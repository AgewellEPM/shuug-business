import CryptoKit
import Foundation

/// Separate wire types deliberately cannot interpret legacy firm-recovery data.
enum PrivateTaxWire {
  static let profile = "client-only-v1"
  static func fail(_ message: String = "The client-owned private data does not match its trusted account, key or format.") -> SecureTaxSetupError { .message(message) }
  static func object(_ data: Data, fields: Set<String>, maximum: Int = 24 * 1024 * 1024) throws -> [String: Any] {
    guard data.count <= maximum, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(value.keys) == fields else { throw fail() }
    return value
  }
  static func exact(_ value: Any?, _ fields: Set<String>) throws {
    guard let value = value as? [String: Any], Set(value.keys) == fields else { throw fail() }
  }
  static func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes, .sortedKeys]) }
  static func date(_ text: String) throws -> Date {
    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"; formatter.isLenient = false
    guard text.utf8.count == 24, let date = formatter.date(from: text), formatter.string(from: date) == text else { throw fail() }
    return date
  }
  static func iso(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
  static func publicKey(_ encoded: String) throws -> P256.KeyAgreement.PublicKey {
    let bytes = try SecureTaxEnvelope.decode(encoded, count: 65)
    guard bytes.first == 4 else { throw fail() }
    return try P256.KeyAgreement.PublicKey(x963Representation: bytes)
  }
}

struct PrivateTaxPins: Codable, Equatable {
  var version: Int
  var profile: String
  var workspaceOrigin: String
  var workspaceId: String
  var signerPublicKey: String
  static let productionOrigin = "https://gig-tax-pros-production.up.railway.app"
  static func bundled(in bundle: Bundle = .main) throws -> Self {
    guard let url = bundle.url(forResource: "SecureTaxTrustedPins", withExtension: "json") else { throw PrivateTaxWire.fail("Private cloud sync is disabled because this signed app has no client-owned trust configuration.") }
    return try decode(Data(contentsOf: url))
  }
  static func decode(_ data: Data) throws -> Self {
    _ = try PrivateTaxWire.object(data, fields: ["version", "profile", "workspaceOrigin", "workspaceId", "signerPublicKey"], maximum: 4096)
    let value = try JSONDecoder().decode(Self.self, from: data); try value.validate(); return value
  }
  func validate() throws {
    try SecureTaxManifest.validateId(workspaceId)
    guard version == 2, profile == PrivateTaxWire.profile, let url = URLComponents(string: workspaceOrigin), url.scheme == "https", let host = url.host, host.contains("."), url.path.isEmpty, url.port == nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.url?.absoluteString == workspaceOrigin else { throw PrivateTaxWire.fail() }
    _ = try signer()
  }
  func signer() throws -> P256.Signing.PublicKey {
    let bytes = try SecureTaxEnvelope.decode(signerPublicKey, count: 65)
    guard bytes.first == 4 else { throw PrivateTaxWire.fail() }
    return try P256.Signing.PublicKey(x963Representation: bytes)
  }
  var signerKeyId: String { get throws { SecureTaxEnvelope.encode(Data(SHA256.hash(data: try signer().x963Representation))) } }
}

struct PrivateTaxScope: Codable, Equatable {
  var version = 2
  var profile = PrivateTaxWire.profile
  var workspaceOrigin: String
  var workspaceId: String
  var identity: SecureTaxIdentity
  init(pins: PrivateTaxPins, identity: SecureTaxIdentity) throws {
    try pins.validate(); try SecureTaxManifest.validateId(identity.accountId); try SecureTaxManifest.validateId(identity.clientId)
    workspaceOrigin = pins.workspaceOrigin; workspaceId = pins.workspaceId; self.identity = identity
  }
  var storageAccount: String { get throws {
    guard version == 2, profile == PrivateTaxWire.profile else { throw PrivateTaxWire.fail() }
    let data = try PrivateTaxWire.json([2, "gigtax/client-only-device-key", profile, workspaceOrigin, workspaceId, identity.accountId, identity.clientId])
    return SecureTaxEnvelope.encode(Data(SHA256.hash(data: data)))
  } }
}

