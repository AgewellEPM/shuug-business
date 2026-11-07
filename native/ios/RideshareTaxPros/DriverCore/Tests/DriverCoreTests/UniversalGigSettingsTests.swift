import Foundation
import XCTest
@testable import DriverCore

final class UniversalGigSettingsTests: XCTestCase {
  func testWorkProfilesAreIndependentAndValidateUserChosenHTTPSLinks() throws {
    var settings = UniversalGigSettings()
    let profile = try UniversalGigProfile(workLabel: "  Neighborhood deliveries  ", appURL: " https://example.com/jobs ").validated()
    settings.setProfile(profile, for: .delivery)
    XCTAssertEqual(settings.profile(for: .delivery).workLabel, "Neighborhood deliveries")
    XCTAssertEqual(settings.profile(for: .delivery).appURL, "https://example.com/jobs")
    XCTAssertEqual(settings.profile(for: .shopping).workLabel, "In-store shopping")
    XCTAssertNil(try UniversalGigProfile.validatedAppURL("  "))
    XCTAssertNil(try UniversalGigProfile(workLabel: "Store shift", appURL: "").validated().appURL)
    for address in ["http://example.com", "https://person:password@example.com", "file:///private/data", "sparkdriver://", "https://localhost", "https://127.0.0.1", "https://work.internal", "https://example.com:8443"] {
      XCTAssertThrowsError(try UniversalGigProfile.validatedAppURL(address), address)
    }
    XCTAssertThrowsError(try UniversalGigProfile(workLabel: "  ").validated())
    XCTAssertThrowsError(try UniversalGigProfile(workLabel: String(repeating: "x", count: 81)).validated())
  }

  func testJournalRoundTripKeepsSettingsOptionalAndGuestRecordCopyPreservesAccountSettings() throws {
    var source = Journal()
    source.universalGigSettings = UniversalGigSettings(shopping: .init(workLabel: "Guest store", appURL: "https://example.com"))
    let encoded = try WireJSON.encoder().encode(source)
    let restored = try WireJSON.decoder().decode(Journal.self, from: encoded)
    XCTAssertEqual(restored.universalGigSettings, source.universalGigSettings)
    var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    legacy.removeValue(forKey: "universalGigSettings")
    XCTAssertNil(try WireJSON.decoder().decode(Journal.self, from: JSONSerialization.data(withJSONObject: legacy)).universalGigSettings)
    let copied = try GuestTransferPlan.prepare(source: source, destination: Journal())
    XCTAssertEqual(copied.journal.universalGigSettings, source.universalGigSettings)
    var destination = Journal()
    destination.universalGigSettings = UniversalGigSettings(shopping: .init(workLabel: "Account store"))
    let kept = try GuestTransferPlan.prepare(source: source, destination: destination)
    XCTAssertEqual(kept.journal.universalGigSettings, destination.universalGigSettings)
    XCTAssertEqual(source.universalGigSettings?.shopping.workLabel, "Guest store")
  }

  func testManualZeroMileShoppingUsesActualWorkDurationAndKnownFeesWithoutGPSOrDrivingCost() throws {
    let start = Date(timeIntervalSince1970: 1_793_700_000)
    var shopping = Trip(startedAt: start, endedAt: start.addingTimeInterval(3600), distanceMeters: 0,
      classification: .business, purpose: "In-store work", source: "manual")
    shopping.rideRole = .shopping; shopping.earningsCents = 1800; shopping.platformFeesCents = 200
    let record = DriverRecord(payload: .trip(shopping))
    XCTAssertEqual(try WireJSON.decoder().decode(DriverRecord.self, from: WireJSON.encoder().encode(record)), record)
    let profit = try XCTUnwrap(RideProfit(record: record, goals: .init()))
    XCTAssertEqual(profit.estimatedVehicleCents, 0); XCTAssertEqual(profit.estimatedNetCents, 1600)
    XCTAssertEqual(profit.hourlyCents, 1600); XCTAssertNil(profit.netCentsPerMile)
    XCTAssertEqual(profit.minutes, 60); XCTAssertEqual(profit.miles, 0); XCTAssertFalse(profit.needsMileageReview)
    var journal = Journal(); journal.upsert(record)
    XCTAssertNil(journal.activeTripId); XCTAssertNil(journal.tracker); XCTAssertEqual(journal.pending.count, 1)
    let summary = DrivingInsights(records: [record], goals: .init(), from: shopping.recordedDate, through: shopping.recordedDate)
    XCTAssertEqual(summary.days.first?.minutes, 60); XCTAssertEqual(summary.days.first?.estimatedRideNetCents, 1600)
    shopping.platformFeesCents = nil
    XCTAssertNil(RideProfit(record: .init(payload: .trip(shopping)), goals: .init())?.estimatedNetCents)
    shopping.platformFeesCents = 200; shopping.distanceMeters = 1609.344
    XCTAssertNil(RideProfit(record: .init(payload: .trip(shopping)), goals: .init())?.estimatedNetCents)
    XCTAssertEqual(RideProfit(record: .init(payload: .trip(shopping)), goals: .init(vehicleCostCentsPerMile: 50))?.estimatedNetCents, 1550)
    shopping.distanceMeters = 0; shopping.rideRole = .delivery
    XCTAssertNil(RideProfit(record: .init(payload: .trip(shopping)), goals: .init())?.estimatedVehicleCents)
  }
}
