import Foundation

public struct GigMoneyRange: Codable, Equatable, Sendable {
  public var lowerCents: Int, upperCents: Int
  public init(_ lower: Int, _ upper: Int) { lowerCents = lower; upperCents = upper }
  public var isPoint: Bool { lowerCents == upperCents }
}
public enum GigProfitOutcome: String, Codable, Sendable {
  case positiveMeetsTarget, positiveBelowTarget, estimatedLoss, insufficientInformation
}
public enum GigProfitIssue: String, Codable, Sendable {
  case unsupportedCurrency, invalidAmount, missingVehicleCost, missingMiles, missingWorkingTime
  case missingWait, missingAdditionalCosts, uncertainTips, uncertainMileage, uncertainTravelTime
  case unknownPayGuarantee, uncertainThreshold
}
public struct GigProfitProfile: Codable, Equatable, Sendable {
  public var vehicleCostCentsPerMile: Decimal?
  public var minimumNetHourlyCents: Int
  public var taxReserveBasisPoints: Int
  public init(vehicleCostCentsPerMile: Decimal?, minimumNetHourlyCents: Int, taxReserveBasisPoints: Int = 0) {
    self.vehicleCostCentsPerMile = vehicleCostCentsPerMile
    self.minimumNetHourlyCents = minimumNetHourlyCents; self.taxReserveBasisPoints = taxReserveBasisPoints
  }
}
public struct GigProfitAssessment: Codable, Equatable, Sendable {
  public var outcome: GigProfitOutcome
  public var vehicleCost: GigMoneyRange?, profitBeforeReserve: GigMoneyRange?
  public var reserve: GigMoneyRange?, availableCash: GigMoneyRange?, effectiveHourly: GigMoneyRange?
  public var totalMiles: GigNumericBounds?, workingMinutes: GigNumericBounds?
  public var issues: [GigProfitIssue]
  public init(outcome: GigProfitOutcome = .insufficientInformation, issues: [GigProfitIssue] = []) {
    self.outcome = outcome; self.issues = issues
  }
}

public enum GigMoneyMath {
  public static func roundedCents(_ value: Decimal, mode: NSDecimalNumber.RoundingMode = .plain) -> Int {
    var value = value, rounded = Decimal()
    NSDecimalRound(&rounded, &value, 0, mode)
    return NSDecimalNumber(decimal: rounded).intValue
  }
  public static func decimal(_ value: Double) -> Decimal? {
    value.isFinite ? Decimal(string: String(value), locale: Locale(identifier: "en_US_POSIX")) : nil
  }
  public static func vehicleCost(miles: Double, centsPerMile: Decimal) -> Int? {
    guard miles.isFinite, (0...10000).contains(miles), let distance = decimal(miles),
      NSDecimalNumber(decimal: centsPerMile).doubleValue.isFinite, centsPerMile >= 0, centsPerMile <= 10000 else { return nil }
    return roundedCents(distance * centsPerMile)
  }
  public static func reserve(profit: Int, basisPoints: Int) -> Int {
    roundedCents(Decimal(max(0, profit)) * Decimal(basisPoints) / 10000)
  }
}

