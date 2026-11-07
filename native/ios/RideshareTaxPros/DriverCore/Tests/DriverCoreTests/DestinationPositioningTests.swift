import Foundation
import XCTest
@testable import DriverCore

final class DestinationPositioningTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)
  private func job(_ toward: Bool = true, date: Date? = nil) -> HistoricalPositioningTrip {
    HistoricalPositioningTrip(origin: PositionPoint(40, -73), dropoff: PositionPoint(toward ? 40.05 : 39.95, -73),
      area: "Recorded start", netCents: 1200, minutes: 25, completedAt: date ?? now)
  }
  func testNeedsThreeTowardHomeJobsAndReportsTheWholeEligibleSample() {
    let current = PositionPoint(40, -73), destination = PositionPoint(40.1, -73)
    XCTAssertTrue(DestinationPositioning.candidates([job(), job()], current: current, destination: destination, now: now).isEmpty)
    let areas = DestinationPositioning.candidates([job(), job(), job(), job(false)], current: current, destination: destination, now: now)
    XCTAssertEqual(areas.count, 1); XCTAssertEqual(areas.first?.matchingJobs, 3); XCTAssertEqual(areas.first?.totalJobs, 4)
    XCTAssertEqual(areas.first?.averageNetCents, 1200)
  }
  func testRejectsOldDistantInvalidAndMostlyWrongDirectionHistory() {
    let current = PositionPoint(40, -73), destination = PositionPoint(40.1, -73)
    let rows = [job(), job(), job(), job(false), job(false), job(false), job(false)]
    XCTAssertTrue(DestinationPositioning.candidates(rows, current: current, destination: destination, now: now).isEmpty)
    let old = [job(date: now.addingTimeInterval(-91 * 86400)), job(), job()]
    XCTAssertTrue(DestinationPositioning.candidates(old, current: current, destination: destination, now: now).isEmpty)
    XCTAssertTrue(DestinationPositioning.candidates([job(), job(), job()], current: PositionPoint(45, -73), destination: destination, now: now).isEmpty)
    XCTAssertTrue(DestinationPositioning.candidates(rows, current: PositionPoint(.nan, -73), destination: destination, now: now).isEmpty)
  }
}
