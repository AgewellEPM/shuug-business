import Foundation

public struct LocalEntry: Codable, Identifiable, Sendable {
    public var record: DriverRecord, pendingMutationId: UUID?, conflict: ServerRecord?, locations: [LocationFix]
    public var id: UUID { record.id }
    public init(record: DriverRecord, pending: Bool = true) { self.record = record; pendingMutationId = pending ? UUID() : nil; conflict = nil; locations = [] }
    public var mutation: DriverMutation? { pendingMutationId.map { DriverMutation(mutationId: $0, record: record) } }
    // Route points have their own append-only phone file. Historical routes
    // must not be re-encoded on every live GPS update or transmitted to Shuug.
    private enum CodingKeys: String, CodingKey { case record, pendingMutationId, conflict }
    public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); record = try c.decode(DriverRecord.self, forKey: .record); pendingMutationId = try c.decodeIfPresent(UUID.self, forKey: .pendingMutationId); conflict = try c.decodeIfPresent(ServerRecord.self, forKey: .conflict); locations = [] }
}
public struct LocalReceipt: Codable, Identifiable, Sendable {
    public var id: UUID, mime: String, uploaded: Bool
    public init(id: UUID = UUID(), mime: String = "image/jpeg", uploaded: Bool = false) { self.id = id; self.mime = mime; self.uploaded = uploaded }
}
public struct Journal: Codable, Sendable {
    public var version = 1, cursor = 0
    public var entries: [LocalEntry] = [], receipts: [LocalReceipt] = []
    public var activeTripId: UUID?, tracker: TripAccumulator?, lastSyncAt: Date?
    public var goals: DriverGoals?, bankTransactions: [BankTransaction]?, placePrompts: [ExpensePrompt]?
    public var assistance: AssistanceSettings?
    public var bankCursor: Int?, bankUpdatedAt: Date?
    public init() {}
    public var visible: [LocalEntry] { entries.filter { !$0.record.deleted }.sorted { $0.record.dateLabel > $1.record.dateLabel } }
    public var pending: [DriverMutation] { entries.filter { $0.conflict == nil }.compactMap(\.mutation) }
    public var pendingReceipts: [LocalReceipt] { receipts.filter { r in !r.uploaded && visible.contains { $0.record.receiptId == r.id } } }
    public mutating func upsert(_ record: DriverRecord) {
        if let i = entries.firstIndex(where: { $0.id == record.id }) {
            var value = record; value.revision = entries[i].record.revision
            entries[i].record = value; entries[i].pendingMutationId = UUID()
        } else { entries.append(LocalEntry(record: record)) }
        if let bank = record.bankReference, let index = bankTransactions?.firstIndex(where: { $0.id == bank.transactionId }) {
            bankTransactions?[index].reviewedRecordId = record.id
        }
    }
    public mutating func delete(_ id: UUID) {
        guard id != activeTripId, let i = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[i].record.deleted = true; entries[i].pendingMutationId = UUID()
    }
    @discardableResult public mutating func beginTrip(classification: TripClassification, purpose: String, now: Date = Date()) -> UUID? {
        guard activeTripId == nil else { return nil }
        let record = DriverRecord(payload: .trip(Trip(startedAt: now, classification: classification, purpose: purpose)))
        upsert(record); activeTripId = record.id; tracker = TripAccumulator(); return record.id
    }
    public mutating func addLocation(_ fix: LocationFix, now: Date = Date()) {
        guard let id = activeTripId, let i = entries.firstIndex(where: { $0.id == id }), case .trip(var trip) = entries[i].record.payload, var tracker else { return }
        guard fix.timestamp >= trip.startedAt else { return }
        let startsSegment = tracker.anchor == nil || tracker.lastObservedAt.map { fix.timestamp.timeIntervalSince($0) > 90 } == true
        let anchor = tracker.consume(fix, now: now); self.tracker = tracker
        trip.distanceMeters = tracker.distanceMeters; trip.hasGaps = tracker.hasGaps; trip.sampleCount = tracker.sampleCount
        if entries[i].record.payload != .trip(trip) { entries[i].record.payload = .trip(trip); entries[i].pendingMutationId = UUID() }
        if anchor {
            // Bound the map preview while retaining the independent distance accumulator.
            if entries[i].locations.count >= 20_000 { entries[i].locations = entries[i].locations.enumerated().filter { $0.offset % 2 == 0 }.map(\.element) }
            var point = fix; point.startsSegment = startsSegment; entries[i].locations.append(point)
        }
    }
    public mutating func markLocationGap() {
        tracker?.markGap()
        if let i = entries.firstIndex(where: { $0.id == activeTripId }), case .trip(var trip) = entries[i].record.payload { trip.hasGaps = true; entries[i].record.payload = .trip(trip); entries[i].pendingMutationId = UUID() }
    }
    public mutating func finishTrip(now: Date = Date()) {
        guard let i = entries.firstIndex(where: { $0.id == activeTripId }), case .trip(var trip) = entries[i].record.payload else { return }
        trip.endedAt = max(now, trip.startedAt); entries[i].record.payload = .trip(trip); entries[i].pendingMutationId = UUID(); activeTripId = nil; tracker = nil
    }
    public mutating func acknowledge(_ mutation: DriverMutation, result: ServerRecord) {
        guard result.record.id == mutation.record.id, let i = entries.firstIndex(where: { $0.id == result.record.id }) else { return }
        if entries[i].pendingMutationId == mutation.mutationId { entries[i].record = result.record; entries[i].pendingMutationId = nil; entries[i].conflict = nil }
        else { entries[i].record.revision = max(entries[i].record.revision, result.record.revision) }
    }
    public mutating func merge(_ result: ServerRecord) {
        if let i = entries.firstIndex(where: { $0.id == result.record.id }) {
            guard result.record.revision > entries[i].record.revision else { return }
            if entries[i].pendingMutationId != nil { entries[i].conflict = result }
            else { entries[i].record = result.record; entries[i].conflict = nil }
        } else { entries.append(LocalEntry(record: result.record, pending: false)) }
    }
    public mutating func resolve(_ id: UUID, keepPhone: Bool) {
        guard let i = entries.firstIndex(where: { $0.id == id }), let server = entries[i].conflict, activeTripId != id else { return }
        if keepPhone { entries[i].record.revision = server.record.revision; entries[i].pendingMutationId = UUID() }
        else { entries[i].record = server.record; entries[i].pendingMutationId = nil }
        entries[i].conflict = nil
    }
}
