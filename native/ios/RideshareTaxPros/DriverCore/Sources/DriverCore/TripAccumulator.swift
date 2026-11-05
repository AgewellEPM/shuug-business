import Foundation

public struct LocationFix: Codable, Equatable, Sendable {
    public var latitude: Double, longitude: Double, accuracy: Double, timestamp: Date
    public var startsSegment: Bool?
    public init(latitude: Double, longitude: Double, accuracy: Double, timestamp: Date, startsSegment: Bool? = nil) { self.latitude = latitude; self.longitude = longitude; self.accuracy = accuracy; self.timestamp = timestamp; self.startsSegment = startsSegment }
    public func distance(to other: Self) -> Double {
        let r = Double.pi / 180, a = latitude * r, b = other.latitude * r
        let h = pow(sin((b-a)/2), 2) + cos(a) * cos(b) * pow(sin((other.longitude-longitude)*r/2), 2)
        return 6_371_008.8 * 2 * atan2(sqrt(max(0, h)), sqrt(max(0, 1-h)))
    }
}
/// Quality filtering measures observed travel. It never fills a signal gap with
/// an assumed straight line or silently adds simulated/missing road distance.
public struct TripAccumulator: Codable, Equatable, Sendable {
    public private(set) var distanceMeters = 0.0, hasGaps = false, sampleCount = 0
    public private(set) var anchor: LocationFix?, lastObservedAt: Date?
    public init() {}
    /// Returns true when the accepted fix becomes a new route anchor.
    public mutating func consume(_ fix: LocationFix, now: Date = Date()) -> Bool {
        guard fix.latitude.isFinite, fix.longitude.isFinite, fix.accuracy.isFinite,
              abs(fix.latitude) <= 90, abs(fix.longitude) <= 180, (0...50).contains(fix.accuracy),
              now.timeIntervalSince(fix.timestamp) <= 20, fix.timestamp.timeIntervalSince(now) <= 5,
              lastObservedAt.map({ fix.timestamp > $0 }) ?? true else { return false }
        let gap = lastObservedAt.map { fix.timestamp.timeIntervalSince($0) > 90 } ?? false
        if gap { hasGaps = true; anchor = nil }
        guard let previous = anchor else { anchor = fix; lastObservedAt = fix.timestamp; sampleCount += 1; return true }
        let distance = previous.distance(to: fix), seconds = fix.timestamp.timeIntervalSince(previous.timestamp)
        guard seconds > 0 else { return false }
        if distance / seconds > 65 { hasGaps = true; return false }
        lastObservedAt = fix.timestamp; sampleCount += 1
        let noise = max(5, (previous.accuracy + fix.accuracy) * 0.25)
        guard distance >= noise else { return false }
        distanceMeters += distance; anchor = fix; return true
    }
    public mutating func markGap() { hasGaps = true; anchor = nil }
}
