import DriverCore
import Foundation

extension DriverModel {
  func refreshBanks(force: Bool = false) async {
    guard storageHealthy, let connection, !bankSyncing,
      force || Date().timeIntervalSince(journal.bankUpdatedAt ?? .distantPast) > 900 else { return }
    let scope = journalScope
    let isCurrentSession = { scope == self.journalScope && self.connection?.session.token == connection.session.token }
    bankSyncing = true
    defer {
      bankSyncing = false
      // A connection switch can happen while the old account's request is
      // awaiting the network. Initialize the new profile once this task exits.
      if !isCurrentSession(), self.connection != nil, bankStatus == nil {
        Task { await self.refreshBanks(force: true) }
      }
    }
    let client = WorkspaceClient(origin: connection.origin, token: connection.session.token)
    do {
      let status = try await client.banks()
      guard isCurrentSession() else { return }
      let protectedWorkspace = try SecureTaxTransportPolicy.requiresProtectedTransport(origin: connection.origin)
      bankStatus = status
      bankError = protectedWorkspace ? "New bank updates are paused until a protected off-host provider connection is available. Existing imported history still needs migration review." : nil
      if status.ready && !protectedWorkspace {
        for item in status.items where item.connected == 1 && item.environment == status.environment {
          do { _ = try await client.bankAction(["action": "sync", "itemId": item.id], as: BankActionReply.self) }
          catch {
            guard isCurrentSession() else { return }
            bankError = error.localizedDescription
          }
          guard isCurrentSession() else { return }
        }
      }
      // Provider activation controls new network updates, not access to this
      // client's already-saved inbox on another phone or after disconnection.
      for _ in 0..<100 {
        let page = try await client.bankFeed(after: journal.bankCursor ?? 0)
        guard isCurrentSession() else { return }
        let merged = BankInbox.merging(page.transactions, into: journal.bankTransactions ?? [])
        guard merged.count <= 50_000 else { bankError = "This phone's bank inbox has reached its capacity. Existing records are kept."; return }
        guard commit({ j in
          j.bankTransactions = merged; j.bankCursor = page.cursor
          for index in (j.bankTransactions ?? []).indices {
            let id = j.bankTransactions![index].id
            j.bankTransactions![index].reviewedRecordId = j.visible.first { $0.record.bankReference?.transactionId == id }?.id
          }
        }) else { return }
        if !page.hasMore { _ = commit { $0.bankUpdatedAt = Date() }; break }
      }
      let latest = try await client.banks()
      guard isCurrentSession() else { return }
      bankStatus = latest
    } catch {
      guard isCurrentSession() else { return }
      bankError = error.localizedDescription
    }
  }
}
