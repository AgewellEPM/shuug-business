import CryptoKit
import DriverCore
import Foundation

/// Real DriverCore Journal + CryptoKit, synthetic memory custody/API only.
/// No real Keychain, journals, server, Simulator or production keys are used.
@main struct SecureTaxSnapshotProof {
  struct Failure: Error { var message: String }
  struct AmbiguousNetworkFailure: Error {}
  final class MemoryStore: SecureTaxKeyStore {
    var values: [String: Data] = [:]
    func read(account: String) throws -> Data? { values[account] }
    func add(_ data: Data, account: String) throws {
      guard values[account] == nil else { throw Failure(message: "Unexpected state replacement") }
      values[account] = data
    }
    func update(_ data: Data, account: String) throws {
      guard values[account] != nil else { throw Failure(message: "Unexpected state creation") }
      values[account] = data
    }
  }
  final class MemoryAPI: SecureTaxObjectTransport {
    var rows: [String: SecureTaxStoredObject] = [:]
    var mutations: [String: SecureTaxSnapshotUpload] = [:]
    var sequence = 0, writes = 0
    var failAfterCommit = false
    var duringPut: (() -> Void)?
    func changes(after: Int, limit: Int) async throws -> SecureTaxObjectPage {
      let rows = rows.values.filter { $0.sequence > after }.sorted { $0.sequence < $1.sequence }
      let selected = rows.prefix(limit).map { SecureTaxObjectReceipt(objectId: $0.objectId, revision: $0.revision, sequence: $0.sequence, deleted: $0.deleted) }
      return .init(changes: selected, cursor: selected.last?.sequence ?? after, hasMore: rows.count > limit)
    }
    func object(_ objectId: String) async throws -> SecureTaxStoredObject {
      guard let row = rows[objectId] else { throw Failure(message: "Missing memory object") }; return row
    }
    func put(_ upload: SecureTaxSnapshotUpload) async throws -> SecureTaxObjectReceipt {
      writes += 1
      let id = upload.envelope.context.objectId
      if let previous = mutations[upload.mutationId], let row = rows[id] {
        guard previous.envelope == upload.envelope else { throw Failure(message: "Retry changed its ciphertext") }
        return .init(objectId: id, revision: row.revision, sequence: row.sequence, deleted: false, duplicate: true)
      }
      guard (rows[id]?.revision ?? 0) == upload.expectedRevision else { throw Failure(message: "Memory CAS conflict") }
      sequence += 1; mutations[upload.mutationId] = upload
      let row = SecureTaxStoredObject(objectId: id, revision: upload.expectedRevision + 1, sequence: sequence, deleted: false, envelope: upload.envelope)
      rows[id] = row; duringPut?(); duringPut = nil
      if failAfterCommit { failAfterCommit = false; throw AmbiguousNetworkFailure() }
      return .init(objectId: id, revision: row.revision, sequence: sequence, deleted: false, duplicate: false)
    }
    func delete(_ objectId: String, expectedRevision: Int) async throws -> SecureTaxObjectReceipt {
      guard var row = rows[objectId], row.revision == expectedRevision else { throw Failure(message: "Memory deletion CAS conflict") }
      sequence += 1; row.revision += 1; row.sequence = sequence; row.deleted = true; row.envelope = nil; rows[objectId] = row
      mutations = mutations.filter { $0.value.envelope.context.objectId != objectId }
      return .init(objectId: objectId, revision: row.revision, sequence: sequence, deleted: true)
    }
  }
  static func require(_ value: Bool, _ message: String) throws { if !value { throw Failure(message: message) } }
  static func rejects(_ label: String, _ checks: inout [String], _ work: () throws -> Void) throws {
    do { try work(); throw Failure(message: "Rejected boundary accepted: " + label) }
    catch let error as Failure { throw error }
    catch { checks.append(label) }
  }
  static func fixtureJournal() throws -> Journal {
    let now = Date(timeIntervalSince1970: 1_800_000_000), sample = try GigSampleShift.make(relativeTo: now)
    var journal = Journal()
    for record in sample.records.prefix(3) { journal.upsert(record) }
    journal.upsert(DriverRecord(payload: .income(.init(date: "2026-11-07", platform: "Synthetic", description: "SYNTHETIC SNAPSHOT ONLY", amountCents: 12345, notes: "Synthetic invalid SSN 000-12-3456"))))
    let receipt = LocalReceipt(); journal.receipts = [receipt]
    var expense = Expense(date: "2026-11-07", merchant: "Synthetic receipt merchant", category: .fuel, amountCents: 4500, classification: .business)
    expense.receiptId = receipt.id
    journal.upsert(DriverRecord(payload: .expense(expense)))
    journal.cursor = 42; journal.bankCursor = 7; journal.lastSyncAt = now; journal.bankUpdatedAt = now
    var bank = BankTransaction(id: "synthetic-statement-row", provider: "Synthetic statement", accountLabel: "Synthetic account", date: "2026-11-07", merchant: "Synthetic bank merchant", amountCents: 4500)
    bank.reviewedRecordId = journal.entries[0].id; bank.ignored = true; bank.needsUpdateReview = true
    journal.bankTransactions = [bank]
    journal.goals = sample.goals; journal.reserveSettings = .init(taxPercent: 20, vehiclePercent: 12)
    var assistance = AssistanceSettings(); assistance.automaticDrives = true; assistance.placeReminders = true
    journal.assistance = assistance
    journal.mission = .init(startedAt: now, deadline: now.addingTimeInterval(7200), targetCents: 12000, destination: "Synthetic private destination")
    journal.pickupWaits = [.init(name: "Synthetic pickup", minutes: 8, date: now)]
    journal.missionOffers = [.init(label: "Synthetic comparison", direction: "Toward destination", payoutCents: 2000, feesCents: 0, miles: 8, minutes: 25, waitMinutes: 3, homeMinutes: 10)]
    journal.placePrompts = [.init(placeId: "synthetic-place", merchant: "Synthetic fuel stop", address: "Synthetic private address", category: .fuel, detectedAt: now)]
    journal.driverAlerts = [.init(kind: .expense, scope: "synthetic-account-scope", promptId: journal.placePrompts![0].id, now: now)]
    journal.observedOffers = [.init(platform: .uber, source: .sharedText, observedAt: now, payoutCents: 2200, displayedMiles: 8, displayedMinutes: 25, dropoffLabel: "Synthetic private dropoff")]
    var offer = sample.offers[0]; offer.source = .manual
    var ingestion = OfferIngestionService(); try ingestion.ingest(offer, now: sample.now)
    journal.gigOffers = ingestion.offers; journal.gigOfferLogs = ingestion.logs
    try journal.recordGigDecision(.acceptedInProvider, offerId: offer.id, now: sample.now)
    _ = journal.beginTrip(classification: .business, purpose: "Synthetic interrupted drive", now: now)
    journal.addLocation(.init(latitude: 41.7, longitude: -72.7, accuracy: 5, timestamp: now), now: now)
    var remote = journal.entries[0].record; remote.revision = 2
    journal.entries[0].conflict = .init(record: remote, updatedAt: now, sequence: 5)
    return journal
  }
  @MainActor static func main() async throws {
    let journal = try fixtureJournal(), client = P256.KeyAgreement.PrivateKey(), firm = P256.KeyAgreement.PrivateKey()
    let signer = P256.Signing.PrivateKey()
    let pins = SecureTaxPublicPins(version: 1, workspaceOrigin: "https://synthetic.invalid", workspaceId: "synthetic-workspace",
      signerPublicKey: SecureTaxEnvelope.encode(signer.publicKey.x963Representation), firmRecoveryPublicKey: SecureTaxEnvelope.encode(firm.publicKey.x963Representation))
    let identity = SecureTaxIdentity(accountId: "synthetic-account", clientId: "synthetic-client")
    let scope = try SecureTaxKeyScope(pins: pins, identity: identity)
    let trusted = SecureTaxEnvelope.TrustedRecipients(client: client.publicKey, firmRecovery: firm.publicKey)
    let snapshot = try SecureTaxJournalSnapshot.capture(journal, scope: scope, objectId: UUID().uuidString.lowercased())
    let envelope = try snapshot.seal(revision: 1, trustedRecipients: trusted, privateKey: client)
    if CommandLine.arguments.dropFirst().first == "fixture" {
      let result: [String: Any] = ["syntheticOnly": true, "payload": try JSONSerialization.jsonObject(with: snapshot.encoded()),
        "envelope": try JSONSerialization.jsonObject(with: JSONEncoder().encode(envelope)),
        "clientPrivateKey": SecureTaxEnvelope.encode(client.rawRepresentation), "firmRecoveryPrivateKey": SecureTaxEnvelope.encode(firm.rawRepresentation),
        "clientPublicKey": SecureTaxEnvelope.encode(client.publicKey.x963Representation), "firmRecoveryPublicKey": pins.firmRecoveryPublicKey]
      print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self)); return
    }
    var checks: [String] = []
    let payload = try JSONSerialization.jsonObject(with: snapshot.encoded()) as! [String: Any], encodedJournal = payload["journal"] as! [String: Any]
    try require(encodedJournal.count == 23 && encodedJournal["lastSyncAt"] is NSNumber && encodedJournal["gigCommitments"] != nil && encodedJournal["tracker"] != nil, "Full native fixture did not populate every Journal Codable field")
    checks.append("all23 actual Journal Codable fields and milliseconds dates are in the encrypted payload")
    let opened = try SecureTaxJournalSnapshot.open(envelope, scope: scope, objectId: snapshot.binding.objectId, revision: 1, trustedRecipients: trusted, privateKey: client)
    let recovered = try SecureTaxJournalSnapshot.open(envelope, scope: scope, objectId: snapshot.binding.objectId, revision: 1, trustedRecipients: trusted, role: .firmRecovery, privateKey: firm)
    let originalBytes = try SecureTaxJournalSnapshot.encoder().encode(journal)
    try require(try SecureTaxJournalSnapshot.encoder().encode(opened.journal) == originalBytes && SecureTaxJournalSnapshot.encoder().encode(recovered.journal) == originalBytes, "Native Journal changed during authenticated encryption/recovery")
    checks.append("client and separate firm recovery decrypt byte-equivalent full native Journal")
    let hostJSON = String(decoding: try JSONEncoder().encode(envelope), as: UTF8.self)
    try require(!hostJSON.contains("000-12-3456") && !hostJSON.contains("Synthetic private destination"), "Snapshot leaked plaintext")
    checks.append("host envelope does not contain private fixture fields")
    try require(opened.journal.entries.allSatisfy { $0.locations.isEmpty } && !opened.journal.receipts.isEmpty, "Route exclusion or receipt metadata changed")
    checks.append("route files and receipt bytes remain separate; receipt metadata survives")
    let preparation = try SecureTaxJournalImportPreparation(snapshot: opened, currentJournal: journal, availableReceiptIDs: [])
    try require(try preparation.stillMatches(journal) && preparation.missingReceiptIDs.count == 1 && preparation.reviewNotes.count >= 5, "Import preparation did not retain safety review")
    var edited = journal; edited.goals?.dailyNetCents = 99999
    try require(try !preparation.stillMatches(edited), "Import preparation ignored a newer local edit")
    checks.append("import preparation preserves source and detects local edits plus missing attachments and device-action review")
    try rejects("wrong encrypted linked client rejected", &checks) {
      var wrong = snapshot; wrong.binding.clientId = "different-client"
      _ = try SecureTaxJournalSnapshot.open(wrong.seal(revision: 1, trustedRecipients: trusted, privateKey: client), scope: scope, objectId: snapshot.binding.objectId, revision: 1, trustedRecipients: trusted, privateKey: client)
    }
    try rejects("wrong encrypted payload type rejected", &checks) {
      var wrong = snapshot; wrong.type = "unrelated-type"
      _ = try SecureTaxJournalSnapshot.open(wrong.seal(revision: 1, trustedRecipients: trusted, privateKey: client), scope: scope, objectId: snapshot.binding.objectId, revision: 1, trustedRecipients: trusted, privateKey: client)
    }
    try rejects("future Journal schema rejected", &checks) {
      var future = journal; future.version = 2
      _ = try SecureTaxJournalSnapshot.capture(future, scope: scope, objectId: UUID().uuidString.lowercased())
    }
    try rejects("unknown future Journal field rejected before lossy import", &checks) {
      var changed = payload, body = encodedJournal; body["futurePrivateFeature"] = ["preserve": true]; changed["journal"] = body
      _ = try SecureTaxJournalSnapshot.decode(JSONSerialization.data(withJSONObject: changed), expectedBinding: snapshot.binding)
    }
    let keyMemory = MemoryStore(), checkpointMemory = MemoryStore()
    let deviceKeys = SecureTaxDeviceKeys(storage: keyMemory), checkpointStore = SecureTaxSnapshotCheckpointStore(storage: checkpointMemory)
    let localKey = try deviceKeys.createClientKey(for: scope).client, formatter = ISO8601DateFormatter(), now = Date()
    var approval = SecureTaxManifest(version: 1, manifestId: "synthetic-approval", workspaceId: pins.workspaceId, accountId: identity.accountId, clientId: identity.clientId, epoch: 1,
      client: localKey, firmRecovery: .init(keyId: SecureTaxEnvelope.keyId(firm.publicKey), publicKey: pins.firmRecoveryPublicKey),
      issuedAt: formatter.string(from: now.addingTimeInterval(-60)), expiresAt: formatter.string(from: now.addingTimeInterval(86400)), signature: .init(algorithm: "ES256-P1363", signerKeyId: try pins.signerKeyId, value: ""))
    approval.signature.value = SecureTaxEnvelope.encode(try signer.signature(for: approval.canonicalBytes()).rawRepresentation)
    _ = try deviceKeys.stage(approval, scope: scope, pins: pins)
    let api = MemoryAPI()
    var server = SecureTaxServerStatus(enrolled: false, keyProvisioningEnabled: true, identity: identity)
    let service = try SecureTaxJournalSnapshotService(scope: scope, pins: pins, keys: deviceKeys, checkpoints: checkpointStore, objects: api, readStatus: { server })
    do { _ = try await service.upload(journal, currentJournal: { journal }); throw Failure(message: "Unenrolled server accepted snapshot") }
    catch is SecureTaxSetupError { checks.append("unenrolled status fails before object write or checkpoint creation") }
    try require(api.writes == 0 && checkpointMemory.values.isEmpty, "Unenrolled preflight wrote data")
    server.enrolled = true; server.manifest = approval
    var currentJournal = journal
    api.failAfterCommit = true; api.duringPut = { currentJournal.goals?.weeklyNetCents = 123456 }
    do { _ = try await service.upload(journal, currentJournal: { currentJournal }); throw Failure(message: "Ambiguous response unexpectedly succeeded") }
    catch is AmbiguousNetworkFailure { checks.append("ambiguous response preserves exact pending ciphertext request") }
    let pending = try service.checkpoint()!, previousMutation = pending.pending!.mutationId
    let checkpointText = String(decoding: checkpointMemory.values.values.reduce(Data(), +), as: UTF8.self)
    try require(!checkpointText.contains("000-12-3456") && !checkpointText.contains("Synthetic private destination"), "Pending checkpoint contains plaintext Journal")
    checks.append("pending local retry checkpoint stores ciphertext without plaintext Journal or key bytes")
    let retried = try await service.upload(currentJournal, currentJournal: { currentJournal })
    try require(retried.receipt.duplicate == true && !retried.localJournalStillMatches && api.mutations.count == 1 && api.mutations[previousMutation] != nil, "Retry lost idempotency or acknowledged a newer edit")
    checks.append("retry is byte-identical and older upload never clears newer local generation")
    let acknowledged = try service.checkpoint()!
    try require(try acknowledged.needsUpload(currentJournal), "New local changes were hidden after old snapshot acknowledgment")
    let oldRemote = api.rows[acknowledged.objectId]!
    let second = try await service.upload(currentJournal, currentJournal: { currentJournal })
    try require(second.receipt.revision == 2 && second.localJournalStillMatches, "Newer local generation did not upload with CAS")
    checks.append("subsequent upload advances CAS and acknowledges only the current local hash")
    let preview = try await service.preview(objectId: acknowledged.objectId, minimumRevision: 2)
    try require(preview.journal.goals?.weeklyNetCents == 123456, "GET preview did not open latest encrypted snapshot")
    let prepared = try service.prepareImport(preview, currentJournal: currentJournal, availableReceiptIDs: [])
    try require(try prepared.stillMatches(currentJournal), "Preview modified live journal")
    checks.append("real adapter GET decrypts preview and prepares import without replacing Journal")
    let latest = api.rows[acknowledged.objectId]!
    api.rows[acknowledged.objectId] = oldRemote
    do { _ = try await service.preview(objectId: acknowledged.objectId); throw Failure(message: "Known older revision accepted") }
    catch is SecureTaxSetupError { checks.append("known local revision floor rejects host rollback") }
    api.rows[acknowledged.objectId] = latest
    let page = try await service.changes(after: 0)
    try require(page.changes.count == 1 && page.cursor == 2, "Encrypted change listing failed")
    checks.append("encrypted metadata change cursor is separate from legacy Journal cursor")
    let beforeDeleteSHA = try SecureTaxJournalSnapshot.journalSHA256(currentJournal)
    let tombstone = try await service.deleteOwnSnapshot()
    try require(tombstone.deleted && api.rows[tombstone.objectId]?.envelope == nil && api.mutations.isEmpty,
      "Encrypted deletion retained live object/retry")
    try require(try SecureTaxJournalSnapshot.journalSHA256(currentJournal) == beforeDeleteSHA, "Deleting remote snapshot modified local Journal")
    checks.append("explicit remote deletion purges ciphertext retry and keeps local journal intact")
    var deleted = try service.checkpoint()!
    try rejects("deleted archive cannot silently resurrect", &checks) {
      _ = try deleted.prepare(currentJournal, trustedRecipients: trusted, privateKey: client)
    }
    try service.startNewArchiveAfterDeletion()
    try require(try service.checkpoint()!.objectId != tombstone.objectId && service.checkpoint()!.revision == 0, "Explicit new archive reused a deleted object ID")
    checks.append("explicit new archive starts with a fresh opaque UUID after remote deletion")
    let output: [String: Any] = ["ok": true, "syntheticOnly": true, "scope": "Real native Journal/CryptoKit and injected memory API; no live server, Keychain or restore", "checks": checks]
    print(String(decoding: try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]), as: UTF8.self))
  }
}
