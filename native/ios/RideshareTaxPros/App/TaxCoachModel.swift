import DriverCore
import Foundation

extension DriverModel {
  @discardableResult func askCoach(_ text: String, from: String, through: String) async -> Bool {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard storageHealthy, !text.isEmpty, text.count <= 2000 else { return false }
    guard (journal.coachOutbox ?? []).count < 50 else {
      coachStatus = "Your saved questions are waiting to sync. Connect your workspace before adding more."
      return false
    }
    let user = CoachMessage(role: "user", text: text)
    var answer: CoachMessage
    let milestones: [CoachMilestone]
    if ReputationGuide.isQuery(text) {
      answer = CoachMessage(role: "assistant", text: ReputationGuide.answer(query: text,
        state: journal.reputationState ?? .init()))
      milestones = journal.coachMilestones ?? []
    } else {
      let local = TaxCoach.respond(to: text, records: journal.visible.map(\.record),
        goals: journal.goals ?? DriverGoals(), from: from, through: through, intake: journal.coachIntake ?? .init())
      answer = local.message; milestones = local.milestones
    }
    answer.engine = "local-record-rules"
    let pending = CoachPendingMessage(id: user.id, text: text, from: from, through: through,
      preferences: CoachPreferences(goals: journal.goals ?? DriverGoals()), localReplyId: answer.id)
    guard commit({ journal in
      journal.coachMessages = (journal.coachMessages ?? []) + [user, answer]
      journal.coachOutbox = (journal.coachOutbox ?? []) + [pending]
      journal.coachMilestones = milestones
    }) else { return false }
    coachStatus = connection == nil ? "On this iPhone · Connect to share with your firm" : "Saved on this iPhone · Waiting to share"
    await syncCoach(from: from, through: through)
    return true
  }

  @discardableResult func saveCoachIntake(_ intake: CoachIntake, from: String, through: String) async -> Bool {
    guard commit({ $0.coachIntake = intake; $0.coachIntakeMutationId = UUID() }) else { return false }
    coachStatus = "Confirmed on this iPhone · Sharing pending"
    await syncCoach(from: from, through: through)
    return true
  }

  func syncCoach(from: String, through: String) async {
    guard !coachSyncing, storageHealthy else { return }
    guard let profile = connection else {
      coachStatus = "On this iPhone · Connect to share with your firm"
      return
    }
    let scope = journalScope
    let client = WorkspaceClient(origin: profile.origin, token: profile.session.token)
    coachSyncing = true
    defer { coachSyncing = false }
    do {
      await sync()
      guard journalScope == scope else { return }
      guard pendingCount == 0, !journal.entries.contains(where: { $0.conflict != nil }) else {
        coachStatus = "Phone analysis shown · Finish record sync or review conflicts before workspace answers"
        return
      }
      if (journal.coachOutbox ?? []).contains(where: { ReputationGuide.isQuery($0.text) }) {
        let shared = await syncReputation()
        guard journalScope == scope else { return }
        guard shared else {
          coachStatus = "Phone analysis shown · Sync ratings and reviews before workspace answers"
          return
        }
      }
      if let mutation = journal.coachIntakeMutationId {
        let state = try await client.coachIntake(journal.coachIntake ?? .init(), mutationId: mutation)
        guard journalScope == scope else { return }
        guard applyCoach(state, intakeMutation: mutation) else { return }
      }
      for message in Array(journal.coachOutbox ?? []) {
        let state = try await client.coachMessage(message)
        guard journalScope == scope else { return }
        guard applyCoach(state, acknowledgedMessageID: message.id) else { return }
      }
      let state = try await client.coach(from: from, through: through)
      guard journalScope == scope else { return }
      if applyCoach(state) {
        coachStatus = (journal.coachOutbox ?? []).isEmpty && journal.coachIntakeMutationId == nil
          ? "Shared with \(profile.session.branding.name) · Same client account as the website"
          : "Saved on this iPhone · Newer questions or tax details are waiting to share"
      }
    } catch {
      guard journalScope == scope else { return }
      coachStatus = "Saved on this iPhone · Workspace not updated: \(error.localizedDescription)"
    }
  }

  private func applyCoach(_ state: CoachState, intakeMutation: UUID? = nil, acknowledgedMessageID: UUID? = nil) -> Bool {
    guard state.apiVersion == 1 else { coachStatus = "The workspace needs an update before sharing chat."; return false }
    return commit { journal in
      let receivedIDs = Set(state.messages.filter { $0.role == "user" }.map(\.id))
      let acknowledged = (journal.coachOutbox ?? []).filter { receivedIDs.contains($0.id) || $0.id == acknowledgedMessageID }
      // A successful retry can acknowledge an older question outside the latest
      // 100 server messages. Keep its phone answer rather than lose history.
      let replaced = Set(acknowledged.filter { receivedIDs.contains($0.id) }.map(\.localReplyId))
      let retained = Set(acknowledged.filter { !receivedIDs.contains($0.id) }.map(\.localReplyId))
      var messages: [UUID: CoachMessage] = [:]
      var order: [UUID: Int] = [:]
      for var message in journal.coachMessages ?? [] where !replaced.contains(message.id) {
        if retained.contains(message.id) { message.engine = "phone-record-rules" }
        if order[message.id] == nil { order[message.id] = order.count }
        messages[message.id] = message
      }
      let serverOffset = order.count
      for (index, message) in state.messages.enumerated() {
        messages[message.id] = message
        order[message.id] = serverOffset + index
      }
      journal.coachMessages = messages.values.sorted {
        $0.createdAt == $1.createdAt ? order[$0.id, default: 0] < order[$1.id, default: 0] : $0.createdAt < $1.createdAt
      }
      let acknowledgedIDs = Set(acknowledged.map(\.id))
      journal.coachOutbox = (journal.coachOutbox ?? []).filter { !acknowledgedIDs.contains($0.id) }
      if let intakeMutation, journal.coachIntakeMutationId == intakeMutation { journal.coachIntakeMutationId = nil }
      if journal.coachIntakeMutationId == nil { journal.coachIntake = state.intake }
      journal.coachMilestones = state.milestones; journal.coachEngine = state.engine
    }
  }
}
