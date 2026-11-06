import XCTest
@testable import DriverCore

final class ShiftMissionTests: XCTestCase {
  func testRoadComparisonIncludesBothLegsAndRequiresWaitForDeadline() {
    let now = Date(timeIntervalSince1970: 1000), deadline = now.addingTimeInterval(3600)
    let comparison = DestinationRouteComparison(directMeters: 20_000, directSeconds: 1200,
      toDropoffMeters: 8_000, toDropoffSeconds: 600, onwardMeters: 15_000, onwardSeconds: 900,
      waitSeconds: 300, deadline: deadline, now: now)!
    XCTAssertEqual(comparison.distanceChangeMeters, 5_000)
    XCTAssertEqual(comparison.extraTravelSeconds, 300)
    XCTAssertEqual(comparison.deadlineBufferSeconds, 1800)
    let missing = DestinationRouteComparison(directMeters: 20_000, directSeconds: 1200,
      toDropoffMeters: 8_000, toDropoffSeconds: 600, onwardMeters: 15_000, onwardSeconds: 900,
      waitSeconds: nil, deadline: deadline, now: now)!
    XCTAssertNil(missing.deadlineBufferSeconds)
    XCTAssertNil(DestinationRouteComparison(directMeters: .nan, directSeconds: 0,
      toDropoffMeters: 0, toDropoffSeconds: 0, onwardMeters: 0, onwardSeconds: 0,
      waitSeconds: 0, deadline: deadline, now: now))
  }
  func testOfferRequiresCostAndTimeAndReportsDeadline() {
    let now = Date(timeIntervalSince1970: 1_000)
    let missing = OfferEstimate(payoutCents: 2000, feesCents: 300, miles: 10, minutes: 20, waitMinutes: 10, homeMinutes: nil, vehicleCostCentsPerMile: nil, hourlyTargetCents: 2500, deadline: now.addingTimeInterval(3600), now: now)
    XCTAssertNil(missing)
    let value = OfferEstimate(payoutCents: 2000, feesCents: 300, miles: 10, minutes: 20, waitMinutes: 10, homeMinutes: 15, vehicleCostCentsPerMile: 50, hourlyTargetCents: 2500, deadline: now.addingTimeInterval(3600), now: now)!
    XCTAssertEqual(value.netCents, 1200); XCTAssertEqual(value.minimumCents, 2050)
    XCTAssertEqual(value.hourlyCents, 2400, accuracy: 0.001); XCTAssertFalse(value.meetsGoal)
    XCTAssertEqual(value.deadlineMinutesRemaining!, 15, accuracy: 0.001)
    let unknown = OfferEstimate(payoutCents: 2000, feesCents: 0, miles: 1, minutes: 10, waitMinutes: 0, homeMinutes: nil, vehicleCostCentsPerMile: 0, hourlyTargetCents: 1000, deadline: now, now: now)!
    XCTAssertNil(unknown.deadlineMinutesRemaining)
  }
  func testWaitAverageAndMissionJournalRoundTrip() throws {
    let rows = [PickupWait(name: " Diner ", minutes: 10), PickupWait(name: "diner", minutes: 20), PickupWait(name: "Other", minutes: 100)]
    let average = PickupWait.average("DINER", in: rows)!
    XCTAssertEqual(average.count, 2); XCTAssertEqual(average.minutes, 15, accuracy: 0.001)
    var journal = Journal(); journal.mission = ShiftMission(deadline: Date(timeIntervalSince1970: 5000), targetCents: 10000, destination: "Home"); journal.pickupWaits = rows
    let decoded = try JSONDecoder().decode(Journal.self, from: JSONEncoder().encode(journal))
    XCTAssertEqual(decoded.mission, journal.mission); XCTAssertEqual(decoded.pickupWaits, rows)
  }
  func testMissionOnlyCountsCompletedBusinessDrivesBeforeDeadline() {
    let start = Date(timeIntervalSince1970: 1000), deadline = Date(timeIntervalSince1970: 5000)
    let mission = ShiftMission(startedAt: start, deadline: deadline, targetCents: 10000, destination: "Home")
    func record(end: TimeInterval, classification: TripClassification, role: RideRole, fare: Int?) -> DriverRecord {
      var trip = Trip(startedAt: start.addingTimeInterval(20), endedAt: Date(timeIntervalSince1970: end), distanceMeters: 1609.344, classification: classification)
      trip.earningsCents = fare; trip.platformFeesCents = 0; trip.rideRole = role
      return DriverRecord(payload: .trip(trip))
    }
    let records = [record(end: 2000, classification: .business, role: .ride, fare: 1000), record(end: 3000, classification: .business, role: .reposition, fare: nil), record(end: 6000, classification: .business, role: .ride, fare: 5000), record(end: 2000, classification: .personal, role: .ride, fare: 4000)]
    let progress = mission.progress(records: records, goals: DriverGoals(vehicleCostCentsPerMile: 50), now: Date(timeIntervalSince1970: 7000))
    XCTAssertEqual(progress.netCents, 900); XCTAssertEqual(progress.unpaidMiles, 1, accuracy: 0.001); XCTAssertEqual(progress.missingCount, 0)
  }
}
