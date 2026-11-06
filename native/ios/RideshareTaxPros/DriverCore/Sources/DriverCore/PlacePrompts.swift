import Foundation

public struct AssistanceSettings: Codable, Equatable, Sendable {
  public var automaticDrives = false
  public var placeReminders = false
  public init() {}
}

public struct ExpensePrompt: Codable, Identifiable, Equatable, Sendable {
  public var id: UUID
  public var placeId: String, merchant: String, address: String
  public var category: ExpenseCategory, detectedAt: Date
  public var dismissed: Bool
  public init(id: UUID = UUID(), placeId: String, merchant: String, address: String,
              category: ExpenseCategory, detectedAt: Date = Date(), dismissed: Bool = false) {
    self.id = id; self.placeId = placeId; self.merchant = merchant; self.address = address
    self.category = category; self.detectedAt = detectedAt; self.dismissed = dismissed
  }
}

public struct PlaceCandidate: Sendable {
  public var id: String, name: String, address: String, category: ExpenseCategory
  public var distanceMeters: Double
  public init(id: String, name: String, address: String, category: ExpenseCategory, distanceMeters: Double) {
    self.id = id; self.name = name; self.address = address
    self.category = category; self.distanceMeters = distanceMeters
  }
}

public enum PlaceReminderPolicy {
  public static func choose(_ places: [PlaceCandidate], history: [ExpensePrompt], now: Date = Date()) -> PlaceCandidate? {
    let recent = history.filter { now.timeIntervalSince($0.detectedAt) < 24 * 3600 }
    guard recent.count < 6,
          !recent.contains(where: { now.timeIntervalSince($0.detectedAt) < 10 * 60 }) else { return nil }
    return places.filter { place in
      place.distanceMeters.isFinite && (0...90).contains(place.distanceMeters) && !place.name.isEmpty
      && !recent.contains { $0.placeId == place.id && now.timeIntervalSince($0.detectedAt) < 6 * 3600 }
    }.min { $0.distanceMeters < $1.distanceMeters }
  }
}

public struct MovementDecision: Sendable {
  public var beganDriving = false, arrivedAtStop = false, parkedLongEnough = false
}

/// Hysteresis keeps a traffic light, GPS jitter or a drive-by from becoming a visit.
public struct MovementWindow: Sendable {
  private var last: LocationFix?, anchor: LocationFix?, movingSince: Date?, stoppedSince: Date?
  private var movingMeters = 0.0, announcedDrive = false, announcedStop = false, announcedPark = false
  public init() {}
  /// The caller can decline a tentative start (for example, motion still says
  /// walking). Keep watching so a later automotive update can start the drive.
  public mutating func reconsiderDrivingStart() { announcedDrive = false }
  public mutating func observe(_ fix: LocationFix, speed reportedSpeed: Double, now: Date = Date()) -> MovementDecision {
    var decision = MovementDecision()
    guard fix.accuracy >= 0, fix.accuracy <= 50,
          (-90...90).contains(fix.latitude), (-180...180).contains(fix.longitude),
          abs(now.timeIntervalSince(fix.timestamp)) <= 30,
          last.map({ fix.timestamp > $0.timestamp }) ?? true else { return decision }
    let previous = last
    let elapsed = previous.map { fix.timestamp.timeIntervalSince($0.timestamp) } ?? 0
    let gap = elapsed > 90
    let moved = gap ? 0 : (previous.map { Self.distance($0, fix) } ?? 0)
    let speed = reportedSpeed >= 0 ? reportedSpeed : (elapsed > 0 ? moved / elapsed : 0)
    guard speed.isFinite, speed < 65, elapsed <= 0 || moved / elapsed < 65 else { return decision }
    last = fix
    if gap {
      movingSince = nil; stoppedSince = nil; movingMeters = 0; anchor = nil
      announcedDrive = false; announcedStop = false; announcedPark = false
    }
    if speed >= 3.5 {
      movingSince = movingSince ?? fix.timestamp
      movingMeters += moved
      stoppedSince = nil; anchor = nil; announcedStop = false; announcedPark = false
      if !announcedDrive, fix.timestamp.timeIntervalSince(movingSince!) >= 45, movingMeters >= 120 {
        decision.beganDriving = true; announcedDrive = true
      }
    } else if speed <= 1.4 {
      movingSince = nil; movingMeters = 0
      if anchor == nil || Self.distance(anchor!, fix) > 70 {
        anchor = fix; stoppedSince = fix.timestamp; announcedStop = false; announcedPark = false
      }
      let stoppedFor = fix.timestamp.timeIntervalSince(stoppedSince ?? fix.timestamp)
      if stoppedFor >= 90, !announcedStop { decision.arrivedAtStop = true; announcedStop = true }
      if stoppedFor >= 300, !announcedPark {
        decision.parkedLongEnough = true; announcedPark = true; announcedDrive = false
      }
    } else {
      movingSince = nil; movingMeters = 0; stoppedSince = nil; anchor = nil
    }
    return decision
  }
  private static func distance(_ a: LocationFix, _ b: LocationFix) -> Double {
    let p = Double.pi / 180, dLat = (b.latitude-a.latitude)*p, dLon = (b.longitude-a.longitude)*p
    let h = pow(sin(dLat/2), 2) + cos(a.latitude*p)*cos(b.latitude*p)*pow(sin(dLon/2), 2)
    return 6_371_000 * 2 * asin(sqrt(min(1, max(0, h))))
  }
}
