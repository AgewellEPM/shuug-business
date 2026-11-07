import CryptoKit
import Foundation

/// Synthetic memory-only proof. Uses an injected store and never calls Security
/// services, opens an app, contacts a server, or reads real keys/client data.
@main struct SecureTaxEnrollmentProof {
  struct ProofFailure: Error { var message: String }
  final class MemoryStore: SecureTaxKeyStore {
    var values: [String: Data] = [:]
    func read(account: String) throws -> Data? { values[account] }
    func add(_ data: Data, account: String) throws {
      guard values[account] == nil else { throw ProofFailure(message: "Unexpected replacement") }
      values[account] = data
    }
    func update(_ data: Data, account: String) throws {
      guard values[account] != nil else { throw ProofFailure(message: "Unexpected creation") }
      values[account] = data
    }
  }
  static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw ProofFailure(message: message) }
  }
  static func rejects(_ label: String, _ checks: inout [String], _ work: () throws -> Void) throws {
    do { try work(); throw ProofFailure(message: "Rejected boundary accepted: " + label) }
    catch let error as ProofFailure { throw error }
    catch { checks.append(label) }
  }
  static func main() throws {
    let signer = P256.Signing.PrivateKey(), firm = P256.KeyAgreement.PrivateKey()
    let other = P256.KeyAgreement.PrivateKey()
    let pins = SecureTaxPublicPins(version: 1, workspaceOrigin: "https://synthetic.invalid",
      workspaceId: "synthetic-workspace", signerPublicKey: SecureTaxEnvelope.encode(signer.publicKey.x963Representation),
      firmRecoveryPublicKey: SecureTaxEnvelope.encode(firm.publicKey.x963Representation))
    let identity = SecureTaxIdentity(accountId: "synthetic-account", clientId: "synthetic-client")
    let scope = try SecureTaxKeyScope(pins: pins, identity: identity)
    let storage = MemoryStore(), keys = SecureTaxDeviceKeys(storage: MemoryStore())
    let device = SecureTaxDeviceKeys(storage: storage)
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let formatter = ISO8601DateFormatter()
    func sign(_ manifest: SecureTaxManifest, key: P256.Signing.PrivateKey = signer) throws -> SecureTaxManifest {
      var value = manifest
      value.signature.value = SecureTaxEnvelope.encode(try key.signature(for: value.canonicalBytes()).rawRepresentation)
      return value
    }
    func manifest(_ client: SecureTaxManifest.PublicRecipient, epoch: Int = 2) throws -> SecureTaxManifest {
      try sign(.init(version: 1, manifestId: "synthetic-approval-\(epoch)", workspaceId: pins.workspaceId,
        accountId: identity.accountId, clientId: identity.clientId, epoch: epoch, client: client,
        firmRecovery: .init(keyId: SecureTaxEnvelope.keyId(firm.publicKey), publicKey: pins.firmRecoveryPublicKey),
        issuedAt: formatter.string(from: now.addingTimeInterval(-60)), expiresAt: formatter.string(from: now.addingTimeInterval(3600)),
        signature: .init(algorithm: "ES256-P1363", signerKeyId: try pins.signerKeyId, value: "")))
    }
    var checks: [String] = []
    try rejects("missing bundled public pins disables setup", &checks) { _ = try SecureTaxPublicPins.bundled() }
    try require(try device.state(for: scope) == nil && storage.values.isEmpty, "Reading status generated a key")
    checks.append("reading status never generates a client key")
    let state = try device.createClientKey(for: scope)
    let restored = try SecureTaxDeviceKeys(storage: storage).createClientKey(for: scope)
    try require(restored.client == state.client && storage.values.count == 1, "Retry replaced the device key")
    checks.append("explicit setup persists one client key and reconnect preserves it")
    let separateScope = try SecureTaxKeyScope(pins: pins, identity: .init(accountId: "other-account", clientId: "other-client"))
    try require(try device.state(for: separateScope) == nil, "Another account saw an existing key")
    let separate = try device.createClientKey(for: separateScope)
    try require(separate.client != state.client && storage.values.count == 2, "Account keys were reused")
    checks.append("separate account and linked client use isolated keys")
    let request = try SecureTaxEnrollmentRequest(scope: scope, client: state.client).publicJSON()
    let requestObject = try JSONSerialization.jsonObject(with: Data(request.utf8)) as! [String: Any]
    try require(Set(requestObject.keys) == ["version", "workspaceId", "accountId", "clientId", "client"] && !request.contains("private"), "Enrollment request exposed private fields")
    checks.append("enrollment request exports only exact public signing input")
    let storedText = String(decoding: storage.values.values.reduce(Data(), +), as: UTF8.self)
    try require(!storedText.contains(firm.rawRepresentation.base64EncodedString()) && !storedText.contains(signer.rawRepresentation.base64EncodedString()), "Firm private key was stored")
    checks.append("client custody never stores synthetic firm recovery or signer private key")
    let valid = try manifest(state.client)
    _ = try device.stage(valid, scope: scope, pins: pins, now: now)
    let restoredDevice = SecureTaxDeviceKeys(storage: storage)
    _ = try restoredDevice.verifiedRecipients(scope: scope, pins: pins, now: now)
    try require(try restoredDevice.state(for: scope)?.stagedManifest == valid, "Verified manifest did not persist")
    checks.append("signed approval verifies and survives service reconstruction")
    let roundTrip = try SecureTaxManifest.decode(JSONEncoder().encode(valid))
    try require(roundTrip == valid, "Manifest serialization changed signed fields")
    checks.append("signed public manifest round trip")
    try rejects("approval import before explicit device-key setup rejected", &checks) { _ = try keys.stage(valid, scope: scope, pins: pins, now: now) }
    try rejects("wrong linked account rejected", &checks) {
      var changed = valid; changed.accountId = "wrong-account"
      _ = try device.stage(sign(changed), scope: scope, pins: pins, now: now)
    }
    try rejects("wrong linked client rejected", &checks) {
      var changed = valid; changed.clientId = "wrong-client"
      _ = try device.stage(sign(changed), scope: scope, pins: pins, now: now)
    }
    try rejects("wrong workspace rejected", &checks) {
      var changed = valid; changed.workspaceId = "wrong-workspace"
      _ = try device.stage(sign(changed), scope: scope, pins: pins, now: now)
    }
    try rejects("different device client key rejected", &checks) {
      _ = try device.stage(manifest(separate.client), scope: scope, pins: pins, now: now)
    }
    try rejects("untrusted recovery key rejected even with valid firm signature", &checks) {
      var changed = valid; changed.firmRecovery = .init(keyId: SecureTaxEnvelope.keyId(other.publicKey), publicKey: SecureTaxEnvelope.encode(other.publicKey.x963Representation))
      _ = try device.stage(sign(changed), scope: scope, pins: pins, now: now)
    }
    try rejects("mismatched client fingerprint rejected", &checks) {
      var changed = valid; changed.client.keyId = SecureTaxEnvelope.keyId(other.publicKey)
      _ = try device.stage(sign(changed), scope: scope, pins: pins, now: now)
    }
    try rejects("untrusted signer rejected", &checks) {
      let badSigner = P256.Signing.PrivateKey()
      var changed = valid
      changed.signature.signerKeyId = SecureTaxEnvelope.encode(Data(SHA256.hash(data: badSigner.publicKey.x963Representation)))
      _ = try device.stage(sign(changed, key: badSigner), scope: scope, pins: pins, now: now)
    }
    try rejects("signature tampering rejected", &checks) {
      var changed = valid; var bytes = try SecureTaxEnvelope.decode(changed.signature.value, count: 64); bytes[0] ^= 1
      changed.signature.value = SecureTaxEnvelope.encode(bytes)
      _ = try device.stage(changed, scope: scope, pins: pins, now: now)
    }
    try rejects("expired signed approval rejected", &checks) {
      _ = try device.stage(valid, scope: scope, pins: pins, now: now.addingTimeInterval(7200))
    }
    try rejects("future signed approval rejected", &checks) {
      _ = try device.stage(valid, scope: scope, pins: pins, now: now.addingTimeInterval(-600))
    }
    try rejects("older approval epoch rejected after restart", &checks) {
      _ = try restoredDevice.stage(manifest(state.client, epoch: 1), scope: scope, pins: pins, now: now)
    }
    try rejects("changed approval at same epoch rejected", &checks) {
      var changed = valid; changed.manifestId = "different-signed-approval"
      _ = try restoredDevice.stage(sign(changed), scope: scope, pins: pins, now: now)
    }
    _ = try restoredDevice.stage(manifest(state.client, epoch: 3), scope: scope, pins: pins, now: now)
    checks.append("newer signed approval epoch accepted")
    try rejects("unknown manifest fields rejected", &checks) {
      var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(valid)) as! [String: Any]
      object["privateKey"] = "forbidden"
      _ = try SecureTaxManifest.decode(JSONSerialization.data(withJSONObject: object))
    }
    try rejects("private-shaped public pin rejected", &checks) {
      var changed = pins; changed.firmRecoveryPublicKey = SecureTaxEnvelope.encode(firm.rawRepresentation)
      _ = try SecureTaxPublicPins.decode(JSONEncoder().encode(changed))
    }
    try rejects("unsafe identifier newline rejected", &checks) {
      _ = try SecureTaxKeyScope(pins: pins, identity: .init(accountId: "synthetic-account\n", clientId: identity.clientId))
    }
    let status = SecureTaxServerStatus(enrolled: false, keyProvisioningEnabled: true, identity: identity)
    try status.validate(accountId: identity.accountId)
    try rejects("status for another authenticated account rejected", &checks) { try status.validate(accountId: "other-account") }
    try rejects("API origin cannot replace signed-app workspace pin", &checks) {
      var wrongPins = pins; wrongPins.workspaceOrigin = "https://other.invalid"
      _ = try restoredDevice.verifiedRecipients(scope: scope, pins: wrongPins, now: now)
    }
    let result: [String: Any] = ["ok": true, "syntheticOnly": true,
      "scope": "Signed enrollment and injected memory custody; no real Keychain or activation", "checks": checks]
    let output = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(decoding: output, as: UTF8.self))
  }
}
