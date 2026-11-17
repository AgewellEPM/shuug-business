import CommonCrypto
import CryptoKit
import Foundation

/// A v1 backup supplies key material only. Profile/account authority is supplied
/// independently by signed pins, authenticated identity and the v2 manifest.
enum PrivateTaxBackup {
  static func open(_ data: Data, passphrase: String) throws -> P256.KeyAgreement.PrivateKey {
    let object = try PrivateTaxWire.object(data, fields: ["version", "type", "keyId", "publicKey", "kdf", "cipher"], maximum: 16_384)
    try PrivateTaxWire.exact(object["kdf"], ["name", "hash", "iterations", "salt"]); try PrivateTaxWire.exact(object["cipher"], ["name", "nonce", "ciphertext"])
    guard object["version"] as? Int == 1, object["type"] as? String == "shuug-client-key-backup", let publicText = object["publicKey"] as? String, let keyId = object["keyId"] as? String, let kdf = object["kdf"] as? [String: Any], let cipher = object["cipher"] as? [String: Any], kdf["name"] as? String == "PBKDF2", kdf["hash"] as? String == "SHA-256", kdf["iterations"] as? Int == 600_000, cipher["name"] as? String == "AES-256-GCM", let saltText = kdf["salt"] as? String, let nonceText = cipher["nonce"] as? String, let ciphertextText = cipher["ciphertext"] as? String, (16...1024).contains(passphrase.utf16.count) else { throw PrivateTaxWire.fail("Choose the original encrypted client-key backup and its separate passphrase.") }
    let publicKey = try PrivateTaxWire.publicKey(publicText)
    guard SecureTaxEnvelope.keyId(publicKey) == keyId else { throw PrivateTaxWire.fail() }
    let salt = try SecureTaxEnvelope.decode(saltText, count: 16), nonce = try SecureTaxEnvelope.decode(nonceText, count: 12), ciphertext = try SecureTaxEnvelope.decode(ciphertextText, minimum: 32, maximum: 1024)
    var password = Array(passphrase.utf8), derived = [UInt8](repeating: 0, count: 32)
    defer { _ = password.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }; _ = derived.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) } }
    let result = password.withUnsafeBytes { p in salt.withUnsafeBytes { s in derived.withUnsafeMutableBytes { d in
      CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), p.baseAddress?.assumingMemoryBound(to: Int8.self), password.count, s.baseAddress?.assumingMemoryBound(to: UInt8.self), salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 600_000, d.baseAddress?.assumingMemoryBound(to: UInt8.self), 32)
    } } }
    guard result == kCCSuccess else { throw PrivateTaxWire.fail() }
    let aad = try PrivateTaxWire.json([1, "shuug-client-key-backup", keyId, publicText])
    let sealed = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: ciphertext.dropLast(16), tag: ciphertext.suffix(16))
    var der = try AES.GCM.open(sealed, using: SymmetricKey(data: derived), authenticating: aad); defer { der.resetBytes(in: 0..<der.count) }
    let key = try P256.KeyAgreement.PrivateKey(derRepresentation: der)
    guard key.publicKey.x963Representation == publicKey.x963Representation else { throw PrivateTaxWire.fail() }
    return key
  }
}

