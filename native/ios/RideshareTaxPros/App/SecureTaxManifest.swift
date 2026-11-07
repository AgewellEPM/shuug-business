import CryptoKit
import Foundation

enum SecureTaxSetupError: LocalizedError {
  case message(String)
  var errorDescription: String? { if case .message(let message) = self { return message }; return nil }
}

/// Public trust roots distributed with the signed app, independently of the
/// ciphertext API. A missing resource deliberately disables key setup.
struct SecureTaxPublicPins: Codable {
  var version: Int
  var workspaceOrigin: String
  var workspaceId: String
  var signerPublicKey: String
  var firmRecoveryPublicKey: String

  static func bundled(in bundle: Bundle = .main) throws -> Self {
    guard let url = bundle.url(forResource: "SecureTaxTrustedPins", withExtension: "json") else {
      throw SecureTaxSetupError.message("Secure setup is unavailable until your firm’s public signing and recovery keys are included in this signed app.")
    }
    return try decode(Data(contentsOf: url))
  }
  static func decode(_ data: Data) throws -> Self {
    try SecureTaxManifest.requireFields(data, fields: ["version", "workspaceOrigin", "workspaceId", "signerPublicKey", "firmRecoveryPublicKey"])
    let pins = try JSONDecoder().decode(Self.self, from: data)
    try pins.validate()
    return pins
  }
  func validate() throws {
    try SecureTaxManifest.validateId(workspaceId)
    guard version == 1, let origin = URLComponents(string: workspaceOrigin), origin.scheme == "https",
      let host = origin.host, host.contains("."), origin.user == nil, origin.password == nil,
      origin.query == nil, origin.fragment == nil, origin.port == nil,
      origin.path.isEmpty, origin.url?.absoluteString == workspaceOrigin else {
      throw SecureTaxSetupError.message("The app’s public encryption configuration is invalid.")
    }
    _ = try signer()
    _ = try recovery()
    guard signerPublicKey != firmRecoveryPublicKey else {
      throw SecureTaxSetupError.message("Signing and firm recovery must use separate public keys.")
    }
  }
  func signer() throws -> P256.Signing.PublicKey {
    try P256.Signing.PublicKey(x963Representation: SecureTaxEnvelope.decode(signerPublicKey, count: 65))
  }
  func recovery() throws -> P256.KeyAgreement.PublicKey {
    try P256.KeyAgreement.PublicKey(x963Representation: SecureTaxEnvelope.decode(firmRecoveryPublicKey, count: 65))
  }
  var signerKeyId: String { get throws { SecureTaxEnvelope.encode(Data(SHA256.hash(data: try signer().x963Representation))) } }
}

struct SecureTaxIdentity: Codable, Equatable {
  var accountId: String
  var clientId: String
}

struct SecureTaxManifest: Codable, Equatable {
  struct PublicRecipient: Codable, Equatable { var keyId: String; var publicKey: String }
  struct Signature: Codable, Equatable { var algorithm: String; var signerKeyId: String; var value: String }
  var version: Int
  var manifestId: String
  var workspaceId: String
  var accountId: String
  var clientId: String
  var epoch: Int
  var client: PublicRecipient
  var firmRecovery: PublicRecipient
  var issuedAt: String
  var expiresAt: String
  var signature: Signature

  static func decode(_ data: Data) throws -> Self {
    try requireFields(data, fields: ["version", "manifestId", "workspaceId", "accountId", "clientId", "epoch", "client", "firmRecovery", "issuedAt", "expiresAt", "signature"],
      nested: ["client": ["keyId", "publicKey"], "firmRecovery": ["keyId", "publicKey"], "signature": ["algorithm", "signerKeyId", "value"]])
    return try JSONDecoder().decode(Self.self, from: data)
  }
  static func requireFields(_ data: Data, fields: Set<String>, nested: [String: Set<String>] = [:]) throws {
    guard data.count <= 16_384, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      Set(object.keys) == fields else { throw SecureTaxSetupError.message("This public key document has an unsupported format.") }
    for (name, fields) in nested {
      guard let value = object[name] as? [String: Any], Set(value.keys) == fields else {
        throw SecureTaxSetupError.message("This public key document has an unsupported format.")
      }
    }
  }
  static func validateId(_ value: String) throws {
    guard let match = value.range(of: #"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"#, options: .regularExpression),
      match == value.startIndex..<value.endIndex else { throw SecureTaxSetupError.message("The protected workspace identity is invalid.") }
  }
  func canonicalBytes() throws -> Data {
    try JSONSerialization.data(withJSONObject: [1, "shuug/secure-tax-manifest", manifestId, workspaceId,
      accountId, clientId, epoch, client.keyId, client.publicKey, firmRecovery.keyId,
      firmRecovery.publicKey, issuedAt, expiresAt], options: [.withoutEscapingSlashes])
  }
  /// Expected identity comes from the current session's authenticated binding;
  /// public pins come only from the signed app, never from the API response.
  func verify(pins: SecureTaxPublicPins, identity: SecureTaxIdentity,
    localClient: PublicRecipient, now: Date = Date()) throws -> SecureTaxEnvelope.TrustedRecipients {
    try pins.validate()
    for value in [manifestId, workspaceId, accountId, clientId, identity.accountId, identity.clientId] { try Self.validateId(value) }
    guard version == 1, (1...1_000_000_000).contains(epoch), workspaceId == pins.workspaceId,
      accountId == identity.accountId, clientId == identity.clientId, client == localClient,
      signature.algorithm == "ES256-P1363", signature.signerKeyId == (try pins.signerKeyId) else {
      throw SecureTaxSetupError.message("The signed key enrollment does not match this account, workspace and device key.")
    }
    let clientKey = try P256.KeyAgreement.PublicKey(x963Representation: SecureTaxEnvelope.decode(client.publicKey, count: 65))
    let recoveryKey = try pins.recovery()
    guard client.keyId == SecureTaxEnvelope.keyId(clientKey),
      firmRecovery.keyId == SecureTaxEnvelope.keyId(recoveryKey), firmRecovery.publicKey == pins.firmRecoveryPublicKey,
      client.keyId != firmRecovery.keyId, client.keyId != (try pins.signerKeyId) else {
      throw SecureTaxSetupError.message("The signed key enrollment does not match the independently trusted public keys.")
    }
    func date(_ text: String) -> Date? {
      guard text.utf8.count <= 64, let match = text.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$"#, options: .regularExpression),
        match == text.startIndex..<text.endIndex else { return nil }
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = text.contains(".") ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
      return formatter.date(from: text)
    }
    guard let issued = date(issuedAt), let expires = date(expiresAt), issued <= now.addingTimeInterval(60),
      expires > now, expires > issued else { throw SecureTaxSetupError.message("The signed key enrollment has expired or is not yet valid.") }
    let signed = try P256.Signing.ECDSASignature(rawRepresentation: SecureTaxEnvelope.decode(signature.value, count: 64))
    guard try pins.signer().isValidSignature(signed, for: canonicalBytes()) else {
      throw SecureTaxSetupError.message("The public key enrollment’s firm signature is invalid.")
    }
    return .init(client: clientKey, firmRecovery: recoveryKey)
  }
}
