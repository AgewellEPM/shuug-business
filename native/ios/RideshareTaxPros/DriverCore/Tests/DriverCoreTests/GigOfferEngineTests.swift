import Foundation
import XCTest
@testable import DriverCore

final class GigOfferEngineTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)
  private let profile = GigProfitProfile(vehicleCostCentsPerMile: 50, minimumNetHourlyCents: 2000, taxReserveBasisPoints: 1500)
  private func offer() throws -> UniversalGigOffer {
    try OfferNormalizer.normalize("""
      Offer payout: $30.00
      Guaranteed payout: $30.00
      Currency: USD
      Pickup: Cafe
      Dropoff: 10 Example Road
      Pickup distance: 2 miles
      Delivery distance: 8 miles
      Reposition distance: 0 miles
      Travel time: 25 minutes
      Pickup wait: 5 minutes
      Additional costs: $2.00
      Tips included
      Expires in: 50 seconds
      """, platform: .doorDash, source: .sharedText, now: now)
  }
  func testNormalizationPreservesActualFieldsWithoutInventingAvailability() throws {
    let value = try offer()
    XCTAssertEqual(value.payoutCents, 3000); XCTAssertEqual(value.guaranteedPayoutCents, 3000)
    XCTAssertEqual(value.pickupMiles, 2); XCTAssertEqual(value.deliveryMiles, 8); XCTAssertEqual(value.waitMinutes, 5)
    XCTAssertEqual(value.additionalCostsCents, 200); XCTAssertEqual(value.source, .sharedText)
    XCTAssertNil(value.confirmedTipCents); XCTAssertNil(value.unconfirmedTipCents)
    XCTAssertEqual(value.availabilityStatus, .observed); XCTAssertEqual(value.providerCapabilities, .unavailable)
    XCTAssertTrue(value.missingFields.isEmpty)
    var wrong = value; wrong.currency = "CAD"
    XCTAssertEqual(OfferProfitabilityEngine.assess(wrong, profile: profile).issues, [.unsupportedCurrency])
  }
  func testMalformedAndConflictingOCRMoneyIsNeverTruncatedOrResolvedByGuessing() throws {
    for amount in ["$19.OO", "$19.999", "$5,000", "$19.50/hr", "$-5.00"] {
      let value = try OfferNormalizer.normalize("Offer payout: \(amount)\nPickup distance: 2 miles", platform: .uber, source: .sharedScreenshot, now: now)
      XCTAssertNil(value.payoutCents, amount)
      XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile).outcome, .insufficientInformation)
    }
    let ambiguous = try OfferNormalizer.normalize("Payout: $19.50\nPayout: $29.50\nPickup distance: 2 miles", platform: .uber, source: .sharedScreenshot, now: now)
    XCTAssertNil(ambiguous.payoutCents)
    let guarantee = try OfferNormalizer.normalize("Payout: $30.00\nGuaranteed payout: $20.00", platform: .uber, source: .sharedText, now: now)
    XCTAssertEqual(guarantee.payoutCents, 3000); XCTAssertEqual(guarantee.guaranteedPayoutCents, 2000)
    XCTAssertThrowsError(try OfferNormalizer.normalize("Uber\nPayout: $20.00", platform: .doorDash, source: .screenShare, now: now))
    let currency = try OfferNormalizer.normalize("Payout: $20.00\nCurrency: CAD\nCurrency: USD", platform: .uber, source: .sharedText, now: now)
    XCTAssertNil(currency.currency)
  }
  func testIntegerMoneyReserveAndAllWorkingTimeAvoidDoubleCounting() throws {
    var value = try offer()
    let expected = OfferProfitabilityEngine.assess(value, profile: profile)
    XCTAssertEqual(expected.vehicleCost, GigMoneyRange(500, 500))
    XCTAssertEqual(expected.profitBeforeReserve, GigMoneyRange(2300, 2300))
    XCTAssertEqual(expected.reserve, GigMoneyRange(345, 345))
    XCTAssertEqual(expected.availableCash, GigMoneyRange(1955, 1955))
    XCTAssertEqual(expected.effectiveHourly, GigMoneyRange(3910, 3910))
    XCTAssertEqual(expected.outcome, .positiveMeetsTarget)
    value.uncertainty.workingMinutes = GigNumericBounds(30, 30)
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile), expected)
    value.uncertainty.workingMinutes = nil; value.durationCoverage = .allWorkingTime; value.estimatedMinutes = 30
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile), expected)
  }
  func testUncertainPayMileageAndTimeUseConservativeBounds() throws {
    var value = try offer()
    value.uncertainty.totalMiles = GigNumericBounds(10, 12)
    value.uncertainty.workingMinutes = GigNumericBounds(30, 45)
    let measured = OfferProfitabilityEngine.assess(value, profile: profile)
    XCTAssertEqual(measured.availableCash, GigMoneyRange(1870, 1955))
    XCTAssertEqual(measured.effectiveHourly, GigMoneyRange(2493, 3910))
    XCTAssertEqual(measured.outcome, .positiveMeetsTarget)
    value.guaranteedPayoutCents = 2000; value.unconfirmedTipCents = 1000
    let uncertain = OfferProfitabilityEngine.assess(value, profile: profile)
    XCTAssertEqual(uncertain.availableCash, GigMoneyRange(1020, 1955))
    XCTAssertEqual(uncertain.effectiveHourly, GigMoneyRange(1360, 3910))
    XCTAssertEqual(uncertain.outcome, .insufficientInformation)
    value.guaranteedPayoutCents = nil; value.unconfirmedTipCents = nil; value.tipTreatment = .unknown
    XCTAssertTrue(OfferProfitabilityEngine.assess(value, profile: profile).issues.contains(.unknownPayGuarantee))
  }
  func testMissingInvalidAndLosingInputsStayDistinct() throws {
    var value = try offer()
    value.waitMinutes = nil
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile).issues, [.missingWait])
    value = try offer(); value.additionalCostsCents = nil
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile).issues, [.missingAdditionalCosts])
    value = try offer(); value.uncertainty.totalMiles = GigNumericBounds(12, 10)
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile).issues, [.missingMiles])
    value = try offer(); value.uncertainty.workingMinutes = GigNumericBounds(1e-300, 30)
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile).issues, [.missingWorkingTime])
    value = try offer(); value.payoutCents = 600; value.guaranteedPayoutCents = 600
    let loss = OfferProfitabilityEngine.assess(value, profile: profile)
    XCTAssertEqual(loss.outcome, .estimatedLoss); XCTAssertEqual(loss.availableCash, GigMoneyRange(-100, -100))
    XCTAssertEqual(loss.reserve, GigMoneyRange(0, 0))
    value.payoutCents = 1500; value.guaranteedPayoutCents = 1500
    XCTAssertEqual(OfferProfitabilityEngine.assess(value, profile: profile).outcome, .positiveBelowTarget)
  }
  func testDeduplicationDoesNotExtendExpirationAndLogsExcludeLocations() throws {
    let original = try offer()
    var service = OfferIngestionService()
    let id = try service.ingest(original, now: now)
    var repeated = original; repeated.offerId = UUID(); repeated.lastObservedAt = now.addingTimeInterval(20)
    repeated.expiresAt = now.addingTimeInterval(70)
    XCTAssertEqual(try service.ingest(repeated, now: repeated.lastObservedAt), id)
    XCTAssertEqual(service.offers.count, 1); XCTAssertEqual(service.offers[0].expiresAt, now.addingTimeInterval(50))
    service.expire(now: now.addingTimeInterval(51))
    XCTAssertEqual(service.offers[0].availabilityStatus, .expired)
    let log = String(decoding: try WireJSON.encoder().encode(service.logs), as: UTF8.self)
    XCTAssertFalse(log.contains("Example Road")); XCTAssertFalse(log.contains("Cafe"))
    var noExpiration = original; noExpiration.expiresAt = nil
    var other = OfferIngestionService(offers: [noExpiration]); other.expire(now: now.addingTimeInterval(61))
    XCTAssertEqual(other.offers[0].availabilityStatus, .stale)
    XCTAssertFalse(original.validForComparison(now: now, observationLifetime: -1))
  }
  func testRapidProviderUpdatesReplaceTermsAndWithdrawalRemainsTerminal() throws {
    var original = try offer(); original.source = .authorizedAPI; original.providerOfferId = "provider-123"
    original.providerCapabilities = GigProviderCapabilities(readOffers: true, readDestinations: true, readStatus: true)
    original.availabilityStatus = .providerVerified; original.driverConfirmedFields = true
    var service = OfferIngestionService(); try service.ingest(original, now: now)
    var newer = original; newer.payoutCents = 2000; newer.guaranteedPayoutCents = 2000; newer.lastObservedAt = now.addingTimeInterval(1)
    XCTAssertEqual(try service.ingest(newer, now: newer.lastObservedAt), original.id)
    XCTAssertEqual(service.offers[0].payoutCents, 2000); XCTAssertFalse(service.offers[0].driverConfirmedFields)
    newer.lastObservedAt = now.addingTimeInterval(2); newer.availabilityStatus = .withdrawn
    try service.ingest(newer, now: newer.lastObservedAt)
    newer.lastObservedAt = now.addingTimeInterval(3); newer.availabilityStatus = .providerVerified
    try service.ingest(newer, now: newer.lastObservedAt)
    XCTAssertEqual(service.offers[0].availabilityStatus, .withdrawn)
    var screenshot = original; screenshot.source = .sharedScreenshot
    var untrusted = OfferIngestionService(); try untrusted.ingest(screenshot, now: now)
    XCTAssertEqual(untrusted.offers[0].providerCapabilities, .unavailable)
    XCTAssertEqual(untrusted.offers[0].availabilityStatus, .observed)
  }
  func testSampleOffersNormalizeRankAndRejectDeadlineAndLoss() throws {
    let sample = try GigSampleShift.make(relativeTo: now), rows = sample.recommendations
    XCTAssertEqual(sample.offers.count, 5); XCTAssertEqual(Set(sample.offers.map(\.platform)).count, 4)
    XCTAssertEqual(Array(rows.prefix(2)).map(\.offer.platform), [.uber, .doorDash])
    XCTAssertEqual(Array(rows.prefix(2)).map(\.kind), [.recommended, .recommended])
    XCTAssertEqual(rows.first(where: { $0.offer.platform == .spark })?.destination.outcome, .hardDeadlineConflict)
    XCTAssertEqual(rows.first(where: { $0.offer.platform == .spark })?.kind, .skip)
    XCTAssertEqual(rows.first(where: { $0.offer.platform == .instacart })?.financial.outcome, .estimatedLoss)
    XCTAssertEqual(rows.first(where: { $0.offer.platform == .instacart })?.kind, .skip)
    XCTAssertEqual(rows.filter { $0.kind == .needsReview }.count, 1)
    XCTAssertTrue(sample.offers.allSatisfy { $0.source == .simulation && $0.availabilityStatus == .simulated && $0.providerCapabilities == .unavailable })
    XCTAssertEqual(rows.first?.financial.profitBeforeReserve, GigMoneyRange(2350, 2350))
    XCTAssertEqual(rows.first?.destination.incrementalAvailableCash, GigMoneyRange(2592, 2592))
  }
  func testHardDeadlineAndUnknownDestinationCannotBeOverridden() throws {
    let sample = try GigSampleShift.make(relativeTo: now), value = sample.offers[1]
    var prefs = sample.preferences; prefs.arrivalDeadline = sample.now.addingTimeInterval(45 * 60); prefs.riskTolerance = .balanced
    let tooLate = DestinationOptimizer.evaluate(value, plan: sample.routes[value.id], preferences: prefs, profile: sample.profile, now: sample.now)
    XCTAssertEqual(tooLate.outcome, .hardDeadlineConflict)
    prefs = sample.preferences; prefs.destination = GigOfferLocation(label: "Home")
    XCTAssertEqual(DestinationOptimizer.evaluate(value, plan: sample.routes[value.id], preferences: prefs, profile: sample.profile, now: sample.now).outcome, .insufficientInformation)
    prefs = sample.preferences; prefs.maximumAdditionalMinutes = 5
    XCTAssertEqual(DestinationOptimizer.evaluate(value, plan: sample.routes[value.id], preferences: prefs, profile: sample.profile, now: sample.now).outcome, .excessiveTravel)
  }
  func testFullWorkingTimeUsesKnownWaitWithoutDoubleCounting() throws {
    let sample = try GigSampleShift.make(relativeTo: now)
    var value = sample.offers[1]
    value.durationCoverage = .allWorkingTime; value.estimatedMinutes = 34
    var result = DestinationOptimizer.evaluate(value, plan: sample.routes[value.id], preferences: sample.preferences, profile: sample.profile, now: sample.now)
    XCTAssertEqual(result.routeProfit?.workingMinutes, GigNumericBounds(34, 34))
    value.estimatedMinutes = nil; value.uncertainty.workingMinutes = GigNumericBounds(34, 40)
    result = DestinationOptimizer.evaluate(value, plan: sample.routes[value.id], preferences: sample.preferences, profile: sample.profile, now: sample.now)
    XCTAssertEqual(result.routeProfit?.workingMinutes, GigNumericBounds(34, 40))
  }
  func testAcceptedWorkPickupWindowsAndExpiredObservationsBlockAdvice() throws {
    let sample = try GigSampleShift.make(relativeTo: now)
    var value = sample.offers[1]
    let work = GigConfirmedWork(offerId: UUID(), platform: .lyft, startsAt: sample.now, expectedEnd: sample.now.addingTimeInterval(600), verification: "Driver confirmed")
    let blocked = DispatchPlanner.rank([value], profile: sample.profile, preferences: sample.preferences, routes: sample.routes, commitments: [work], now: sample.now)
    XCTAssertEqual(blocked.first?.kind, .skip); XCTAssertTrue(blocked.first?.reasons.first?.contains("Conflicts") == true)
    value.pickupWindow = GigOfferTimeWindow(startsAt: sample.now, endsAt: sample.now.addingTimeInterval(60))
    XCTAssertEqual(DispatchPlanner.rank([value], profile: sample.profile, preferences: sample.preferences, routes: sample.routes, now: sample.now).first?.kind, .skip)
    value.pickupWindow = nil; value.expiresAt = sample.now
    XCTAssertEqual(DispatchPlanner.rank([value], profile: sample.profile, preferences: sample.preferences, routes: sample.routes, now: sample.now).first?.kind, .skip)
    let same = GigConfirmedWork(offerId: sample.offers[1].id, platform: .uber, startsAt: sample.now, expectedEnd: nil, verification: "Driver confirmed")
    XCTAssertEqual(DispatchPlanner.rank([sample.offers[1]], profile: sample.profile, preferences: sample.preferences, routes: sample.routes, commitments: [same], now: sample.now).first?.kind, .skip)
  }
  func testDispatchUnavailableAndExplicitOptInRequired() async throws {
    let sample = try GigSampleShift.make(relativeTo: now), value = sample.offers[1]
    for enabled in [false, true] {
      do {
        _ = try await DriverDecisionService.authorizedAcceptance(offer: value, profile: sample.profile, preferences: sample.preferences,
          route: try XCTUnwrap(sample.routes[value.id]), commitments: [], adapter: UnavailableGigPlatformAdapter(platform: .uber),
          driverOptedIn: enabled, emergencyDisabled: false, now: sample.now)
        XCTFail("Unavailable provider must never accept")
      } catch let error as GigDispatchError {
        switch (enabled, error) { case (false, .optInRequired), (true, .acceptanceUnavailable): break; default: XCTFail("Unexpected gate: \(error)") }
      }
    }
    let once = DriverDecisionService.record(.consider, offer: value, existing: [], now: sample.now)
    XCTAssertEqual(DriverDecisionService.record(.consider, offer: value, existing: once, now: sample.now).count, 1)
  }
}
