import DriverCore
import Foundation

struct ParsedOfferCapture: Sendable {
  var observation: ObservedOffer, normalized: UniversalGigOffer
  static func read(_ text: String, platform: GigPlatform, source: OfferObservationSource, now: Date = Date()) throws -> ParsedOfferCapture {
    let normalizedSource: GigOfferSource = source == .screenShare ? .screenShare : (source == .sharedText ? .sharedText : .sharedScreenshot)
    var normalized = try OfferNormalizer.normalize(text, platform: platform, source: normalizedSource, now: now)
    let observation = OfferTextReader.read(text, platform: platform, source: source, now: now)
      ?? ObservedOffer(platform: platform, source: source, observedAt: now, payoutCents: normalized.payoutCents,
        displayedMiles: normalized.displayedTotalMiles, displayedMinutes: normalized.estimatedMinutes,
        pickupMiles: normalized.pickupMiles, deliveryMiles: normalized.deliveryMiles, dropoffLabel: normalized.dropoffLocation?.label)
    normalized.offerId = observation.id
    return ParsedOfferCapture(observation: observation, normalized: normalized)
  }
}
