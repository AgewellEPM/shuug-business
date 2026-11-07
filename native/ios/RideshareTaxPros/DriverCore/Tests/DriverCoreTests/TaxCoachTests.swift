import XCTest
@testable import DriverCore

final class TaxCoachTests: XCTestCase {
  private let day = "2026-11-05"
  private let goals = DriverGoals(dailyNetCents: 5_000, weeklyNetCents: 25_000,
    targetHourlyCents: 2_000, vehicleCostCentsPerMile: 50)

  private func trip(_ title: String, fare: Int?, fee: Int? = 100, miles: Double = 10,
                    platform: String = "Uber", area: String = "Queens", hour: Int = 12,
                    gaps: Bool = false, date: String = "2026-11-05", duration: TimeInterval = 1_800) -> DriverRecord {
    let start = ISO8601DateFormatter().date(from: "\(date)T\(String(format: "%02d", hour)):00:00Z")!
    var trip = Trip(startedAt: start, endedAt: start.addingTimeInterval(duration),
      distanceMeters: miles * 1609.344, classification: .business, purpose: title,
      hasGaps: gaps, timeZone: TimeZone(secondsFromGMT: 0)!)
    trip.earningsCents = fare; trip.platformFeesCents = fee; trip.rideRole = .ride
    trip.platform = platform; trip.workArea = area
    return DriverRecord(payload: .trip(trip))
  }

  func testLosingAndBestQueriesUseActualIndividualTripEconomics() {
    let loss = trip("Long pickup", fare: 400)
    let best = trip("Airport job", fare: 2_000, fee: 200)
    let records = [loss, best]
    let result = TaxCoach.respond(to: "Am I loosing money?", records: records, goals: goals, from: day, through: day)
    XCTAssertEqual(result.analysis.lossMakingJobs.map(\.id), [loss.id])
    XCTAssertEqual(result.analysis.bestJobs.first?.id, best.id)
    XCTAssertEqual(result.analysis.lossMakingJobs.first?.estimatedNetCents, -200)
    XCTAssertEqual(result.analysis.bestJobs.first?.estimatedNetCents, 1_300)
    XCTAssertTrue(result.message.text.contains("Long pickup"))
    XCTAssertTrue(result.message.text.contains("-$2.00"))
    XCTAssertTrue(result.message.text.contains("Records for \(day) through \(day)"))
    let bestAnswer = TaxCoach.respond(to: "Show my best individual jobs", records: records,
      goals: goals, from: day, through: day)
    XCTAssertTrue(bestAnswer.message.text.contains("Airport job"))
    XCTAssertEqual(bestAnswer.message.engine, "record-rules")
  }

  func testUnknownFeesFaresVehicleCostAndGPSGapsNeverRankAsFreeOrProfitable() {
    let unknownFare = trip("No fare", fare: nil)
    let unknownFee = trip("No fees recorded", fare: 10_000, fee: nil)
    let gap = trip("Partial GPS", fare: 20_000, gaps: true)
    let records = [unknownFare, unknownFee, gap]
    let analysis = TaxCoach.analyze(records: records, goals: goals, from: day, through: day)
    XCTAssertTrue(analysis.bestJobs.isEmpty)
    XCTAssertTrue(analysis.lossMakingJobs.isEmpty)
    XCTAssertNil(analysis.estimatedRideNetCents)
    XCTAssertEqual(analysis.missingFareCount, 1)
    XCTAssertEqual(analysis.missingFeeCount, 1)
    XCTAssertEqual(analysis.gpsGapCount, 1)
    let noCost = TaxCoach.analyze(records: [trip("No cost estimate", fare: 10_000)],
      goals: DriverGoals(), from: day, through: day)
    XCTAssertEqual(noCost.missingVehicleCostCount, 1)
    XCTAssertTrue(noCost.bestJobs.isEmpty)
    let reply = TaxCoach.respond(to: "Am I losing money", records: records, goals: goals, from: day, through: day)
    XCTAssertTrue(reply.message.text.contains("do not yet establish"))
    XCTAssertTrue(reply.message.text.contains("unknown platform fees"))
    XCTAssertTrue(reply.message.text.contains("GPS gaps"))
  }

