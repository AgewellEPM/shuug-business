import Foundation

public struct RouteReadResult: Sendable {
    public let points: [LocationFix]
    public let hasDamagedRecords: Bool
}

public final class JournalDiskStore {
    public let directory: URL
    public var journalURL: URL { directory.appendingPathComponent("journal.json") }
    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try protect(directory)
    }
    public func load() throws -> Journal {
        guard FileManager.default.fileExists(atPath: journalURL.path) else { return Journal() }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .millisecondsSince1970
        let journal = try decoder.decode(Journal.self, from: Data(contentsOf: journalURL))
        guard journal.version == 1 else { throw CocoaError(.coderReadCorrupt) }
        return journal
    }
    public func save(_ journal: Journal) throws { let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .millisecondsSince1970; try encoder.encode(journal).write(to: journalURL, options: .atomic); try protect(journalURL) }
    private func routeURL(_ id: UUID) -> URL { directory.appendingPathComponent("route-\(id.uuidString.lowercased()).jsonl") }
    public func appendRoute(_ point: LocationFix, tripId: UUID) throws {
        let url = routeURL(tripId), encoder = JSONEncoder(); encoder.dateEncodingStrategy = .millisecondsSince1970
        var data = try encoder.encode(point); data.append(0x0a)
        if !FileManager.default.fileExists(atPath: url.path) { try data.write(to: url, options: .atomic); try protect(url); return }
        let file = try FileHandle(forUpdating: url); defer { try? file.close() }
        let end = try file.seekToEnd()
        if end > 0 { try file.seek(toOffset: end - 1); let last = try file.read(upToCount: 1); try file.seekToEnd(); if last != Data([0x0a]) { try file.write(contentsOf: Data([0x0a])) } }
        try file.write(contentsOf: data); try file.synchronize()
    }
    public func route(_ id: UUID) throws -> [LocationFix] {
        try readRoute(id).points
    }
    /// Preserve readable samples around a damaged append without drawing an
    /// invented straight segment across the missing data. The source stays intact.
    public func readRoute(_ id: UUID) throws -> RouteReadResult {
        let url = routeURL(id); guard FileManager.default.fileExists(atPath: url.path) else { return RouteReadResult(points: [], hasDamagedRecords: false) }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .millisecondsSince1970
        let data = try Data(contentsOf: url)
        var points: [LocationFix] = [], damaged = false, breakBeforeNext = false
        for line in data.split(separator: 0x0a) {
            guard var point = try? decoder.decode(LocationFix.self, from: Data(line)),
                  point.latitude.isFinite, (-90...90).contains(point.latitude),
                  point.longitude.isFinite, (-180...180).contains(point.longitude),
                  point.accuracy.isFinite, (0...50).contains(point.accuracy) else {
                damaged = true; breakBeforeNext = true; continue
            }
            if breakBeforeNext { point.startsSegment = true; breakBeforeNext = false }
            points.append(point)
        }
        return RouteReadResult(points: points, hasDamagedRecords: damaged)
    }
    public func copyRoute(_ id: UUID, from other: JournalDiskStore) throws {
        let source = other.routeURL(id); guard FileManager.default.fileExists(atPath: source.path) else { return }
        try Data(contentsOf: source).write(to: routeURL(id), options: .atomic); try protect(routeURL(id))
    }
    public func receiptURL(_ id: UUID) -> URL { directory.appendingPathComponent("receipt-\(id.uuidString.lowercased())") }
    public func receipt(_ id: UUID) throws -> Data { try Data(contentsOf: receiptURL(id)) }
    public func saveReceipt(_ data: Data, id: UUID) throws { try data.write(to: receiptURL(id), options: .atomic); try protect(receiptURL(id)) }
    private func protect(_ url: URL) throws {
        var attributes: [FileAttributeKey: Any] = [.posixPermissions: url == directory ? 0o700 : 0o600]
        #if os(iOS)
        // A user-started trip must keep saving after the phone locks.
        attributes[.protectionKey] = FileProtectionType.completeUntilFirstUserAuthentication
        #endif
        try FileManager.default.setAttributes(attributes, ofItemAtPath: url.path)
    }
}
