import CryptoKit
import Foundation

/// Client-side envelope primitive foundation. Existing record sync, receipts and
/// tax uploads are not protected by this type until those paths are migrated.
/// This type never loads private keys from the server, environment or workspace.
@available(iOS 17.0, macOS 14.0, *)
struct SecureTaxEnvelope: Codable, Equatable {
  enum Domain: String, Codable, CaseIterable {
    case taxDocument = "tax-document", taxIdentity = "tax-identity"
    case driverRecord = "driver-record", driverReceipt = "driver-receipt"
    case driverState = "driver-state", driverRoute = "driver-route"
    case providerRecord = "provider-record"
  }
  enum Role: String, Codable { case client, firmRecovery = "firm-recovery" }
  struct Context: Codable, Equatable {
    var workspaceId: String
    var accountId: String
    var objectId: String
    var revision: Int
    var domain: Domain

    func validate() throws {
      for value in [workspaceId, accountId, objectId] {
        guard let matched = value.range(of: #"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"#,
          options: .regularExpression), matched == value.startIndex..<value.endIndex else {
          throw Failure.invalidEnvelope
        }
      }
      guard (1...1_000_000_000).contains(revision) else { throw Failure.invalidEnvelope }
    }
  }
  struct Recipient: Codable, Equatable {
    var role: Role
    var keyId: String
    var publicKey: String
    var encapsulatedKey: String
    var wrappedKey: String
  }
  /// Keys supplied here must be independently trusted, e.g. an already pinned,
  /// verified manifest. Keys downloaded from the ciphertext host alone do not
  /// establish recipient identity or authorize recovery/rewrapping.
  struct TrustedRecipients {
    let client: P256.KeyAgreement.PublicKey
    let firmRecovery: P256.KeyAgreement.PublicKey
  }
  enum Failure: LocalizedError {
    case invalidEnvelope, untrustedRecipients, unableToOpen
    var errorDescription: String? {
      switch self {
      case .invalidEnvelope: "The protected item's format or expected context is invalid."
      case .untrustedRecipients: "The protected item's recipients do not match the trusted keys."
      case .unableToOpen: "The protected item could not be opened with this key and context."
      }
    }
  }

  static let suiteName = "HPKE-P256-SHA256-A256GCM"
  static let contentAlgorithmName = "AES-256-GCM"
  static let maximumCiphertextBytes = 16 * 1024 * 1024
  static let hpkeInfo = Data("shuug/secure-tax-envelope/v1".utf8)
  private static let suite = HPKE.Ciphersuite.P256_SHA256_AES_GCM_256

  var version: Int
  var suite: String
  var contentAlgorithm: String
  var context: Context
  var nonce: String
  /// Standard AES-GCM output: ciphertext followed by the 16-byte tag; nonce is separate.
  var ciphertext: String
  var recipients: [Recipient]

  static func keyId(_ key: P256.KeyAgreement.PublicKey) -> String {
    encode(Data(SHA256.hash(data: key.x963Representation)))
  }

  static func seal(_ plaintext: Data, context: Context, recipients trusted: TrustedRecipients) throws -> Self {
    try context.validate()
    guard plaintext.count <= maximumCiphertextBytes - 16 else { throw Failure.invalidEnvelope }
    let clientId = keyId(trusted.client), firmId = keyId(trusted.firmRecovery)
    guard clientId != firmId else { throw Failure.untrustedRecipients }
    let aad = try authenticatedHeader(context: context, clientId: clientId, firmId: firmId)
    let contentKey = SymmetricKey(size: .bits256)
    let keyBytes = contentKey.withUnsafeBytes { Data($0) }
    let sealed = try AES.GCM.seal(plaintext, using: contentKey, authenticating: aad)
    let slots = try [(Role.client, trusted.client), (.firmRecovery, trusted.firmRecovery)].map { role, key in
      // Each recipient/object uses its own RFC 9180 context and sequence zero.
      var sender = try HPKE.Sender(recipientKey: key, ciphersuite: suite, info: hpkeInfo)
      let wrapped = try sender.seal(keyBytes, authenticating: aad)
      return Recipient(role: role, keyId: keyId(key), publicKey: encode(key.x963Representation),
        encapsulatedKey: encode(sender.encapsulatedKey), wrappedKey: encode(wrapped))
    }
    return Self(version: 1, suite: suiteName, contentAlgorithm: contentAlgorithmName,
      context: context, nonce: encode(sealed.nonce.withUnsafeBytes { Data($0) }),
      ciphertext: encode(sealed.ciphertext + sealed.tag), recipients: slots)
  }