struct PrivateTaxManifest: Codable, Equatable {
  typealias PublicRecipient = SecureTaxManifest.PublicRecipient
  typealias Signature = SecureTaxManifest.Signature
  var version: Int
  var profile: String
  var manifestId: String
  var workspaceId: String
  var accountId: String
  var clientId: String
  var epoch: Int
  var client: PublicRecipient
  var issuedAt: String
  var expiresAt: String
  var signature: Signature
  static func decode(_ data: Data) throws -> Self {
    let value = try PrivateTaxWire.object(data, fields: ["version", "profile", "manifestId", "workspaceId", "accountId", "clientId", "epoch", "client", "issuedAt", "expiresAt", "signature"], maximum: 16_384)
    try PrivateTaxWire.exact(value["client"], ["keyId", "publicKey"]); try PrivateTaxWire.exact(value["signature"], ["algorithm", "signerKeyId", "value"])
    return try JSONDecoder().decode(Self.self, from: data)
  }
  func canonicalBytes() throws -> Data {
    try PrivateTaxWire.json([2, "gigtax/client-only-manifest", PrivateTaxWire.profile, manifestId, workspaceId, accountId, clientId, epoch, client.keyId, client.publicKey, issuedAt, expiresAt])
  }
  func verify(pins: PrivateTaxPins, identity: SecureTaxIdentity, localPublicKey: String, minimumEpoch: Int = 1, now: Date = Date()) throws -> P256.KeyAgreement.PublicKey {
    try pins.validate()
    for value in [manifestId, workspaceId, accountId, clientId, identity.accountId, identity.clientId] { try SecureTaxManifest.validateId(value) }
    guard version == 2, profile == PrivateTaxWire.profile, (1...1_000_000_000).contains(epoch), (1...1_000_000_000).contains(minimumEpoch), epoch >= minimumEpoch, workspaceId == pins.workspaceId, accountId == identity.accountId, clientId == identity.clientId, client.publicKey == localPublicKey, signature.algorithm == "ES256-P1363", signature.signerKeyId == (try pins.signerKeyId) else { throw PrivateTaxWire.fail() }
    let key = try PrivateTaxWire.publicKey(client.publicKey)
    guard client.keyId == SecureTaxEnvelope.keyId(key), client.keyId != (try pins.signerKeyId) else { throw PrivateTaxWire.fail() }
    let issued = try PrivateTaxWire.date(issuedAt), expires = try PrivateTaxWire.date(expiresAt)
    guard now.timeIntervalSince1970.isFinite, issued <= now.addingTimeInterval(60), expires > now, expires > issued else { throw PrivateTaxWire.fail("The client-owned signed enrollment has expired or is not yet valid.") }
    let signed = try P256.Signing.ECDSASignature(rawRepresentation: SecureTaxEnvelope.decode(signature.value, count: 64))
    guard try pins.signer().isValidSignature(signed, for: canonicalBytes()) else { throw PrivateTaxWire.fail("The public account binding has an invalid signature.") }
    return key
  }
}