public enum OfferProfitabilityEngine {
  public static func assess(_ offer: UniversalGigOffer, profile: GigProfitProfile) -> GigProfitAssessment {
    var result = GigProfitAssessment()
    guard offer.currency == "USD" else { result.issues = [.unsupportedCurrency]; return result }
    guard let quote = offer.payoutCents, (0...100_000_000).contains(quote),
      (0...10000).contains(profile.taxReserveBasisPoints), (1...1_000_000).contains(profile.minimumNetHourlyCents),
      [offer.confirmedTipCents, offer.unconfirmedTipCents, offer.guaranteedPayoutCents].compactMap({ $0 }).allSatisfy({ (0...100_000_000).contains($0) }) else {
      result.issues = [.invalidAmount]; return result
    }
    guard let rate = profile.vehicleCostCentsPerMile,
      GigMoneyMath.vehicleCost(miles: 1, centsPerMile: rate) != nil else { result.issues = [.missingVehicleCost]; return result }
    let miles: GigNumericBounds
    if let bounds = offer.uncertainty.totalMiles {
      guard bounds.valid, bounds.upper <= 10000 else { result.issues = [.missingMiles]; return result }
      miles = bounds
    }
    else if let pickup = offer.pickupMiles, let delivery = offer.deliveryMiles, let reposition = offer.repositionMiles,
      [pickup, delivery, reposition].allSatisfy({ $0.isFinite && (0...10000).contains($0) }), pickup + delivery + reposition <= 10000 {
      miles = GigNumericBounds(pickup + delivery + reposition, pickup + delivery + reposition)
    } else { result.issues = [.missingMiles]; return result }
    var minutes: GigNumericBounds
    if let bounds = offer.uncertainty.workingMinutes {
      guard bounds.valid else { result.issues = [.missingWorkingTime]; return result }
      minutes = bounds
    }
    else if let value = offer.estimatedMinutes, value.isFinite, (0...1440).contains(value), offer.durationCoverage != .unknown {
      minutes = GigNumericBounds(value, value)
    } else { result.issues = [.missingWorkingTime]; return result }
    // The explicit working-time range already includes every working minute.
    if offer.uncertainty.workingMinutes == nil && offer.durationCoverage != .allWorkingTime {
      let wait: GigNumericBounds
      if let bounds = offer.uncertainty.waitMinutes {
        guard bounds.valid, bounds.upper <= 240 else { result.issues = [.missingWait]; return result }
        wait = bounds
      }
      else if let value = offer.waitMinutes, value.isFinite, (0...240).contains(value) { wait = GigNumericBounds(value, value) }
      else { result.issues = [.missingWait]; return result }
      minutes.lower += wait.lower; minutes.upper += wait.upper
    }
    guard minutes.lower >= 1, minutes.upper <= 2880, minutes.valid else { result.issues = [.missingWorkingTime]; return result }
    guard let additional = offer.additionalCostsCents, (0...100_000_000).contains(additional) else {
      result.issues = [.missingAdditionalCosts]; return result
    }
    var lowerPay: Int, upperPay: Int
    let separateConfirmed = offer.tipTreatment == .separateFromQuote ? offer.confirmedTipCents ?? 0 : 0
    let separateUnconfirmed = offer.tipTreatment == .separateFromQuote ? offer.unconfirmedTipCents ?? 0 : 0
    if offer.tipTreatment == .includedInQuote,
      (offer.confirmedTipCents ?? 0) + (offer.unconfirmedTipCents ?? 0) > quote {
      result.issues = [.invalidAmount]; return result
    }
    if let guarantee = offer.guaranteedPayoutCents {
      guard guarantee <= quote else { result.issues = [.invalidAmount]; return result }
      lowerPay = guarantee + separateConfirmed
      upperPay = quote + separateConfirmed + separateUnconfirmed
    } else if offer.tipTreatment == .includedInQuote, let uncertainTip = offer.unconfirmedTipCents {
      guard uncertainTip <= quote else { result.issues = [.invalidAmount]; return result }
      lowerPay = quote - uncertainTip; upperPay = quote
    } else {
      // The quoted number may be conditional or contain an unconfirmed tip.
      // A zero lower bound is uncertainty, not an invented zero-dollar offer.
      lowerPay = separateConfirmed; upperPay = quote + separateConfirmed + separateUnconfirmed
      result.issues.append(.unknownPayGuarantee)
    }
    guard let costLow = GigMoneyMath.vehicleCost(miles: miles.lower, centsPerMile: rate),
      let costHigh = GigMoneyMath.vehicleCost(miles: miles.upper, centsPerMile: rate),
      let timeLow = GigMoneyMath.decimal(minutes.lower), let timeHigh = GigMoneyMath.decimal(minutes.upper) else {
      result.issues.append(.invalidAmount); return result
    }
    let profitLow = lowerPay - costHigh - additional, profitHigh = upperPay - costLow - additional
    let reserveLow = GigMoneyMath.reserve(profit: profitLow, basisPoints: profile.taxReserveBasisPoints)
    let reserveHigh = GigMoneyMath.reserve(profit: profitHigh, basisPoints: profile.taxReserveBasisPoints)
    let cashLow = profitLow - reserveLow, cashHigh = profitHigh - reserveHigh
    let hourly = [Decimal(cashLow) * 60 / timeLow, Decimal(cashLow) * 60 / timeHigh,
                  Decimal(cashHigh) * 60 / timeLow, Decimal(cashHigh) * 60 / timeHigh]
    let hourlyLow = GigMoneyMath.roundedCents(hourly.min()!, mode: .down)
    let hourlyHigh = GigMoneyMath.roundedCents(hourly.max()!, mode: .up)
    result.totalMiles = miles; result.workingMinutes = minutes
    result.vehicleCost = GigMoneyRange(costLow, costHigh)
    result.profitBeforeReserve = GigMoneyRange(profitLow, profitHigh)
    result.reserve = GigMoneyRange(reserveLow, reserveHigh); result.availableCash = GigMoneyRange(cashLow, cashHigh)
    result.effectiveHourly = GigMoneyRange(hourlyLow, hourlyHigh)
    if lowerPay != upperPay { result.issues.append(.uncertainTips) }
    if miles.lower != miles.upper { result.issues.append(.uncertainMileage) }
    if minutes.lower != minutes.upper { result.issues.append(.uncertainTravelTime) }
    if profitHigh <= 0 { result.outcome = .estimatedLoss }
    else if profitLow > 0, hourlyLow >= profile.minimumNetHourlyCents { result.outcome = .positiveMeetsTarget }
    else if profitLow > 0, hourlyHigh < profile.minimumNetHourlyCents { result.outcome = .positiveBelowTarget }
    else { result.outcome = .insufficientInformation; result.issues.append(.uncertainThreshold) }
    return result
  }
}
