import Foundation

public struct GigProviderCapabilities: Codable, Equatable, Sendable {
  public var readOffers: Bool, readDestinations: Bool, readStatus: Bool, acceptOffer: Bool
  public init(readOffers: Bool = false, readDestinations: Bool = false, readStatus: Bool = false, acceptOffer: Bool = false) {
    self.readOffers = readOffers; self.readDestinations = readDestinations
    self.readStatus = readStatus; self.acceptOffer = acceptOffer
  }
  public static let unavailable = GigProviderCapabilities()
}
public enum GigOfferSource: String, Codable, Sendable {
  case sharedScreenshot, sharedText, screenShare, notification, authorizedAPI, manual, simulation
}
public enum GigAvailability: String, Codable, Sendable {
  case observed, providerVerified, expired, stale, withdrawn, simulated
}
public enum GigMissingField: String, Codable, CaseIterable, Sendable {
  case payout, currency, pickup, dropoff, pickupMiles, deliveryMiles, repositionMiles
  case duration, durationCoverage, wait, additionalCosts, guaranteedPay, tipTreatment, expiration
}
public enum GigDurationCoverage: String, Codable, Sendable { case travelExcludingWait, allWorkingTime, unknown }
public enum GigTipTreatment: String, Codable, Sendable { case includedInQuote, separateFromQuote, unknown }
public struct GigOfferLocation: Codable, Equatable, Sendable {
  public var label: String
  public var latitude: Double?, longitude: Double?
  public init(label: String, latitude: Double? = nil, longitude: Double? = nil) {
    self.label = String(label.prefix(240)); self.latitude = latitude; self.longitude = longitude
  }
  public var hasCoordinate: Bool {
    guard let latitude, let longitude else { return false }
    return PositionPoint(latitude, longitude).valid
  }
}
public struct GigNumericBounds: Codable, Equatable, Sendable {
  public var lower: Double, upper: Double
  public init(_ lower: Double, _ upper: Double) { self.lower = lower; self.upper = upper }
  public var valid: Bool { lower.isFinite && upper.isFinite && lower >= 0 && lower <= upper && upper <= 100_000 }
}
public struct GigOfferUncertainty: Codable, Equatable, Sendable {
  /// workingMinutes always covers the complete job, including waiting and repositioning.
  public var totalMiles: GigNumericBounds?, workingMinutes: GigNumericBounds?, waitMinutes: GigNumericBounds?
  public init(totalMiles: GigNumericBounds? = nil, workingMinutes: GigNumericBounds? = nil, waitMinutes: GigNumericBounds? = nil) {
    self.totalMiles = totalMiles; self.workingMinutes = workingMinutes; self.waitMinutes = waitMinutes
  }
}
public struct GigOfferTimeWindow: Codable, Equatable, Sendable {
  public var startsAt: Date, endsAt: Date
  public init(startsAt: Date, endsAt: Date) { self.startsAt = startsAt; self.endsAt = endsAt }
  public var valid: Bool { startsAt <= endsAt }
}
public struct UniversalGigOffer: Codable, Equatable, Identifiable, Sendable {
  public var offerId: UUID, platform: GigPlatform, source: GigOfferSource
  public var receivedAt: Date, lastObservedAt: Date, expiresAt: Date?
  public var providerOfferId: String?, sourceEventId: String?
  /// Capture IDs remain traceable when repeated observations merge into one offer.
  public var captureObservationIds: [UUID]?
  public var payoutCents: Int?, currency: String?
  public var pickupLocation: GigOfferLocation?, dropoffLocation: GigOfferLocation?
  public var pickupMiles: Double?, deliveryMiles: Double?, repositionMiles: Double?
  public var displayedTotalMiles: Double?
  public var estimatedMinutes: Double?, waitMinutes: Double?, additionalCostsCents: Int?
  public var confirmedTipCents: Int?, unconfirmedTipCents: Int?, guaranteedPayoutCents: Int?
  public var tipTreatment: GigTipTreatment, durationCoverage: GigDurationCoverage
  /// A heuristic extraction score, not a calibrated accuracy probability.
  public var extractionConfidence: Double
  public var missingFields: [GigMissingField]
  public var availabilityStatus: GigAvailability, providerCapabilities: GigProviderCapabilities
  public var uncertainty: GigOfferUncertainty
  public var driverConfirmedFields: Bool
  public var pickupWindow: GigOfferTimeWindow?, deliveryWindow: GigOfferTimeWindow?
  public var id: UUID { offerId }
  public init(platform: GigPlatform, source: GigOfferSource, receivedAt: Date = Date()) {
    offerId = UUID(); self.platform = platform; self.source = source
    self.receivedAt = receivedAt; lastObservedAt = receivedAt
    tipTreatment = .unknown; durationCoverage = .unknown; extractionConfidence = 0
    missingFields = GigMissingField.allCases; availabilityStatus = source == .simulation ? .simulated : .observed
    providerCapabilities = .unavailable; uncertainty = GigOfferUncertainty(); driverConfirmedFields = false
  }
  public mutating func refreshMissingFields() {
    var fields: [GigMissingField] = []
    if payoutCents == nil { fields.append(.payout) }
    if currency == nil { fields.append(.currency) }
    if pickupLocation == nil { fields.append(.pickup) }
    if dropoffLocation == nil { fields.append(.dropoff) }
    if pickupMiles == nil { fields.append(.pickupMiles) }
    if deliveryMiles == nil { fields.append(.deliveryMiles) }
    if repositionMiles == nil { fields.append(.repositionMiles) }
    if estimatedMinutes == nil { fields.append(.duration) }
    if durationCoverage == .unknown { fields.append(.durationCoverage) }
    if waitMinutes == nil && durationCoverage != .allWorkingTime { fields.append(.wait) }
    if additionalCostsCents == nil { fields.append(.additionalCosts) }
    if guaranteedPayoutCents == nil { fields.append(.guaranteedPay) }
    if tipTreatment == .unknown { fields.append(.tipTreatment) }
    if expiresAt == nil { fields.append(.expiration) }
    missingFields = fields
  }
  public func validForComparison(now: Date = Date(), observationLifetime: TimeInterval = 60) -> Bool {
    guard observationLifetime.isFinite, observationLifetime >= 0,
      ![GigAvailability.expired, .stale, .withdrawn].contains(availabilityStatus),
      (0...observationLifetime).contains(now.timeIntervalSince(lastObservedAt)),
      expiresAt.map({ $0 > now }) ?? true else { return false }
    return true
  }
}