struct PrivateTaxEnvelope: Codable, Equatable {
  typealias Context = SecureTaxEnvelope.Context
  typealias Recipient = SecureTaxEnvelope.Recipient
  typealias Author = SecureTaxEnvelope.Author
  var version: Int
  var profile: String
  var suite: String
  var contentAlgorithm: String
  var hpkeMode: String
  var author: Author
  var context: Context
  var nonce: String
  var ciphertext: String
  var recipients: [Recipient]
  static let info = Data("gigtax/client-only-envelope/v3".utf8)
  static func decode(_ data: Data) throws -> Self {
    let value = try PrivateTaxWire.object(data, fields: ["version", "profile", "suite", "contentAlgorithm", "hpkeMode", "author", "context", "nonce", "ciphertext", "recipients"])
    try PrivateTaxWire.exact(value["author"], ["role", "keyId"])
    try PrivateTaxWire.exact(value["context"], ["workspaceId", "accountId", "objectId", "revision", "domain"])
    guard let slots = value["recipients"] as? [Any], slots.count == 1 else { throw PrivateTaxWire.fail() }
    try PrivateTaxWire.exact(slots[0], ["role", "keyId", "publicKey", "encapsulatedKey", "wrappedKey"])
    let result = try JSONDecoder().decode(Self.self, from: data)
    try result.validate(expected: result.context, publicKey: PrivateTaxWire.publicKey(result.recipients[0].publicKey))
    return result
  }
  static func aad(_ context: Context, keyId: String) throws -> Data {
    try context.validate()
    return try PrivateTaxWire.json([3, "gigtax/client-only-envelope", PrivateTaxWire.profile, context.domain.rawValue, context.workspaceId, context.accountId, context.objectId, context.revision, "AES-256-GCM", "HPKE-P256-SHA256-A256GCM", "auth", ["client", keyId], ["client", keyId]])
  }
  static func contentAAD(_ base: Data, _ slot: Recipient) throws -> Data {
    try PrivateTaxWire.json([String(decoding: base, as: UTF8.self), [slot.role.rawValue, slot.keyId, slot.publicKey, slot.encapsulatedKey, slot.wrappedKey]])
  }
  func validate(expected: Context, publicKey: P256.KeyAgreement.PublicKey) throws {
    try expected.validate(); try context.validate()
    let keyId = SecureTaxEnvelope.keyId(publicKey)
    guard version == 3, profile == PrivateTaxWire.profile, suite == SecureTaxEnvelope.suiteName, contentAlgorithm == "AES-256-GCM", hpkeMode == "auth", context == expected, author.role == .client, author.keyId == keyId, recipients.count == 1 else { throw PrivateTaxWire.fail() }
    let slot = recipients[0]
    guard slot.role == .client, slot.keyId == keyId, slot.publicKey == SecureTaxEnvelope.encode(publicKey.x963Representation) else { throw PrivateTaxWire.fail() }
    _ = try PrivateTaxWire.publicKey(slot.encapsulatedKey); _ = try SecureTaxEnvelope.decode(slot.wrappedKey, count: 48)
    _ = try SecureTaxEnvelope.decode(nonce, count: 12); _ = try SecureTaxEnvelope.decode(ciphertext, minimum: 16, maximum: SecureTaxEnvelope.maximumCiphertextBytes)
  }
  static func seal(_ plaintext: Data, context: Context, publicKey: P256.KeyAgreement.PublicKey, privateKey: P256.KeyAgreement.PrivateKey) throws -> Self {
    try context.validate()
    guard plaintext.count <= SecureTaxEnvelope.maximumCiphertextBytes - 16, privateKey.publicKey.x963Representation == publicKey.x963Representation else { throw PrivateTaxWire.fail() }
    let keyId = SecureTaxEnvelope.keyId(publicKey), base = try aad(context, keyId: keyId), contentKey = SymmetricKey(size: .bits256)
    var raw = contentKey.withUnsafeBytes { Data($0) }; defer { raw.resetBytes(in: 0..<raw.count) }
    var sender = try HPKE.Sender(recipientKey: publicKey, ciphersuite: .P256_SHA256_AES_GCM_256, info: info, authenticatedBy: privateKey)
    let slot = Recipient(role: .client, keyId: keyId, publicKey: SecureTaxEnvelope.encode(publicKey.x963Representation), encapsulatedKey: SecureTaxEnvelope.encode(sender.encapsulatedKey), wrappedKey: SecureTaxEnvelope.encode(try sender.seal(raw, authenticating: base)))
    let sealed = try AES.GCM.seal(plaintext, using: contentKey, authenticating: contentAAD(base, slot))
    return .init(version: 3, profile: PrivateTaxWire.profile, suite: SecureTaxEnvelope.suiteName, contentAlgorithm: "AES-256-GCM", hpkeMode: "auth", author: .init(role: .client, keyId: keyId), context: context, nonce: SecureTaxEnvelope.encode(sealed.nonce.withUnsafeBytes { Data($0) }), ciphertext: SecureTaxEnvelope.encode(sealed.ciphertext + sealed.tag), recipients: [slot])
  }
  func open(expected: Context, publicKey: P256.KeyAgreement.PublicKey, privateKey: P256.KeyAgreement.PrivateKey) throws -> Data {
    try validate(expected: expected, publicKey: publicKey)
    guard privateKey.publicKey.x963Representation == publicKey.x963Representation else { throw PrivateTaxWire.fail() }
    let base = try Self.aad(expected, keyId: SecureTaxEnvelope.keyId(publicKey)), slot = recipients[0]
    var recipient = try HPKE.Recipient(privateKey: privateKey, ciphersuite: .P256_SHA256_AES_GCM_256, info: Self.info, encapsulatedKey: SecureTaxEnvelope.decode(slot.encapsulatedKey, count: 65), authenticatedBy: publicKey)
    var raw = try recipient.open(SecureTaxEnvelope.decode(slot.wrappedKey, count: 48), authenticating: base); defer { raw.resetBytes(in: 0..<raw.count) }
    guard raw.count == 32 else { throw PrivateTaxWire.fail() }
    let encrypted = try SecureTaxEnvelope.decode(ciphertext, minimum: 16, maximum: SecureTaxEnvelope.maximumCiphertextBytes)
    let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: SecureTaxEnvelope.decode(nonce, count: 12)), ciphertext: encrypted.dropLast(16), tag: encrypted.suffix(16))
    return try AES.GCM.open(box, using: SymmetricKey(data: raw), authenticating: Self.contentAAD(base, slot))
  }
}

