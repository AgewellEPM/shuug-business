import Combine
import CryptoKit
import DriverCore
import Foundation
import Network

@MainActor final class DriverModel: ObservableObject {
  @Published private(set) var journal = Journal()
  @Published private(set) var connection: ConnectionProfile?
  @Published var message: String?
  @Published var requestedPrompt: ExpensePrompt?
  @Published var requestedOffer: UniversalGigOffer?
  @Published var offerRouteEvidence: [UUID: GigOfferRouteEvidence] = [:]
  @Published var bankStatus: BankStatusReply?
  @Published var bankError: String?
  @Published var bankSyncing = false
  @Published var coachSyncing = false
  @Published var coachStatus = "Saved on this iPhone"
  @Published var reputationSyncing = false
  @Published var reputationStatus = "Saved on this iPhone"
  @Published private(set) var syncing = false
  @Published private(set) var syncStatus = "Saved on this iPhone"
  @Published private(set) var syncDetail: String?
  @Published private(set) var updatingProfile = false
  @Published private(set) var profileError: String?
  @Published private(set) var storageHealthy = true
  private(set) var disk: JournalDiskStore!
  private var namespace = "guest", lastAttempt = Date.distantPast
  private let monitor = NWPathMonitor()
  var importedCaptureIDs = Set<String>()
  private var root: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("RideshareTaxPros", isDirectory: true)
  }
  var guest: Bool { namespace == "guest" }
  var journalScope: String { namespace }
  var active: LocalEntry? { journal.entries.first { $0.id == journal.activeTripId } }
  var pendingCount: Int {
    journal.entries.filter { $0.pendingMutationId != nil }.count + journal.pendingReceipts.count
  }
  init() {
    do {
      connection = try SessionKeychain.read()
      namespace = connection.map(Self.scope) ?? "guest"
      disk = try JournalDiskStore(directory: root.appendingPathComponent(namespace))
      journal = try disk.load()
    } catch {
      storageHealthy = false
      message =
        "Your saved journal could not be opened. Keep this installation and its data; do not reinstall. \(error.localizedDescription)"
    }
    monitor.pathUpdateHandler = { [weak self] path in
      if path.status == .satisfied { Task { @MainActor in await self?.syncAll() } }
    }
    monitor.start(queue: DispatchQueue(label: "com.ridesharetaxpros.driver.network"))
  }
  deinit { monitor.cancel() }
  private static func scope(_ profile: ConnectionProfile) -> String {
    SHA256.hash(
      data: Data(
        (profile.origin.absoluteString + "|" + profile.session.account.id.uuidString.lowercased())
          .utf8)
    ).map { String(format: "%02x", $0) }.joined()
  }
  @discardableResult func commit(_ change: (inout Journal) -> Void) -> Bool {
    guard storageHealthy, disk != nil else { return false }
    var next = journal
    change(&next)
    do {
      try disk.save(next)
      journal = next
      return true
    } catch {
      message = "Your phone could not save this change. \(error.localizedDescription)"
      return false
    }
  }
  func save(
    _ record: DriverRecord, receipt: Data? = nil, receiptId: UUID? = nil,
    mime: String = "image/jpeg"
  ) -> Bool {
    guard storageHealthy, disk != nil else { return false }
    if let reference = record.bankReference, journal.visible.contains(where: {
      $0.id != record.id && $0.record.bankReference?.transactionId == reference.transactionId
    }) {
      message = "This bank transaction is already linked to another record. Open that record instead of saving it twice."
      return false
    }
    do { if let receipt, let receiptId { try disk.saveReceipt(receipt, id: receiptId) } } catch {
      message = "Receipt could not be saved on this iPhone. \(error.localizedDescription)"
      return false
    }
    let saved = commit { j in
      if let receiptId, receipt != nil, !j.receipts.contains(where: { $0.id == receiptId }) {
        j.receipts.append(LocalReceipt(id: receiptId, mime: mime))
      }
      j.upsert(record)
    }
    if saved { Task { await sync() } }
    return saved
  }
  func remove(_ id: UUID) { if commit({ $0.delete(id) }) { Task { await sync() } } }
  func location(_ fix: LocationFix, now: Date = Date()) {
    let previous = active?.locations.last?.timestamp
    if commit({ $0.addLocation(fix, now: now) }) {
      if let id = journal.activeTripId, let point = active?.locations.last,
        point.timestamp != previous
      {
        do { try disk.appendRoute(point, tripId: id) } catch {
          message =
            "Mileage was saved, but the route preview could not be saved. \(error.localizedDescription)"
        }
      }
      if Date().timeIntervalSince(lastAttempt) >= 15 { Task { await sync() } }
    }
  }
  func finishTrip() { if commit({ $0.finishTrip() }) { Task { await sync() } } }
  func connect(origin: URL, email: String, password: String, includeOffline: Bool, includeCoach: Bool = false,
               includeReputation: Bool = false) async throws {
    guard !syncing, !updatingProfile else {
      throw WorkspaceError.message("Wait for the current sync to finish before reconnecting an account.")
    }
    guard journal.activeTripId == nil else {
      throw WorkspaceError.message(
        "Finish your current drive before changing the workspace connection.")
    }
    let originalScope = namespace
    let reply = try await WorkspaceClient(origin: origin).login(email: email, password: password)
    guard namespace == originalScope, journal.activeTripId == nil, storageHealthy else {
      throw WorkspaceError.message("Your account or drive changed while signing in. Finish the drive and try again.")
    }
    let profile = ConnectionProfile(origin: origin, session: reply)
    let nextScope = Self.scope(profile)
    let nextDisk = try JournalDiskStore(directory: root.appendingPathComponent(nextScope))
    var nextJournal = try nextDisk.load()
    if guest && (includeOffline || includeCoach || includeReputation) {
      let plan = try GuestTransferPlan.prepare(source: journal, destination: nextJournal,
        includeRecords: includeOffline, includeCoach: includeCoach, includeReputation: includeReputation)
      try plan.copyFiles(source: disk, destination: nextDisk)
      nextJournal = plan.journal
    }
    try nextDisk.save(nextJournal)
    try SessionKeychain.save(profile)
    disk = nextDisk
    journal = nextJournal
    namespace = nextScope
    offerRouteEvidence = [:]
    connection = profile
    reputationStatus = "Saved on this iPhone · Sharing pending"
    bankStatus = nil; bankError = nil
    syncDetail = nil
    profileError = nil
    storageHealthy = true
    syncStatus = "Connected to \(reply.branding.name)"
    await sync()
    await syncReputation()
    if includeCoach {
      let day = DriverRecord.day(Date())
      await syncCoach(from: String(day.prefix(4)) + "-01-01", through: day)
    }
  }
  func disconnect() async {
    guard !syncing, !updatingProfile else {
      message = "Wait for the current sync to finish before signing out."
      return
    }
    guard journal.activeTripId == nil else {
      message = "Finish your current drive before signing out."
      return
    }
    let previous = connection
    do {
      let guestDisk = try JournalDiskStore(directory: root.appendingPathComponent("guest"))
      let guestJournal = try guestDisk.load()
      try SessionKeychain.remove()
      connection = nil
      bankStatus = nil; bankError = nil
      namespace = "guest"
      offerRouteEvidence = [:]
      disk = guestDisk
      journal = guestJournal
      reputationStatus = "Saved on this iPhone"
      syncStatus = "Saved on this iPhone"
      syncDetail = nil
      profileError = nil
      if let previous {
        try? await WorkspaceClient(origin: previous.origin, token: previous.session.token).logout()
      }
    } catch { message = error.localizedDescription }
  }
  func sync() async {
    guard !syncing, !updatingProfile, storageHealthy, let connection else { return }
    let scope = namespace
    let client = WorkspaceClient(origin: connection.origin, token: connection.session.token)
    let capturedDisk = disk!
    syncing = true
    lastAttempt = Date()
    syncDetail = nil
    syncStatus = "Syncing with your firm…"
    var continueSync = false
    defer {
      syncing = false
      if continueSync && scope == namespace { Task { await sync() } }
    }
    do {
      for receipt in journal.pendingReceipts {
        try await client.upload(receipt, data: capturedDisk.receipt(receipt.id))
        guard scope == namespace else { return }
        guard
          commit({ j in
            if let i = j.receipts.firstIndex(where: { $0.id == receipt.id }) {
              j.receipts[i].uploaded = true
            }
          })
        else { return }
      }
      for mutation in journal.pending {
        do {
          let reply = try await client.save(mutation)
          guard scope == namespace else { return }
          guard commit({ $0.acknowledge(mutation, result: reply) }) else { return }
        } catch WorkspaceError.server(let status, _, let current)
          where status == 409 && current != nil
        {
          guard scope == namespace else { return }
          _ = commit { $0.merge(current!) }
        }
      }
      var morePages = false
      for _ in 0..<25 {
        let page = try await client.records(after: journal.cursor)
        guard scope == namespace else { return }
        guard
          commit({ j in
            for row in page.records { j.merge(row) }
            j.cursor = page.cursor
          })
        else { return }
        morePages = page.hasMore
        if !morePages { break }
      }
      guard commit({ $0.lastSyncAt = Date() }) else { return }
      syncStatus =
        journal.entries.contains(where: { $0.conflict != nil })
        ? "Records need your review"
        : pendingCount == 0 && !morePages ? "Synced with your firm" : "More records waiting to sync"
      // Flush edits made during this successful upload pass. Network failures
      // keep their queue and wait for a reconnect or explicit retry.
      continueSync = morePages || !journal.pending.isEmpty || !journal.pendingReceipts.isEmpty
      await refreshBanks()
      await refreshProfile()
    } catch {
      guard scope == namespace else { return }
      if case WorkspaceError.server(let status, _, _) = error, status == 401 || status == 403 {
        syncStatus = "Sign in again to continue syncing"
      } else {
        syncStatus = "Saved on this iPhone · Sync pending"
      }
      syncDetail = error.localizedDescription
    }
  }
  private func applyProfile(_ reply: ProfileReply, expected: ConnectionProfile, scope: String) throws {
    guard scope == namespace, var current = connection, current.origin == expected.origin,
      current.session.token == expected.session.token
    else { throw CancellationError() }
    guard reply.account.id == current.session.account.id else {
      throw WorkspaceError.message("The workspace returned another client identity. Sign in again before continuing.")
    }
    current.session.account = reply.account
    current.session.branding = reply.branding
    // A profile read or edit does not renew the session or change journal scope.
    try SessionKeychain.save(current)
    connection = current
  }
  func refreshProfile() async {
    guard let connection, !updatingProfile else { return }
    let scope = namespace
    do {
      let reply = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).profile()
      try applyProfile(reply, expected: connection, scope: scope)
      profileError = nil
    } catch {
      guard scope == namespace, self.connection?.session.token == connection.session.token else { return }
      profileError = error.localizedDescription
      if case WorkspaceError.server(let status, _, _) = error, status == 401 || status == 403 {
        syncStatus = "Sign in again to continue syncing"
      }
    }
  }
  func updateProfileName(_ name: String) async throws {
    guard let connection else { throw WorkspaceError.message("Connect your client account first.") }
    guard !syncing, !updatingProfile else { throw WorkspaceError.message("Wait for the current sync or profile update to finish.") }
    let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.count <= 100 else { throw WorkspaceError.message("Use a display name between 1 and 100 characters.") }
    let scope = namespace
    updatingProfile = true
    defer { updatingProfile = false }
    let reply = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).profile(name: value)
    try applyProfile(reply, expected: connection, scope: scope)
    profileError = nil
  }
  func receiptURL(_ id: UUID) async throws -> URL {
    if FileManager.default.fileExists(atPath: disk.receiptURL(id).path) {
      return disk.receiptURL(id)
    }
    guard let connection else {
      throw WorkspaceError.message("Connect to the workspace to download this receipt.")
    }
    let scope = namespace
    let capturedDisk = disk!
    let (data, mime) = try await WorkspaceClient(
      origin: connection.origin, token: connection.session.token
    ).receipt(id)
    guard scope == namespace else { throw CancellationError() }
    guard ["image/jpeg", "image/png", "application/pdf"].contains(mime) else {
      throw WorkspaceError.message("Unsupported receipt format.")
    }
    try capturedDisk.saveReceipt(data, id: id)
    return capturedDisk.receiptURL(id)
  }
  /// The firm can request a fresh copy after a server-side file loss. Reuse the
  /// immutable receipt ID so the workspace can verify the existing digest.
  func resendReceipt(_ id: UUID) async throws {
    guard let connection else { throw WorkspaceError.message("Connect to the workspace first.") }
    let scope = namespace, capturedDisk = disk!
    let data = try capturedDisk.receipt(id)
    let mime: String
    if data.starts(with: Data([0xff, 0xd8, 0xff])) { mime = "image/jpeg" }
    else if data.starts(with: Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) { mime = "image/png" }
    else if data.starts(with: Data("%PDF-".utf8)) { mime = "application/pdf" }
    else { throw WorkspaceError.message("The local receipt format is not supported.") }
    try await WorkspaceClient(origin: connection.origin, token: connection.session.token)
      .upload(LocalReceipt(id: id, mime: mime), data: data)
    guard scope == namespace else { throw CancellationError() }
    if journal.receipts.contains(where: { $0.id == id && !$0.uploaded }) {
      guard commit({ j in
        if let index = j.receipts.firstIndex(where: { $0.id == id }) { j.receipts[index].uploaded = true }
      }) else { throw WorkspaceError.message("The receipt was sent, but this phone could not update its sync status.") }
    }
  }
}
