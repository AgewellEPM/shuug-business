import DriverCore
import Foundation
import UserNotifications

struct CapturedOfferEnvelope: Codable {
  var sessionId: UUID, scope: String, offer: ObservedOffer
}
struct OfferCaptureStatus: Codable {
  var phase: String, updatedAt: Date, message: String
}
enum OfferCaptureStore {
  static let group = "group.com.ridesharetaxpros.driver"
  static let extensionBundle = "com.ridesharetaxpros.driver.offerbroadcast"
  private static func root() throws -> URL {
    guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw CocoaError(.fileNoSuchFile, userInfo: [NSLocalizedDescriptionKey: "Screen sharing needs the app’s configured App Group on this device."])
    }
    let directory = root.appendingPathComponent("OfferReader", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
  private static func write<T: Encodable>(_ value: T, name: String) throws {
    let data = try WireJSON.encoder().encode(value)
    try data.write(to: root().appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  private static func read<T: Decodable>(_ type: T.Type, name: String) throws -> T {
    let url = try root().appendingPathComponent(name)
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size <= 128 * 1024 else { throw CocoaError(.fileReadTooLarge) }
    return try WireJSON.decoder().decode(type, from: Data(contentsOf: url))
  }
  static func session() -> OfferReaderSession? {
    guard let session = try? read(OfferReaderSession.self, name: "session.json"), session.expiresAt > Date() else { return nil }
    return session
  }
  static func activate(_ session: OfferReaderSession) throws { try write(session, name: "session.json") }
  static func deactivate() {
    if let url = try? root().appendingPathComponent("session.json") { try? FileManager.default.removeItem(at: url) }
  }
  static func status() -> OfferCaptureStatus? { try? read(OfferCaptureStatus.self, name: "status.json") }
  static func status(_ phase: String, _ message: String) {
    try? write(OfferCaptureStatus(phase: phase, updatedAt: Date(), message: message), name: "status.json")
  }
  static func save(_ offer: ObservedOffer, session: OfferReaderSession) throws {
    guard self.session()?.id == session.id else { throw DriverAlertError.expired }
    let envelope = CapturedOfferEnvelope(sessionId: session.id, scope: session.scope, offer: offer)
    try write(envelope, name: offer.id.uuidString + ".json")
    // These are transient, unconfirmed observations, not journal entries.
    let root = try root()
    let files = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.contentModificationDateKey])
      .filter { UUID(uuidString: $0.deletingPathExtension().lastPathComponent) != nil }
      .sorted { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        > ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
    for file in files.dropFirst(50) { try? FileManager.default.removeItem(at: file) }
  }
  static func offer(_ id: UUID) throws -> CapturedOfferEnvelope {
    try read(CapturedOfferEnvelope.self, name: id.uuidString + ".json")
  }
  static func offers(scope: String) -> [CapturedOfferEnvelope] {
    guard let directory = try? root(), let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return [] }
    return files.compactMap { file in
      guard let id = UUID(uuidString: file.deletingPathExtension().lastPathComponent), let value = try? offer(id), value.scope == scope else { return nil }
      return value
    }.sorted { $0.offer.observedAt > $1.offer.observedAt }
  }
  static func notify(_ offer: ObservedOffer, session: OfferReaderSession) {
    let content = UNMutableNotificationContent()
    content.title = "Review \(offer.platform.rawValue) offer: \(offer.payoutCents.map(usd) ?? "payout unreadable")"
    if let estimate = offer.estimate(session: session) {
      content.body = "\(usd(estimate.netCents)) estimated net · \(usd(Int(estimate.hourlyCents.rounded())))/active hour. Confirm \(offer.displayedMiles ?? 0) total mi, \(offer.displayedMinutes ?? 0) min, \(usd(session.feesCents ?? 0)) fees and \(session.waitMinutes ?? 0) min wait. Home impact unknown."
      content.categoryIdentifier = "gig.offer"
    } else {
      content.body = "Some payout, total miles, time or cost settings are missing. Review the visible offer before calculating."
      content.categoryIdentifier = "gig.offer.review"
    }
    content.sound = .default; content.threadIdentifier = "gig-offers"
    content.userInfo = ["observedOffer": offer.id.uuidString, "readerSession": session.id.uuidString, "scope": session.scope]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: offer.id.uuidString, content: content, trigger: nil)) { error in
      if error != nil { status("attention", "Offer read, but its alert could not be delivered. Check notification access.") }
    }
  }
  private static func usd(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
}