  /// SK can be a software P256 key or SecureEnclave.P256.KeyAgreement.PrivateKey.
  /// Its bytes are never exported. This is a local operation, not an RPC.
  func open<SK: HPKEDiffieHellmanPrivateKey>(
    expectedContext: Context, trustedRecipients trusted: TrustedRecipients,
    role: Role, privateKey: SK
  ) throws -> Data {
    try expectedContext.validate()
    guard version == 1, suite == Self.suiteName,
      contentAlgorithm == Self.contentAlgorithmName, context == expectedContext,
      recipients.count == 2, recipients[0].role == .client,
      recipients[1].role == .firmRecovery else { throw Failure.invalidEnvelope }
    let clientId = Self.keyId(trusted.client), firmId = Self.keyId(trusted.firmRecovery)
    guard clientId != firmId else { throw Failure.untrustedRecipients }
    let expectedKeys = [trusted.client, trusted.firmRecovery]
    for (index, key) in expectedKeys.enumerated() {
      let slot = recipients[index]
      guard slot.keyId == Self.keyId(key),
        try Self.decode(slot.publicKey, count: 65) == key.x963Representation else {
        throw Failure.untrustedRecipients
      }
      _ = try Self.decode(slot.encapsulatedKey, count: 65)
      _ = try Self.decode(slot.wrappedKey, count: 48)
    }
    let nonceBytes = try Self.decode(nonce, count: 12)
    let encryptedBytes = try Self.decode(ciphertext, minimum: 16, maximum: Self.maximumCiphertextBytes)
    let slot = recipients[role == .client ? 0 : 1]
    let expectedPublic = expectedKeys[role == .client ? 0 : 1].x963Representation
    let aad = try Self.authenticatedHeader(context: context, clientId: clientId, firmId: firmId)
    do {
      guard try privateKey.publicKey.hpkeRepresentation(kem: Self.suite.kem) == expectedPublic else {
        throw Failure.unableToOpen
      }
      var recipient = try HPKE.Recipient(privateKey: privateKey, ciphersuite: Self.suite,
        info: Self.hpkeInfo, encapsulatedKey: Self.decode(slot.encapsulatedKey, count: 65))
      let keyBytes = try recipient.open(Self.decode(slot.wrappedKey, count: 48), authenticating: aad)
      guard keyBytes.count == 32 else { throw Failure.unableToOpen }
      let sealed = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonceBytes),
        ciphertext: encryptedBytes.dropLast(16), tag: encryptedBytes.suffix(16))
      return try AES.GCM.open(sealed, using: SymmetricKey(data: keyBytes), authenticating: aad)
    } catch { throw Failure.unableToOpen }
  }

  /// Array ordering, ASCII identifiers and integer bounds make these UTF-8
  /// bytes identical to JavaScript JSON.stringify without custom crypto/KDFs.
  static func authenticatedHeader(context: Context, clientId: String, firmId: String) throws -> Data {
    try context.validate()
    return try JSONSerialization.data(withJSONObject: [
      1, "shuug/secure-tax-envelope", context.domain.rawValue, context.workspaceId,
      context.accountId, context.objectId, context.revision, contentAlgorithmName, suiteName,
      [Role.client.rawValue, clientId], [Role.firmRecovery.rawValue, firmId],
    ], options: [.withoutEscapingSlashes])
  }
  static func encode(_ value: Data) -> String {
    value.base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
  static func decode(_ value: String, count: Int) throws -> Data {
    try decode(value, minimum: count, maximum: count)
  }
  static func decode(_ value: String, minimum: Int, maximum: Int) throws -> Data {
    guard value.utf8.count <= (maximum * 4 + 2) / 3,
      value.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else {
      throw Failure.invalidEnvelope
    }
    let base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    guard let data = Data(base64Encoded: base64 + String(repeating: "=", count: (4 - base64.count % 4) % 4)),
      (minimum...maximum).contains(data.count), encode(data) == value else { throw Failure.invalidEnvelope }
    return data
  }
}
