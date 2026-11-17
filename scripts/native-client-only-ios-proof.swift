import CryptoKit
import DriverCore
import Foundation

/// Disposable synthetic inputs and an in-memory Keychain substitute only.
/// This executable never opens a real Keychain, account, UI or network session.
@main struct ClientOnlyIOSProof {
  struct Failure: Error { var message: String }
  final class MemoryStore: SecureTaxKeyStore {
    var values: [String: Data] = [:]
    func read(account: String) throws -> Data? { values[account] }
    func add(_ data: Data, account: String) throws { guard values[account] == nil else { throw Failure(message: "Existing test item") }; values[account] = data }
    func update(_ data: Data, account: String) throws { guard values[account] != nil else { throw Failure(message: "Missing test item") }; values[account] = data }
  }
  final class MemoryTransport: PrivateTaxObjectTransport {
    let pins: PrivateTaxPins
    var attempts = 0, commits = 0
    var failAfterCommit = true
    var mutations: [String: (Data, Data)] = [:]
    var envelopes: [PrivateTaxEnvelope] = []
    init(pins: PrivateTaxPins) { self.pins = pins }
    struct AmbiguousNetwork: Error {}
    func putObject(_ objectId: String, token: String, body: Data) async throws -> Data {
      attempts += 1
      let input = try PrivateTaxWire.object(body, fields: ["mutationId", "expectedRevision", "envelope"])
      let mutation = input["mutationId"] as! String
      if let previous = mutations[mutation] {
        guard previous.0 == body else { throw Failure(message: "Idempotent retry changed its ciphertext bytes") }; return previous.1
      }
      let envelope = try PrivateTaxEnvelope.decode(PrivateTaxWire.json(input["envelope"]!))
      guard envelope.context.objectId == objectId, envelope.version == 3, envelope.profile == "client-only-v1", envelope.recipients.count == 1 else { throw Failure(message: "Legacy/foreign dispatch") }
      commits += 1; envelopes.append(envelope)
      let response = try JSONEncoder().encode(SecureTaxObjectReceipt(objectId: objectId, revision: envelope.context.revision, sequence: commits, deleted: false))
      mutations[mutation] = (body, response)
      if failAfterCommit { failAfterCommit = false; throw AmbiguousNetwork() }
      return response
    }
  }
  static func require(_ condition: Bool, _ message: String) throws { if !condition { throw Failure(message: message) } }
  static func rejects(_ label: String, _ checks: inout [String], _ operation: () throws -> Void) throws {
    do { try operation(); throw Failure(message: "Unexpected acceptance: " + label) }
    catch let error as Failure { throw error }
    catch { checks.append(label) }
  }
  static func json<T: Encodable>(_ value: T) throws -> [String: Any] { try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as! [String: Any] }
  static func main() async throws {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard let input = try JSONSerialization.jsonObject(with: data) as? [String: Any], input["syntheticOnly"] as? Bool == true,
      let publicKey = input["clientPublicKey"] as? String, let privateText = input["clientPrivateKey"] as? String, let plaintext = input["plaintext"] as? String,
      let manifestObject = input["manifest"], let envelopeObject = input["envelope"], let pinsObject = input["nativePins"], let contextObject = input["context"], let generatedAt = input["generatedAt"] as? String else { throw Failure(message: "Supply a disposable synthetic JS fixture") }
    let pins = try PrivateTaxPins.decode(PrivateTaxWire.json(pinsObject)), manifest = try PrivateTaxManifest.decode(PrivateTaxWire.json(manifestObject)), envelope = try PrivateTaxEnvelope.decode(PrivateTaxWire.json(envelopeObject))
    let key = try P256.KeyAgreement.PrivateKey(rawRepresentation: SecureTaxEnvelope.decode(privateText, count: 32)), context = try JSONDecoder().decode(SecureTaxEnvelope.Context.self, from: PrivateTaxWire.json(contextObject))
    let identity = SecureTaxIdentity(accountId: manifest.accountId, clientId: manifest.clientId), scope = try PrivateTaxScope(pins: pins, identity: identity), now = try PrivateTaxWire.date(generatedAt)
    _ = try manifest.verify(pins: pins, identity: identity, localPublicKey: publicKey, now: now)
    let bytes = try envelope.open(expected: context, publicKey: key.publicKey, privateKey: key)
    try require(SecureTaxEnvelope.encode(bytes) == plaintext, "JS to CryptoKit plaintext mismatch")
    var checks = ["JS manifest v2 signature verified by CryptoKit", "JS envelope v3 decrypted by CryptoKit"]
    let native = try PrivateTaxEnvelope.seal(bytes, context: context, publicKey: key.publicKey, privateKey: key)
    let roundtrip = try native.open(expected: context, publicKey: key.publicKey, privateKey: key)
    try require(roundtrip == bytes, "Native roundtrip mismatch"); checks.append("CryptoKit fresh v3 roundtrip")
    for field in ["unrelatedFirmPrivateKey", "signerPrivateKey"] {
      let wrong = try P256.KeyAgreement.PrivateKey(rawRepresentation: SecureTaxEnvelope.decode(input[field] as! String, count: 32))
      try rejects(field + " cannot decrypt", &checks) { _ = try envelope.open(expected: context, publicKey: key.publicKey, privateKey: wrong) }
      try rejects(field + " cannot author", &checks) { _ = try PrivateTaxEnvelope.seal(bytes, context: context, publicKey: key.publicKey, privateKey: wrong) }
    }
    for (label, value) in [("extra recipient", ["recipients": (try json(envelope)["recipients"] as! [Any]) + (try json(envelope)["recipients"] as! [Any])]), ("firm author", ["author": ["role": "firm-recovery", "keyId": manifest.client.keyId]]), ("legacy v2 envelope", ["version": 2]), ("unknown profile", ["profile": "legacy"]), ("extra recovery metadata", ["firmRecovery": ["publicKey": publicKey]])] as [(String, [String: Any])] {
      var changed = try json(envelope); changed.merge(value) { _, next in next }
      try rejects(label, &checks) { _ = try PrivateTaxEnvelope.decode(PrivateTaxWire.json(changed)) }
    }
    var wrongContext = context; wrongContext.revision += 1
    try rejects("wrong revision context", &checks) { _ = try envelope.open(expected: wrongContext, publicKey: key.publicKey, privateKey: key) }
    var legacyManifest = try json(manifest); legacyManifest["firmRecovery"] = ["publicKey": publicKey]
    try rejects("legacy manifest cannot import recovery authority", &checks) { _ = try PrivateTaxManifest.decode(PrivateTaxWire.json(legacyManifest)) }
    let signer = try P256.Signing.PrivateKey(rawRepresentation: SecureTaxEnvelope.decode(input["signerPrivateKey"] as! String, count: 32))
    func signed(_ source: PrivateTaxManifest) throws -> PrivateTaxManifest { var value = source; value.signature.value = SecureTaxEnvelope.encode(try signer.signature(for: value.canonicalBytes()).rawRepresentation); return value }
    let other = P256.KeyAgreement.PrivateKey()
    var changed = manifest; changed.client = .init(keyId: SecureTaxEnvelope.keyId(other.publicKey), publicKey: SecureTaxEnvelope.encode(other.publicKey.x963Representation)); changed.epoch += 1; changed = try signed(changed)
    try rejects("owner-signed replacement cannot replace locally held client key", &checks) { _ = try changed.verify(pins: pins, identity: identity, localPublicKey: publicKey, now: now) }
    var badTime = manifest; badTime.issuedAt = String(manifest.issuedAt.prefix(19)) + "Z"; badTime = try signed(badTime)
    try rejects("noncanonical signed timestamps", &checks) { _ = try badTime.verify(pins: pins, identity: identity, localPublicKey: publicKey, now: now) }
    try rejects("expired manifest", &checks) { _ = try manifest.verify(pins: pins, identity: identity, localPublicKey: publicKey, now: PrivateTaxWire.date(manifest.expiresAt)) }
    let memory = MemoryStore(), keys = PrivateTaxDeviceKeys(storage: memory)
    try keys.stage(key: key, manifest: manifest, scope: scope, pins: pins, now: now)
    var renewal = manifest; renewal.epoch += 1; renewal = try signed(renewal)
    try keys.stage(key: key, manifest: renewal, scope: scope, pins: pins, now: now); checks.append("same-key higher epoch accepted")
    try rejects("epoch rollback", &checks) { try keys.stage(key: key, manifest: manifest, scope: scope, pins: pins, now: now) }
    try rejects("local immutable binding rejects signed replacement", &checks) { try keys.stage(key: other, manifest: changed, scope: scope, pins: pins, now: now) }
    var changedIdentity = identity; changedIdentity.clientId = "synthetic-changed-client"
    let changedScope = try PrivateTaxScope(pins: pins, identity: changedIdentity)
    var changedClientIdManifest = manifest; changedClientIdManifest.clientId = changedIdentity.clientId; changedClientIdManifest.epoch += 1; changedClientIdManifest = try signed(changedClientIdManifest)
    try rejects("account anchor rejects changed clientId despite valid same-key signature", &checks) { try keys.stage(key: key, manifest: changedClientIdManifest, scope: changedScope, pins: pins, now: now) }
    try rejects("server status cannot bypass anchor by selecting new clientId namespace", &checks) { _ = try keys.refresh(manifest: changedClientIdManifest, scope: changedScope, pins: pins) }
    memory.values.removeValue(forKey: try "client-only-key-" + scope.storageAccount)
    try rejects("missing key row cannot roll back permanent observed epoch", &checks) { try keys.stage(key: key, manifest: manifest, scope: scope, pins: pins, now: now) }
    var reusedEpoch = renewal; reusedEpoch.expiresAt = PrivateTaxWire.iso(try PrivateTaxWire.date(renewal.expiresAt).addingTimeInterval(60)); reusedEpoch = try signed(reusedEpoch)
    try rejects("missing key row cannot replace canonical manifest at observed epoch", &checks) { try keys.stage(key: key, manifest: reusedEpoch, scope: scope, pins: pins, now: now) }
    try rejects("empty key store retains immutable account anchor", &checks) { try keys.stage(key: other, manifest: changed, scope: scope, pins: pins, now: now) }
    guard let backup = input["syntheticBackup"], let passphrase = input["syntheticPassphrase"] as? String else { throw Failure(message: "Synthetic browser backup is required") }
    let imported = try PrivateTaxBackup.open(PrivateTaxWire.json(backup), passphrase: passphrase)
    try require(imported.publicKey.x963Representation == key.publicKey.x963Representation, "JS PKCS8 backup mismatch"); checks.append("JS PBKDF2/AES-GCM/PKCS8 backup imported with Unicode passphrase")
    try rejects("incorrect backup passphrase", &checks) { _ = try PrivateTaxBackup.open(PrivateTaxWire.json(backup), passphrase: "SYNTHETIC WRONG PASSPHRASE") }
    var oldBackup = backup as! [String: Any]; oldBackup["manifest"] = manifestObject
    try rejects("backup cannot import a legacy manifest or retry queue", &checks) { _ = try PrivateTaxBackup.open(PrivateTaxWire.json(oldBackup), passphrase: passphrase) }
    let proof = try PrivateTaxActivationProof.decode(PrivateTaxWire.json(input["activationChallenge"]!))
    let answer = try proof.open(manifest: manifest, pins: pins, identity: identity, privateKey: key, now: now)
    try require(answer == input["activationAnswer"] as? String, "Activation answer mismatch"); checks.append("JS activation HPKE Base proof opened by CryptoKit")
    var wrongProof = proof; wrongProof.profile = "legacy"
    try rejects("activation binds profile", &checks) { _ = try wrongProof.open(manifest: manifest, pins: pins, identity: identity, privateKey: key, now: now) }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("SYNTHETIC-client-only-checkpoints-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = PrivateTaxCheckpointStore(directory: directory)
    var checkpoint = try store.load(scope: scope, name: "journal", publicKey: key.publicKey)
    checkpoint.pending = .init(mutationId: UUID().uuidString.lowercased(), expectedRevision: 0, contentSHA256: SecureTaxEnvelope.encode(Data(SHA256.hash(data: bytes))), envelope: try PrivateTaxEnvelope.seal(bytes, context: .init(workspaceId: scope.workspaceId, accountId: scope.identity.accountId, objectId: checkpoint.objectId, revision: 1, domain: .driverState), publicKey: key.publicKey, privateKey: key))
    try store.save(checkpoint, name: "journal", publicKey: key.publicKey)
    let saved = try store.load(scope: scope, name: "journal", publicKey: key.publicKey)
    try require(saved.pending?.envelope == checkpoint.pending?.envelope, "Pending ciphertext changed during reload"); checks.append("saved pending mutation preserves exact ciphertext across reload")
    let file = try directory.appendingPathComponent(scope.storageAccount + "-journal.json")
    var old = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any], oldPending = old["pending"] as! [String: Any], oldEnvelope = oldPending["envelope"] as! [String: Any]
    oldEnvelope["version"] = 2; oldPending["envelope"] = oldEnvelope; old["pending"] = oldPending
    let original = try PrivateTaxWire.json(old); try original.write(to: file)
    try rejects("legacy pending rejected before dispatch", &checks) { _ = try store.load(scope: scope, name: "journal", publicKey: key.publicKey) }
    try require(Data(contentsOf: file) == original, "Rejected original checkpoint was changed"); checks.append("rejected legacy pending original preserved")
    // Exercise the real prepare/save/dispatch/acknowledgment implementation,
    // using a synthetic server that loses the first response after committing.
    try keys.stage(key: imported, manifest: renewal, scope: scope, pins: pins, now: now)
    let transport = MemoryTransport(pins: pins), authenticated = PrivateTaxSession(apiVersion: 1, token: String(repeating: "a", count: 64), expiresAt: manifest.expiresAt, identity: identity)
    let integrationDirectory = directory.appendingPathComponent("integration"), integrationStore = PrivateTaxCheckpointStore(directory: integrationDirectory)
    let sync = try PrivateTaxSync(http: transport, authenticated: authenticated, keys: keys, checkpoints: integrationStore)
    do { try await sync.journal(Journal()); throw Failure(message: "Expected simulated lost response") }
    catch is MemoryTransport.AmbiguousNetwork { checks.append("lost server acknowledgment retains exact encrypted pending upload") }
    try await sync.journal(Journal())
    try require(transport.attempts == 2 && transport.commits == 1, "Retry did not reuse its mutation/ciphertext")
    let afterRetry = try integrationStore.load(scope: scope, name: "journal", publicKey: key.publicKey)
    try require(afterRetry.pending == nil && afterRetry.revision == 1, "Acknowledgment did not persist")
    try await sync.journal(Journal()); try require(transport.attempts == 2, "Unchanged Journal uploaded again")
    checks.append("real snapshot sync retries exact bytes, persists receipt, suppresses unchanged v3 upload")
    let uploaded = transport.envelopes[0], opened = try uploaded.open(expected: uploaded.context, publicKey: key.publicKey, privateKey: key)
    let payload = try JSONSerialization.jsonObject(with: opened) as! [String: Any], binding = payload["binding"] as! [String: Any]
    try require(payload["type"] as? String == "driver-journal" && binding["objectId"] as? String == uploaded.context.objectId, "Journal binding and envelope routing differ")
    let receipt = LocalReceipt(id: UUID(), mime: "application/pdf"), receiptBytes = Data("%PDF-1.4 SYNTHETIC PRIVATE RECEIPT".utf8)
    try await sync.receipt(receipt, bytes: receiptBytes); try await sync.receipt(receipt, bytes: receiptBytes)
    try require(transport.commits == 2 && transport.attempts == 3, "Unchanged receipt re-uploaded")
    let uploadedReceipt = transport.envelopes[1], receiptPayload = try uploadedReceipt.open(expected: uploadedReceipt.context, publicKey: key.publicKey, privateKey: key)
    let receiptObject = try JSONSerialization.jsonObject(with: receiptPayload) as! [String: Any]
    try require(uploadedReceipt.context.domain == .driverReceipt && receiptObject["data"] as? String == SecureTaxEnvelope.encode(receiptBytes), "Receipt did not use its actual private-file envelope")
    checks.append("actual receipt sync encrypts private-file bytes and acknowledges only new-profile fingerprint")
    let request = try PrivateTaxHTTP(pins: pins).makeRequest("objects/" + uploaded.context.objectId, method: "PUT", token: authenticated.token, body: Data("{}".utf8))
    try require(request.url?.path.hasPrefix("/api/website/customer/client-only/objects/") == true && request.value(forHTTPHeaderField: "Cookie") == nil && request.value(forHTTPHeaderField: "Origin") == nil, "Wrong native endpoint or browser credentials")
    checks.append("actual HTTP request builder uses client-only native bearer namespace")
    try rejects("unknown HTTP namespace", &checks) { _ = try PrivateTaxHTTP(pins: pins).makeRequest("../secure/objects") }
    let googleItems = ["client_id": "synthetic-client", "redirect_uri": pins.workspaceOrigin + "/api/auth/social/google/callback", "response_type": "code", "scope": "openid", "state": String(repeating: "a", count: 43), "nonce": String(repeating: "b", count: 43), "code_challenge": String(repeating: "c", count: 43), "code_challenge_method": "S256", "prompt": "select_account"]
    var google = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!; google.queryItems = googleItems.map { URLQueryItem(name: $0.key, value: $0.value) }
    _ = try PrivateTaxSocialAuthorization.validate(google.url!.absoluteString, provider: "google", pins: pins)
    checks.append("external Google authorization uses minimal openid and pinned callback")
    var foreignGoogle = google; foreignGoogle.host = "accounts.google.com.changed-discovery.example"
    try rejects("provider lookalike host", &checks) { _ = try PrivateTaxSocialAuthorization.validate(foreignGoogle.url!.absoluteString, provider: "google", pins: pins) }
    var broadGoogle = google; broadGoogle.queryItems = google.queryItems!.map { $0.name == "scope" ? URLQueryItem(name: "scope", value: "openid email profile") : $0 }
    try rejects("provider cannot request extra contact scopes", &checks) { _ = try PrivateTaxSocialAuthorization.validate(broadGoogle.url!.absoluteString, provider: "google", pins: pins) }
    var extraGoogle = google; extraGoogle.queryItems!.append(URLQueryItem(name: "login_hint", value: "forbidden@example.invalid"))
    try rejects("unknown provider authorization parameters", &checks) { _ = try PrivateTaxSocialAuthorization.validate(extraGoogle.url!.absoluteString, provider: "google", pins: pins) }
    var oldCallback = google; oldCallback.queryItems = google.queryItems!.map { $0.name == "redirect_uri" ? URLQueryItem(name: "redirect_uri", value: pins.workspaceOrigin + "/api/auth/social/callback/google") : $0 }
    try rejects("obsolete callback path", &checks) { _ = try PrivateTaxSocialAuthorization.validate(oldCallback.url!.absoluteString, provider: "google", pins: pins) }
    var apple = URLComponents(string: "https://appleid.apple.com/auth/authorize")!
    apple.queryItems = ["client_id": "synthetic.apple.client", "redirect_uri": pins.workspaceOrigin + "/api/auth/social/apple/callback", "response_type": "code", "state": String(repeating: "a", count: 43), "nonce": String(repeating: "b", count: 43), "response_mode": "query"].map { URLQueryItem(name: $0.key, value: $0.value) }
    _ = try PrivateTaxSocialAuthorization.validate(apple.url!.absoluteString, provider: "apple", pins: pins); checks.append("external Apple authorization matches actual query/code callback contract")
    var wrongApple = apple; wrongApple.queryItems = apple.queryItems!.map { $0.name == "response_mode" ? URLQueryItem(name: "response_mode", value: "form_post") : $0 }
    try rejects("wrong Apple response mode", &checks) { _ = try PrivateTaxSocialAuthorization.validate(wrongApple.url!.absoluteString, provider: "apple", pins: pins) }
    let expiredMFA = PrivateTaxMFA(apiVersion: 1, mfaRequired: true, challengeToken: String(repeating: "a", count: 64), enrollmentRequired: false, expiresAt: PrivateTaxWire.iso(now.addingTimeInterval(-1)), secret: nil)
    try rejects("MFA expiry cannot be bypassed by provider login", &checks) { try expiredMFA.validate(now: now) }
    let production = URL(string: PrivateTaxPins.productionOrigin)!
    try rejects("missing production pins fail closed", &checks) { _ = try SecureTaxTransportPolicy.requiresProtectedTransport(origin: production, configuration: nil) }
    try require(SecureTaxTransportPolicy.requiresProtectedTransport(origin: URL(string: pins.workspaceOrigin)!, configuration: JSONEncoder().encode(pins)), "v2 policy missing")
    try rejects("discovery cannot redirect v2 pins to a foreign workspace", &checks) { _ = try SecureTaxTransportPolicy.requiresProtectedTransport(origin: URL(string: "https://changed-discovery.example")!, configuration: JSONEncoder().encode(pins)) }
    for origin in [URL(string: pins.workspaceOrigin)!, URL(string: "https://changed-discovery.example")!] {
      for path in ["session", "records", "receipts", "profile", "tax-work"] {
        try rejects("client-only distribution blocks legacy " + path + " at " + (origin.host ?? ""), &checks) { try SecureTaxTransportPolicy.assertLegacyAllowed(origin: origin, group: .driver, path: path, method: "POST") }
      }
    }
    try rejects("legacy plaintext writes blocked", &checks) { try SecureTaxTransportPolicy.assertLegacyAllowed(protectedWorkspace: true, group: .driver, path: "records", method: "POST") }
    var output: [String: Any] = ["syntheticOnly": true, "ok": true, "checks": checks, "envelope": try json(native), "plaintext": SecureTaxEnvelope.encode(bytes)]
    output["scopeNamespace"] = try scope.storageAccount
    print(String(decoding: try PrivateTaxWire.json(output), as: UTF8.self))
  }
}
