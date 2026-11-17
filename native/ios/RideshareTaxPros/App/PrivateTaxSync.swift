import CryptoKit
import DriverCore
import Foundation

/// Separate directory and profile-bound metadata: legacy acknowledgments and v2
/// pending wraps never suppress an upload or enter the client-only dispatch path.
struct PrivateTaxCheckpoint: Codable {
  struct Pending: Codable { var mutationId: String; var expectedRevision: Int; var contentSHA256: String; var envelope: PrivateTaxEnvelope }
  var version = 2; var profile = PrivateTaxWire.profile; var scope: PrivateTaxScope
  var objectId: String; var revision = 0; var sequence = 0; var acknowledgedSHA256: String?; var pending: Pending?
  func validate(scope expected: PrivateTaxScope, publicKey: P256.KeyAgreement.PublicKey) throws {
    guard version == 2, profile == PrivateTaxWire.profile, scope == expected, (0...1_000_000_000).contains(revision), (0...9_007_199_254_740_991).contains(sequence) else { throw PrivateTaxWire.fail("The saved pending ciphertext uses another profile or account. Its original file is preserved for review.") }
    try SecureTaxJournalSnapshot.validateObjectID(objectId)
    if let acknowledgedSHA256 { _ = try SecureTaxEnvelope.decode(acknowledgedSHA256, count: 32) }
    if let pending {
      try SecureTaxJournalSnapshot.validateObjectID(pending.mutationId); _ = try SecureTaxEnvelope.decode(pending.contentSHA256, count: 32)
      guard pending.expectedRevision == revision, pending.envelope.context.objectId == objectId, pending.envelope.context.workspaceId == scope.workspaceId, pending.envelope.context.accountId == scope.identity.accountId, pending.envelope.context.revision == revision + 1 else { throw PrivateTaxWire.fail() }
      try pending.envelope.validate(expected: pending.envelope.context, publicKey: publicKey)
    }
  }
}
struct PrivateTaxCheckpointStore {
  let directory: URL
  init(directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("RideshareTaxPros/ClientOnlySnapshots/client-only-v1", isDirectory: true)) { self.directory = directory }
  private func file(scope: PrivateTaxScope, name: String) throws -> URL {
    guard name.range(of: #"^(journal|receipt-[a-f0-9-]{36})$"#, options: .regularExpression) != nil else { throw PrivateTaxWire.fail() }
    return try directory.appendingPathComponent(scope.storageAccount + "-" + name + ".json")
  }
  func load(scope: PrivateTaxScope, name: String, publicKey: P256.KeyAgreement.PublicKey) throws -> PrivateTaxCheckpoint {
    let url = try file(scope: scope, name: name)
    guard FileManager.default.fileExists(atPath: url.path) else { return .init(scope: scope, objectId: UUID().uuidString.lowercased()) }
    let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
    let data = try handle.read(upToCount: 24 * 1024 * 1024 + 1) ?? Data()
    guard data.count <= 24 * 1024 * 1024, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(object.keys).isSubset(of: ["version", "profile", "scope", "objectId", "revision", "sequence", "acknowledgedSHA256", "pending"]), Set(["version", "profile", "scope", "objectId", "revision", "sequence"]).isSubset(of: Set(object.keys)) else { throw PrivateTaxWire.fail() }
    if let pending = object["pending"] as? [String: Any], let envelope = pending["envelope"] { _ = try PrivateTaxEnvelope.decode(PrivateTaxWire.json(envelope)) }
    let value = try JSONDecoder().decode(PrivateTaxCheckpoint.self, from: data)
    try value.validate(scope: scope, publicKey: publicKey); return value
  }
  func save(_ value: PrivateTaxCheckpoint, name: String, publicKey: P256.KeyAgreement.PublicKey) throws {
    try value.validate(scope: value.scope, publicKey: publicKey)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let url = try file(scope: value.scope, name: name)
    try JSONEncoder().encode(value).write(to: url, options: .atomic)
    var attributes: [FileAttributeKey: Any] = [.posixPermissions: 0o600]
    #if os(iOS)
    attributes[.protectionKey] = FileProtectionType.complete
    #endif
    try FileManager.default.setAttributes(attributes, ofItemAtPath: url.path)
    var target = url, resource = URLResourceValues(); resource.isExcludedFromBackup = true; try target.setResourceValues(resource)
  }
}

final class PrivateTaxSync {
  let http: any PrivateTaxObjectTransport; let authenticated: PrivateTaxSession; let scope: PrivateTaxScope
  let keys: PrivateTaxDeviceKeys; let checkpoints: PrivateTaxCheckpointStore
  init(http: any PrivateTaxObjectTransport, authenticated: PrivateTaxSession, keys: PrivateTaxDeviceKeys = .init(), checkpoints: PrivateTaxCheckpointStore = .init()) throws {
    self.http = http; self.authenticated = authenticated; self.scope = try PrivateTaxScope(pins: http.pins, identity: authenticated.identity); self.keys = keys; self.checkpoints = checkpoints
  }
  /// Saves a mutation and exact ciphertext before network I/O. A failed response
  /// leaves the identical request retryable; success acknowledges only its hash.
  func upload(payload: Data, name: String, domain: SecureTaxEnvelope.Domain, fingerprint: String? = nil) async throws {
    try authenticated.validate()
    let digest = fingerprint ?? SecureTaxEnvelope.encode(Data(SHA256.hash(data: payload)))
    var checkpoint = try keys.withKey(scope: scope, pins: http.pins) { key, _ in
      var saved = try checkpoints.load(scope: scope, name: name, publicKey: key.publicKey)
      if saved.pending == nil, saved.acknowledgedSHA256 != digest {
        guard saved.revision < 1_000_000_000 else { throw PrivateTaxWire.fail("This encrypted archive exhausted its revision space. Keep it for review.") }
        let context = PrivateTaxEnvelope.Context(workspaceId: scope.workspaceId, accountId: scope.identity.accountId, objectId: saved.objectId, revision: saved.revision + 1, domain: domain)
        saved.pending = .init(mutationId: UUID().uuidString.lowercased(), expectedRevision: saved.revision, contentSHA256: digest, envelope: try PrivateTaxEnvelope.seal(payload, context: context, publicKey: key.publicKey, privateKey: key))
        try checkpoints.save(saved, name: name, publicKey: key.publicKey)
      }
      return saved
    }
    guard let pending = checkpoint.pending else { return }
    // Validate again immediately before dispatch; downloaded status cannot choose
    // a recipient or cause a legacy pending envelope to be sent.
    try keys.withKey(scope: scope, pins: http.pins) { key, _ in
      try checkpoint.validate(scope: scope, publicKey: key.publicKey)
      guard pending.envelope.context.domain == domain else { throw PrivateTaxWire.fail() }
    }
    struct Input: Encodable { var mutationId: String; var expectedRevision: Int; var envelope: PrivateTaxEnvelope }
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let body = try encoder.encode(Input(mutationId: pending.mutationId, expectedRevision: pending.expectedRevision, envelope: pending.envelope))
    let response = try await http.putObject(checkpoint.objectId, token: authenticated.token, body: body)
    let receipt = try JSONDecoder().decode(SecureTaxObjectReceipt.self, from: response); try receipt.validate()
    guard receipt.objectId == checkpoint.objectId, receipt.revision == pending.expectedRevision + 1, receipt.sequence > checkpoint.sequence, !receipt.deleted else { throw PrivateTaxWire.fail("The ciphertext acknowledgment did not match the pending object and revision.") }
    try keys.withKey(scope: scope, pins: http.pins) { key, _ in
      let current = try checkpoints.load(scope: scope, name: name, publicKey: key.publicKey)
      guard current.pending?.mutationId == pending.mutationId else { throw PrivateTaxWire.fail("The local pending object changed; its newer bytes were kept.") }
      checkpoint.revision = receipt.revision; checkpoint.sequence = receipt.sequence; checkpoint.acknowledgedSHA256 = pending.contentSHA256; checkpoint.pending = nil
      try checkpoints.save(checkpoint, name: name, publicKey: key.publicKey)
    }
    if pending.contentSHA256 != digest { try await upload(payload: payload, name: name, domain: domain, fingerprint: fingerprint) }
  }
  func journal(_ journal: Journal) async throws {
    let key = try keys.withKey(scope: scope, pins: http.pins) { key, _ in key.publicKey }
    let checkpoint = try checkpoints.load(scope: scope, name: "journal", publicKey: key)
    try checkpoints.save(checkpoint, name: "journal", publicKey: key)
    let binding = SecureTaxJournalSnapshot.Binding(workspaceId: scope.workspaceId, accountId: scope.identity.accountId, clientId: scope.identity.clientId, objectId: checkpoint.objectId)
    // Capture time is authenticated but excluded from the change fingerprint.
    let capturedAt = Date()
    let snapshot = SecureTaxJournalSnapshot(version: 1, type: "driver-journal", binding: binding, capturedAt: capturedAt, journal: journal)
    var payload = try snapshot.encoded(); defer { payload.resetBytes(in: 0..<payload.count) }
    try await upload(payload: payload, name: "journal", domain: .driverState, fingerprint: SecureTaxJournalSnapshot.journalSHA256(journal))
  }
  func receipt(_ receipt: LocalReceipt, bytes: Data) async throws {
    guard !bytes.isEmpty, bytes.count <= 10 * 1024 * 1024, ["image/jpeg", "image/png", "application/pdf"].contains(receipt.mime) else { throw PrivateTaxWire.fail("The local receipt format or size is unsupported. Keep its original file.") }
    let suffix = receipt.mime == "application/pdf" ? "pdf" : receipt.mime == "image/png" ? "png" : "jpg", id = receipt.id.uuidString.lowercased()
    let value: [String: Any] = ["version": 1, "type": "private-file", "filename": "receipt-" + id + "." + suffix, "mime": receipt.mime, "data": SecureTaxEnvelope.encode(bytes), "byteLength": bytes.count, "purpose": "receipt", "category": "purchases", "notes": "", "savedAt": PrivateTaxWire.iso(Date())]
    var payload = try PrivateTaxWire.json(value); defer { payload.resetBytes(in: 0..<payload.count) }
    try await upload(payload: payload, name: "receipt-" + id, domain: .driverReceipt, fingerprint: SecureTaxEnvelope.encode(Data(SHA256.hash(data: Data(receipt.mime.utf8) + bytes))))
  }
}
