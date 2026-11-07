import DriverCore
import Foundation

extension DriverModel {
  @discardableResult func saveReputationRating(_ rating: ReputationRating) -> Bool {
    saveReputation(.init(action: .addRating, rating: rating))
  }
  @discardableResult func saveReputationReview(_ review: ReputationReview) -> Bool {
    saveReputation(.init(action: .addReview, review: review))
  }
  @discardableResult func deleteReputationRating(_ id: UUID) -> Bool {
    saveReputation(.init(action: .deleteRating, id: id))
  }
  @discardableResult func deleteReputationReview(_ id: UUID) -> Bool {
    saveReputation(.init(action: .deleteReview, id: id))
  }

  private func saveReputation(_ mutation: ReputationMutation) -> Bool {
    do {
      var next = journal
      try next.enqueueReputation(mutation)
      guard commit({ $0.reputationState = next.reputationState; $0.reputationOutbox = next.reputationOutbox }) else { return false }
      reputationStatus = connection == nil ? "Saved on this iPhone" : "Saved on this iPhone · Sharing pending"
      Task { await syncReputation() }
      return true
    } catch { message = error.localizedDescription; return false }
  }

  /// Independent of financial/chat sync. Every post-await write rechecks account scope.
  @discardableResult func syncReputation() async -> Bool {
    guard !reputationSyncing, storageHealthy else { return false }
    guard let profile = connection else {
      reputationStatus = "Saved on this iPhone · Connect to share with your tax team"
      return false
    }
    let scope = journalScope
    let client = WorkspaceClient(origin: profile.origin, token: profile.session.token)
    var continueSync = false
    reputationSyncing = true
    defer {
      reputationSyncing = false
      if let current = connection, journalScope != scope || current.session.token != profile.session.token {
        Task { await syncReputation() }
      } else if continueSync { Task { await syncReputation() } }
    }
    func sameAccount() -> Bool {
      journalScope == scope && connection?.session.account.id == profile.session.account.id
        && connection?.session.token == profile.session.token
    }
    do {
      for operation in Array(journal.reputationOutbox ?? []) {
        let state = try await client.reputation(operation)
        guard sameAccount() else { return false }
        var next = journal
        try next.mergeReputation(state, acknowledging: operation.mutationId)
        guard commit({ $0.reputationState = next.reputationState; $0.reputationOutbox = next.reputationOutbox }) else { return false }
      }
      let state = try await client.reputation()
      guard sameAccount() else { return false }
      var next = journal
      try next.mergeReputation(state)
      guard commit({ $0.reputationState = next.reputationState; $0.reputationOutbox = next.reputationOutbox }) else { return false }
      let complete = (journal.reputationOutbox ?? []).isEmpty
      continueSync = !complete
      reputationStatus = complete ? "Shared with \(profile.session.branding.name) · Your recorded entries"
        : "Saved on this iPhone · Newer changes are waiting to share"
      return complete
    } catch {
      guard sameAccount() else { return false }
      reputationStatus = "Saved on this iPhone · Sharing pending: \(error.localizedDescription)"
      return false
    }
  }
}
