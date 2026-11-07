import Foundation

public enum GigCommitmentState: String, Codable, Sendable { case accepted, inProgress, completed, canceled }
public struct GigConfirmedWork: Codable, Identifiable, Sendable {
  public var id: UUID, offerId: UUID, platform: GigPlatform, state: GigCommitmentState
  public var startsAt: Date, expectedEnd: Date?
  public var verification: String
  public init(offerId: UUID, platform: GigPlatform, startsAt: Date, expectedEnd: Date?, verification: String) {
    id = UUID(); self.offerId = offerId; self.platform = platform; state = .accepted
    self.startsAt = startsAt; self.expectedEnd = expectedEnd; self.verification = verification
  }
}
public enum GigRecommendationKind: String, Codable, Sendable {
  case recommended, tradeoff, needsReview, skip
}
public struct GigDispatchRecommendation: Identifiable, Sendable {
  public let offer: UniversalGigOffer, financial: GigProfitAssessment, destination: GigDestinationAssessment
  public var kind: GigRecommendationKind, reasons: [String]
  public var id: UUID { offer.id }
}
public enum DispatchPlanner {
  public static func rank(_ offers: [UniversalGigOffer], profile: GigProfitProfile,
    preferences: GigDestinationPreferences?, routes: [UUID: GigDestinationRoutePlan],
    commitments: [GigConfirmedWork] = [], now: Date = Date()) -> [GigDispatchRecommendation] {
    offers.map { offer in
      let journey = DestinationOptimizer.evaluate(offer, plan: routes[offer.id], preferences: preferences, profile: profile, now: now)
      let financial = journey.routeProfit ?? OfferProfitabilityEngine.assess(offer, profile: profile)
      var row = GigDispatchRecommendation(offer: offer, financial: financial, destination: journey,
        kind: .needsReview, reasons: [])
      guard offer.validForComparison(now: now) else { row.kind = .skip; row.reasons = ["Observation is stale, expired or withdrawn."]; return row }
      guard financial.outcome != .estimatedLoss else { row.kind = .skip; row.reasons = ["Estimated operating loss or break-even result."]; return row }
      guard !commitments.contains(where: { $0.offerId == offer.id && [.accepted, .inProgress, .completed].contains($0.state) }) else {
        row.kind = .skip; row.reasons = ["This offer is already recorded as accepted or completed."]; return row
      }
      let candidateEnd = journey.latestArrival
      let overlapping = commitments.contains { work in
        guard [.accepted, .inProgress].contains(work.state), work.offerId != offer.id else { return false }
        // An estimated end time does not establish completion. Keep current
        // work reserved until the driver or an authorized provider closes it.
        if work.startsAt <= now { return true }
        guard let end = work.expectedEnd, let candidateEnd else { return true }
        return work.startsAt < candidateEnd && end > now
      }
      guard !overlapping else { row.kind = .skip; row.reasons = ["Conflicts with accepted work. Simultaneous jobs are not assumed."]; return row }
      if [.hardDeadlineConflict, .excessiveTravel, .belowEarningsTarget].contains(journey.outcome) {
        row.kind = .skip; row.reasons = journey.reasons; return row
      }
      if let plan = routes[offer.id] {
        if let window = offer.pickupWindow {
          let earliest = now.addingTimeInterval(plan.toPickup.minutes.lower * 60)
          let latest = now.addingTimeInterval(plan.toPickup.minutes.upper * 60)
          guard window.valid, earliest >= window.startsAt, latest <= window.endsAt else {
            row.kind = .skip; row.reasons = ["Pickup-window conflict or unaccounted waiting before pickup."]; return row
          }
        }
        if let window = offer.deliveryWindow, let working = journey.routeProfit?.workingMinutes {
          let earliest = now.addingTimeInterval(working.lower * 60), latest = now.addingTimeInterval(working.upper * 60)
          guard window.valid, earliest >= window.startsAt, latest <= window.endsAt else {
            row.kind = .skip; row.reasons = ["Delivery window cannot be met with the entered route and waiting estimates."]; return row
          }
        }
      }
      guard offer.source == .simulation || offer.availabilityStatus == .providerVerified || offer.driverConfirmedFields else {
        row.reasons = ["Recheck the offer and extracted fields in its original app. A screenshot is not live availability."]; return row
      }
      switch journey.outcome {
      case .aligned: row.kind = .recommended
      case .profitableTradeoff: row.kind = .tradeoff
      case .hardDeadlineConflict, .excessiveTravel, .belowEarningsTarget: row.kind = .skip
      case .insufficientInformation: row.kind = .needsReview
      }
      row.reasons = journey.reasons
      return row
    }.sorted { lhs, rhs in
      func priority(_ value: GigRecommendationKind) -> Int {
        switch value { case .recommended: 0; case .tradeoff: 1; case .needsReview: 2; case .skip: 3 }
      }
      if priority(lhs.kind) != priority(rhs.kind) { return priority(lhs.kind) < priority(rhs.kind) }
      let a = lhs.destination.incrementalAvailableCash?.lowerCents ?? Int.min
      let b = rhs.destination.incrementalAvailableCash?.lowerCents ?? Int.min
      if a != b { return a > b }
      let ah = lhs.financial.effectiveHourly?.lowerCents ?? Int.min, bh = rhs.financial.effectiveHourly?.lowerCents ?? Int.min
      if ah != bh { return ah > bh }
      return lhs.offer.id.uuidString < rhs.offer.id.uuidString
    }
  }
}