public enum GigProviderConnection: String, Codable, Sendable { case unavailable, notConfigured, authorized }
public protocol GigPlatformAdapter: Sendable {
  var platform: GigPlatform { get }
  var capabilities: GigProviderCapabilities { get }
  var connection: GigProviderConnection { get }
  func acceptOffer(providerOfferId: String) async throws -> String
}
public struct UnavailableGigPlatformAdapter: GigPlatformAdapter {
  public let platform: GigPlatform
  public let capabilities = GigProviderCapabilities.unavailable
  public let connection = GigProviderConnection.unavailable
  public init(platform: GigPlatform) { self.platform = platform }
  public func acceptOffer(providerOfferId: String) async throws -> String { throw GigDispatchError.acceptanceUnavailable }
}
public enum GigDispatchError: Error, LocalizedError {
  case acceptanceUnavailable, optInRequired, infeasible, invalidInput
  public var errorDescription: String? {
    switch self {
    case .acceptanceUnavailable: "This platform has no configured, authorized acceptance API. Make the decision in its app."
    case .optInRequired: "Authorized dispatch is off. Driver opt-in and thresholds are required."
    case .infeasible: "The offer is stale, incomplete or conflicts with the route, deadline or accepted work."
    case .invalidInput: "Some offer fields could not be validated. Review the source before deciding."
    }
  }
}

extension UniversalGigOffer {
  public static func observation(_ value: ObservedOffer) -> UniversalGigOffer {
    var offer = UniversalGigOffer(platform: value.platform,
      source: value.source == .screenShare ? .screenShare : (value.source == .notification ? .notification : (value.source == .sharedText ? .sharedText : .sharedScreenshot)), receivedAt: value.observedAt)
    offer.offerId = value.id; offer.payoutCents = value.payoutCents
    offer.currency = "USD" // The reader is explicitly configured for the app's USD profile.
    offer.pickupMiles = value.pickupMiles; offer.deliveryMiles = value.deliveryMiles
    offer.displayedTotalMiles = value.displayedMiles; offer.estimatedMinutes = value.displayedMinutes
    offer.dropoffLocation = value.dropoffLabel.map { GigOfferLocation(label: $0) }
    offer.refreshMissingFields(); return offer
  }
}
