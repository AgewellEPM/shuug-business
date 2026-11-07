import DriverCore
import SwiftUI

struct SecureTaxSnapshotView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var service: SecureTaxJournalSnapshotService?
  @State private var rows: [SecureTaxObjectReceipt] = []
  @State private var cursor = 0
  @State private var hasMore = false
  @State private var preview: SecureTaxJournalSnapshot?
  @State private var preparation: SecureTaxJournalImportPreparation?
  @State private var checkpoint: SecureTaxSnapshotCheckpoint?
  @State private var loading = false
  @State private var busy = false
  @State private var notice: String?
  @State private var error: String?
  @State private var deleting = false
  @State private var deleteScope: String?
  @State private var loadedIdentity: String?
  private var identity: String {
    guard let connection = model.connection else { return "signed-out" }
    return connection.origin.absoluteString + "|" + connection.session.account.id.uuidString + "|" + connection.session.token
  }
  var body: some View {
    Form {
      Section("Encrypted Journal snapshots") {
        Text("Save this account’s durable Journal as a client-encrypted snapshot for review in an approved client. This does not replace normal records or migrate older workspace data.")
        Text("Includes trips, income, expenses, offers, decisions, goals, mission and review/settings history. Historical route files, receipt contents and server-only tax/profile/provider data are separate and are not uploaded here.")
          .font(.footnote).foregroundStyle(.secondary)
        if loading { ProgressView("Checking protected workspace…") }
        if let notice { Text(notice).font(.footnote) }
        if let error { Text(error).font(.footnote).foregroundStyle(.secondary) }
      }
      Section("This iPhone’s archive") {
        if let checkpoint {
          LabeledContent("Remote revision", value: String(checkpoint.revision))
          if checkpoint.pending != nil { Text("An encrypted upload is waiting for confirmation. Retry sends its original ciphertext first; later edits stay pending.").font(.footnote) }
          if checkpoint.deleted {
            Text("This remote archive was deleted. Your local Journal and attachments are kept.")
            Button("Start a new archive with a new ID") { startNewArchive() }.disabled(busy || loading || service == nil)
          }
        }
        Button("Upload encrypted Journal snapshot") { Task { await upload(identity) } }
          .disabled(service == nil || busy || loading || checkpoint?.deleted == true)
          .accessibilityIdentifier("secureTax.uploadSnapshot")
        if let checkpoint, checkpoint.revision > 0, !checkpoint.deleted {
          Button("Delete this remote archive", role: .destructive) { deleteScope = identity; deleting = true }
            .disabled(service == nil || busy || loading || checkpoint.pending != nil)
        }
        Text("A server acknowledgment does not prove independent backup or recovery. Your current Journal is kept after every operation.")
          .font(.footnote).foregroundStyle(.secondary)
      }
      Section("Remote encrypted items") {
        Button("List workspace items") { Task { await list(identity, reset: true) } }.disabled(service == nil || busy || loading)
        ForEach(rows, id: \.objectId) { row in
          if row.deleted { Text("Deleted item · \(row.objectId.prefix(8)) · revision \(row.revision)").font(.caption) }
          else {
            Button("Preview item \(row.objectId.prefix(8)) · revision \(row.revision)") { Task { await open(row, expected: identity) } }
              .disabled(busy || loading)
          }
        }
        if hasMore { Button("Load more items") { Task { await list(identity, reset: false) } }.disabled(busy || loading) }
        Text("An item is treated as a Journal only after its encrypted type and account binding verify. Other feature objects may appear in this list.")
          .font(.footnote).foregroundStyle(.secondary)
      }
      if let preview {
        Section("Verified Journal preview") {
          LabeledContent("Captured", value: preview.capturedAt.formatted())
          LabeledContent("Records", value: String(preview.journal.entries.count))
          LabeledContent("Offers / decisions / work", value: "\(preview.journal.gigOffers?.count ?? 0) / \(preview.journal.gigDecisions?.count ?? 0) / \(preview.journal.gigCommitments?.count ?? 0)")
          LabeledContent("Bank review rows", value: String(preview.journal.bankTransactions?.count ?? 0))
          LabeledContent("Coach history / pending", value: "\(preview.journal.coachMessages?.count ?? 0) / \(preview.journal.coachOutbox?.count ?? 0)")
          if let settings = preview.journal.universalGigSettings {
            LabeledContent("Delivery / shopping", value: settings.delivery.workLabel + " / " + settings.shopping.workLabel)
          }
          if preview.journal.activeTripId != nil { Text("Source includes an interrupted or active drive. It will not be started on this device.").font(.footnote) }
          DisclosureGroup("Record preview") {
            ForEach(Array(preview.journal.visible.prefix(20))) { entry in
              VStack(alignment: .leading) { Text(entry.record.title); Text(entry.record.dateLabel).font(.caption).foregroundStyle(.secondary) }
            }
          }
          Button("Prepare import review") { prepareImport(preview) }.disabled(busy || loading)
          Text("Preview and review do not restore, merge or overwrite the current Journal, files, active drive or device settings.")
            .font(.footnote).foregroundStyle(.secondary)
        }.privacySensitive()
      }
      if let preparation {
        Section("Import review · no changes applied") {
          ForEach(preparation.reviewNotes, id: \.self) { Text($0).font(.footnote) }
          if (try? preparation.stillMatches(model.journal)) == false {
            Text("Your local Journal changed after this review. Prepare a fresh review before any future import.").font(.footnote)
          }
        }
      }
      Section { Button("Check account setup again") { Task { await configure(identity) } }.disabled(busy || loading) }
    }.driverScreen().navigationTitle("Protected Journal")
      .task(id: identity) {
        service = nil; rows = []; cursor = 0; hasMore = false; preview = nil; preparation = nil
        checkpoint = nil; notice = nil; error = nil; busy = false; loading = false; loadedIdentity = nil; deleteScope = nil
        await configure(identity)
      }
      .confirmationDialog("Delete this iPhone’s remote encrypted archive? The local Journal, receipt/route files and older retained backups are kept.", isPresented: $deleting, titleVisibility: .visible) {
        Button("Delete remote archive", role: .destructive) {
          if let expected = deleteScope { Task { await delete(expected) } }
          deleteScope = nil
        }
      }
  }
  @MainActor private func configure(_ expected: String) async {
    guard let connection = model.connection, expected == identity else { return }
    guard model.storageHealthy, model.disk != nil else {
      error = "The saved local Journal could not be opened. Keep this installation and its data; an empty replacement will not be uploaded."
      service = nil
      return
    }
    loading = true; error = nil
    defer { if expected == identity { loading = false } }
    do {
      let pins = try SecureTaxPublicPins.bundled()
      let status = try await SecureTaxEnrollmentClient(origin: connection.origin, token: connection.session.token)
        .status(pins: pins, accountId: connection.session.account.id.uuidString.lowercased())
      guard expected == identity, !Task.isCancelled else { return }
      let scope = try SecureTaxKeyScope(pins: pins, identity: status.identity)
      _ = try SecureTaxDeviceKeys().verifiedRecipients(scope: scope, pins: pins)
      guard status.enrolled else { throw SecureTaxSetupError.message("Your device approval may be staged, but encrypted workspace enrollment is not activated. Keep your local Journal; setup does not activate it automatically.") }
      let adapter = try SecureTaxJournalSnapshotService(origin: connection.origin, token: connection.session.token, scope: scope, pins: pins)
      service = adapter; checkpoint = try adapter.checkpoint(); loadedIdentity = expected
    } catch { if expected == identity, !Task.isCancelled { service = nil; self.error = error.localizedDescription } }
  }
  @MainActor private func upload(_ expected: String) async {
    guard expected == identity, loadedIdentity == expected, let service, !busy, model.storageHealthy else { return }
    busy = true; error = nil
    defer { if expected == identity { busy = false } }
    do {
      let captured = model.journal
      let result = try await service.upload(captured, currentJournal: { model.journal })
      guard expected == identity, !Task.isCancelled else { return }
      checkpoint = try service.checkpoint()
      notice = result.localJournalStillMatches ? "Encrypted Journal snapshot acknowledged at revision \(result.receipt.revision). Local records are kept." : "The captured snapshot was acknowledged. Newer local edits remain to be uploaded."
    } catch { if expected == identity, !Task.isCancelled { self.error = error.localizedDescription; checkpoint = try? service.checkpoint() } }
  }
  @MainActor private func list(_ expected: String, reset: Bool) async {
    guard expected == identity, loadedIdentity == expected, let service, !busy else { return }
    busy = true; error = nil
    defer { if expected == identity { busy = false } }
    do {
      let page = try await service.changes(after: reset ? 0 : cursor)
      guard expected == identity, !Task.isCancelled else { return }
      var byID = Dictionary((reset ? [] : rows).map { ($0.objectId, $0) }, uniquingKeysWith: { _, newest in newest })
      for row in page.changes { byID[row.objectId] = row }
      rows = byID.values.sorted { $0.sequence > $1.sequence }; cursor = page.cursor; hasMore = page.hasMore
    } catch { if expected == identity, !Task.isCancelled { self.error = error.localizedDescription } }
  }
  @MainActor private func open(_ row: SecureTaxObjectReceipt, expected: String) async {
    guard expected == identity, loadedIdentity == expected, let service, !busy else { return }
    busy = true; error = nil; preview = nil; preparation = nil
    defer { if expected == identity { busy = false } }
    do {
      let snapshot = try await service.preview(objectId: row.objectId, minimumRevision: row.revision)
      guard expected == identity, !Task.isCancelled else { return }
      preview = snapshot
    } catch { if expected == identity, !Task.isCancelled { self.error = error.localizedDescription } }
  }
  @MainActor private func prepareImport(_ snapshot: SecureTaxJournalSnapshot) {
    guard loadedIdentity == identity, let service, let disk = model.disk, model.storageHealthy else { return }
    do {
      let available = Set(snapshot.journal.receipts.map(\.id).filter { FileManager.default.fileExists(atPath: disk.receiptURL($0).path) })
      preparation = try service.prepareImport(snapshot, currentJournal: model.journal, availableReceiptIDs: available)
    } catch { self.error = error.localizedDescription }
  }
  @MainActor private func delete(_ expected: String) async {
    guard expected == identity, loadedIdentity == expected, let service, !busy else { return }
    busy = true; error = nil
    defer { if expected == identity { busy = false } }
    do {
      _ = try await service.deleteOwnSnapshot()
      guard expected == identity, !Task.isCancelled else { return }
      checkpoint = try service.checkpoint(); preview = nil; preparation = nil; rows = []
      notice = "Remote archive deleted. Your local Journal and attachments are kept; retained backups need their own review."
    } catch { if expected == identity, !Task.isCancelled { self.error = error.localizedDescription } }
  }
  @MainActor private func startNewArchive() {
    guard loadedIdentity == identity, let service else { return }
    do { try service.startNewArchiveAfterDeletion(); checkpoint = try service.checkpoint(); notice = "A new opaque archive ID is ready for your next explicit upload." }
    catch { self.error = error.localizedDescription }
  }
}
