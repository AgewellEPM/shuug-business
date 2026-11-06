import Foundation

/// Road routes are estimates at query time, not a prediction of a completed gig.
public struct DestinationRouteComparison: Sendable {
  public let distanceChangeMeters: Double, extraTravelSeconds: Double
  public let deadlineBufferSeconds: Double?
  public init?(directMeters: Double, directSeconds: Double, toDropoffMeters: Double,
               toDropoffSeconds: Double, onwardMeters: Double, onwardSeconds: Double,
               waitSeconds: Double?, deadline: Date?, now: Date) {
    let values = [directMeters, directSeconds, toDropoffMeters, toDropoffSeconds, onwardMeters, onwardSeconds]
    guard values.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 100_000_000 }),
      waitSeconds.map({ $0.isFinite && (0...14_400).contains($0) }) ?? true else { return nil }
    distanceChangeMeters = directMeters - onwardMeters
    extraTravelSeconds = toDropoffSeconds + onwardSeconds - directSeconds
    if let deadline, let waitSeconds {
      deadlineBufferSeconds = deadline.timeIntervalSince(now) - toDropoffSeconds - onwardSeconds - waitSeconds
    } else { deadlineBufferSeconds = nil }
  }
}

public struct ReserveSettings: Codable, Sendable, Equatable {
  public var taxPercent: Double, vehiclePercent: Double
  public init(taxPercent: Double, vehiclePercent: Double) { self.taxPercent = taxPercent; self.vehiclePercent = vehiclePercent }
}

public struct MissionOffer: Codable, Identifiable, Sendable {
  public var id: UUID = UUID()
  public var label: String, direction: String
  public var payoutCents: Int, feesCents: Int
  public var miles: Double, minutes: Double, waitMinutes: Double, homeMinutes: Double?
  public init(label: String, direction: String, payoutCents: Int, feesCents: Int, miles: Double, minutes: Double, waitMinutes: Double, homeMinutes: Double?) {
    self.label = label; self.direction = direction; self.payoutCents = payoutCents; self.feesCents = feesCents
    self.miles = miles; self.minutes = minutes; self.waitMinutes = waitMinutes; self.homeMinutes = homeMinutes
  }
  public func estimate(goals: DriverGoals, deadline: Date?, now: Date = Date()) -> OfferEstimate? {
    OfferEstimate(payoutCents: payoutCents, feesCents: feesCents, miles: miles, minutes: minutes,
      waitMinutes: waitMinutes, homeMinutes: homeMinutes, vehicleCostCentsPerMile: goals.vehicleCostCentsPerMile,
      hourlyTargetCents: goals.targetHourlyCents, deadline: deadline, now: now)
  }
}

/// Local planning data. An entered destination is never sent to the firm.
public struct ShiftMission: Codable, Sendable, Equatable {
  public var startedAt: Date, deadline: Date, targetCents: Int, destination: String
  public init(startedAt: Date = Date(), deadline: Date, targetCents: Int, destination: String) {
    self.startedAt = startedAt; self.deadline = deadline; self.targetCents = targetCents; self.destination = destination
  }
  public func progress(records: [DriverRecord], goals: DriverGoals, now: Date = Date()) -> MissionProgress {
    var net = 0, missing = 0, deadMiles = 0.0
    for record in records where !record.deleted {
      guard case .trip(let trip) = record.payload, trip.classification == .business,
        let end = trip.endedAt, trip.startedAt >= startedAt, end <= min(now, deadline),
        let profit = RideProfit(record: record, goals: goals) else { continue }
      if let amount = profit.estimatedNetCents { net += amount } else { missing += 1 }
      if trip.rideRole == .reposition { deadMiles += profit.miles }
    }
    return MissionProgress(netCents: net, missingCount: missing, unpaidMiles: deadMiles)
  }
}
public struct MissionProgress: Sendable {
  public let netCents: Int, missingCount: Int, unpaidMiles: Double
}
public struct PickupWait: Codable, Identifiable, Sendable, Equatable {
  public var id: UUID, name: String, minutes: Double, date: Date
  public init(id: UUID = UUID(), name: String, minutes: Double, date: Date = Date()) {
    self.id = id; self.name = name; self.minutes = minutes; self.date = date
  }
  public static func average(_ name: String, in samples: [PickupWait]) -> (minutes: Double, count: Int)? {
    let key = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !key.isEmpty else { return nil }
    let matches = samples.filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == key && $0.minutes.isFinite && (0...240).contains($0.minutes) }
    guard !matches.isEmpty else { return nil }
    return (matches.map(\.minutes).reduce(0, +) / Double(matches.count), matches.count)
  }
}
public struct OfferEstimate: Sendable {
  public let netCents: Int, minimumCents: Int, hourlyCents: Double, meetsGoal: Bool, deadlineMinutesRemaining: Double?
  /// Miles include pickup, job and any additional unpaid travel; no live marketplace data is assumed.
  public init?(payoutCents: Int, feesCents: Int, miles: Double, minutes: Double,
               waitMinutes: Double, homeMinutes: Double?, vehicleCostCentsPerMile: Double?,
               hourlyTargetCents: Int?, deadline: Date?, now: Date = Date()) {
    guard (0...100_000_000).contains(payoutCents), (0...100_000_000).contains(feesCents),
      miles.isFinite, (0...10_000).contains(miles), minutes.isFinite, (1...1440).contains(minutes),
      waitMinutes.isFinite, (0...240).contains(waitMinutes),
      let rate = vehicleCostCentsPerMile, rate.isFinite, (0...10_000).contains(rate),
      let target = hourlyTargetCents, (1...1_000_000).contains(target),
      homeMinutes.map({ $0.isFinite && (0...1440).contains($0) }) ?? true else { return nil }
    let totalMinutes = minutes + waitMinutes
    let cost = Int((miles * rate).rounded())
    netCents = payoutCents - feesCents - cost
    minimumCents = Int((Double(target) * totalMinutes / 60).rounded(.up)) + feesCents + cost
    hourlyCents = Double(netCents) * 60 / totalMinutes
    meetsGoal = payoutCents >= minimumCents
    if let deadline, let homeMinutes { deadlineMinutesRemaining = deadline.timeIntervalSince(now) / 60 - totalMinutes - homeMinutes }
    else { deadlineMinutesRemaining = nil }
  }
}
