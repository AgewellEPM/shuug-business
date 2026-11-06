import Foundation

public enum RideRole: String, Codable, CaseIterable, Identifiable, Sendable {
  case ride, delivery, reposition, other
  public var id: String { rawValue }
  public var label: String {
    switch self {
    case .ride: "Passenger ride"
    case .delivery: "Delivery"
    case .reposition: "Driving without a paid ride"
    case .other: "Other / review"
    }
  }
}

public struct DriverGoals: Codable, Equatable, Sendable {
  public var dailyNetCents: Int?
  public var weeklyNetCents: Int?
  public var targetHourlyCents: Int?
  // A user-supplied operating estimate, never a tax mileage rate.
  public var vehicleCostCentsPerMile: Double?
  public init(dailyNetCents: Int? = nil, weeklyNetCents: Int? = nil,
              targetHourlyCents: Int? = nil, vehicleCostCentsPerMile: Double? = nil) {
    self.dailyNetCents = dailyNetCents
    self.weeklyNetCents = weeklyNetCents
    self.targetHourlyCents = targetHourlyCents
    self.vehicleCostCentsPerMile = vehicleCostCentsPerMile
  }
}

public struct RideProfit: Identifiable, Sendable {
  public let id: UUID
  public let title: String
  public let date: String
  public let miles: Double
  public let minutes: Double
  public let earningsCents: Int?
  public let feesCents: Int
  public let estimatedVehicleCents: Int?
  public let estimatedNetCents: Int?
  public let needsMileageReview: Bool
  public let feesRecorded: Bool
  public let role: RideRole
  public let platform: String
  public let workArea: String
  public let startHour: Int
  public var hourlyCents: Double? {
    guard let net = estimatedNetCents, minutes >= 1 else { return nil }
    return Double(net) / (minutes / 60)
  }
  public var netCentsPerMile: Double? {
    guard let net = estimatedNetCents, miles > 0 else { return nil }
    return Double(net) / miles
  }
  public init?(record: DriverRecord, goals: DriverGoals) {
    guard !record.deleted, case .trip(let trip) = record.payload, let end = trip.endedAt else { return nil }
    id = record.id; title = record.title; date = trip.recordedDate
    miles = max(0, trip.distanceMeters / 1609.344)
    minutes = max(0, end.timeIntervalSince(trip.startedAt) / 60)
    earningsCents = trip.rideRole == .reposition ? 0 : trip.earningsCents
    feesCents = trip.platformFeesCents ?? 0
    feesRecorded = trip.platformFeesCents != nil || trip.rideRole == .reposition
    role = trip.rideRole ?? .other
    platform = trip.platform?.isEmpty == false ? trip.platform! : "Unspecified"
    workArea = trip.workArea?.isEmpty == false ? trip.workArea! : "Unspecified"
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = trip.recordedTimeZone
    startHour = calendar.component(.hour, from: trip.startedAt)
    needsMileageReview = trip.hasGaps
    if let cost = goals.vehicleCostCentsPerMile, cost.isFinite, (0...10_000).contains(cost) {
      estimatedVehicleCents = Int((miles * cost).rounded())
    } else { estimatedVehicleCents = nil }
    if let earnings = earningsCents, let cost = estimatedVehicleCents, feesRecorded {
      estimatedNetCents = earnings - feesCents - cost
    } else { estimatedNetCents = nil }
  }
}

public struct DrivingDay: Identifiable, Sendable {
  public var date: String
  public var incomeCents = 0, businessExpenseCents = 0, fuelCents = 0, rides = 0
  public var miles = 0.0, minutes = 0.0
  public var estimatedRideNetCents = 0, pricedRides = 0
  public var id: String { date }
  public init(date: String) { self.date = date }
  public var recordedCashFlowCents: Int { incomeCents - businessExpenseCents }
}

public struct DrivingInsights: Sendable {
  public let days: [DrivingDay]
  public let rides: [RideProfit]
  public let unreviewedExpenses: Int
  public let missingFareCount: Int
  public let unreviewedTrips: Int
  public init(records: [DriverRecord], goals: DriverGoals, from firstDay: String, through lastDay: String) {
    let selected = records.filter { !$0.deleted && $0.dateLabel >= firstDay && $0.dateLabel <= lastDay }
    var daily: [String: DrivingDay] = [:]
    var review = 0, tripReview = 0
    var profits: [RideProfit] = []
    for record in selected {
      var day = daily[record.dateLabel] ?? DrivingDay(date: record.dateLabel)
      switch record.payload {
      case .income(let income): day.incomeCents += income.amountCents
      case .expense(let expense):
        if expense.classification == .unclassified { review += 1 }
        if expense.classification == .business {
          let share = min(100, max(0, expense.businessUsePercent ?? 100))
          let cost = Int((Double(expense.amountCents) * Double(share) / 100).rounded())
          day.businessExpenseCents += cost
          if [.fuel, .evCharging].contains(expense.category) { day.fuelCents += cost }
        }
      case .trip(let trip):
        if trip.classification == .unclassified { tripReview += 1 }
        if trip.classification == .business, let profit = RideProfit(record: record, goals: goals) {
          profits.append(profit)
          day.rides += 1; day.miles += profit.miles; day.minutes += profit.minutes
          if let net = profit.estimatedNetCents { day.estimatedRideNetCents += net; day.pricedRides += 1 }
        }
      }
      daily[day.date] = day
    }
    days = daily.values.sorted { $0.date < $1.date }
    rides = profits.sorted { $0.date > $1.date }
    unreviewedExpenses = review
    unreviewedTrips = tripReview
    missingFareCount = profits.filter { $0.earningsCents == nil }.count
  }
}