  func testUIJobPromptsReturnMatchingEvidenceBeforeUnrelatedRecords() {
    let income = DriverRecord(payload: .income(Income(date: day, platform: "Uber",
      description: "Unrelated payout entry", amountCents: 2_000)))
    let loss = trip("Loss evidence", fare: 400)
    let best = trip("Best evidence", fare: 5_000)
    let records = [income, loss, best]
    let lossReply = TaxCoach.respond(to: "Which jobs lose money?", records: records,
      goals: goals, from: day, through: day)
    XCTAssertTrue(lossReply.message.text.contains("Loss evidence"))
    XCTAssertEqual(lossReply.message.recordIds, [loss.id])
    for prompt in ["Which jobs make the most money?", "Which job pays the best?"] {
      let answer = TaxCoach.respond(to: prompt, records: records, goals: goals, from: day, through: day)
      XCTAssertTrue(answer.message.text.contains("Best individual recorded trips"))
      XCTAssertEqual(answer.message.recordIds?.first, best.id)
      XCTAssertFalse(answer.message.recordIds?.contains(income.id) == true)
    }
  }

  func testUnsureWorkStatusRemainsAnUnfinishedIntakeMilestone() {
    for status in ["unsure", " Unsure ", "unknown", "not sure"] {
      let reply = TaxCoach.respond(to: "tax checklist", records: [], goals: goals, from: day, through: day,
        intake: .init(taxYear: 2026, jurisdiction: "US / New York", businessType: status))
      XCTAssertEqual(reply.milestones.first(where: { $0.id == "work-status" })?.status, "todo")
    }
  }

  func testPayoutIncomeIsNeverAddedToTripFaresAndExpenseSharesAreRespected() {
    let ride = trip("Included in payout", fare: 2_000, fee: 200)
    let payout = DriverRecord(payload: .income(Income(date: day, platform: "Uber",
      description: "Platform payout", amountCents: 3_000)))
    let expense = DriverRecord(payload: .expense(Expense(date: day, merchant: "Shop",
      category: .supplies, amountCents: 200, classification: .business,
      businessPurpose: "Recorded work", businessUsePercent: 50)))
    let reply = TaxCoach.respond(to: "Revenue and costs", records: [ride, payout, expense],
      goals: goals, from: day, through: day)
    XCTAssertEqual(reply.analysis.recordedIncomeCents, 3_000)
    XCTAssertEqual(reply.analysis.tripFareCents, 2_000)
    XCTAssertEqual(reply.analysis.recordedBusinessExpenseCents, 100)
    XCTAssertEqual(reply.analysis.recordedOperatingBalanceCents, 2_900)
    XCTAssertEqual(reply.analysis.knownEstimatedRideNetCents, 1_300)
    XCTAssertTrue(reply.message.text.contains("not added to saved income"))
    XCTAssertTrue(reply.message.text.contains("$29.00"))
  }

  func testGroupsKeepUnknownEconomicsIncompleteAndUseRecordedStartHour() {
    let good = trip("Known", fare: 2_000, platform: "Uber", area: "Queens", hour: 9)
    let missing = trip("Missing fee", fare: 5_000, fee: nil, platform: "Lyft", area: "Manhattan", hour: 17)
    let analysis = TaxCoach.analyze(records: [missing, good], goals: goals, from: day, through: day)
    XCTAssertEqual(analysis.platforms.first?.label, "Uber")
    XCTAssertEqual(analysis.platforms.first?.estimatedNetCents, 1_400)
    XCTAssertNil(analysis.platforms.first(where: { $0.label == "Lyft" })?.estimatedNetCents)
    XCTAssertEqual(Set(analysis.areas.map(\.label)), ["Queens", "Manhattan"])
    XCTAssertEqual(Set(analysis.startHours.map(\.label)), ["09:00", "17:00"])
    let answer = TaxCoach.respond(to: "Which platform is best?", records: [missing, good],
      goals: goals, from: day, through: day)
    XCTAssertTrue(answer.message.text.contains("Lyft: 1 trips, 0 fully priced"))
    XCTAssertTrue(answer.message.text.contains("incomplete"))
  }

