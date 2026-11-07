import CryptoKit
import Foundation
import Security

protocol SecureTaxKeyStore {
  func read(account: String) throws -> Data?
  func add(_ data: Data, account: String) throws
  func update(_ data: Data, account: String) throws
}

/// No App Group or synchronization: the client key is available only while this
/// device is unlocked and is excluded from transferable/iCloud backups.
struct SecureTaxKeychainStore: SecureTaxKeyStore {
  static let service = "com.ridesharetaxpros.driver.secure-tax.v2"
  private func query(_ account: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service,
      kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
  }
  func read(account: String) throws -> Data? {
    var query = query(account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw SecureTaxSetupError.message("Unlock this iPhone to access its protected client key.")
    }
    return data
  }
  func add(_ data: Data, account: String) throws {
    var item = query(account)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    item[kSecValueData as String] = data
    guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
      throw SecureTaxSetupError.message("The device key could not be saved. An existing key will never be replaced automatically.")
    }
  }
  func update(_ data: Data, account: String) throws {
    guard SecItemUpdate(query(account) as CFDictionary,
      [kSecValueData as String: data] as CFDictionary) == errSecSuccess else {
      throw SecureTaxSetupError.message("The verified key enrollment could not be saved on this device.")
    }
  }
}

struct SecureTaxKeyScope: Codable, Equatable {
  var workspaceOrigin: String
  var workspaceId: String
  var identity: SecureTaxIdentity
  init(pins: SecureTaxPublicPins, identity: SecureTaxIdentity) throws {
    try pins.validate()
    try SecureTaxManifest.validateId(identity.accountId)
    try SecureTaxManifest.validateId(identity.clientId)
    workspaceOrigin = pins.workspaceOrigin; workspaceId = pins.workspaceId; self.identity = identity
  }
  var storageAccount: String {
    get throws {
      let bytes = try JSONSerialization.data(withJSONObject: [1, "shuug/secure-tax-device-key", workspaceOrigin,
        workspaceId, identity.accountId, identity.clientId], options: [.withoutEscapingSlashes])
      return SecureTaxEnvelope.encode(Data(SHA256.hash(data: bytes)))
    }
  }
}

struct SecureTaxDeviceKeys {
  struct State {
    var client: SecureTaxManifest.PublicRecipient
    var stagedManifest: SecureTaxManifest?
  }
  private struct StoredKey: Codable {
    var version: Int
    var scope: SecureTaxKeyScope
    var clientPrivateKey: Data
    var stagedManifest: SecureTaxManifest?
  }
  private let storage: any SecureTaxKeyStore
  init(storage: any SecureTaxKeyStore = SecureTaxKeychainStore()) { self.storage = storage }

  private func stored(_ scope: SecureTaxKeyScope) throws -> StoredKey? {
    guard let bytes = try storage.read(account: scope.storageAccount) else { return nil }
    guard bytes.count <= 24_576 else { throw SecureTaxSetupError.message("The saved device key needs review.") }
    let value = try JSONDecoder().decode(StoredKey.self, from: bytes)
    guard value.version == 1, value.scope == scope, value.clientPrivateKey.count == 32 else {
      throw SecureTaxSetupError.message("The saved device key belongs to a different account or format.")
    }
    _ = try P256.KeyAgreement.PrivateKey(rawRepresentation: value.clientPrivateKey)
    return value
  }
  private func state(_ value: StoredKey) throws -> State {
    let key = try P256.KeyAgreement.PrivateKey(rawRepresentation: value.clientPrivateKey).publicKey
    return State(client: .init(keyId: SecureTaxEnvelope.keyId(key), publicKey: SecureTaxEnvelope.encode(key.x963Representation)),
      stagedManifest: value.stagedManifest)
  }
  func state(for scope: SecureTaxKeyScope) throws -> State? { try stored(scope).map(state) }

  /// Call only after an explicit setup action. Reading status never generates a
  /// key, and retrying setup keeps the original key for this account.
  func createClientKey(for scope: SecureTaxKeyScope) throws -> State {
    if let current = try stored(scope) { return try state(current) }
    let value = StoredKey(version: 1, scope: scope, clientPrivateKey: P256.KeyAgreement.PrivateKey().rawRepresentation)
    try storage.add(JSONEncoder().encode(value), account: scope.storageAccount)
    return try state(value)
  }
  /// Staging is local only. It neither enrolls the backend nor enables legacy
  /// plaintext synchronization. The highest verified epoch survives app restart.
  func stage(_ manifest: SecureTaxManifest, scope: SecureTaxKeyScope, pins: SecureTaxPublicPins,
    now: Date = Date()) throws -> State {
    guard try scope == SecureTaxKeyScope(pins: pins, identity: scope.identity) else {
      throw SecureTaxSetupError.message("The device key belongs to a different trusted workspace.")
    }
    guard var current = try stored(scope) else { throw SecureTaxSetupError.message("Create this account’s device key before importing its signed enrollment.") }
    let client = try state(current).client
    _ = try manifest.verify(pins: pins, identity: scope.identity, localClient: client, now: now)
    if let previous = current.stagedManifest {
      let unchanged = try manifest.canonicalBytes() == previous.canonicalBytes()
      guard manifest.epoch >= previous.epoch,
        manifest.epoch != previous.epoch || unchanged else {
        throw SecureTaxSetupError.message("An older or changed key enrollment cannot replace the version already verified on this device.")
      }
    }
    current.stagedManifest = manifest
    try storage.update(JSONEncoder().encode(current), account: scope.storageAccount)
    return try state(current)
  }
  /// A future encrypted transport must call this before each use. Staging alone
  /// is not authorization to send data; the server must confirm enrollment too.
  func verifiedRecipients(scope: SecureTaxKeyScope, pins: SecureTaxPublicPins,
    now: Date = Date()) throws -> SecureTaxEnvelope.TrustedRecipients {
    guard try scope == SecureTaxKeyScope(pins: pins, identity: scope.identity) else {
      throw SecureTaxSetupError.message("The device key belongs to a different trusted workspace.")
    }
    guard let current = try stored(scope), let manifest = current.stagedManifest else {
      throw SecureTaxSetupError.message("This device has no verified signed key enrollment for this account.")
    }
    return try manifest.verify(pins: pins, identity: scope.identity, localClient: state(current).client, now: now)
  }
  /// Private material stays within this synchronous local operation. Callers
  /// prepare ciphertext before awaiting network I/O and must not export key bytes.
  func withClientPrivateKey<Output>(scope: SecureTaxKeyScope, pins: SecureTaxPublicPins,
    now: Date = Date(), operation: (P256.KeyAgreement.PrivateKey, SecureTaxEnvelope.TrustedRecipients) throws -> Output) throws -> Output {
    let recipients = try verifiedRecipients(scope: scope, pins: pins, now: now)
    guard let current = try stored(scope) else { throw SecureTaxSetupError.message("This device’s client key is unavailable.") }
    return try operation(P256.KeyAgreement.PrivateKey(rawRepresentation: current.clientPrivateKey), recipients)
  }
}
