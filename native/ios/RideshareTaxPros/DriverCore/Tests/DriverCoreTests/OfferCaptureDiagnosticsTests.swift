import Foundation
import XCTest
@testable import DriverCore

final class OfferCaptureDiagnosticsTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)
  private let profile = GigProfitProfile(vehicleCostCentsPerMile: 50, minimumNetHourlyCents: 2000)
  private func capture(_ platform: GigPlatform) throws -> UniversalGigOffer {
    try OfferNormalizer.normalize("""
      \(platform.rawValue)
      Payout: $30.00
      Guaranteed pay: $30.00
      Pickup distance: 2 miles
      Delivery distance: 8 miles
      Reposition distance: 0 miles
      Total working time: 30 minutes
      Additional costs: $2.00
      Tips included
      """, platform: platform, source: .screenShare, now: now)
  }
  func testEachPlatformHasIndependentCaptureAndMissingRouteEvidence() throws {
    for platform in GigPlatform.allCases {
      let offer = try capture(platform)
      for inspected in GigPlatform.allCases {
        let report = OfferCaptureDiagnostics.evaluate(platform: inspected, captures: [offer], journalOffers: [], profile: profile, now: now)
        XCTAssertEqual(report.connection, .unavailable)
        XCTAssertEqual(report.capturedOfferCount, inspected == platform ? 1 : 0)
        XCTAssertEqual(report.latestCapture?.payoutCents, inspected == platform ? 3000 : nil)
        XCTAssertFalse(report.sufficientForRecommendation)
        if inspected == platform {
          XCTAssertNotNil(report.financial?.availableCash)
          XCTAssertTrue(report.blockers.contains { $0.contains("full route") })
          XCTAssertTrue(report.blockers.contains { $0.contains("not been reviewed") })
        }
      }
    }
  }
  func testSamplesManualEntriesAndFutureObservationsNeverEstablishCapture() throws {
    var manual = try capture(.doorDash); manual.source = .manual
    var simulated = manual; simulated.source = .simulation
    var future = try capture(.doorDash); future.lastObservedAt = now.addingTimeInterval(1)
    let report = OfferCaptureDiagnostics.evaluate(platform: .doorDash, captures: [manual, simulated, future],
      journalOffers: [manual], profile: profile, now: now)
    XCTAssertNil(report.latestCapture); XCTAssertEqual(report.capturedOfferCount, 0)
    XCTAssertFalse(report.sufficientForRecommendation)
  }
  func testMissingFieldsRemainUnknownAndPreventFinancialAdvice() throws {
    let partial = try OfferNormalizer.normalize("Instacart\nPayout: $12.50", platform: .instacart, source: .screenShare, now: now)
    let report = OfferCaptureDiagnostics.evaluate(platform: .instacart, captures: [partial], journalOffers: [], profile: profile, now: now)
    XCTAssertEqual(report.latestCapture?.payoutCents, 1250)
    XCTAssertNil(report.latestCapture?.pickupLocation); XCTAssertNil(report.latestCapture?.estimatedMinutes)
    XCTAssertNil(report.financial?.availableCash); XCTAssertFalse(report.sufficientForRecommendation)
  }
  func testFreshReviewedRouteProducesAdviceAndChangedInputsInvalidateIt() throws {
    let sample = try GigSampleShift.make(relativeTo: now)
    var offer = sample.recommendations[0].offer
    offer.source = .sharedScreenshot; offer.availabilityStatus = .observed; offer.driverConfirmedFields = true
    var plan = try XCTUnwrap(sample.routes[offer.id])
    plan.direct.source = .driverEstimate; plan.toPickup.source = .driverEstimate
    plan.delivery.source = .driverEstimate; plan.onward.source = .driverEstimate
    let evidence = GigOfferRouteEvidence(sourceOffer: offer, routedOffer: offer,
      profile: sample.profile, preferences: sample.preferences, plan: plan)
    func inspect(_ current: UniversalGigOffer, cost: GigProfitProfile? = nil, at: Date? = nil) -> GigCaptureDiagnosticReport {
      OfferCaptureDiagnostics.evaluate(platform: offer.platform, captures: [offer], journalOffers: [current],
        profile: cost ?? sample.profile, routeEvidence: [offer.id: evidence], now: at ?? sample.now)
    }
    let ready = inspect(offer)
    XCTAssertTrue(ready.sufficientForRecommendation, ready.blockers.joined(separator: "; "))
    XCTAssertEqual(ready.recommendation?.kind, .recommended)
    var changed = offer; changed.additionalCostsCents = 1000
    XCTAssertFalse(inspect(changed).sufficientForRecommendation)
    var cost = sample.profile; cost.vehicleCostCentsPerMile = 100
    XCTAssertFalse(inspect(offer, cost: cost).sufficientForRecommendation)
    XCTAssertFalse(inspect(offer, at: sample.now.addingTimeInterval(61)).sufficientForRecommendation)
  }
  func testMergedCaptureIDsSurviveReviewAndJournalReload() throws {
    let first = try capture(.spark)
    var repeated = first; repeated.offerId = UUID(); repeated.lastObservedAt = now.addingTimeInterval(1)
    var service = OfferIngestionService()
    try service.ingest(first, now: now)
    try service.ingest(repeated, now: repeated.lastObservedAt)
    XCTAssertEqual(service.offers.count, 1)
    var journal = Journal(); journal.gigOffers = service.offers
    journal.gigOffers?[0].additionalCostsCents = 123
    let reloaded = try WireJSON.decoder().decode(Journal.self, from: WireJSON.encoder().encode(journal))
    XCTAssertEqual(reloaded.gigOffers?.offer(capturedAs: repeated.id)?.id, first.id)
    let report = OfferCaptureDiagnostics.evaluate(platform: .spark, captures: [repeated], journalOffers: reloaded.gigOffers ?? [],
      profile: profile, now: repeated.lastObservedAt)
    XCTAssertEqual(report.latestCapture?.additionalCostsCents, 200, "Extracted values must retain their capture provenance")
    XCTAssertEqual(report.reviewedOffer?.additionalCostsCents, 123)
  }
}