  func testExplicitDateScopeTombstonesAndDuplicateRevisionsAreHonored() {
    var current = trip("Current", fare: 2_000)
    var older = current; older.revision = 0
    current.revision = 2
    var deleted = trip("Deleted", fare: 99_999); deleted.deleted = true
    let prior = trip("Previous month", fare: 99_999, date: "2026-10-31")
    let future = trip("Later", fare: 99_999, date: "2026-11-06")
    let analysis = TaxCoach.analyze(records: [current, prior, older, deleted, future],
      goals: goals, from: day, through: day)
    XCTAssertEqual(analysis.recordCount, 1)
    XCTAssertEqual(analysis.rides.map(\.id), [current.id])
    XCTAssertEqual(analysis.records.first?.revision, 2)
    let invalid = TaxCoach.respond(to: "best jobs", records: [current], goals: goals,
      from: "2026-11-31", through: "2026-11-01")
    XCTAssertFalse(invalid.analysis.scopeIsValid)
    XCTAssertTrue(invalid.analysis.rides.isEmpty)
    XCTAssertTrue(invalid.milestones.isEmpty)
    XCTAssertTrue(invalid.message.text.contains("No records were analyzed"))
  }

  func testTaxPreparationUsesSourcesAndNeverInfersFilingOrDeductionApproval() {
    let meal = DriverRecord(payload: .expense(Expense(date: day, merchant: "Cafe", category: .meals,
      amountCents: 1_500, classification: .business)))
    let reply = TaxCoach.respond(to: "What tax documents am I missing? Can I deduct meals?",
      records: [meal], goals: goals, from: day, through: day)
    XCTAssertEqual(reply.message.sources?.count, 5)
    XCTAssertTrue(reply.message.sources?.allSatisfy { $0.url.hasPrefix("https://www.irs.gov/") } == true)
    XCTAssertTrue(reply.message.text.contains("confirm the tax year"))
    XCTAssertTrue(reply.message.text.contains("participants or travel context"))
    XCTAssertTrue(reply.message.text.contains("has not submitted a return or payment"))
    XCTAssertEqual(reply.milestones.first(where: { $0.id == "expense-evidence" })?.recordIds, [meal.id])
    XCTAssertEqual(reply.milestones.first(where: { $0.id == "tax-year" })?.status, "todo")
    XCTAssertEqual(reply.milestones.first(where: { $0.id == "return-review" })?.status, "todo")
    let intake = CoachIntake(taxYear: 2025, jurisdiction: "US / New York", businessType: "Independent contractor")
    let prepared = TaxCoach.respond(to: "tax prep", records: [], goals: goals, from: day, through: day, intake: intake)
    XCTAssertEqual(prepared.milestones.first(where: { $0.id == "tax-year" })?.status, "done")
    XCTAssertTrue(prepared.message.text.contains("tax year 2025"))
    XCTAssertTrue(prepared.message.text.contains("2026-11-05 through 2026-11-05"))
    XCTAssertEqual(prepared.milestones.first(where: { $0.id == "return-review" })?.status, "todo")
  }

  func testGoalsAndWaitingUseObservedTripTimeWithoutInventingSavingsOrIdleHours() {
    let ride = trip("Known job", fare: 2_000, fee: 200)
    let goal = TaxCoach.respond(to: "Goal progress and savings", records: [ride], goals: goals, from: day, through: day)
    XCTAssertTrue(goal.message.text.contains("$13.00 recorded estimated trip net"))
    XCTAssertTrue(goal.message.text.contains("$50.00 target"))
    XCTAssertTrue(goal.message.text.contains("full shift and idle hours are not known"))
    XCTAssertTrue(goal.message.text.contains("cannot infer money saved or taxes paid"))
    let waiting = TaxCoach.respond(to: "How much idle and waiting time?", records: [ride], goals: goals, from: day, through: day)
    XCTAssertTrue(waiting.message.text.contains("30.0 recorded minutes"))
    XCTAssertTrue(waiting.message.text.contains("cannot determine total shift hours"))
  }

