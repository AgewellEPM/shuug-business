import DriverCore
import Foundation

extension DriverModel {
  func refreshBanks(force: Bool = false) async {
    guard storageHealthy, let connection, !bankSyncing,
      force || Date().timeIntervalSince(journal.bankUpdatedAt ?? .distantPast) > 900 else { return }
    bankSyncing = true; defer { bankSyncing = false }
    let scope = journalScope
    let client = WorkspaceClient(origin: connection.origin, token: connection.session.token)
    do {
      let status = try await client.banks()
      guard scope == journalScope else { return }
      bankStatus = status; bankError = nil
      guard status.ready else { return }
      for item in status.items where item.connected == 1 && item.environment == status.environment {
        do { _ = try await client.bankAction(["action": "sync", "itemId": item.id], as: BankActionReply.self) }
        catch { bankError = error.localizedDescription }
        guard scope == journalScope else { return }
      }
      for _ in 0..<100 {
        let page = try await client.bankFeed(after: journal.bankCursor ?? 0)
        guard scope == journalScope else { return }
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
      guard scope == journalScope else { return }
      bankStatus = latest
    } catch {
      guard scope == journalScope else { return }
      bankError = error.localizedDescription
    }
  }
}
