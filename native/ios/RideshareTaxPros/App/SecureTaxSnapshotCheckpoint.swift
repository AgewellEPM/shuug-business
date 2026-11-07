import CryptoKit
import DriverCore
import Foundation

struct SecureTaxSnapshotUpload: Codable {
  let mutationId: String
  let expectedRevision: Int
  let journalSHA256: String
  let envelope: SecureTaxEnvelope
}

/// Local-only metadata and a retryable ciphertext request. No plaintext journal,
/// receipt bytes, routes or private key is persisted in this checkpoint.
struct SecureTaxSnapshotCheckpoint: Codable {
  var version: Int
  var scope: SecureTaxKeyScope
  var objectId: String
  var revision: Int
  var sequence: Int
  var acknowledgedJournalSHA256: String?
  var pending: SecureTaxSnapshotUpload?
  var deleted: Bool

  static func create(scope: SecureTaxKeyScope) -> Self {
    .init(version: 1, scope: scope, objectId: UUID().uuidString.lowercased(), revision: 0,
      sequence: 0, deleted: false)
  }
  func validate(scope expected: SecureTaxKeyScope) throws {
    guard version == 1, scope == expected, (0...1_000_000_001).contains(revision),
      (0...9_007_199_254_740_991).contains(sequence) else {
      throw SecureTaxSetupError.message("This snapshot checkpoint belongs to another account or unsupported version.")
    }
    try SecureTaxJournalSnapshot.validateObjectID(objectId)
    if let acknowledgedJournalSHA256 { _ = try SecureTaxEnvelope.decode(acknowledgedJournalSHA256, count: 32) }
    if let pending {
      try SecureTaxJournalSnapshot.validateObjectID(pending.mutationId)
      _ = try SecureTaxEnvelope.decode(pending.journalSHA256, count: 32)
      guard !deleted, pending.expectedRevision == revision, revision < 1_000_000_000,
        pending.envelope.context == SecureTaxEnvelope.Context(workspaceId: scope.workspaceId,
          accountId: scope.identity.accountId, objectId: objectId, revision: revision + 1, domain: .driverState) else {
        throw SecureTaxSetupError.message("The pending snapshot no longer matches its saved account and revision.")
      }
    }
  }
  func needsUpload(_ journal: Journal) throws -> Bool {
    let currentSHA256 = try SecureTaxJournalSnapshot.journalSHA256(journal)
    return !deleted && (pending != nil || currentSHA256 != acknowledgedJournalSHA256)
  }
  /// Keep the exact mutation/envelope across retries: re-encrypting with the same
  /// mutation ID would violate the server's idempotency digest.
  mutating func prepare<SK: HPKEDiffieHellmanPrivateKey>(_ journal: Journal,
    trustedRecipients: SecureTaxEnvelope.TrustedRecipients, privateKey: SK,
    now: Date = Date()) throws -> SecureTaxSnapshotUpload where SK.PublicKey == P256.KeyAgreement.PublicKey {
    try validate(scope: scope)
    guard !deleted, revision < 1_000_000_000 else {
      throw SecureTaxSetupError.message("This snapshot was deleted or exhausted its revision space. Create a new archive after review.")
    }
    if let pending { return pending }
    let snapshot = try SecureTaxJournalSnapshot.capture(journal, scope: scope, objectId: objectId, now: now)
    let prepared = try SecureTaxSnapshotUpload(mutationId: UUID().uuidString.lowercased(), expectedRevision: revision,
      journalSHA256: SecureTaxJournalSnapshot.journalSHA256(journal),
      envelope: snapshot.seal(revision: revision + 1, trustedRecipients: trustedRecipients, privateKey: privateKey))
    pending = prepared
    return prepared
  }
  /// Advances the remote cursor only. It never acknowledges record mutations,
  /// clears pending receipts, or replaces any part of the live Journal.
  @discardableResult mutating func acknowledge(_ receipt: SecureTaxObjectReceipt, mutationId: String,
    currentJournal: Journal) throws -> Bool {
    try validate(scope: scope)
    try receipt.validate()
    guard let pending, pending.mutationId == mutationId, receipt.objectId == objectId,
      receipt.revision == pending.expectedRevision + 1, !receipt.deleted, receipt.sequence > sequence else {
      throw SecureTaxSetupError.message("The workspace acknowledgment does not match this pending snapshot.")
    }
    revision = receipt.revision; sequence = receipt.sequence
    acknowledgedJournalSHA256 = pending.journalSHA256; self.pending = nil
    return try SecureTaxJournalSnapshot.journalSHA256(currentJournal) == acknowledgedJournalSHA256
  }
  mutating func acknowledgeDeletion(_ receipt: SecureTaxObjectReceipt) throws {
    try validate(scope: scope)
    try receipt.validate()
    guard receipt.objectId == objectId, receipt.deleted, receipt.revision >= revision,
      receipt.revision <= revision + 1, receipt.sequence >= sequence else {
      throw SecureTaxSetupError.message("The workspace deletion does not match this snapshot revision.")
    }
    deleted = true; revision = receipt.revision; sequence = receipt.sequence
    pending = nil; acknowledgedJournalSHA256 = nil
  }
}

