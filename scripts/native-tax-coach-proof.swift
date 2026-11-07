import DriverCore
import Foundation

enum CoachWireFailure: Error { case failed(String) }

@main struct NativeTaxCoachProof {
  static func check(_ condition: Bool, _ message: String) throws {
    if !condition { throw CoachWireFailure.failed(message) }
  }

  static func main() async throws {
    guard CommandLine.arguments.count == 3,
      let origin = URL(string: CommandLine.arguments[1]), origin.scheme == "http",
      origin.host == "127.0.0.1", origin.port != nil,
      ["write", "read"].contains(CommandLine.arguments[2])
    else { throw CoachWireFailure.failed("Use the owned loopback coach fixture server and a proof phase.") }
    let login = WorkspaceClient(origin: origin)
    let first = try await login.login(email: "coach.alpha@example.com", password: "Synthetic-native-coach-password")
    let second = try await login.login(email: "coach.beta@example.com", password: "Synthetic-native-coach-password")
    let alpha = WorkspaceClient(origin: origin, token: first.token)
    let beta = WorkspaceClient(origin: origin, token: second.token)
    let from = "2026-11-07", through = "2026-11-07"
    let foreign = try await beta.coach(from: from, through: through)
    try check(foreign.messages.isEmpty && foreign.intake.taxYear == nil,
      "A foreign account received the shared coach history or confirmed context.")
    if CommandLine.arguments[2] == "read" {
      let shared = try await alpha.coach(from: from, through: through)
      try check(shared.intake.jurisdiction == "New Jersey", "Native GET did not see the website's updated intake.")
      try check(shared.messages.contains { $0.role == "user" && $0.text == "What tax documents and vehicle deductions do I need?" },
        "Native GET did not receive the website's shared question.")
      try check(shared.preferences.vehicleCostCentsPerMile == 50 && shared.preferences.dailyNetCents == 10_000,
        "The website update lost the native goal/cost snapshot.")
      try check(shared.messages.allSatisfy { $0.createdAt.timeIntervalSince1970 > 0 }, "An actual server timestamp did not decode.")
      try printResult(["ok": true, "phase": "read", "messageCount": shared.messages.count,
                       "checks": ["native GET sees cookie-written question and intake", "optional source and engine fields decode", "UUID and timestamp decode", "foreign native history stays empty"]])
      return
    }
    let initial = try await alpha.coach(from: from, through: through)
    try check(initial.apiVersion == 1 && initial.messages.isEmpty && initial.preferences.dailyNetCents == nil,
      "The empty shared state or optional preference fields did not decode.")
    try check(initial.milestones.contains { $0.title == "Synthetic shared tax request" },
      "The native milestones did not include the same client-visible website request.")
    let formatter = ISO8601DateFormatter()
    let start = formatter.date(from: "2026-11-07T12:00:00Z")!
    var profitable = Trip(startedAt: start, endedAt: start.addingTimeInterval(1_800),
      distanceMeters: 10 * 1_609.344, classification: .business, purpose: "Synthetic profitable coach job",
      source: "manual", timeZone: TimeZone(identifier: "America/New_York")!)
    profitable.earningsCents = 2_000; profitable.platformFeesCents = 300
    profitable.platform = "Uber"; profitable.workArea = "Synthetic north"; profitable.rideRole = .ride
    var losing = Trip(startedAt: start.addingTimeInterval(3_600), endedAt: start.addingTimeInterval(5_400),
      distanceMeters: 14 * 1_609.344, classification: .business, purpose: "Synthetic loss coach job",
      source: "manual", timeZone: TimeZone(identifier: "America/New_York")!)
    losing.earningsCents = 500; losing.platformFeesCents = 100
    losing.platform = "DoorDash"; losing.workArea = "Synthetic south"; losing.rideRole = .delivery
    var recordIds: [UUID] = []
    for trip in [profitable, losing] {
      let record = DriverRecord(payload: .trip(trip))
      _ = try await alpha.save(DriverMutation(mutationId: UUID(), record: record))
      recordIds.append(record.id)
    }
    let messageId = UUID()
    let pending = CoachPendingMessage(id: messageId,
      text: "Where am I losing money, on which jobs, and which jobs make the most?", from: from, through: through,
      preferences: CoachPreferences(dailyNetCents: 10_000, weeklyNetCents: 50_000,
                                    targetHourlyCents: 2_000, vehicleCostCentsPerMile: 50),
      localReplyId: UUID())
    let answered = try await alpha.coachMessage(pending)
    try check(answered.messages.count == 2 && answered.messages.contains { $0.id == messageId && $0.role == "user" },
      "The server did not acknowledge the same native message UUID.")
    guard let reply = answered.messages.last(where: { $0.role == "assistant" }) else {
      throw CoachWireFailure.failed("No actual shared assistant reply decoded.")
    }
    try check(reply.text.contains("$12.00") && reply.text.contains("-$3.00"), "The actual reply did not preserve positive and loss-making job estimates.")
    try check(Set(reply.recordIds ?? []) == Set(recordIds), "The native reply lost its scoped record UUID references.")
    try check(reply.sources?.first?.id == "irs-recordkeeping" && reply.engine == "record-rules",
      "Source objects or the honest unconnected engine label did not decode.")
    try check(answered.messages.first?.engine == nil && answered.messages.first?.sources == nil,
      "Optional absent user-message fields were not preserved.")
    try check(answered.messages.allSatisfy { $0.createdAt.timeIntervalSince1970 > 0 }, "A server timestamp did not decode.")
    let retry = try await alpha.coachMessage(pending)
    try check(retry.messages == answered.messages, "Retrying the same native question appended duplicate shared history.")
    let intake = CoachIntake(taxYear: 2026, jurisdiction: "New York", businessType: "sole-proprietor")
    let intakeId = UUID()
    let saved = try await alpha.coachIntake(intake, mutationId: intakeId)
    let retriedIntake = try await alpha.coachIntake(intake, mutationId: intakeId)
    try check(saved.intake == intake && retriedIntake.messages == saved.messages,
      "Confirmed native intake or its idempotent retry did not round trip.")
    let fetched = try await alpha.coach(from: from, through: through)
    try check(fetched.messages == saved.messages && fetched.intake == intake,
      "Fresh native GET did not read the persisted shared conversation and intake.")
    try printResult(["ok": true, "phase": "write", "messageId": messageId.uuidString.lowercased(),
      "recordIds": recordIds.map { $0.uuidString.lowercased() }, "messageCount": fetched.messages.count,
      "checks": ["actual WorkspaceClient GET and POST", "optional empty preferences decode", "shared tax-request milestone", "positive and negative per-job estimates", "message and record UUID decode", "server timestamp decode", "optional source and engine fields", "native question retry idempotency", "explicit intake and retry", "fresh shared state GET", "foreign native account denied shared history"]])
  }

  static func printResult(_ value: [String: Any]) throws {
    print(String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), as: UTF8.self))
  }
}