struct PrivateTaxActivationProof: Codable {
  var version: Int; var profile: String; var type: String; var challengeId: String
  var workspaceId: String; var accountId: String; var clientId: String; var manifestId: String
  var manifestEpoch: Int; var keyId: String; var expiresAt: String; var encapsulatedKey: String; var ciphertext: String
  static func decode(_ data: Data) throws -> Self {
    _ = try PrivateTaxWire.object(data, fields: ["version", "profile", "type", "challengeId", "workspaceId", "accountId", "clientId", "manifestId", "manifestEpoch", "keyId", "expiresAt", "encapsulatedKey", "ciphertext"], maximum: 16_384)
    return try JSONDecoder().decode(Self.self, from: data)
  }
  func open(manifest: PrivateTaxManifest, pins: PrivateTaxPins, identity: SecureTaxIdentity, privateKey: P256.KeyAgreement.PrivateKey, now: Date = Date()) throws -> String {
    _ = try manifest.verify(pins: pins, identity: identity, localPublicKey: SecureTaxEnvelope.encode(privateKey.publicKey.x963Representation), now: now)
    let expires = try PrivateTaxWire.date(expiresAt)
    guard version == 2, profile == PrivateTaxWire.profile, type == "gigtax-client-only-activation-proof", challengeId.range(of: #"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#, options: .regularExpression) != nil, workspaceId == manifest.workspaceId, accountId == manifest.accountId, clientId == manifest.clientId, manifestId == manifest.manifestId, manifestEpoch == manifest.epoch, keyId == manifest.client.keyId, expires > now, expires <= now.addingTimeInterval(360) else { throw PrivateTaxWire.fail() }
    let aad = try PrivateTaxWire.json([2, "gigtax/client-only-activation-proof", PrivateTaxWire.profile, challengeId, workspaceId, accountId, clientId, manifestId, manifestEpoch, keyId, expiresAt])
    var recipient = try HPKE.Recipient(privateKey: privateKey, ciphersuite: .P256_SHA256_AES_GCM_256, info: Data("gigtax/client-only-activation-proof/v2".utf8), encapsulatedKey: SecureTaxEnvelope.decode(encapsulatedKey, count: 65))
    var answer = try recipient.open(SecureTaxEnvelope.decode(ciphertext, count: 48), authenticating: aad); defer { answer.resetBytes(in: 0..<answer.count) }
    guard answer.count == 32 else { throw PrivateTaxWire.fail() }
    return SecureTaxEnvelope.encode(answer)
  }
}
