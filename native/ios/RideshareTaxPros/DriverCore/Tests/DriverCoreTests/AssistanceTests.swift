import Foundation
import XCTest
@testable import DriverCore

final class AssistanceTests: XCTestCase {
  func testStatementImportPreservesCentsRefundsQuotedNamesAndStableReferences() throws {
    let raw = "Date,Description,Amount,ID\r\n2026-11-05,\"Shell, Main St\",-17.35,a\r\n2026-11-05,Refund,5.20,b\r\nwrong,Bad amount,abc,c\r\n"
    let rows = try StatementImport.csv(raw)
    let columns = StatementColumns(date: 0, merchant: 1, amount: 2, reference: 3)
    let preview = StatementImport.preview(rows: rows, columns: columns, account: "Checking 1234", fileIdentity: "file-a")
    XCTAssertEqual(preview.transactions.map(\.amountCents), [1735, -520])
    XCTAssertEqual(preview.transactions.first?.merchant, "Shell, Main St")
    XCTAssertEqual(preview.issues.count, 1)
    let again = StatementImport.preview(rows: rows, columns: columns, account: "Checking 1234", fileIdentity: "different-file")
    XCTAssertEqual(preview.transactions.map(\.id), again.transactions.map(\.id))
    XCTAssertEqual(BankInbox.merging(again.transactions, into: preview.transactions).count, 2)
    XCTAssertNil(StatementImport.signedCents("1.235"))
    XCTAssertNil(StatementImport.signedCents("12,34"))
    XCTAssertEqual(StatementImport.signedCents("($1,234.56)"), -123456)
    XCTAssertEqual(MerchantCategory.suggest("T-Mobile"), .phone)
    XCTAssertEqual(MerchantCategory.suggest("Mobil"), .fuel)
    XCTAssertThrowsError(try StatementImport.csv("Date,Name\n2026-11-05,\"unfinished"))
  }
  func testOFXAndProviderCorrectionsDoNotSilentlyOverwriteAnApprovedExpense() throws {
    let raw = "<OFX><BANKTRANLIST><CURDEF>USD<STMTTRN><DTPOSTED>20261105120000<TRNAMT>-24.50<FITID>bank-001<NAME>Lunch</STMTTRN></BANKTRANLIST></OFX>"
    let preview = try StatementImport.ofx(raw, account: "Checking 1234")
    XCTAssertEqual(preview.transactions.first?.amountCents, 2450)
    XCTAssertEqual(preview.transactions.first?.date, "2026-11-05")
    var approved = try XCTUnwrap(preview.transactions.first)
    approved.reviewedRecordId = UUID()
    var changed = approved; changed.amountCents = 2500; changed.reviewedRecordId = nil
    let merged = BankInbox.merging([changed], into: [approved])
    XCTAssertEqual(merged.first?.reviewedRecordId, approved.reviewedRecordId)
    XCTAssertEqual(merged.first?.needsUpdateReview, true)
    XCTAssertFalse(try XCTUnwrap(merged.first).readyForReview)
    changed.pending = true
    XCTAssertFalse(changed.readyForReview)
  }
  func testMovementNeedsSustainedDrivingAndARealStopBeforePrompting() {
    let start = Date(timeIntervalSince1970: 1_800_000_000)
    var window = MovementWindow(), starts = 0, arrivals = 0, parks = 0
    for index in 0...4 {
      let date = start.addingTimeInterval(Double(index) * 15)
      let fix = LocationFix(latitude: 40 + Double(index) * 0.00135, longitude: -73.9, accuracy: 8, timestamp: date)
      let decision = window.observe(fix, speed: 10, now: date)
      starts += decision.beganDriving ? 1 : 0
      XCTAssertFalse(decision.arrivedAtStop)
    }
    for index in 0...10 {
      let date = start.addingTimeInterval(75 + Double(index) * 30)
      let fix = LocationFix(latitude: 40.0054, longitude: -73.9, accuracy: 8, timestamp: date)
      let decision = window.observe(fix, speed: 0, now: date)
      arrivals += decision.arrivedAtStop ? 1 : 0; parks += decision.parkedLongEnough ? 1 : 0
      if index < 3 { XCTAssertFalse(decision.arrivedAtStop) }
    }
    XCTAssertEqual(starts, 1); XCTAssertEqual(arrivals, 1); XCTAssertEqual(parks, 1)
    let place = PlaceCandidate(id: "station", name: "Fixture Fuel", address: "Fixture City", category: .fuel, distanceMeters: 20)
    XCTAssertNotNil(PlaceReminderPolicy.choose([place], history: [], now: start))
    let recent = ExpensePrompt(placeId: "station", merchant: place.name, address: place.address, category: .fuel, detectedAt: start)
    XCTAssertNil(PlaceReminderPolicy.choose([place], history: [recent], now: start.addingTimeInterval(7200)))
  }
  func testRideProfitShowsUnknownFaresAndKeepsCashFlowSeparateFromRideEstimates() throws {
    let start = Date(timeIntervalSince1970: 1_800_000_000)
    var trip = Trip(startedAt: start, endedAt: start.addingTimeInterval(3600), distanceMeters: 16093.44, classification: .business)
    trip.earningsCents = 2000; trip.platformFeesCents = 300; trip.rideRole = .ride
    let record = DriverRecord(payload: .trip(trip)), day = record.dateLabel
    let goals = DriverGoals(targetHourlyCents: 2500, vehicleCostCentsPerMile: 50)
    let profit = try XCTUnwrap(RideProfit(record: record, goals: goals))
    XCTAssertEqual(profit.estimatedNetCents, 1200)
    XCTAssertEqual(try XCTUnwrap(profit.hourlyCents), 1200, accuracy: 0.01)
    let records = [record,
      DriverRecord(payload: .income(Income(date: day, platform: "uber", description: "Payout", amountCents: 2000))),
      DriverRecord(payload: .expense(Expense(date: day, merchant: "Fuel", category: .fuel, amountCents: 500, classification: .business)))]
    let summary = DrivingInsights(records: records, goals: goals, from: day, through: day)
    XCTAssertEqual(summary.days.first?.recordedCashFlowCents, 1500)
    XCTAssertEqual(summary.days.first?.estimatedRideNetCents, 1200)
    trip.earningsCents = nil
    XCTAssertNil(RideProfit(record: DriverRecord(payload: .trip(trip)), goals: goals)?.estimatedNetCents)
    trip.rideRole = .reposition; trip.platformFeesCents = nil
    XCTAssertEqual(RideProfit(record: DriverRecord(payload: .trip(trip)), goals: goals)?.estimatedNetCents, -500)
    XCTAssertNil(RideProfit(record: record, goals: DriverGoals())?.estimatedNetCents)
  }
}
