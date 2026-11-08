import XCTest
@testable import DriverCore

final class OfficeDirectoryTests: XCTestCase {
  private func fixture() throws -> OfficeDirectory {
    let office: [String: Any] = ["id": "1", "name": "Synthetic Connecticut Office", "address": "Example Street", "city": "Hartford", "state": "CT", "postalCode": "06103",
      "latitude": 41.7658, "longitude": -72.6734, "phone": "+1 203 555 0100", "hours": "By appointment", "available24x7": false, "appointmentURL": "https://example.test/book"]
    var far = office; far["id"] = "2"; far["name"] = "Synthetic California Office"; far["latitude"] = 34.05; far["longitude"] = -118.25
    var invalid = office; invalid["id"] = "3"; invalid["latitude"] = 100
    return try JSONDecoder().decode(OfficeDirectory.self, from: JSONSerialization.data(withJSONObject: ["version": 1, "updatedAt": "2026-11-07T00:00:00Z",
      "support": ["phone": "", "hours": "", "available24x7": false, "appointmentURL": ""], "offices": [far, office, invalid, office]]))
  }
  func testNearestSortingRejectsInvalidPinsAndDuplicates() throws {
    let directory = try fixture(), point = OfficeCoordinate(latitude: 41.76, longitude: -72.67)
    let offices = directory.ranked(near: point)
    XCTAssertEqual(offices.map(\.id), ["1", "2"])
    XCTAssertLessThan(point.miles(to: offices[0].coordinate), 1)
    XCTAssertGreaterThan(point.miles(to: offices[1].coordinate), 2000)
    XCTAssertEqual(directory.ranked(near: nil).map(\.id), ["2", "1"])
  }
  func testContactActionsRequireUsableValuesAnd24HourFlag() throws {
    var contact = try fixture().offices[0].contact
    XCTAssertEqual(contact.callURL?.absoluteString, "tel:+12035550100")
    XCTAssertNotNil(contact.bookingURL); XCTAssertFalse(contact.shows24x7)
    contact.available24x7 = true; XCTAssertTrue(contact.shows24x7)
    contact.phone = ""; XCTAssertFalse(contact.shows24x7); XCTAssertNil(contact.callURL)
    for value in ["http://example.test/book", "https://user:secret@example.test", "javascript:alert(1)", "https://127.0.0.1/book"] {
      contact.appointmentURL = value; XCTAssertNil(contact.bookingURL)
    }
  }
}