public enum GigDriverChoice: String, Codable, Sendable {
  case consider, skipAdvice, acceptedInProvider, declinedInProvider, started, completed, canceled
}
public struct GigDriverDecision: Codable, Identifiable, Sendable {
  public var id: UUID, offerId: UUID, platform: GigPlatform, choice: GigDriverChoice, recordedAt: Date
  public var source: GigOfferSource
  public init(offer: UniversalGigOffer, choice: GigDriverChoice, at: Date = Date()) {
    id = UUID(); offerId = offer.id; platform = offer.platform; self.choice = choice; recordedAt = at; source = offer.source
  }
}
public enum DriverDecisionService {
  public static func record(_ choice: GigDriverChoice, offer: UniversalGigOffer,
    existing: [GigDriverDecision], now: Date = Date()) -> [GigDriverDecision] {
    if existing.contains(where: { $0.offerId == offer.id && $0.choice == choice }) { return existing }
    return Array((existing + [GigDriverDecision(offer: offer, choice: choice, at: now)]).suffix(500))
  }
  public static func authorizedAcceptance(offer: UniversalGigOffer,
    profile: GigProfitProfile, preferences: GigDestinationPreferences, route: GigDestinationRoutePlan,
    commitments: [GigConfirmedWork], adapter: any GigPlatformAdapter, driverOptedIn: Bool, emergencyDisabled: Bool,
    now: Date = Date()) async throws -> String {
    guard driverOptedIn, !emergencyDisabled else { throw GigDispatchError.optInRequired }
    guard adapter.connection == .authorized, adapter.platform == offer.platform,
      adapter.capabilities.acceptOffer, adapter.capabilities.readOffers, adapter.capabilities.readStatus,
      offer.providerCapabilities.acceptOffer else { throw GigDispatchError.acceptanceUnavailable }
    // Re-plan at the dispatch boundary. A UI recommendation may have become
    // stale after a changed deadline, offer update or newly accepted commitment.
    let recommendation = DispatchPlanner.rank([offer], profile: profile, preferences: preferences,
      routes: [offer.id: route], commitments: commitments, now: now).first
    guard recommendation?.kind == .recommended, offer.source == .authorizedAPI,
      offer.availabilityStatus == .providerVerified, offer.validForComparison(now: now, observationLifetime: 5),
      offer.expiresAt.map({ $0 > now }) == true,
      let id = offer.providerOfferId, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw GigDispatchError.infeasible }
    return try await adapter.acceptOffer(providerOfferId: id)
  }
}
