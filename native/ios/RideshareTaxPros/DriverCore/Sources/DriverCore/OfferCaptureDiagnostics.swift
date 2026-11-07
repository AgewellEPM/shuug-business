import Foundation

/// Short-lived route evidence. The app keeps this in memory, never in the firm's journal.
public struct GigOfferRouteEvidence: Codable, Sendable {
  public let sourceOffer: UniversalGigOffer, routedOffer: UniversalGigOffer
  public let profile: GigProfitProfile, preferences: GigDestinationPreferences, plan: GigDestinationRoutePlan
  public init(sourceOffer: UniversalGigOffer, routedOffer: UniversalGigOffer, profile: GigProfitProfile,
    preferences: GigDestinationPreferences, plan: GigDestinationRoutePlan) {
    self.sourceOffer = sourceOffer; self.routedOffer = routedOffer; self.profile = profile
    self.preferences = preferences; self.plan = plan
  }
}

public struct GigCaptureDiagnosticReport: Sendable {
  public let platform: GigPlatform, connection: GigProviderConnection
  public let capturedOfferCount: Int, latestCapture: UniversalGigOffer?, reviewedOffer: UniversalGigOffer?
  public let financial: GigProfitAssessment?, recommendation: GigDispatchRecommendation?
  public let sufficientForRecommendation: Bool, blockers: [String]
}

public enum OfferCaptureDiagnostics {
  public static func evaluate(platform: GigPlatform, captures: [UniversalGigOffer],
    journalOffers: [UniversalGigOffer], profile: GigProfitProfile,
    routeEvidence: [UUID: GigOfferRouteEvidence] = [:], commitments: [GigConfirmedWork] = [],
    connection: GigProviderConnection = .unavailable, now: Date = Date()) -> GigCaptureDiagnosticReport {
    // Entered jobs and the sample shift cannot establish provider capture.
    let observed = captures.filter {
      $0.platform == platform && [.sharedScreenshot, .sharedText, .screenShare].contains($0.source)
        && $0.receivedAt <= now && $0.lastObservedAt <= now
    }.sorted { $0.lastObservedAt > $1.lastObservedAt }
    guard let capture = observed.first else {
      return GigCaptureDiagnosticReport(platform: platform, connection: connection, capturedOfferCount: 0,
        latestCapture: nil, reviewedOffer: nil, financial: nil, recommendation: nil,
        sufficientForRecommendation: false, blockers: ["No captured offer is saved for this platform in this account. Manual entries and sample data do not count."])
    }
    let reviewed = journalOffers.offer(capturedAs: capture.id) ?? capture
    var blockers: [String] = []
    if !reviewed.validForComparison(now: now) { blockers.append("This observation is stale, expired or withdrawn. Check the current offer again.") }
    if !reviewed.driverConfirmedFields {
      blockers.append("The extracted fields and current availability have not been reviewed in the original gig app.")
    }
    let evidence = routeEvidence[reviewed.id]
    let matching = evidence.map { $0.sourceOffer == reviewed && $0.profile == profile } ?? false
    let recommendation: GigDispatchRecommendation
    if let evidence, matching {
      recommendation = DispatchPlanner.rank([evidence.routedOffer], profile: profile,
        preferences: evidence.preferences, routes: [reviewed.id: evidence.plan], commitments: commitments, now: now)[0]
    } else {
      recommendation = DispatchPlanner.rank([reviewed], profile: profile, preferences: nil,
        routes: [:], commitments: commitments, now: now)[0]
      blockers.append("A current full route to pickup, drop-off and your destination has not been checked for these offer fields and cost settings.")
    }
    let financial = recommendation.financial
    if financial.outcome == .insufficientInformation {
      blockers.append("The pay estimate is incomplete or its uncertainty crosses your earnings target.")
    }
    if matching && recommendation.destination.outcome == .insufficientInformation {
      blockers += recommendation.destination.reasons
    }
    let sufficient = blockers.isEmpty && recommendation.kind != .needsReview
    return GigCaptureDiagnosticReport(platform: platform, connection: connection, capturedOfferCount: observed.count,
      latestCapture: capture, reviewedOffer: reviewed, financial: financial, recommendation: recommendation,
      sufficientForRecommendation: sufficient, blockers: blockers)
  }
}
