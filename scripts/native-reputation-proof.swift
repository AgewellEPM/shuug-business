import DriverCore
import Foundation

enum ReputationWireFailure: Error { case failed(String) }

@main struct NativeReputationProof {
  static func check(_ condition: Bool, _ message: String) throws {
    if !condition { throw ReputationWireFailure.failed(message) }
  }
  static func main() async throws {
    guard CommandLine.arguments.count == 3, let origin = URL(string: CommandLine.arguments[1]),
      origin.scheme == "http", origin.host == "127.0.0.1", origin.port != nil,
      ["write", "read"].contains(CommandLine.arguments[2]) else {
      throw ReputationWireFailure.failed("Use the owned loopback reputation fixture and a proof phase.")
    }
    let session = WorkspaceClient(origin: origin)
    let first = try await session.login(email: "reputation.alpha@example.com", password: "Synthetic-reputation-password")
    let second = try await session.login(email: "reputation.beta@example.com", password: "Synthetic-reputation-password")
    let alpha = WorkspaceClient(origin: origin, token: first.token)
    let beta = WorkspaceClient(origin: origin, token: second.token)
    let foreign = try await beta.reputation()
    try check(foreign.ratings.isEmpty && foreign.reviews.isEmpty, "Another native account received private reputation records.")
    if CommandLine.arguments[2] == "read" {
      let shared = try await alpha.reputation()
      try check(shared.reviews.contains { $0.text == "Website positive communication feedback" && !$0.deleted },
        "Native GET did not decode the website's review addition.")
      try check(shared.reviews.contains { $0.text == "Native tagged accuracy feedback" && $0.deleted },
        "Native GET did not retain the website-confirmed deletion tombstone.")
      let summary = ReputationGuide.summaries(state: shared, platformID: "uber-driver").first!
      try check(summary.improvements.isEmpty && summary.unreviewedCount == 1,
        "Deleted or unreviewed feedback created an unsupported improvement finding.")
      try check(summary.strengths.contains { $0.topic == "communication" }, "Native guide lost website-tagged positive evidence.")
      let financial = try await alpha.coach(from: "2026-11-07", through: "2026-11-07")
      try check(financial.preferences.vehicleCostCentsPerMile == 50 && financial.preferences.dailyNetCents == 10_000,
        "Reputation sharing changed the financial goal/cost snapshot.")
      try output(["ok": true, "phase": "read", "ratingCount": shared.ratings.count, "reviewCount": shared.reviews.count,
        "checks": ["native GET sees cookie-written review", "native GET retains explicit cookie deletion tombstone",
          "deleted and unreviewed feedback cannot fabricate criticism", "native guide sees cookie-written strength evidence",
          "foreign native account remains isolated", "financial preferences remain unchanged"]])
      return
    }
    let initial = try await alpha.reputation()
    try check(initial.apiVersion == 1 && initial.ratings.isEmpty && initial.reviews.isEmpty && initial.acknowledgedMutationId == nil,
      "Empty reputation state did not decode.")
    let formatter = ISO8601DateFormatter()
    func at(_ text: String) -> Date { formatter.date(from: text)! }
    var trip = Trip(startedAt: at("2026-11-07T12:00:00Z"), endedAt: at("2026-11-07T12:30:00Z"),
      distanceMeters: 10 * 1609.344, classification: .business, purpose: "Synthetic preserved financial baseline",
      source: "manual", timeZone: TimeZone(secondsFromGMT: 0)!)
    trip.rideRole = .ride; trip.earningsCents = 2_000; trip.platformFeesCents = 300
    trip.platform = "Uber"; trip.workArea = "Synthetic proof area"
    let financialRecord = DriverRecord(payload: .trip(trip))
    _ = try await alpha.save(.init(mutationId: UUID(), record: financialRecord))
    let baselineQuestion = CoachPendingMessage(id: UUID(), text: "Show recorded profit and goals",
      from: "2026-11-07", through: "2026-11-07",
      preferences: .init(dailyNetCents: 10_000, vehicleCostCentsPerMile: 50), localReplyId: UUID())
    let baseline = try await alpha.coachMessage(baselineQuestion)
    try check(baseline.messages.last(where: { $0.role == "assistant" })?.text.contains("$12.00") == true,
      "Compiled financial baseline did not establish1200cents estimated trip net.")
    let ratings = [
      ReputationRating(platformID: "uber-driver", platformName: "Uber Driver", recordedAt: at("2026-11-01T12:00:00Z"),
        score: 4.7, scale: 5, reviewCount: 20, notes: "Native manual earlier snapshot"),
      ReputationRating(platformID: "uber-driver", platformName: "Uber Driver", recordedAt: at("2026-11-03T12:00:00Z"),
        score: 95, scale: 100, notes: "Native different scale snapshot"),
      ReputationRating(platformID: "uber-driver", platformName: "Uber Driver", recordedAt: at("2026-11-05T12:00:00Z"),
        score: 4.9, scale: 5, reviewCount: 30, notes: "Native manual latest snapshot"),
      ReputationRating(platformID: "lyft-driver", platformName: "Lyft Driver", recordedAt: at("2026-11-06T12:00:00Z"),
        score: 88, scale: 100, notes: "Native separate app snapshot")
    ]
    var firstMutation: ReputationMutation?
    for rating in ratings {
      let mutation = ReputationMutation(action: .addRating, rating: rating)
      let saved = try await alpha.reputation(mutation)
      try check(saved.acknowledgedMutationId == mutation.mutationId && saved.ratings.contains(rating),
        "Actual native rating POST lost payload, timestamp, UUID or exact acknowledgement.")
      if firstMutation == nil { firstMutation = mutation }
    }
    let negative = ReputationReview(platformID: "uber-driver", platformName: "Uber Driver", recordedAt: at("2026-11-07T11:00:00Z"),
      text: "Native tagged accuracy feedback", sentiment: "mixed", topics: ["accuracy"])
    let positive = ReputationReview(platformID: "uber-driver", platformName: "Uber Driver", recordedAt: at("2026-11-07T11:10:00Z"),
      text: "Native positive handling feedback", sentiment: "positive", topics: ["handling"])
    let unreviewed = ReputationReview(platformID: "uber-driver", platformName: "Uber Driver", recordedAt: at("2026-11-07T11:20:00Z"),
      text: "Native unreviewed timing words must not imply criticism", sentiment: "unreviewed", topics: ["timing"])
    for review in [negative, positive, unreviewed] {
      let mutation = ReputationMutation(action: .addReview, review: review)
      let saved = try await alpha.reputation(mutation)
      try check(saved.acknowledgedMutationId == mutation.mutationId && saved.reviews.contains(review),
        "Actual native review POST lost tags or explicit acknowledgement.")
    }
    let saved = try await alpha.reputation()
    let retried = try await alpha.reputation(firstMutation!)
    try check(retried.ratings == saved.ratings && retried.reviews == saved.reviews
      && retried.acknowledgedMutationId == firstMutation!.mutationId, "Native retry duplicated or changed immutable history.")
    var changed = firstMutation!; changed.rating!.score = 4.1
    do { _ = try await alpha.reputation(changed); throw ReputationWireFailure.failed("Changed operation digest was accepted.") }
    catch WorkspaceError.server(let status, _, _) { try check(status == 409, "Changed operation did not return409.") }
    changed.mutationId = UUID()
    do { _ = try await alpha.reputation(changed); throw ReputationWireFailure.failed("Immutable entity ID was edited.") }
    catch WorkspaceError.server(let status, _, _) { try check(status == 409, "Immutable entity edit did not return409.") }
    let summary = ReputationGuide.summaries(state: saved, platformID: "uber-driver").first!
    try check(summary.latestRating?.id == ratings[2].id && summary.previousComparableRating?.id == ratings[0].id,
      "Native guide compared another app or a different rating scale.")
    try check(abs((summary.change ?? 0) - 0.2) < 0.00001, "Same-scale native trend did not retain the observed0.2change.")
    try check(summary.improvements.flatMap(\.reviewIDs) == [negative.id]
      && summary.strengths.flatMap(\.reviewIDs) == [positive.id] && summary.unreviewedCount == 1,
      "Native guidance did not stay grounded in explicit feedback tags.")
    let ratingQuestion = CoachPendingMessage(id: UUID(), text: "How are my ratings and personal reviews? Show improvement steps.",
      from: "2025-01-01", through: "2025-01-02", preferences: .init(dailyNetCents: 1, vehicleCostCentsPerMile: 999), localReplyId: UUID())
    let answered = try await alpha.coachMessage(ratingQuestion)
    let reply = answered.messages.last(where: { $0.role == "assistant" })!
    try check(reply.text.contains("4.9/5") && reply.text.contains("4.7/5") && reply.text.contains("accuracy")
      && reply.text.contains("independent of the selected financial date range"), "Shared coach did not use saved reputation history.")
    try check(reply.engine == "record-rules" && !answered.engine.peelAvailable && !reply.text.contains("Peel verified"),
      "Personal reputation advice received an unsupported Peel verification label.")
    try check(reply.recordIds?.contains(negative.id) == true && reply.recordIds?.contains(ratings[2].id) == true,
      "Shared reputation guidance lost its actual record evidence IDs.")
    try check(answered.preferences.vehicleCostCentsPerMile == 50 && answered.preferences.dailyNetCents == 10_000,
      "A reputation question overwrote operating goals or costs.")
    let records = try await alpha.records(after: 0)
    try check(records.records.count == 1 && records.records[0].record == financialRecordWithRevision(financialRecord, records.records[0].record.revision),
      "Reputation operations changed a financial record.")
    try await alpha.logout()
    do { _ = try await alpha.reputation(); throw ReputationWireFailure.failed("A revoked native bearer token retained access.") }
    catch WorkspaceError.server(let status, _, _) { try check(status == 401, "Revoked token did not fail401.") }
    try output(["ok": true, "phase": "write", "negativeReviewID": negative.id.uuidString.lowercased(),
      "ratingIDs": ratings.map { $0.id.uuidString.lowercased() }, "financialRecordID": financialRecord.id.uuidString.lowercased(),
      "ratingQuestionID": ratingQuestion.id.uuidString.lowercased(), "ratingReplyEngine": reply.engine!,
      "checks": ["actual compiled WorkspaceClient empty reputation GET", "native rating and review POST decode exact acknowledgement",
        "UUID timestamp scale sentiment and topic wire roundtrip", "same operation retry is idempotent",
        "changed operation digest returns409", "immutable entity edit returns409", "same-app same-scale native trend",
        "native strengths and improvement evidence use explicit tags", "shared coach reads all saved manual reputation history",
        "reputation reply stays record-rules without Peel qualification", "reputation question cannot overwrite financial preferences",
        "financial records remain unchanged", "revoked native token returns401", "foreign native reputation state is empty"]])
  }
  static func financialRecordWithRevision(_ record: DriverRecord, _ revision: Int) -> DriverRecord {
    var value = record; value.revision = revision; return value
  }
  static func output(_ value: [String: Any]) throws {
    print(String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), as: UTF8.self))
  }
}
