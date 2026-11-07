import Foundation

public enum GigRoadSource: String, Codable, Sendable { case appleMaps, driverEstimate, simulation }
public struct GigRoadLeg: Codable, Sendable {
  public var miles: GigNumericBounds, minutes: GigNumericBounds, measuredAt: Date, source: GigRoadSource
  public init(miles: GigNumericBounds, minutes: GigNumericBounds, measuredAt: Date, source: GigRoadSource) {
    self.miles = miles; self.minutes = minutes; self.measuredAt = measuredAt; self.source = source
  }
  public var valid: Bool { miles.valid && miles.upper <= 10000 && minutes.valid && minutes.upper <= 1440 }
}
public struct GigDestinationRoutePlan: Codable, Sendable {
  public var offerId: UUID, destination: GigOfferLocation, originCapturedAt: Date
  public var direct: GigRoadLeg, toPickup: GigRoadLeg, delivery: GigRoadLeg, onward: GigRoadLeg
  public var reposition: GigRoadLeg?
  public init(offerId: UUID, destination: GigOfferLocation, originCapturedAt: Date, direct: GigRoadLeg,
    toPickup: GigRoadLeg, delivery: GigRoadLeg, onward: GigRoadLeg, reposition: GigRoadLeg? = nil) {
    self.offerId = offerId; self.destination = destination; self.originCapturedAt = originCapturedAt
    self.direct = direct; self.toPickup = toPickup; self.delivery = delivery; self.onward = onward; self.reposition = reposition
  }
}
public enum GigRiskTolerance: String, Codable, CaseIterable, Sendable { case conservative, balanced }
public struct GigDestinationPreferences: Codable, Sendable {
  public var destination: GigOfferLocation, arrivalDeadline: Date
  public var maximumAdditionalMiles: Double?, maximumAdditionalMinutes: Double?
  public var preferredPlatforms: [GigPlatform], riskTolerance: GigRiskTolerance
  public init(destination: GigOfferLocation, arrivalDeadline: Date, maximumAdditionalMiles: Double? = nil,
    maximumAdditionalMinutes: Double? = nil, preferredPlatforms: [GigPlatform] = GigPlatform.allCases,
    riskTolerance: GigRiskTolerance = .conservative) {
    self.destination = destination; self.arrivalDeadline = arrivalDeadline
    self.maximumAdditionalMiles = maximumAdditionalMiles; self.maximumAdditionalMinutes = maximumAdditionalMinutes
    self.preferredPlatforms = preferredPlatforms; self.riskTolerance = riskTolerance
  }
}
public struct GigSignedBounds: Codable, Equatable, Sendable {
  public var lower: Double, upper: Double
  public init(_ lower: Double, _ upper: Double) { self.lower = lower; self.upper = upper }
}
public enum GigJourneyOutcome: String, Codable, Sendable {
  case aligned, profitableTradeoff, hardDeadlineConflict, excessiveTravel, belowEarningsTarget, insufficientInformation
}
public struct GigDestinationAssessment: Codable, Sendable {
  public var outcome: GigJourneyOutcome = .insufficientInformation
  public var routeProfit: GigProfitAssessment?
  public var incrementalProfitBeforeReserve: GigMoneyRange?, incrementalAvailableCash: GigMoneyRange?
  public var additionalMiles: GigSignedBounds?, additionalMinutes: GigSignedBounds?, homeProgressMiles: GigSignedBounds?
  public var earliestArrival: Date?, latestArrival: Date?, remainingMinutes: Double?
  public var reasons: [String] = []
  public init() {}
}