  func testEveryContributingJobNeedsDurationBeforeAnHourlyGroupOrGoalRate() {
    let normal = trip("Recorded duration", fare: 2_000)
    for seconds: TimeInterval in [0, 30] {
      let short = trip("Duration needs review", fare: 1_000, duration: seconds)
      let analysis = TaxCoach.analyze(records: [normal, short], goals: goals, from: day, through: day)
      XCTAssertEqual(analysis.platforms.first?.pricedJobCount, 2)
      XCTAssertFalse(analysis.platforms.first?.hasCompleteDurations ?? true)
      XCTAssertNil(analysis.platforms.first?.hourlyCents)
      XCTAssertNil(analysis.areas.first?.hourlyCents)
      XCTAssertNil(analysis.startHours.first?.hourlyCents)
      let reply = TaxCoach.respond(to: "goal progress", records: [normal, short], goals: goals, from: day, through: day)
      XCTAssertTrue(reply.message.text.contains("Hourly goal comparison unavailable"))
      XCTAssertFalse(reply.message.text.contains("Recorded trip-hour rate:"))
    }
    let complete = TaxCoach.analyze(records: [normal], goals: goals, from: day, through: day)
    XCTAssertTrue(complete.platforms.first?.hasCompleteDurations == true)
    XCTAssertEqual(complete.platforms.first?.hourlyCents, 2_800)
  }

  func testGoalProgressIsUnavailableWithoutPricedJobsAndPartialWithUnreviewedJobs() {
    let unknown = trip("Missing fees", fare: 2_000, fee: nil)
    let gap = trip("GPS gap", fare: 2_000, gaps: true)
    for records in [[], [unknown], [gap]] {
      let reply = TaxCoach.respond(to: "goals", records: records, goals: goals, from: day, through: day)
      XCTAssertTrue(reply.message.text.contains("Daily goal for \(day): progress unavailable"))
      XCTAssertTrue(reply.message.text.contains("Weekly target reference: progress unavailable"))
      XCTAssertFalse(reply.message.text.contains("$0.00 recorded estimated trip net"))
    }
    let known = trip("Known economics", fare: 2_000)
    let partial = TaxCoach.respond(to: "goals", records: [known, unknown], goals: goals, from: day, through: day)
    XCTAssertTrue(partial.message.text.contains("$14.00 recorded estimated trip net is the known portion"))
    XCTAssertTrue(partial.message.text.contains("full progress and remaining earnings are unknown"))
    XCTAssertFalse(partial.message.text.contains("Daily goal for \(day): $14.00 recorded estimated trip net toward"))
    var unfinished = known
    if case .trip(var value) = unfinished.payload { value.endedAt = nil; unfinished.payload = .trip(value) }
    unfinished.id = UUID()
    let withUnfinished = TaxCoach.respond(to: "goals", records: [known, unfinished], goals: goals, from: day, through: day)
    XCTAssertTrue(withUnfinished.message.text.contains("is the known portion"))
  }

  func testCoachStateAndOutboxPreserveWireIDsDatesAndPreferenceSnapshot() throws {
    let timestamp = Date(timeIntervalSince1970: 1_793_700_000)
    let message = CoachMessage(role: "user", text: "Review my jobs", createdAt: timestamp)
    let preference = CoachPreferences(goals: goals)
    let state = CoachState(messages: [message], preferences: preference,
      intake: .init(taxYear: 2026), engine: .init())
    XCTAssertEqual(try WireJSON.decoder().decode(CoachState.self, from: WireJSON.encoder().encode(state)), state)
    XCTAssertFalse(state.engine.peelAvailable)
    XCTAssertFalse(state.engine.llmAvailable)
    let pending = CoachPendingMessage(id: message.id, text: message.text, from: day, through: day,
      preferences: preference, localReplyId: UUID())
    let data = try WireJSON.encoder().encode(pending)
    XCTAssertEqual(try WireJSON.decoder().decode(CoachPendingMessage.self, from: data), pending)
    XCTAssertEqual(pending.preferences.goals, goals)
    XCTAssertEqual(pending.id, message.id)
  }

  func testOtherCurrencyIsFlaggedAndNeverSilentlyConvertedOrMixed() {
    var income = Income(date: day, platform: "Other", description: "Foreign currency", amountCents: 1_000)
    income.currency = "EUR"
    let reply = TaxCoach.respond(to: "income", records: [DriverRecord(payload: .income(income))],
      goals: goals, from: day, through: day)
    XCTAssertEqual(reply.analysis.recordedIncomeCents, 0)
    XCTAssertEqual(reply.analysis.unsupportedCurrencyCount, 1)
    XCTAssertTrue(reply.message.text.contains("excluded from USD totals"))
  }
}
