import CryptoKit
import Foundation

public enum OfferNormalizer {
  public static func normalize(_ text: String, platform: GigPlatform, source: GigOfferSource,
    sourceEventId: String? = nil, confirmedCurrency: String? = "USD", now: Date = Date()) throws -> UniversalGigOffer {
    guard text.utf8.count <= 20_000, source != .authorizedAPI else { throw GigDispatchError.invalidInput }
    let input = text.replacingOccurrences(of: "\u{00a0}", with: " ")
    let lower = input.lowercased()
    if source == .screenShare && !lower.replacingOccurrences(of: " ", with: "").contains(platform.rawValue.lowercased()) {
      throw GigDispatchError.invalidInput
    }
    func unique(_ pattern: String) -> String? {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .anchorsMatchLines]) else { return nil }
      let values = regex.matches(in: input, range: NSRange(input.startIndex..., in: input)).compactMap {
        Range($0.range(at: 1), in: input).map { String(input[$0]).trimmingCharacters(in: .whitespacesAndNewlines) }
      }
      let distinct = Array(Set(values)); return distinct.count == 1 ? distinct[0] : nil
    }
    func money(_ label: String) -> Int? {
      guard let value = unique(#"^[ \t]*(?:"# + label + #")[ \t]*[:=]?[ \t]*(?:\$|USD[ \t]*)?([0-9]{1,6}(?:\.[0-9]{1,2})?)(?![\w.,/])[ \t]*$"#),
        let cents = StatementImport.signedCents(value), (0...100_000_000).contains(cents) else { return nil }
      return cents
    }
    func number(_ label: String, _ unit: String) -> Double? {
      unique(#"\b(?:"# + label + #")\s*[:=]?\s*([0-9]{1,4}(?:\.[0-9]{1,3})?)\s*(?:"# + unit + #")\b"#).flatMap(Double.init)
    }
    let basic = OfferTextReader.read(input, platform: platform, source: source == .screenShare ? .screenShare : .sharedScreenshot, now: now)
    func hasLabel(_ label: String) -> Bool {
      input.range(of: #"(?im)^[ \t]*(?:"# + label + #")[ \t]*[:=]?"#, options: .regularExpression) != nil
    }
    var offer = UniversalGigOffer(platform: platform, source: source, receivedAt: now)
    offer.sourceEventId = sourceEventId.map { String($0.prefix(160)) }
    offer.providerOfferId = unique(#"^offer id\s*:\s*([A-Za-z0-9_-]{1,80})$"#)
    let payoutLabels = "offer payout|quoted payout|payout"
    offer.payoutCents = money(payoutLabels)
    if !hasLabel(payoutLabels) {
      // An unlabeled legacy amount is usable only when its complete monetary
      // token is readable. Never turn OCR '$19.OO' or '$5,000' into $19 or $5.
      let regex = try NSRegularExpression(pattern: #"\$\s*([^\s]+)"#)
      let tokens = regex.matches(in: input, range: NSRange(input.startIndex..., in: input)).compactMap {
        Range($0.range(at: 1), in: input).map { String(input[$0]) }
      }
      if !tokens.isEmpty, tokens.allSatisfy({ $0.range(of: #"^[0-9]{1,6}(?:\.[0-9]{1,2})?$"#, options: .regularExpression) != nil }) {
        offer.payoutCents = basic?.payoutCents
      }
    }
    offer.guaranteedPayoutCents = money("guaranteed pay|guaranteed payout")
    if offer.payoutCents == nil && !hasLabel(payoutLabels) { offer.payoutCents = offer.guaranteedPayoutCents }
    offer.currency = unique(#"^currency\s*:\s*([A-Z]{3})[ \t]*$"#)?.uppercased()
    if !hasLabel("currency") { offer.currency = confirmedCurrency }
    offer.pickupLocation = unique(#"^pickup(?: location| address)?\s*:\s*([^\n]{3,240})$"#).map { GigOfferLocation(label: $0) }
    offer.dropoffLocation = unique(#"^(?:drop-off|dropoff|delivery address)(?: location| address)?\s*:\s*([^\n]{3,240})$"#).map { GigOfferLocation(label: $0) }
    offer.pickupMiles = number("pickup distance|pickup miles|to pickup", "mi|miles") ?? basic?.pickupMiles
    offer.deliveryMiles = number("delivery distance|delivery miles|job distance", "mi|miles") ?? basic?.deliveryMiles
    offer.repositionMiles = number("reposition distance|reposition miles|unpaid return", "mi|miles")
    offer.displayedTotalMiles = basic?.displayedMiles
    if let total = number("total working miles|total miles including repositioning", "mi|miles") {
      offer.uncertainty.totalMiles = GigNumericBounds(total, total)
    }
    if let total = number("total working time|all working time", "min|minutes") {
      offer.estimatedMinutes = total; offer.durationCoverage = .allWorkingTime
    } else if let travel = number("travel time|total travel time", "min|minutes") {
      offer.estimatedMinutes = travel; offer.durationCoverage = .travelExcludingWait
    } else { offer.estimatedMinutes = basic?.displayedMinutes }
    offer.waitMinutes = number("pickup wait|wait time|wait", "min|minutes")
    offer.additionalCostsCents = money("fees|additional costs|additional fees")
    offer.confirmedTipCents = money("confirmed tip")
    offer.unconfirmedTipCents = money("unconfirmed tip|estimated tip")
    let included = lower.contains("tips included") || lower.contains("includes tips")
    let separate = lower.contains("tips separate") || lower.contains("tips extra")
    if included && !separate { offer.tipTreatment = .includedInQuote }
    else if separate && !included { offer.tipTreatment = .separateFromQuote }
    if let expiry = unique(#"^expires at\s*:\s*([0-9TZ:+.\-]+)$"#) {
      let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      offer.expiresAt = formatter.date(from: expiry)
      if offer.expiresAt == nil { formatter.formatOptions = [.withInternetDateTime]; offer.expiresAt = formatter.date(from: expiry) }
    } else if let seconds = number("expires in", "seconds|sec|s"), (1...3600).contains(seconds) {
      offer.expiresAt = now.addingTimeInterval(seconds)
    }
    guard offer.payoutCents != nil || offer.pickupMiles != nil || offer.displayedTotalMiles != nil else { throw GigDispatchError.invalidInput }
    offer.refreshMissingFields()
    let found = GigMissingField.allCases.count - offer.missingFields.count
    offer.extractionConfidence = min(0.95, 0.25 + Double(found) / Double(GigMissingField.allCases.count) * 0.7)
    if let expires = offer.expiresAt, expires <= now { offer.availabilityStatus = .expired }
    return offer
  }
}

public struct OfferIngestionLog: Codable, Sendable {
  public let eventId: UUID, at: Date, platform: GigPlatform, source: GigOfferSource
  public let event: String, missingFields: [GigMissingField], heuristicConfidence: Double
}
public struct OfferIngestionService: Sendable {
  public private(set) var offers: [UniversalGigOffer]
  public private(set) var logs: [OfferIngestionLog]
  public init(offers: [UniversalGigOffer] = [], logs: [OfferIngestionLog] = []) { self.offers = offers; self.logs = logs }
  @discardableResult public mutating func ingest(_ offer: UniversalGigOffer, now: Date = Date()) throws -> UUID {
    guard offer.source != .authorizedAPI || offer.providerCapabilities.readOffers,
      offer.lastObservedAt.timeIntervalSince1970.isFinite, offer.receivedAt.timeIntervalSince1970.isFinite,
      offer.lastObservedAt >= offer.receivedAt, offer.lastObservedAt <= now,
      offer.expiresAt.map({ $0.timeIntervalSince1970.isFinite }) ?? true,
      offer.payoutCents.map({ (0...100_000_000).contains($0) }) ?? true else { throw GigDispatchError.invalidInput }
    var offer = offer
    if [.sharedScreenshot, .sharedText, .screenShare, .notification].contains(offer.source) {
      offer.captureObservationIds = [offer.id]
    }
    if offer.source != .authorizedAPI {
      offer.providerCapabilities = .unavailable
      if offer.availabilityStatus == .providerVerified { offer.availabilityStatus = .observed }
    }
    offer.refreshMissingFields()
    let key = Self.key(offer)
    if let index = offers.firstIndex(where: {
      Self.key($0) == key && (offer.providerOfferId != nil || offer.sourceEventId != nil || abs(now.timeIntervalSince($0.lastObservedAt)) <= 120)
    }) {
      let previous = offers[index]
      if offer.lastObservedAt > previous.lastObservedAt {
        // Provider IDs identify an opportunity, not immutable terms. Newer pay,
        // distance or withdrawal events replace stale facts and require review.
        offer.offerId = previous.id; offer.receivedAt = previous.receivedAt
        offer.driverConfirmedFields = false
        if [.expired, .withdrawn].contains(previous.availabilityStatus) { offer.availabilityStatus = previous.availabilityStatus }
        offers[index] = offer
      }
      // Repeated observations may shorten an expiration, never extend it.
      if let oldExpiry = previous.expiresAt {
        offers[index].expiresAt = min(oldExpiry, offer.expiresAt ?? oldExpiry)
      }
      let aliases = (previous.captureObservationIds ?? [previous.id]) + (offer.captureObservationIds ?? [])
      var unique = Set<UUID>()
      offers[index].captureObservationIds = Array(aliases.reversed().filter { unique.insert($0).inserted }.prefix(50).reversed())
      record(offers[index], event: "deduplicated", now: now)
      expire(now: now); return offers[index].id
    }
    offers.append(offer); offers = Array(offers.suffix(200))
    record(offer, event: "normalized", now: now); expire(now: now)
    return offer.id
  }
  public mutating func expire(now: Date = Date()) {
    for index in offers.indices {
      if offers[index].availabilityStatus == .withdrawn { continue }
      if let expiration = offers[index].expiresAt, expiration <= now { offers[index].availabilityStatus = .expired }
      else if now.timeIntervalSince(offers[index].lastObservedAt) > 60,
        offers[index].availabilityStatus != .expired { offers[index].availabilityStatus = .stale }
    }
  }
  private mutating func record(_ offer: UniversalGigOffer, event: String, now: Date) {
    logs.append(OfferIngestionLog(eventId: UUID(), at: now, platform: offer.platform, source: offer.source,
      event: event, missingFields: offer.missingFields, heuristicConfidence: offer.extractionConfidence))
    logs = Array(logs.suffix(100))
  }
  private static func key(_ offer: UniversalGigOffer) -> String {
    let identity: String
    if let id = offer.providerOfferId { identity = "provider:" + id }
    else if let event = offer.sourceEventId { identity = "source:" + event }
    else {
      var fields = offer
      fields.offerId = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
      fields.receivedAt = Date(timeIntervalSince1970: 0); fields.lastObservedAt = fields.receivedAt
      fields.expiresAt = nil; fields.source = .manual; fields.availabilityStatus = .observed
      fields.extractionConfidence = 0; fields.driverConfirmedFields = false; fields.missingFields = []
      fields.captureObservationIds = nil
      identity = (try? WireJSON.encoder().encode(fields)).flatMap { String(data: $0, encoding: .utf8) } ?? offer.id.uuidString
    }
    return offer.platform.rawValue + ":" + SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
  }
}

extension Array where Element == UniversalGigOffer {
  public func offer(capturedAs id: UUID) -> UniversalGigOffer? {
    first { $0.id == id || $0.captureObservationIds?.contains(id) == true }
  }
}
