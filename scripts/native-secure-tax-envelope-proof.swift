import CryptoKit
import Foundation

/// Synthetic fixtures only. No production keys, Keychain, app data or server
/// paths are read or written. Cross-runtime tests pass fixtures through stdin.
@main struct SecureTaxEnvelopeProof {
  typealias Envelope = SecureTaxEnvelope
  struct ProofFailure: Error { let message: String }
  struct Input: Codable {
    var syntheticOnly: Bool
    var context: Envelope.Context
    var clientPublicKey: String
    var firmRecoveryPublicKey: String
    var privateKey: String?
    var role: Envelope.Role?
    var plaintext: String?
    var envelope: Envelope?
  }
  static let context = Envelope.Context(workspaceId: "synthetic-workspace", accountId: "synthetic-client",
    objectId: "synthetic-document", revision: 1, domain: .taxDocument)
  static let plaintext = Data(#"{"syntheticOnly":true,"name":"SYNTHETIC TAX FIXTURE","ssn":"000-12-3456","amountCents":12345}"#.utf8)

  static func emit(_ value: Any) throws {
    let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
    print(String(decoding: bytes, as: UTF8.self))
  }
  static func object<T: Encodable>(_ value: T) throws -> Any {
    try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
  }
  static func require(_ value: Bool, _ message: String) throws {
    guard value else { throw ProofFailure(message: message) }
  }
  static func rejects(_ label: String, checks: inout [String], work: () throws -> Void) throws {
    do {
      try work()
      throw ProofFailure(message: "Rejected boundary accepted: " + label)
    } catch is Envelope.Failure { checks.append(label) }
  }
  static func changed(_ text: String) throws -> String {
    var bytes = try Envelope.decode(text, minimum: 1, maximum: Envelope.maximumCiphertextBytes)
    bytes[bytes.startIndex] ^= 1
    return Envelope.encode(bytes)
  }
  static func selfTest() throws {
    let client = P256.KeyAgreement.PrivateKey(), firm = P256.KeyAgreement.PrivateKey()
    let other = P256.KeyAgreement.PrivateKey()
    let trusted = Envelope.TrustedRecipients(client: client.publicKey, firmRecovery: firm.publicKey)
    let sealed = try Envelope.seal(plaintext, context: context, recipients: trusted)
    var checks: [String] = []
    try require(try sealed.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: client) == plaintext, "Client could not decrypt")
    checks.append("client recipient decrypts original bytes")
    try require(try sealed.open(expectedContext: context, trustedRecipients: trusted, role: .firmRecovery, privateKey: firm) == plaintext, "Firm recovery could not decrypt")
    checks.append("separate firm recovery recipient decrypts original bytes")
    let restored = try JSONDecoder().decode(Envelope.self, from: JSONEncoder().encode(sealed))
    try require(restored == sealed, "Versioned serialization changed the envelope")
    checks.append("versioned serialization round trip")
    let json = String(decoding: try JSONEncoder().encode(sealed), as: UTF8.self)
    try require(!json.contains("000-12-3456") && !json.contains("SYNTHETIC TAX FIXTURE") && !json.contains("privateKey"), "Plaintext/private key appeared in host envelope")
    checks.append("host envelope contains neither plaintext fixture nor private-key fields")
    try rejects("wrong private key rejected", checks: &checks) {
      _ = try sealed.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: other)
    }
    try rejects("recipient role substitution rejected", checks: &checks) {
      _ = try sealed.open(expectedContext: context, trustedRecipients: trusted, role: .firmRecovery, privateKey: client)
    }
    var moved = context; moved.accountId = "different-client"
    try rejects("wrong expected account context rejected", checks: &checks) {
      _ = try sealed.open(expectedContext: moved, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    var relabeled = sealed; relabeled.context = moved
    try rejects("relabeled account context fails authenticated decryption", checks: &checks) {
      _ = try relabeled.open(expectedContext: moved, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    var revision = sealed; revision.context.revision = 2
    try rejects("revision relabeling fails authenticated decryption", checks: &checks) {
      _ = try revision.open(expectedContext: revision.context, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    var tampered = sealed; tampered.ciphertext = try changed(tampered.ciphertext)
    try rejects("payload tampering rejected", checks: &checks) {
      _ = try tampered.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    tampered = sealed; tampered.nonce = try changed(tampered.nonce)
    try rejects("content nonce tampering rejected", checks: &checks) {
      _ = try tampered.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    tampered = sealed; tampered.recipients[0].wrappedKey = try changed(tampered.recipients[0].wrappedKey)
    try rejects("wrapped content-key tampering rejected", checks: &checks) {
      _ = try tampered.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    tampered = sealed; tampered.recipients[0].encapsulatedKey = try changed(tampered.recipients[0].encapsulatedKey)
    try rejects("HPKE encapsulation tampering rejected", checks: &checks) {
      _ = try tampered.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    tampered = sealed; tampered.recipients.reverse()
    try rejects("recipient order substitution rejected", checks: &checks) {
      _ = try tampered.open(expectedContext: context, trustedRecipients: trusted, role: .client, privateKey: client)
    }
    let substituted = Envelope.TrustedRecipients(client: client.publicKey, firmRecovery: other.publicKey)
    try rejects("untrusted firm recovery key rejected", checks: &checks) {
      _ = try sealed.open(expectedContext: context, trustedRecipients: substituted, role: .client, privateKey: client)
    }
    try rejects("duplicate client and firm public keys rejected", checks: &checks) {
      _ = try Envelope.seal(plaintext, context: context, recipients: .init(client: client.publicKey, firmRecovery: client.publicKey))
    }
    var invalid = context; invalid.objectId = ".."
    try rejects("unsafe opaque object ID rejected", checks: &checks) { _ = try Envelope.seal(plaintext, context: invalid, recipients: trusted) }
    invalid.objectId = "synthetic-document\n"
    try rejects("trailing newline in opaque object ID rejected", checks: &checks) { _ = try Envelope.seal(plaintext, context: invalid, recipients: trusted) }
    let second = try Envelope.seal(plaintext, context: context, recipients: trusted)
    try require(second.nonce != sealed.nonce && second.ciphertext != sealed.ciphertext && second.recipients[0].encapsulatedKey != sealed.recipients[0].encapsulatedKey, "Object encryption reused randomness")
    checks.append("fresh content key nonce and HPKE context per object")
    try emit(["ok": true, "syntheticOnly": true, "scope": "Native CryptoKit envelope primitive; current application uploads remain unmigrated", "checks": checks])
  }
  static func fixture() throws {
    let client = P256.KeyAgreement.PrivateKey(), firm = P256.KeyAgreement.PrivateKey()
    let envelope = try Envelope.seal(plaintext, context: context,
      recipients: .init(client: client.publicKey, firmRecovery: firm.publicKey))
    try emit(["syntheticOnly": true, "context": object(context), "plaintext": Envelope.encode(plaintext),
      "clientPrivateKey": Envelope.encode(client.rawRepresentation), "firmRecoveryPrivateKey": Envelope.encode(firm.rawRepresentation),
      "clientPublicKey": Envelope.encode(client.publicKey.x963Representation), "firmRecoveryPublicKey": Envelope.encode(firm.publicKey.x963Representation),
      "envelope": object(envelope)])
  }
  static func input() throws -> Input {
    let bytes = FileHandle.standardInput.readDataToEndOfFile()
    guard bytes.count <= 24 * 1024 * 1024 else { throw ProofFailure(message: "Synthetic input too large") }
    let value = try JSONDecoder().decode(Input.self, from: bytes)
    guard value.syntheticOnly else { throw ProofFailure(message: "This proof accepts synthetic fixtures only") }
    return value
  }
  static func main() throws {
    switch CommandLine.arguments.dropFirst().first ?? "self-test" {
    case "self-test": try selfTest()
    case "fixture": try fixture()
    case "seal", "open":
      let value = try input()
      let client = try P256.KeyAgreement.PublicKey(x963Representation: Envelope.decode(value.clientPublicKey, count: 65))
      let firm = try P256.KeyAgreement.PublicKey(x963Representation: Envelope.decode(value.firmRecoveryPublicKey, count: 65))
      let trusted = Envelope.TrustedRecipients(client: client, firmRecovery: firm)
      if CommandLine.arguments[1] == "seal" {
        guard let text = value.plaintext else { throw ProofFailure(message: "Missing synthetic plaintext") }
        let bytes = try Envelope.decode(text, minimum: 1, maximum: Envelope.maximumCiphertextBytes - 16)
        try emit(["ok": true, "envelope": object(Envelope.seal(bytes, context: value.context, recipients: trusted))])
      } else {
        guard let envelope = value.envelope, let encodedKey = value.privateKey, let role = value.role else { throw ProofFailure(message: "Missing synthetic recipient input") }
        let key = try P256.KeyAgreement.PrivateKey(rawRepresentation: Envelope.decode(encodedKey, count: 32))
        let bytes = try envelope.open(expectedContext: value.context, trustedRecipients: trusted, role: role, privateKey: key)
        try emit(["ok": true, "plaintext": Envelope.encode(bytes)])
      }
    default: throw ProofFailure(message: "Use self-test, fixture, seal or open")
    }
  }
}
