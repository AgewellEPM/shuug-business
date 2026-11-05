import XCTest
@testable import DriverCore

final class DriverCoreTests: XCTestCase {
    let start = Date(timeIntervalSince1970: 1_793_700_000)
    func fix(_ latitude: Double, _ seconds: Double, accuracy: Double = 5) -> LocationFix { LocationFix(latitude: latitude, longitude: -73.9, accuracy: accuracy, timestamp: start.addingTimeInterval(seconds)) }
    func testObservedDistanceRejectsJitterBadAccuracyReplayAndTeleport() {
        var t = TripAccumulator()
        XCTAssertTrue(t.consume(fix(40, 0), now: start))
        XCTAssertFalse(t.consume(fix(40.000001, 1), now: start.addingTimeInterval(1)))
        XCTAssertTrue(t.consume(fix(40.001, 10), now: start.addingTimeInterval(10)))
        XCTAssertEqual(t.distanceMeters, 111.2, accuracy: 0.5)
        let measured = t.distanceMeters
        for point in [fix(41, 11), fix(40.002, 5), fix(40.002, 12, accuracy: 100), fix(40.002, -100)] { XCTAssertFalse(t.consume(point, now: start.addingTimeInterval(12))) }
        XCTAssertEqual(t.distanceMeters, measured); XCTAssertTrue(t.hasGaps)
    }
    func testSignalGapsDoNotCreateFictionalMiles() {
        var t = TripAccumulator()
        _ = t.consume(fix(40, 0), now: start)
        _ = t.consume(fix(40.001, 10), now: start.addingTimeInterval(10))
        _ = t.consume(fix(40.1, 200), now: start.addingTimeInterval(200))
        XCTAssertEqual(t.distanceMeters, 111.2, accuracy: 0.5); XCTAssertTrue(t.hasGaps)
        _ = t.consume(fix(40.101, 210), now: start.addingTimeInterval(210))
        XCTAssertEqual(t.distanceMeters, 222.4, accuracy: 1)
    }
    func testOfflineJournalRecoversActiveTripPendingEditsAndPrivateReceipt() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let disk = try JournalDiskStore(directory: directory); var j = Journal()
        let id = j.beginTrip(classification: .business, purpose: "Driver shift", now: start)!
        j.addLocation(fix(40, -1), now: start); XCTAssertEqual(j.tracker?.sampleCount, 0)
        j.addLocation(fix(40, 0), now: start); j.addLocation(fix(40.001, 10), now: start.addingTimeInterval(10))
        let receipt = UUID(); try disk.saveReceipt(Data("synthetic-private-receipt".utf8), id: receipt)
        try disk.appendRoute(fix(40, 0), tripId: id); try disk.save(j)
        var reopened = try disk.load(); XCTAssertEqual(reopened.activeTripId, id); XCTAssertEqual(reopened.pending.count, 1)
        XCTAssertEqual(reopened.tracker?.distanceMeters ?? 0, 111.2, accuracy: 0.5)
        XCTAssertTrue(reopened.entries[0].locations.isEmpty); XCTAssertEqual(try disk.route(id).count, 1)
        XCTAssertEqual(try disk.receipt(receipt), Data("synthetic-private-receipt".utf8))
        reopened.finishTrip(now: start.addingTimeInterval(20)); try disk.save(reopened)
        XCTAssertNil(try disk.load().activeTripId)
    }
    func testAcknowledgingAnOlderUploadDoesNotDiscardANewerPhoneEdit() {
        var j = Journal(); let record = DriverRecord(payload: .trip(Trip(startedAt: start)))
        j.upsert(record); let sent = j.pending[0]
        var changed = record; changed.payload = .trip(Trip(startedAt: start, purpose: "Edited while uploading")); j.upsert(changed)
        var acknowledged = record; acknowledged.revision = 1
        j.acknowledge(sent, result: ServerRecord(record: acknowledged, sequence: 1))
        XCTAssertEqual(j.pending.count, 1); XCTAssertEqual(j.pending[0].record.revision, 1)
        XCTAssertEqual(j.pending[0].record.title, "Edited while uploading")
    }
    func testRemoteConflictsRequireExplicitResolutionAndDeletionSurvivesSync() {
        var j = Journal(); let original = DriverRecord(payload: .trip(Trip(startedAt: start)))
        j.upsert(original)
        var remote = original; remote.revision = 1; remote.payload = .trip(Trip(startedAt: start, purpose: "Other device"))
        j.merge(ServerRecord(record: remote, sequence: 1)); XCTAssertNotNil(j.entries[0].conflict); XCTAssertTrue(j.pending.isEmpty)
        j.resolve(original.id, keepPhone: true); XCTAssertEqual(j.pending[0].record.revision, 1)
        j.delete(original.id); XCTAssertTrue(j.visible.isEmpty); XCTAssertTrue(j.pending[0].record.deleted)
    }
    func testCorruptJournalIsNeverSilentlyReplacedAndMoneyIsExact() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let disk = try JournalDiskStore(directory: directory); try Data("damaged".utf8).write(to: disk.journalURL)
        XCTAssertThrowsError(try disk.load()); XCTAssertEqual(try Data(contentsOf: disk.journalURL), Data("damaged".utf8))
        XCTAssertEqual(JournalExport.cents("12.34"), 1234); XCTAssertEqual(JournalExport.cents("0.01"), 1)
        for text in ["-2", "1.999", "1e6", "NaN", "", "0"] { XCTAssertNil(JournalExport.cents(text)) }
    }
    func testWireContractAndCSVDoNotExposePhoneCoordinates() throws {
        var record = DriverRecord(payload: .trip(Trip(startedAt: start, purpose: "=DANGEROUS()")))
        record.revision = 3
        let data = try WireJSON.encoder().encode(record), decoded = try WireJSON.decoder().decode(DriverRecord.self, from: data)
        XCTAssertEqual(record, decoded); XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("latitude"))
        XCTAssertTrue(JournalExport.csv([record]).contains("'=DANGEROUS()"))
        let fractional = Data("\"2026-11-05T00:48:21.903Z\"".utf8)
        XCTAssertNoThrow(try WireJSON.decoder().decode(Date.self, from: fractional))
    }
    func testTripDateStaysInItsRecordedTimeZoneAcrossSyncAndTravel() throws {
        let instant = ISO8601DateFormatter().date(from: "2026-11-05T02:30:00Z")!
        let trip = Trip(startedAt: instant, timeZone: TimeZone(identifier: "America/New_York")!)
        let record = DriverRecord(payload: .trip(trip))
        XCTAssertEqual(record.dateLabel, "2026-11-04")
        XCTAssertEqual(DriverRecord.day(instant, timeZone: TimeZone(identifier: "Asia/Tokyo")!), "2026-11-05")
        let data = try WireJSON.encoder().encode(record)
        let synced = try WireJSON.decoder().decode(DriverRecord.self, from: data)
        XCTAssertEqual(synced, record)
        XCTAssertTrue(JournalExport.csv([synced]).contains("2026-11-04"))
        var legacy = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        var body = legacy["body"] as! [String: Any]
        body.removeValue(forKey: "localDate"); body.removeValue(forKey: "timeZoneId")
        legacy["body"] = body
        let restored = try WireJSON.decoder().decode(DriverRecord.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertEqual(restored.dateLabel, "2026-11-05", "Legacy trips consistently use UTC when their original zone was not recorded.")
    }
}