/// Ciphertext cache, not key custody. Large encrypted retries belong in private
/// protected files rather than large Keychain items; private keys stay Keychain.
private struct SecureTaxSnapshotFileStore: SecureTaxKeyStore {
  private var directory: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("RideshareTaxPros/ProtectedSnapshots", isDirectory: true)
  }
  private func url(_ account: String) -> URL { directory.appendingPathComponent(account + ".json") }
  private func protect(_ target: URL, directory: Bool = false) throws {
    var attributes: [FileAttributeKey: Any] = [.posixPermissions: directory ? 0o700 : 0o600]
    #if os(iOS)
    attributes[.protectionKey] = FileProtectionType.complete
    #endif
    try FileManager.default.setAttributes(attributes, ofItemAtPath: target.path)
    var target = target, values = URLResourceValues()
    values.isExcludedFromBackup = true
    try target.setResourceValues(values)
  }
  func read(account: String) throws -> Data? {
    let target = url(account)
    guard FileManager.default.fileExists(atPath: target.path) else { return nil }
    let file = try FileHandle(forReadingFrom: target); defer { try? file.close() }
    return try file.read(upToCount: 24 * 1024 * 1024 + 1) ?? Data()
  }
  func add(_ data: Data, account: String) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    try protect(directory, directory: true)
    try data.write(to: url(account), options: .withoutOverwriting)
    try protect(url(account))
  }
  func update(_ data: Data, account: String) throws {
    guard FileManager.default.fileExists(atPath: url(account).path) else { throw SecureTaxSetupError.message("The encrypted snapshot checkpoint is missing. Keep the current journal.") }
    try data.write(to: url(account), options: .atomic)
    try protect(url(account))
  }
}

/// A pending encrypted request must be saved before sending. The metadata CAS
/// protects one app process; backend object revisions arbitrate remote writers.
struct SecureTaxSnapshotCheckpointStore {
  private let storage: any SecureTaxKeyStore
  init(storage: any SecureTaxKeyStore = SecureTaxSnapshotFileStore()) { self.storage = storage }
  private func account(_ scope: SecureTaxKeyScope) throws -> String { "journal-snapshot-" + (try scope.storageAccount) }
  func load(scope: SecureTaxKeyScope) throws -> SecureTaxSnapshotCheckpoint? {
    guard let bytes = try storage.read(account: account(scope)) else { return nil }
    guard bytes.count <= 24 * 1024 * 1024 else { throw SecureTaxSetupError.message("The saved encrypted snapshot request exceeds its size limit.") }
    let checkpoint = try JSONDecoder().decode(SecureTaxSnapshotCheckpoint.self, from: bytes)
    try checkpoint.validate(scope: scope)
    return checkpoint
  }
  func create(scope: SecureTaxKeyScope) throws -> SecureTaxSnapshotCheckpoint {
    if let current = try load(scope: scope) { return current }
    let checkpoint = SecureTaxSnapshotCheckpoint.create(scope: scope)
    try storage.add(JSONEncoder().encode(checkpoint), account: account(scope))
    return checkpoint
  }
  func startNewAfterDeletion(scope: SecureTaxKeyScope) throws -> SecureTaxSnapshotCheckpoint {
    guard let previous = try load(scope: scope), previous.deleted, previous.pending == nil else {
      throw SecureTaxSetupError.message("Only an explicitly deleted remote archive can be replaced with a new archive ID.")
    }
    let next = SecureTaxSnapshotCheckpoint.create(scope: scope)
    try storage.update(JSONEncoder().encode(next), account: account(scope))
    return next
  }
  func save(_ checkpoint: SecureTaxSnapshotCheckpoint, replacing expected: SecureTaxSnapshotCheckpoint) throws {
    try checkpoint.validate(scope: expected.scope)
    guard let current = try load(scope: expected.scope), current.objectId == expected.objectId,
      current.revision == expected.revision, current.sequence == expected.sequence,
      current.pending?.mutationId == expected.pending?.mutationId,
      checkpoint.objectId == expected.objectId else {
      throw SecureTaxSetupError.message("The local snapshot changed during this request. Its newer state was kept.")
    }
    try storage.update(JSONEncoder().encode(checkpoint), account: account(expected.scope))
  }
}
