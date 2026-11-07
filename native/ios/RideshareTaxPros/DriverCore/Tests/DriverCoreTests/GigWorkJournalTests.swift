import Foundation
import XCTest
@testable import DriverCore

final class GigWorkJournalTests: XCTestCase {
  func testReportedWorkSurvivesReloadAndBlocksOffersUntilCompleted() throws {
    let sample = try GigSampleShift.make()
    var accepted = sample.offers[0]; accepted.source = .manual
    var journal = Journal(); journal.gigOffers = [accepted]
    try journal.recordGigDecision(.acceptedInProvider, offerId: accepted.id, now: sample.now)
    try journal.recordGigDecision(.acceptedInProvider, offerId: accepted.id, now: sample.now)
    XCTAssertEqual(journal.gigCommitments?.count, 1)
    XCTAssertEqual(journal.gigDecisions?.count, 1)
    XCTAssertTrue(journal.entries.isEmpty, "Reporting acceptance must not book projected earnings or a GPS trip")
    journal = try WireJSON.decoder().decode(Journal.self, from: WireJSON.encoder().encode(journal))
    let candidate = sample.offers[1]
    func ranking(_ journal: Journal) -> GigDispatchRecommendation {
      DispatchPlanner.rank([candidate], profile: sample.profile, preferences: sample.preferences,
        routes: sample.routes, commitments: journal.gigCommitments ?? [], now: sample.now)[0]
    }
    XCTAssertEqual(ranking(journal).kind, .skip)
    try journal.recordGigDecision(.started, offerId: accepted.id, now: sample.now)
    XCTAssertEqual(journal.gigCommitments?.first?.state, .inProgress)
    // An outdated prediction is not a completion signal.
    journal.gigCommitments?[0].expectedEnd = sample.now.addingTimeInterval(-10)
    XCTAssertEqual(ranking(journal).kind, .skip)
    try journal.recordGigDecision(.completed, offerId: accepted.id, now: sample.now)
    XCTAssertEqual(ranking(journal).kind, .recommended)
    XCTAssertTrue(journal.entries.isEmpty)
    XCTAssertThrowsError(try journal.recordGigDecision(.started, offerId: accepted.id, now: sample.now))
  }
  func testEvictedOfferCanStillBeCanceledWithoutInventingAnOffer() throws {
    var offer = UniversalGigOffer(platform: .doorDash, source: .manual)
    offer.availabilityStatus = .expired
    var journal = Journal(); journal.gigOffers = [offer]
    // Reporting an earlier acceptance remains possible after its offer expires.
    try journal.recordGigDecision(.acceptedInProvider, offerId: offer.id)
    journal.gigOffers = []
    try journal.recordGigDecision(.canceled, offerId: offer.id)
    XCTAssertEqual(journal.gigCommitments?.first?.state, .canceled)
    XCTAssertTrue(journal.gigOffers?.isEmpty == true)
    XCTAssertTrue(journal.entries.isEmpty)
  }
  func testSampleAndUnknownOffersCannotCreateRealCommitments() throws {
    let sample = try GigSampleShift.make()
    var journal = Journal(); journal.gigOffers = sample.offers
    XCTAssertThrowsError(try journal.recordGigDecision(.acceptedInProvider, offerId: sample.offers[0].id))
    XCTAssertThrowsError(try journal.recordGigDecision(.completed, offerId: UUID()))
    XCTAssertNil(journal.gigCommitments); XCTAssertNil(journal.gigDecisions)
  }
}
