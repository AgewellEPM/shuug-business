import Foundation

public enum TripClassification: String, Codable, CaseIterable, Identifiable, Sendable {
    case business, personal, unclassified
    public var id: String { rawValue }
    public var label: String { self == .unclassified ? "Review later" : rawValue.capitalized }
}
public struct Trip: Codable, Equatable, Sendable {
    public var startedAt: Date, endedAt: Date?, distanceMeters: Double, classification: TripClassification
    public var purpose: String, notes: String, source: String, hasGaps: Bool, sampleCount: Int
    public var localDate: String?, timeZoneId: String?
    public var earningsCents: Int?, platformFeesCents: Int?, rideRole: RideRole?, automaticallyDetected: Bool?
    public var platform: String?, workArea: String?
    public var recordedTimeZone: TimeZone { timeZoneId.flatMap(TimeZone.init(identifier:)) ?? TimeZone(secondsFromGMT: 0)! }
    public var recordedDate: String { localDate ?? DriverRecord.day(startedAt, timeZone: recordedTimeZone) }
    public init(startedAt: Date = Date(), endedAt: Date? = nil, distanceMeters: Double = 0, classification: TripClassification = .unclassified, purpose: String = "", notes: String = "", source: String = "gps", hasGaps: Bool = false, sampleCount: Int = 0, timeZone: TimeZone = .current) {
        self.startedAt = startedAt; self.endedAt = endedAt; self.distanceMeters = distanceMeters; self.classification = classification; self.purpose = purpose; self.notes = notes; self.source = source; self.hasGaps = hasGaps; self.sampleCount = sampleCount
        self.localDate = DriverRecord.day(startedAt, timeZone: timeZone); self.timeZoneId = timeZone.identifier
    }
}
public struct Income: Codable, Equatable, Sendable {
    public var date: String, platform: String, description: String, amountCents: Int, currency: String, notes: String
    public var bankReference: BankReference?
    public init(date: String, platform: String, description: String, amountCents: Int, notes: String = "") {
        self.date = date; self.platform = platform; self.description = description; self.amountCents = amountCents; self.currency = "USD"; self.notes = notes
    }
}
public enum RecordPayload: Equatable, Sendable { case trip(Trip), expense(Expense), income(Income) }
public struct DriverRecord: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID, revision: Int, deleted: Bool, payload: RecordPayload
    public init(id: UUID = UUID(), revision: Int = 0, deleted: Bool = false, payload: RecordPayload) { self.id = id; self.revision = revision; self.deleted = deleted; self.payload = payload }
    public var kind: String { switch payload { case .trip: "trip"; case .expense: "expense"; case .income: "income" } }
    public var title: String { switch payload { case .trip(let t): t.purpose.isEmpty ? "Driving trip" : t.purpose; case .expense(let e): e.merchant; case .income(let i): i.description } }
    public var dateLabel: String { switch payload { case .trip(let t): t.recordedDate; case .expense(let e): e.date; case .income(let i): i.date } }
    public var receiptId: UUID? { if case .expense(let e) = payload { return e.receiptId }; return nil }
    public var bankReference: BankReference? {
        switch payload { case .expense(let e): e.bankReference; case .income(let i): i.bankReference; case .trip: nil }
    }
    public static func day(_ date: Date, timeZone: TimeZone = .current) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = Calendar(identifier: .gregorian); f.timeZone = timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
    private enum CodingKeys: String, CodingKey { case id, revision, deleted, kind, body }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id); revision = try c.decode(Int.self, forKey: .revision); deleted = try c.decode(Bool.self, forKey: .deleted)
        switch try c.decode(String.self, forKey: .kind) {
        case "trip": payload = .trip(try c.decode(Trip.self, forKey: .body))
        case "expense": payload = .expense(try c.decode(Expense.self, forKey: .body))
        case "income": payload = .income(try c.decode(Income.self, forKey: .body))
        default: throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unsupported driver record.")
        }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(revision, forKey: .revision); try c.encode(deleted, forKey: .deleted); try c.encode(kind, forKey: .kind)
        switch payload { case .trip(let t): try c.encode(t, forKey: .body); case .expense(let e): try c.encode(e, forKey: .body); case .income(let i): try c.encode(i, forKey: .body) }
    }
}
public struct ServerRecord: Codable, Equatable, Sendable {
    public var record: DriverRecord, updatedAt: Date, sequence: Int
    public init(record: DriverRecord, updatedAt: Date = Date(), sequence: Int) { self.record = record; self.updatedAt = updatedAt; self.sequence = sequence }
}
public struct DriverMutation: Codable, Sendable { public var mutationId: UUID, record: DriverRecord; public init(mutationId: UUID, record: DriverRecord) { self.mutationId = mutationId; self.record = record } }
public struct SyncPage: Codable, Sendable { public var records: [ServerRecord], cursor: Int, hasMore: Bool }
public enum WireJSON {
    public static func encoder() -> JSONEncoder { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; e.outputFormatting = [.sortedKeys]; return e }
    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder(); d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer(), text = try c.decode(String.self)
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = f.date(from: text) { return date }; f.formatOptions = [.withInternetDateTime]
            if let date = f.date(from: text) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid timestamp.")
        }; return d
    }
}
