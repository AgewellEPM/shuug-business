import Foundation

public struct PositionPoint: Sendable, Equatable {
  public let latitude: Double, longitude: Double
  public init(_ latitude: Double, _ longitude: Double) { self.latitude = latitude; self.longitude = longitude }
  public var valid: Bool { latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude) }
  public func meters(to other: PositionPoint) -> Double {
    let scale = Double.pi / 180
    let a = pow(sin((other.latitude - latitude) * scale / 2), 2)
      + cos(latitude * scale) * cos(other.latitude * scale) * pow(sin((other.longitude - longitude) * scale / 2), 2)
    return 6_371_000 * 2 * asin(sqrt(min(1, max(0, a))))
  }
}
public struct HistoricalPositioningTrip: Sendable {
  public let origin: PositionPoint, dropoff: PositionPoint
  public let area: String, netCents: Int, minutes: Double, completedAt: Date
  public init(origin: PositionPoint, dropoff: PositionPoint, area: String, netCents: Int, minutes: Double, completedAt: Date) {
    self.origin = origin; self.dropoff = dropoff; self.area = area; self.netCents = netCents
    self.minutes = minutes; self.completedAt = completedAt
  }
}
public struct HistoricalWaitingArea: Identifiable, Sendable {
  public let id: String, name: String, origin: PositionPoint, typicalDropoff: PositionPoint
  public let matchingJobs: Int, totalJobs: Int, averageNetCents: Double, averageMinutes: Double
  public var matchingShare: Double { Double(matchingJobs) / Double(totalJobs) }
}
public enum DestinationPositioning {
  /// Personal history, not a live demand model. A zone needs at least three
  /// toward-destination examples and a majority of its eligible jobs to match.
  public static func candidates(_ history: [HistoricalPositioningTrip], current: PositionPoint,
    destination: PositionPoint, now: Date = Date()) -> [HistoricalWaitingArea] {
    guard current.valid, destination.valid else { return [] }
    let eligible = history.filter {
      $0.origin.valid && $0.dropoff.valid && (1...100_000_000).contains($0.netCents) && $0.minutes.isFinite && (1...1440).contains($0.minutes)
        && (0...90 * 24 * 3600).contains(now.timeIntervalSince($0.completedAt))
        && current.meters(to: $0.origin) <= 15_000
    }
    let groups = Dictionary(grouping: eligible) {
      "\(Int(($0.origin.latitude / 0.005).rounded()))|\(Int(($0.origin.longitude / 0.005).rounded()))"
    }
    return groups.compactMap { key, rows -> HistoricalWaitingArea? in
      let matches = rows.filter { $0.origin.meters(to: destination) - $0.dropoff.meters(to: destination) >= 500 }
      guard matches.count >= 3, matches.count * 2 >= rows.count, let representative = matches.first else { return nil }
      let label = representative.area.trimmingCharacters(in: .whitespacesAndNewlines)
      return HistoricalWaitingArea(id: key, name: label.isEmpty ? "Your recorded job-start area" : label,
        origin: representative.origin, typicalDropoff: representative.dropoff,
        matchingJobs: matches.count, totalJobs: rows.count,
        averageNetCents: Double(matches.reduce(0) { $0 + $1.netCents }) / Double(matches.count),
        averageMinutes: matches.reduce(0) { $0 + $1.minutes } / Double(matches.count))
    }.sorted {
      if abs($0.matchingShare - $1.matchingShare) > 0.01 { return $0.matchingShare > $1.matchingShare }
      return $0.averageNetCents / $0.averageMinutes > $1.averageNetCents / $1.averageMinutes
    }
  }
}
