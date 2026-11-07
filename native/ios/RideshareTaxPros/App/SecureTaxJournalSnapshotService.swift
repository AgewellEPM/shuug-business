import DriverCore
import Foundation

/// Account-scoped encrypted archive adapter. It does not enroll an account,
/// alter live Journal state, acknowledge legacy record queues, or restore files.
@MainActor final class SecureTaxJournalSnapshotService {
  struct UploadOutcome { var receipt: SecureTaxObjectReceipt; var localJournalStillMatches: Bool }
  let scope: SecureTaxKeyScope
  private let pins: SecureTaxPublicPins
  private let keys: SecureTaxDeviceKeys
  private let checkpoints: SecureTaxSnapshotCheckpointStore
  private let objects: any SecureTaxObjectTransport
  private let readStatus: () async throws -> SecureTaxServerStatus
  private var working = false

  convenience init(origin: URL, token: String, scope: SecureTaxKeyScope, pins: SecureTaxPublicPins) throws {
    let statusClient = SecureTaxEnrollmentClient(origin: origin, token: token)
    try self.init(scope: scope, pins: pins, objects: SecureTaxObjectClient(origin: origin, token: token, scope: scope, pins: pins),
      readStatus: { try await statusClient.status(pins: pins, accountId: scope.identity.accountId) })
  }
  init(scope: SecureTaxKeyScope, pins: SecureTaxPublicPins, keys: SecureTaxDeviceKeys = SecureTaxDeviceKeys(),
    checkpoints: SecureTaxSnapshotCheckpointStore = SecureTaxSnapshotCheckpointStore(),
    objects: any SecureTaxObjectTransport, readStatus: @escaping () async throws -> SecureTaxServerStatus) throws {
    guard try scope == SecureTaxKeyScope(pins: pins, identity: scope.identity) else {
      throw SecureTaxSetupError.message("The encrypted snapshot service belongs to another workspace.")
    }
    self.scope = scope; self.pins = pins; self.keys = keys; self.checkpoints = checkpoints
    self.objects = objects; self.readStatus = readStatus
  }
  private func begin() throws {
    guard !working else { throw SecureTaxSetupError.message("Wait for the current encrypted snapshot request to finish.") }
    working = true
  }
  private func authorize() async throws {
    let server = try await readStatus()
    try server.validate(accountId: scope.identity.accountId)
    guard server.identity == scope.identity, server.enrolled, server.keyProvisioningEnabled,
      let remote = server.manifest, let local = try keys.state(for: scope)?.stagedManifest,
      try remote.canonicalBytes() == local.canonicalBytes() else {
      throw SecureTaxSetupError.message("Encrypted snapshots need matching verified device approval and active workspace enrollment. No plaintext fallback is available.")
    }
    guard let client = try keys.state(for: scope)?.client else { throw SecureTaxSetupError.message("This device’s approved client key is unavailable.") }
    _ = try remote.verify(pins: pins, identity: scope.identity, localClient: client)
    _ = try keys.verifiedRecipients(scope: scope, pins: pins)
  }
  func checkpoint() throws -> SecureTaxSnapshotCheckpoint? { try checkpoints.load(scope: scope) }
  func startNewArchiveAfterDeletion() throws {
    try begin(); defer { working = false }
    _ = try checkpoints.startNewAfterDeletion(scope: scope)
  }

  /// Save the exact ciphertext/mutation first. On ambiguous network failure the
  /// next call retries it unchanged, then notices any newer local Journal hash.
  func upload(_ capturedJournal: Journal, currentJournal: () -> Journal) async throws -> UploadOutcome {
    try begin(); defer { working = false }
    try await authorize()
    let original = try checkpoints.create(scope: scope)
    var prepared = original
    let upload = try keys.withClientPrivateKey(scope: scope, pins: pins) { privateKey, recipients in
      try prepared.prepare(capturedJournal, trustedRecipients: recipients, privateKey: privateKey)
    }
    try checkpoints.save(prepared, replacing: original)
    let receipt = try await objects.put(upload)
    guard let current = try checkpoints.load(scope: scope), current.pending?.mutationId == upload.mutationId else {
      throw SecureTaxSetupError.message("The local snapshot changed during upload. Its journal and retry state were kept.")
    }
    var acknowledged = current
    let unchanged = try acknowledged.acknowledge(receipt, mutationId: upload.mutationId, currentJournal: currentJournal())
    try checkpoints.save(acknowledged, replacing: current)
    return .init(receipt: receipt, localJournalStillMatches: unchanged)
  }
  /// Metadata changes include other encrypted feature objects too; preview
  /// validates the actual payload type before treating an item as a Journal.
  func changes(after: Int, limit: Int = 100) async throws -> SecureTaxObjectPage {
    try begin(); defer { working = false }
    try await authorize()
    return try await objects.changes(after: after, limit: limit)
  }
  func preview(objectId: String, minimumRevision: Int = 1) async throws -> SecureTaxJournalSnapshot {
    try begin(); defer { working = false }
    guard (1...1_000_000_000).contains(minimumRevision) else { throw SecureTaxSetupError.message("The snapshot revision floor is invalid.") }
    try await authorize()
    let object = try await objects.object(objectId)
    guard !object.deleted, let envelope = object.envelope, object.revision >= minimumRevision else {
      throw SecureTaxSetupError.message("This snapshot is deleted or older than the independently known revision. The current journal was kept.")
    }
    if let own = try checkpoints.load(scope: scope), own.objectId == objectId, object.revision < own.revision {
      throw SecureTaxSetupError.message("The workspace returned an older snapshot than this device has acknowledged.")
    }
    return try keys.withClientPrivateKey(scope: scope, pins: pins) { privateKey, recipients in
      try SecureTaxJournalSnapshot.open(envelope, scope: scope, objectId: objectId, revision: object.revision,
        trustedRecipients: recipients, privateKey: privateKey)
    }
  }
  func prepareImport(_ snapshot: SecureTaxJournalSnapshot, currentJournal: Journal,
    availableReceiptIDs: Set<UUID>) throws -> SecureTaxJournalImportPreparation {
    guard snapshot.binding.workspaceId == scope.workspaceId,
      snapshot.binding.accountId == scope.identity.accountId, snapshot.binding.clientId == scope.identity.clientId else {
      throw SecureTaxSetupError.message("A snapshot from another account cannot be prepared for import here.")
    }
    return try .init(snapshot: snapshot, currentJournal: currentJournal, availableReceiptIDs: availableReceiptIDs)
  }
  /// Explicitly deletes this device's remote archive only. It never deletes the
  /// source journal/routes/receipts or claims erasure of retained server backups.
  func deleteOwnSnapshot() async throws -> SecureTaxObjectReceipt {
    try begin(); defer { working = false }
    try await authorize()
    guard let original = try checkpoints.load(scope: scope), original.revision > 0,
      original.pending == nil else { throw SecureTaxSetupError.message("Resolve the pending encrypted upload before deleting its remote snapshot.") }
    let receipt = try await objects.delete(original.objectId, expectedRevision: original.revision)
    var deleted = original
    try deleted.acknowledgeDeletion(receipt)
    try checkpoints.save(deleted, replacing: original)
    return receipt
  }
}
