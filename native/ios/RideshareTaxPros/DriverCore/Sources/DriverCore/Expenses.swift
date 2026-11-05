import Foundation

public enum ExpenseGroup: String, CaseIterable, Identifiable, Sendable {
  case vehicle = "Vehicle"
  case travel = "Trips & travel"
  case business = "Business"
  public var id: String { rawValue }
}
public enum ExpenseCategory: String, Codable, CaseIterable, Identifiable, Sendable {
  case fuel, repairs, maintenance, tires, insurance, registration
  case evCharging = "ev_charging"
  case cleaning, rental, lease, interest
  case tolls, parking, meals, lodging, amenities
  case supplies, phone, fees, subscriptions, training, professional, other
  public var id: String { rawValue }
  public var label: String {
    switch self {
    case .fuel: "Fuel"
    case .evCharging: "EV charging"
    case .repairs: "Vehicle repairs"
    case .maintenance: "Maintenance & oil"
    case .tires: "Tires"
    case .cleaning: "Car wash & cleaning"
    case .insurance: "Vehicle insurance"
    case .registration: "Registration & inspections"
    case .rental: "Vehicle rental"
    case .lease: "Vehicle lease"
    case .interest: "Vehicle interest"
    case .tolls: "Tolls"
    case .parking: "Parking"
    case .meals: "Meals & food"
    case .lodging: "Lodging"
    case .amenities: "Rider snacks & amenities"
    case .supplies: "Supplies & equipment"
    case .phone: "Phone & data"
    case .fees: "Platform & payment fees"
    case .subscriptions: "Apps & subscriptions"
    case .training: "Training & licenses"
    case .professional: "Tax & professional fees"
    case .other: "Other"
    }
  }
  public var group: ExpenseGroup {
    switch self {
    case .fuel, .evCharging, .repairs, .maintenance, .tires, .cleaning, .insurance, .registration,
      .rental, .lease, .interest:
      .vehicle
    case .tolls, .parking, .meals, .lodging, .amenities: .travel
    default: .business
    }
  }
}
public enum ExpensePayment: String, Codable, CaseIterable, Identifiable, Sendable {
  case cash, card, bank, platform, other
  public var id: String { rawValue }
  public var label: String {
    switch self {
    case .cash: "Cash"
    case .card: "Card"
    case .bank: "Bank transfer"
    case .platform: "Deducted from payout"
    case .other: "Other"
    }
  }
}
public struct Expense: Codable, Equatable, Sendable {
  public var date: String, merchant: String, category: ExpenseCategory, amountCents: Int,
    currency: String
  public var classification: TripClassification, notes: String, receiptId: UUID?
  // Optional fields keep existing saved journals and earlier API payloads readable.
  public var businessPurpose: String?, businessUsePercent: Int?, mealContext: String?
  public var vehicle: String?, odometerMiles: Double?, paymentMethod: ExpensePayment?,
    place: String?
  public init(
    date: String, merchant: String, category: ExpenseCategory, amountCents: Int,
    classification: TripClassification = .unclassified, notes: String = "", receiptId: UUID? = nil,
    businessPurpose: String? = nil, businessUsePercent: Int? = nil, mealContext: String? = nil,
    vehicle: String? = nil, odometerMiles: Double? = nil, paymentMethod: ExpensePayment? = nil,
    place: String? = nil
  ) {
    self.date = date
    self.merchant = merchant
    self.category = category
    self.amountCents = amountCents
    self.currency = "USD"
    self.classification = classification
    self.notes = notes
    self.receiptId = receiptId
    self.businessPurpose = businessPurpose
    self.businessUsePercent = businessUsePercent
    self.mealContext = mealContext
    self.vehicle = vehicle
    self.odometerMiles = odometerMiles
    self.paymentMethod = paymentMethod
    self.place = place
  }
  public var reviewNotes: [String] {
    guard classification != .personal else { return [] }
    var result: [String] = []
    if classification == .unclassified { result.append("Choose business or personal") }
    if receiptId == nil { result.append("Attach supporting receipt if available") }
    if classification == .business
      && (businessPurpose ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      result.append("Add the business purpose")
    }
    if classification == .business && category == .meals
      && (mealContext ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      result.append("Add meal participants or travel context")
    }
    if classification == .business && businessUsePercent == 0 {
      result.append("Review the zero business-use percentage")
    }
    return result
  }
}

public enum ExpensePeriod: String, CaseIterable, Identifiable {
  case month = "This month"
  case year = "This year"
  case all = "All dates"
  public var id: String { rawValue }
}
public struct ExpenseSummary {
  public let records: [DriverRecord]
  public let totalCents: Int
  public let categoryTotals: [(category: ExpenseCategory, cents: Int)]
  public let needsReview: [DriverRecord]
  public init(records: [DriverRecord], period: ExpensePeriod, now: Date = Date()) {
    let today = DriverRecord.day(now)
    let filtered = records.filter { record in
      guard !record.deleted, case .expense(let expense) = record.payload else { return false }
      switch period {
      case .month: return expense.date.hasPrefix(String(today.prefix(7)))
      case .year: return expense.date.hasPrefix(String(today.prefix(4)))
      case .all: return true
      }
    }
    self.records = filtered
    var totals: [ExpenseCategory: Int] = [:]
    for record in filtered {
      if case .expense(let expense) = record.payload {
        totals[expense.category, default: 0] += expense.amountCents
      }
    }
    self.totalCents = totals.values.reduce(0, +)
    self.categoryTotals = totals.map { (category: $0.key, cents: $0.value) }.sorted {
      $0.cents == $1.cents ? $0.category.label < $1.category.label : $0.cents > $1.cents
    }
    self.needsReview = filtered.filter {
      if case .expense(let expense) = $0.payload { return !expense.reviewNotes.isEmpty }
      return false
    }
  }
  public static func hasPossibleDuplicate(
    _ expense: Expense, records: [DriverRecord], excluding id: UUID? = nil
  ) -> Bool {
    func merchant(_ text: String) -> String {
      text.trimmingCharacters(in: .whitespacesAndNewlines).folding(
        options: [.caseInsensitive, .diacriticInsensitive],
        locale: Locale(identifier: "en_US_POSIX"))
    }
    return records.contains { record in
      guard !record.deleted, record.id != id, case .expense(let other) = record.payload else {
        return false
      }
      return other.date == expense.date && other.amountCents == expense.amountCents
        && other.currency == expense.currency
        && merchant(other.merchant) == merchant(expense.merchant)
    }
  }
}
