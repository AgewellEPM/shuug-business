import Foundation
import XCTest
@testable import DriverCore

final class OfferReadingTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)
  func testOfferReadsLabeledTotalAndRequiresKnownFeesWaitAndVehicleCost() throws {
    let offer = try XCTUnwrap(OfferTextReader.read("DoorDash\nOffer payout $19.50\nPickup 2 mi\nDelivery 4 mi\nTotal time 30 min\nAccept", platform: .doorDash, source: .screenShare, now: now))
    XCTAssertEqual(offer.payoutCents, 1950); XCTAssertEqual(offer.displayedMiles, 6)
    XCTAssertEqual(offer.displayedMinutes, 30)
    var session = OfferReaderSession(scope: "guest", platform: .doorDash, feesCents: nil, waitMinutes: nil,
      goals: DriverGoals(targetHourlyCents: 2000, vehicleCostCentsPerMile: 50), now: now)
    XCTAssertNil(offer.estimate(session: session, now: now))
    session.feesCents = 0; session.waitMinutes = 5
    XCTAssertEqual(offer.estimate(session: session, now: now)?.netCents, 1650)
    XCTAssertNotNil(offer.confirmedComparison(session: session, now: now))
    XCTAssertNil(offer.confirmedComparison(session: session, now: now.addingTimeInterval(61)))
    XCTAssertNil(offer.estimate(session: session, now: now.addingTimeInterval(4 * 3600 + 1)))
  }
  func testAmbiguousMoneyAndDistancesNeverBecomeConfidentProfit() throws {
    XCTAssertNil(OfferTextReader.read("Accept\n$20.00\n$5.00\n2 mi\n8 mi\n10 min\n30 min", platform: .uber, source: .sharedScreenshot, now: now))
  }
  func testUnrelatedScreensAreDiscardedAndLabeledPayoutWinsOverOtherAmounts() throws {
    XCTAssertNil(OfferTextReader.read("Checking account $200.00 · 30 min ago", platform: .spark, source: .screenShare))
    let offer = try XCTUnwrap(OfferTextReader.read("New offer\nPayout: $12.50\nBonus $2.00\nTotal distance 5 mi\nEstimated time 20 min", platform: .spark, source: .notification))
    XCTAssertEqual(offer.payoutCents, 1250); XCTAssertEqual(offer.displayedMiles, 5)
  }
}