public enum DestinationOptimizer {
  public static func evaluate(_ offer: UniversalGigOffer, plan: GigDestinationRoutePlan?,
    preferences: GigDestinationPreferences?, profile: GigProfitProfile, now: Date = Date()) -> GigDestinationAssessment {
    var result = GigDestinationAssessment()
    guard let plan, let preferences, plan.offerId == offer.id, offer.validForComparison(now: now),
      preferences.preferredPlatforms.contains(offer.platform),
      preferences.destination.hasCoordinate, plan.destination.hasCoordinate,
      let desiredLat = preferences.destination.latitude, let desiredLon = preferences.destination.longitude,
      let planLat = plan.destination.latitude, let planLon = plan.destination.longitude,
      PositionPoint(desiredLat, desiredLon).meters(to: PositionPoint(planLat, planLon)) <= 200 else {
      result.reasons = ["Missing current offer, matching destination or platform preference."]; return result
    }
    let legs = [plan.direct, plan.toPickup, plan.delivery, plan.onward] + (plan.reposition.map { [$0] } ?? [])
    guard legs.allSatisfy({ $0.valid && (0...300).contains(now.timeIntervalSince($0.measuredAt)) }),
      (0...120).contains(now.timeIntervalSince(plan.originCapturedAt)),
      offer.source == .simulation || !legs.contains(where: { $0.source == .simulation }) else {
      result.reasons = ["Route estimates are incomplete, stale or belong to a simulation."]; return result
    }
    for limit in [preferences.maximumAdditionalMiles, preferences.maximumAdditionalMinutes].compactMap({ $0 }) {
      guard limit.isFinite && limit >= 0 && limit <= 10000 else { result.reasons = ["Invalid additional-travel limit."]; return result }
    }
    guard plan.reposition != nil || offer.repositionMiles == 0 else {
      result.reasons = ["Necessary repositioning is unknown."]; return result
    }
    let repositionMiles = plan.reposition?.miles ?? GigNumericBounds(0, 0)
    let repositionMinutes = plan.reposition?.minutes ?? GigNumericBounds(0, 0)
    let travel = GigNumericBounds(plan.toPickup.minutes.lower + plan.delivery.minutes.lower + repositionMinutes.lower,
      plan.toPickup.minutes.upper + plan.delivery.minutes.upper + repositionMinutes.upper)
    var working = travel
    let waiting = offer.uncertainty.waitMinutes ?? offer.waitMinutes.map { GigNumericBounds($0, $0) }
    if let waiting {
      guard waiting.valid, waiting.upper <= 240 else { result.reasons = ["Invalid waiting-time range."]; return result }
      working.lower += waiting.lower; working.upper += waiting.upper
    }
    let allWork = offer.uncertainty.workingMinutes ?? (offer.durationCoverage == .allWorkingTime
      ? offer.estimatedMinutes.map { GigNumericBounds($0, $0) } : nil)
    if let allWork {
      guard allWork.valid, allWork.lower >= 1, allWork.upper <= 2880 else { result.reasons = ["Invalid working-time range."]; return result }
      working = GigNumericBounds(max(working.lower, allWork.lower), max(working.upper, allWork.upper))
    } else if waiting == nil { result.reasons = ["Waiting time is unknown."]; return result }
    var routedOffer = offer
    routedOffer.uncertainty.totalMiles = GigNumericBounds(plan.toPickup.miles.lower + plan.delivery.miles.lower + repositionMiles.lower,
      plan.toPickup.miles.upper + plan.delivery.miles.upper + repositionMiles.upper)
    routedOffer.uncertainty.workingMinutes = working; routedOffer.durationCoverage = .allWorkingTime
    let profit = OfferProfitabilityEngine.assess(routedOffer, profile: profile)
    result.routeProfit = profit
    let totalMinutes = GigNumericBounds(working.lower + plan.onward.minutes.lower, working.upper + plan.onward.minutes.upper)
    let totalMiles = GigNumericBounds(routedOffer.uncertainty.totalMiles!.lower + plan.onward.miles.lower,
      routedOffer.uncertainty.totalMiles!.upper + plan.onward.miles.upper)
    let extraMinutes = GigSignedBounds(totalMinutes.lower - plan.direct.minutes.upper, totalMinutes.upper - plan.direct.minutes.lower)
    let extraMiles = GigSignedBounds(totalMiles.lower - plan.direct.miles.upper, totalMiles.upper - plan.direct.miles.lower)
    result.additionalMinutes = extraMinutes; result.additionalMiles = extraMiles
    result.homeProgressMiles = GigSignedBounds(plan.direct.miles.lower - plan.onward.miles.upper,
      plan.direct.miles.upper - plan.onward.miles.lower)
    result.earliestArrival = now.addingTimeInterval(totalMinutes.lower * 60)
    let latest = now.addingTimeInterval(totalMinutes.upper * 60); result.latestArrival = latest
    result.remainingMinutes = preferences.arrivalDeadline.timeIntervalSince(latest) / 60
    // These checks always use the upper bound, including in balanced mode.
    guard latest <= preferences.arrivalDeadline else {
      result.outcome = .hardDeadlineConflict; result.reasons = ["The full job plus onward travel exceeds the required arrival time."]; return result
    }
    guard preferences.maximumAdditionalMiles.map({ extraMiles.upper <= $0 }) ?? true,
      preferences.maximumAdditionalMinutes.map({ extraMinutes.upper <= $0 }) ?? true else {
      result.outcome = .excessiveTravel; result.reasons = ["Additional travel exceeds the driver's limit."]; return result
    }
    guard let rate = profile.vehicleCostCentsPerMile, let base = profit.profitBeforeReserve,
      let homeLow = GigMoneyMath.vehicleCost(miles: plan.onward.miles.lower, centsPerMile: rate),
      let homeHigh = GigMoneyMath.vehicleCost(miles: plan.onward.miles.upper, centsPerMile: rate),
      let directLow = GigMoneyMath.vehicleCost(miles: plan.direct.miles.lower, centsPerMile: rate),
      let directHigh = GigMoneyMath.vehicleCost(miles: plan.direct.miles.upper, centsPerMile: rate) else {
      result.reasons = ["Complete cost inputs are required."]; return result
    }
    let incrementalLow = base.lowerCents - (homeHigh - directLow)
    let incrementalHigh = base.upperCents - (homeLow - directHigh)
    result.incrementalProfitBeforeReserve = GigMoneyRange(incrementalLow, incrementalHigh)
    result.incrementalAvailableCash = GigMoneyRange(incrementalLow - GigMoneyMath.reserve(profit: incrementalLow, basisPoints: profile.taxReserveBasisPoints),
      incrementalHigh - GigMoneyMath.reserve(profit: incrementalHigh, basisPoints: profile.taxReserveBasisPoints))
    guard profit.outcome == .positiveMeetsTarget, incrementalLow > 0 else {
      result.outcome = profit.outcome == .insufficientInformation ? .insufficientInformation : .belowEarningsTarget
      result.reasons = ["The job does not conservatively meet the earnings target and improve net cash versus going directly."]; return result
    }
    let spread = working.upper - working.lower
    if preferences.riskTolerance == .conservative, spread > max(10, working.lower * 0.5) {
      result.reasons = ["Travel/wait uncertainty exceeds the conservative setting."]; return result
    }
    if result.homeProgressMiles!.lower >= 0 {
      result.outcome = .aligned; result.reasons = ["Meets the pay target, stays within the deadline and ends at least as close by road."]
    } else {
      result.outcome = .profitableTradeoff; result.reasons = ["Profitable within the entered limits, but the drop-off may be farther from the destination."]
    }
    return result
  }
}
