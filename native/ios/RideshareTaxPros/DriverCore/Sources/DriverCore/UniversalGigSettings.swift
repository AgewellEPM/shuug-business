import Foundation

public enum UniversalGigWorkType: String, Codable, CaseIterable, Identifiable, Sendable {
  case delivery, shopping
  public var id: String { rawValue }
  public var title: String {
    switch self {
    case .delivery: "Universal Delivery Driver"
    case .shopping: "In-store Shopper"
    }
  }
  public var defaultWorkLabel: String {
    switch self {
    case .delivery: "Universal delivery"
    case .shopping: "In-store shopping"
    }
  }
}

public enum UniversalGigSettingsError: LocalizedError {
  case workLabel, appURL
  public var errorDescription: String? {
    switch self {
    case .workLabel: "Use a work or app name between 1 and 80 characters."
    case .appURL: "Use a public HTTPS app or website link, without a username or password, or leave it blank."
    }
  }
}

/// An account-scoped label and optional user-chosen link. Saving is not provider authorization.
public struct UniversalGigProfile: Codable, Equatable, Sendable {
  public var workLabel: String
  public var appURL: String?
  public init(workLabel: String, appURL: String? = nil) {
    self.workLabel = workLabel; self.appURL = appURL
  }
  public func validated() throws -> Self {
    let label = workLabel.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !label.isEmpty, label.count <= 80 else { throw UniversalGigSettingsError.workLabel }
    return Self(workLabel: label, appURL: try Self.validatedAppURL(appURL ?? "")?.absoluteString)
  }
  public static func validatedAppURL(_ text: String) throws -> URL? {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return nil }
    guard var components = URLComponents(string: value), components.scheme?.lowercased() == "https",
      let host = components.host?.lowercased(), host.contains("."), !host.contains(":"),
      !host.allSatisfy({ $0.isNumber || $0 == "." }),
      !host.hasSuffix(".local"), !host.hasSuffix(".internal"), !host.hasSuffix(".localhost"),
      components.user == nil, components.password == nil, components.port == nil || components.port == 443
    else { throw UniversalGigSettingsError.appURL }
    components.scheme = "https"; components.host = host; components.port = nil
    guard let url = components.url else { throw UniversalGigSettingsError.appURL }
    return url
  }
}

public struct UniversalGigSettings: Codable, Equatable, Sendable {
  public var delivery: UniversalGigProfile
  public var shopping: UniversalGigProfile
  public init(delivery: UniversalGigProfile = .init(workLabel: UniversalGigWorkType.delivery.defaultWorkLabel),
              shopping: UniversalGigProfile = .init(workLabel: UniversalGigWorkType.shopping.defaultWorkLabel)) {
    self.delivery = delivery; self.shopping = shopping
  }
  public func profile(for workType: UniversalGigWorkType) -> UniversalGigProfile {
    switch workType { case .delivery: delivery; case .shopping: shopping }
  }
  public mutating func setProfile(_ profile: UniversalGigProfile, for workType: UniversalGigWorkType) {
    switch workType { case .delivery: delivery = profile; case .shopping: shopping = profile }
  }
}
