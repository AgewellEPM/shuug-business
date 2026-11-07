import CryptoKit
import Foundation

public enum GigPlatform: String, Codable, CaseIterable, Identifiable, Sendable {
  case doorDash = "DoorDash", uber = "Uber", lyft = "Lyft", instacart = "Instacart", spark = "Spark"
  public var id: String { rawValue }
}
public enum OfferObservationSource: String, Codable, Sendable {
  case screenShare, sharedScreenshot, sharedText, notification, accessibility
}
public struct OfferReaderSession: Codable, Sendable {
  public var id: UUID, scope: String, platform: GigPlatform, expiresAt: Date
  public var feesCents: Int?, waitMinutes: Double?, goals: DriverGoals
  public init(scope: String, platform: GigPlatform, feesCents: Int?, waitMinutes: Double?, goals: DriverGoals, now: Date = Date()) {
    id = UUID(); self.scope = scope; self.platform = platform
    expiresAt = now.addingTimeInterval(4 * 3600)
    self.feesCents = feesCents; self.waitMinutes = waitMinutes; self.goals = goals
  }
}
public struct ObservedOffer: Codable, Identifiable, Sendable {
  public var id: UUID, platform: GigPlatform, source: OfferObservationSource, observedAt: Date
  public var payoutCents: Int?, displayedMiles: Double?, displayedMinutes: Double?
  public var pickupMiles: Double?, deliveryMiles: Double?, dropoffLabel: String?
  public var comparisonSavedAt: Date?
  public init(platform: GigPlatform, source: OfferObservationSource, observedAt: Date = Date(),
              payoutCents: Int?, displayedMiles: Double?, displayedMinutes: Double?,
              pickupMiles: Double? = nil, deliveryMiles: Double? = nil, dropoffLabel: String? = nil) {
    id = UUID(); self.platform = platform; self.source = source; self.observedAt = observedAt
    self.payoutCents = payoutCents; self.displayedMiles = displayedMiles; self.displayedMinutes = displayedMinutes
    self.pickupMiles = pickupMiles; self.deliveryMiles = deliveryMiles; self.dropoffLabel = dropoffLabel
  }
  public var fingerprint: String {
    let text = "\(platform.rawValue)|\(payoutCents ?? -1)|\(displayedMiles ?? -1)|\(displayedMinutes ?? -1)|\(dropoffLabel ?? "")"
    return SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
  }
  public func isFresh(now: Date = Date()) -> Bool { (0...60).contains(now.timeIntervalSince(observedAt)) }
  /// The driver must confirm that displayed miles/time include the entire job.
  /// Neither unreadable fields nor a bank deposit supplies missing offer inputs.
  public func estimate(session: OfferReaderSession, now: Date = Date()) -> OfferEstimate? {
    guard session.expiresAt > now, platform == session.platform,
      let payoutCents, let fees = session.feesCents, let wait = session.waitMinutes,
      let miles = displayedMiles, let minutes = displayedMinutes else { return nil }
    return OfferEstimate(payoutCents: payoutCents, feesCents: fees, miles: miles, minutes: minutes,
      waitMinutes: wait, homeMinutes: nil, vehicleCostCentsPerMile: session.goals.vehicleCostCentsPerMile,
      hourlyTargetCents: session.goals.targetHourlyCents, deadline: nil, now: now)
  }
  public func confirmedComparison(session: OfferReaderSession, now: Date = Date()) -> MissionOffer? {
    guard isFresh(now: now), comparisonSavedAt == nil, estimate(session: session, now: now) != nil,
      let payoutCents, let fees = session.feesCents, let miles = displayedMiles,
      let minutes = displayedMinutes, let wait = session.waitMinutes else { return nil }
    return MissionOffer(label: "\(platform.rawValue) · reviewed screen offer", direction: "Unknown",
      payoutCents: payoutCents, feesCents: fees, miles: miles, minutes: minutes, waitMinutes: wait, homeMinutes: nil)
  }
}

public enum OfferTextReader {
  /// Parse only offer-shaped screens. Ambiguous totals stay unknown. No full
  /// screen transcript or unrelated notification text is retained.
  public static func read(_ text: String, platform: GigPlatform, source: OfferObservationSource,
                          now: Date = Date()) -> ObservedOffer? {
    guard text.count <= 20_000 else { return nil }
    let normalized = text.replacingOccurrences(of: "\u{00a0}", with: " ")
    let lower = normalized.lowercased()
    if source == .screenShare {
      let compact = lower.replacingOccurrences(of: " ", with: "")
      guard compact.contains(platform.rawValue.lowercased()) else { return nil }
    }
    let markers = ["accept", "new offer", "delivery offer", "trip radar", "exclusive", "available batch", "offer payout"]
    guard markers.contains(where: { lower.contains($0) }) else { return nil }
    func values(_ pattern: String) -> [String] {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
      return regex.matches(in: normalized, range: NSRange(normalized.startIndex..., in: normalized)).compactMap {
        Range($0.range(at: 1), in: normalized).map { String(normalized[$0]) }
      }
    }
    let money = Array(Set(values(#"\$\s*([0-9]{1,4}(?:\.[0-9]{2})?)\b"#).compactMap(StatementImport.signedCents)))
    let labeledMoney = Array(Set(values(#"(?:offer payout|estimated earnings|guaranteed pay|total pay|payout)\s*[:\-]?\s*\$\s*([0-9]{1,4}(?:\.[0-9]{2})?)\b"#).compactMap(StatementImport.signedCents)))
    let payout = labeledMoney.count == 1 ? labeledMoney.first : (money.count == 1 ? money.first : nil)
    func distance(_ prefix: String) -> Double? {
      let rows = values(prefix + #"\s*[:\-]?\s*([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*(?:mi|miles)\b"#).compactMap(Double.init)
      return rows.count == 1 ? rows.first : nil
    }
    let pickup = distance("(?:pickup|pick-up|to pickup)"), delivery = distance("(?:delivery|drop-off|dropoff)")
    let allMiles = values(#"\b([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*(?:mi|miles)\b"#).compactMap(Double.init)
    let total = distance("(?:total|total distance)") ?? (pickup != nil && delivery != nil ? pickup! + delivery! : (allMiles.count == 1 ? allMiles.first : nil))
    let times = values(#"\b([0-9]{1,3}(?:\.[0-9])?)\s*(?:min|mins|minutes)\b"#).compactMap(Double.init)
    let labeledTime = values(#"(?:total time|estimated time|total)\s*[:\-]?\s*([0-9]{1,3}(?:\.[0-9])?)\s*(?:min|mins|minutes)\b"#).compactMap(Double.init)
    let minutes = labeledTime.count == 1 ? labeledTime.first : (times.count == 1 ? times.first : nil)
    guard payout != nil || total != nil || minutes != nil else { return nil }
    let dropoff = values(#"(?:drop-off address|dropoff address|deliver to)\s*:\s*([^\n]{3,160})"#).first
    return ObservedOffer(platform: platform, source: source, observedAt: now,
      payoutCents: payout.flatMap { (1...100_000).contains($0) ? $0 : nil },
      displayedMiles: total, displayedMinutes: minutes, pickupMiles: pickup, deliveryMiles: delivery, dropoffLabel: dropoff)
  }
}
