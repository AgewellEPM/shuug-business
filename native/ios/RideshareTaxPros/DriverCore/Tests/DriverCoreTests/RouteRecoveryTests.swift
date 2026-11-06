import Foundation
import XCTest
@testable import DriverCore

final class RouteRecoveryTests: XCTestCase {
  func testDamagedRouteDoesNotBridgeMissingSamplesOrOverwriteOriginal() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: folder) }
    let disk = try JournalDiskStore(directory: folder), id = UUID(), date = Date()
    let first = LocationFix(latitude: 40, longitude: -73, accuracy: 5, timestamp: date)
    let second = LocationFix(latitude: 40.1, longitude: -73, accuracy: 5, timestamp: date.addingTimeInterval(60))
    try disk.appendRoute(first, tripId: id)
    let url = folder.appendingPathComponent("route-\(id.uuidString.lowercased()).jsonl")
    let file = try FileHandle(forWritingTo: url); try file.seekToEnd()
    try file.write(contentsOf: Data("{damaged\n".utf8)); try file.close()
    try disk.appendRoute(second, tripId: id)
    let before = try Data(contentsOf: url)
    let recovered = try disk.readRoute(id)
    XCTAssertTrue(recovered.hasDamagedRecords)
    XCTAssertEqual(recovered.points.count, 2)
    XCTAssertEqual(recovered.points.first?.latitude, first.latitude)
    XCTAssertEqual(recovered.points.last?.latitude, second.latitude)
    XCTAssertEqual(recovered.points.last?.startsSegment, true)
    XCTAssertEqual(try Data(contentsOf: url), before)
    XCTAssertTrue(try disk.readRoute(UUID()).points.isEmpty)
  }
}