struct PrivateTaxDeviceKeys {
  struct Stored: Codable {
    var version = 2; var profile = PrivateTaxWire.profile
    var scope: PrivateTaxScope; var privateKey: Data; var manifest: PrivateTaxManifest
  }
  private let storage: any SecureTaxKeyStore
  init(storage: any SecureTaxKeyStore = SecureTaxKeychainStore()) { self.storage = storage }
  func load(scope: PrivateTaxScope, pins: PrivateTaxPins, now: Date = Date()) throws -> Stored? {
    guard try scope == PrivateTaxScope(pins: pins, identity: scope.identity) else { throw PrivateTaxWire.fail() }
    try assertAccountBinding(scope)
    guard let data = try storage.read(account: "client-only-key-" + scope.storageAccount) else { return nil }
    guard data.count <= 32_768 else { throw PrivateTaxWire.fail() }
    let value = try JSONDecoder().decode(Stored.self, from: data)
    guard value.version == 2, value.profile == PrivateTaxWire.profile, value.scope == scope, value.privateKey.count == 32 else { throw PrivateTaxWire.fail() }
    let key = try P256.KeyAgreement.PrivateKey(rawRepresentation: value.privateKey)
    _ = try value.manifest.verify(pins: pins, identity: scope.identity, localPublicKey: SecureTaxEnvelope.encode(key.publicKey.x963Representation), now: now)
    try anchor(scope: scope, manifest: value.manifest, create: false, advance: false)
    return value
  }
  private func anchorAccount(_ scope: PrivateTaxScope) throws -> String {
    // Index by account, not clientId: a host cannot create a fresh local anchor
    // for the same account merely by changing its authenticated clientId.
    let bytes = try PrivateTaxWire.json([2, "gigtax/client-only-account-anchor", PrivateTaxWire.profile, scope.workspaceOrigin, scope.workspaceId, scope.identity.accountId])
    return "client-only-anchor-" + SecureTaxEnvelope.encode(Data(SHA256.hash(data: bytes)))
  }
  private struct Anchor: Codable {
    var version = 2; var profile = PrivateTaxWire.profile
    var scope: PrivateTaxScope; var clientPublicKey: String
    var highestEpoch: Int; var manifestDigest: String
  }
  private func readAnchor(_ scope: PrivateTaxScope) throws -> Anchor? {
    guard let original = try storage.read(account: anchorAccount(scope)) else { return nil }
    _ = try PrivateTaxWire.object(original, fields: ["version", "profile", "scope", "clientPublicKey", "highestEpoch", "manifestDigest"], maximum: 16_384)
    let value = try JSONDecoder().decode(Anchor.self, from: original)
    guard value.version == 2, value.profile == PrivateTaxWire.profile, value.scope == scope, (1...1_000_000_000).contains(value.highestEpoch) else { throw PrivateTaxWire.fail("The account’s original client identity and observed enrollment cannot be changed by a new server response.") }
    _ = try PrivateTaxWire.publicKey(value.clientPublicKey); _ = try SecureTaxEnvelope.decode(value.manifestDigest, count: 32)
    return value
  }
  private func assertAccountBinding(_ scope: PrivateTaxScope) throws { _ = try readAnchor(scope) }
  /// Public account/key identity never changes. Persist the observed epoch and
  /// canonical digest before the key row, so missing/restored rows cannot roll
  /// back a previously accepted approval or reuse an epoch with changed bytes.
  private func anchor(scope: PrivateTaxScope, manifest: PrivateTaxManifest, create: Bool, advance: Bool) throws {
    let account = try anchorAccount(scope), digest = SecureTaxEnvelope.encode(Data(SHA256.hash(data: try manifest.canonicalBytes())))
    if var original = try readAnchor(scope) {
      guard original.clientPublicKey == manifest.client.publicKey, manifest.epoch >= original.highestEpoch,
        manifest.epoch != original.highestEpoch || digest == original.manifestDigest else { throw PrivateTaxWire.fail("A different client key, older approval or changed approval at the same epoch cannot replace this account’s observed binding.") }
      if manifest.epoch > original.highestEpoch {
        guard advance else { throw PrivateTaxWire.fail("Stage the newer signed enrollment before using it.") }
        original.highestEpoch = manifest.epoch; original.manifestDigest = digest
        try storage.update(JSONEncoder().encode(original), account: account)
      }
    } else if create {
      try storage.add(JSONEncoder().encode(Anchor(scope: scope, clientPublicKey: manifest.client.publicKey, highestEpoch: manifest.epoch, manifestDigest: digest)), account: account)
    } else { throw PrivateTaxWire.fail("The immutable local account binding is missing. Keep the existing keys and backups for review.") }
  }
  func stage(key: P256.KeyAgreement.PrivateKey, manifest: PrivateTaxManifest, scope: PrivateTaxScope, pins: PrivateTaxPins, now: Date = Date()) throws {
    guard try scope == PrivateTaxScope(pins: pins, identity: scope.identity) else { throw PrivateTaxWire.fail() }
    let publicKey = SecureTaxEnvelope.encode(key.publicKey.x963Representation)
    _ = try manifest.verify(pins: pins, identity: scope.identity, localPublicKey: publicKey, now: now)
    let account = try "client-only-key-" + scope.storageAccount
    if let data = try storage.read(account: account) {
      let previous = try JSONDecoder().decode(Stored.self, from: data)
      let unchanged = try manifest.canonicalBytes() == previous.manifest.canonicalBytes()
      guard previous.version == 2, previous.profile == PrivateTaxWire.profile, previous.scope == scope, previous.privateKey == key.rawRepresentation, previous.manifest.client == manifest.client, manifest.epoch >= previous.manifest.epoch, manifest.epoch != previous.manifest.epoch || unchanged else { throw PrivateTaxWire.fail("An older or changed enrollment cannot replace the original client key or binding.") }
      try anchor(scope: scope, manifest: manifest, create: false, advance: true)
      try storage.update(JSONEncoder().encode(Stored(scope: scope, privateKey: key.rawRepresentation, manifest: manifest)), account: account)
    } else {
      try anchor(scope: scope, manifest: manifest, create: true, advance: true)
      try storage.add(JSONEncoder().encode(Stored(scope: scope, privateKey: key.rawRepresentation, manifest: manifest)), account: account)
    }
  }
  /// Renew only the same locally held key. An expired old manifest does not
  /// prevent verification of a current higher-epoch document for that key.
  func refresh(manifest: PrivateTaxManifest, scope: PrivateTaxScope, pins: PrivateTaxPins) throws -> Bool {
    try assertAccountBinding(scope)
    guard let data = try storage.read(account: "client-only-key-" + scope.storageAccount) else { return false }
    var previous = try JSONDecoder().decode(Stored.self, from: data)
    defer { previous.privateKey.resetBytes(in: 0..<previous.privateKey.count) }
    guard previous.version == 2, previous.profile == PrivateTaxWire.profile, previous.scope == scope else { throw PrivateTaxWire.fail() }
    try stage(key: P256.KeyAgreement.PrivateKey(rawRepresentation: previous.privateKey), manifest: manifest, scope: scope, pins: pins)
    return true
  }
  func withKey<Output>(scope: PrivateTaxScope, pins: PrivateTaxPins, operation: (P256.KeyAgreement.PrivateKey, PrivateTaxManifest) throws -> Output) throws -> Output {
    guard var value = try load(scope: scope, pins: pins) else { throw PrivateTaxWire.fail("Import this account’s client-held encrypted key backup before syncing.") }
    defer { value.privateKey.resetBytes(in: 0..<value.privateKey.count) }
    return try operation(P256.KeyAgreement.PrivateKey(rawRepresentation: value.privateKey), value.manifest)
  }
}
