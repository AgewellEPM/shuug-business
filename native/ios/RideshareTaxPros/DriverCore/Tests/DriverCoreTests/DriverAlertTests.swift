import Foundation
import XCTest
@testable import DriverCore

final class DriverAlertTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)

  func testStartAndEndRemainIdempotentAfterAProcessReload() throws {
    var journal = Journal()
    let start = journal.prepareDriverAlert(kind: .startTrip, scope: "guest", now: now)
    XCTAssertEqual(journal.prepareDriverAlert(kind: .startTrip, scope: "guest", now: now).id, start.id)
    let result = try journal.applyDriverAlert(start.id, action: .startTrip, scope: "guest", now: now)
    guard case .started(let first) = result else { return XCTFail("No trip was started") }
    journal = try WireJSON.decoder().decode(Journal.self, from: WireJSON.encoder().encode(journal))
    XCTAssertEqual(try journal.applyDriverAlert(start.id, action: .startTrip, scope: "guest", now: now), .alreadyHandled)
    XCTAssertEqual(journal.entries.count, 1)
    let end = journal.prepareDriverAlert(kind: .endTrip, scope: "guest", tripId: first, now: now)
    XCTAssertEqual(try journal.applyDriverAlert(end.id, action: .endTrip, scope: "guest", now: now.addingTimeInterval(60)), .ended(first))
    let second = try XCTUnwrap(journal.beginTrip(classification: .business, purpose: "Later drive", now: now.addingTimeInterval(70)))
    XCTAssertEqual(try journal.applyDriverAlert(end.id, action: .endTrip, scope: "guest", now: now.addingTimeInterval(80)), .alreadyHandled)
    XCTAssertEqual(journal.activeTripId, second)
  }

  func testExpiredWrongAccountAndSupersededEndCannotChangeTheCurrentDrive() throws {
    var journal = Journal()
    let start = journal.prepareDriverAlert(kind: .startTrip, scope: "guest", now: now)
    XCTAssertThrowsError(try journal.applyDriverAlert(start.id, action: .startTrip, scope: "account", now: now))
    XCTAssertThrowsError(try journal.applyDriverAlert(start.id, action: .startTrip, scope: "guest", now: now.addingTimeInterval(301)))
    XCTAssertNil(journal.activeTripId)
    let first = try XCTUnwrap(journal.beginTrip(classification: .business, purpose: "First", now: now))
    let end = journal.prepareDriverAlert(kind: .endTrip, scope: "guest", tripId: first, now: now)
    journal.finishTrip(now: now.addingTimeInterval(10))
    let current = journal.beginTrip(classification: .personal, purpose: "Current", now: now.addingTimeInterval(20))
    XCTAssertThrowsError(try journal.applyDriverAlert(end.id, action: .endTrip, scope: "guest", now: now.addingTimeInterval(30)))
    XCTAssertEqual(journal.activeTripId, current)
  }

  func testExpenseReplyPreservesCentsAndRejectsDuplicatesAndBadInput() throws {
    var journal = Journal()
    let prompt = ExpensePrompt(placeId: "fixture", merchant: "Fixture Fuel", address: "Fixture address", category: .fuel, detectedAt: now)
    journal.placePrompts = [prompt]
    let alert = journal.prepareDriverAlert(kind: .expense, scope: "guest", promptId: prompt.id, now: now)
    XCTAssertThrowsError(try journal.applyDriverAlert(alert.id, action: .logExpense, scope: "guest", text: "17.355", now: now))
    XCTAssertTrue(journal.entries.isEmpty)
    guard case .expenseSaved(let id) = try journal.applyDriverAlert(alert.id, action: .logExpense, scope: "guest", text: "17.35", now: now),
      case .expense(let expense) = journal.entries.first?.record.payload else { return XCTFail("Missing expense") }
    XCTAssertEqual(journal.entries.first?.id, id)
    XCTAssertEqual(expense.amountCents, 1735); XCTAssertEqual(expense.classification, .unclassified)
    let repeated = ExpensePrompt(placeId: "fixture", merchant: "Fixture Fuel", address: "Fixture address", category: .fuel, detectedAt: now)
    journal.placePrompts?.append(repeated)
    let duplicate = journal.prepareDriverAlert(kind: .expense, scope: "guest", promptId: repeated.id, now: now)
    XCTAssertThrowsError(try journal.applyDriverAlert(duplicate.id, action: .logExpense, scope: "guest", text: "17.35", now: now))
    XCTAssertEqual(journal.entries.count, 1)
  }

  func testResumedMovementCancelsAnEndButtonAndFollowUpRepliesSaveToTheRightTrip() throws {
    var journal = Journal()
    let id = try XCTUnwrap(journal.beginTrip(classification: .unclassified, purpose: "Fixture drive", now: now))
    let cancelled = journal.prepareDriverAlert(kind: .endTrip, scope: "guest", tripId: id, now: now)
    XCTAssertEqual(journal.cancelEndTripAlerts(scope: "guest", tripId: id, now: now), [cancelled.id])
    XCTAssertEqual(try journal.applyDriverAlert(cancelled.id, action: .endTrip, scope: "guest", now: now), .alreadyHandled)
    XCTAssertEqual(journal.activeTripId, id)
    journal.finishTrip(now: now.addingTimeInterval(60))
    let classification = journal.prepareDriverAlert(kind: .classifyTrip, scope: "guest", tripId: id, now: now)
    XCTAssertEqual(try journal.applyDriverAlert(classification.id, action: .business, scope: "guest", now: now), .classified(id, .business))
    let fare = journal.prepareDriverAlert(kind: .tripFare, scope: "guest", tripId: id, now: now)
    XCTAssertThrowsError(try journal.applyDriverAlert(fare.id, action: .tripFare, scope: "guest", text: "20", now: now))
    XCTAssertEqual(try journal.applyDriverAlert(fare.id, action: .tripFare, scope: "guest", text: "fare=20.50 fees=3", now: now), .fareSaved(id))
    guard case .trip(let trip) = journal.entries.first?.record.payload else { return XCTFail("Missing trip") }
    XCTAssertEqual(trip.earningsCents, 2050); XCTAssertEqual(trip.platformFeesCents, 300)
  }
}
