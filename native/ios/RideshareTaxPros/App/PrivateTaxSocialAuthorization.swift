import Foundation

/// Provider pages run in external Safari, outside all client key custody.
/// Exact parameters match the pinned backend's minimal-subject-only OAuth flow.
enum PrivateTaxSocialAuthorization {
  static func validate(_ address: String, provider: String, pins: PrivateTaxPins) throws -> URL {
    guard address.utf8.count <= 8192, ["google", "apple"].contains(provider), let components = URLComponents(string: address), components.scheme == "https", components.user == nil, components.password == nil, components.port == nil, components.fragment == nil, let url = components.url else { throw PrivateTaxWire.fail() }
    let items = components.queryItems ?? []
    guard Set(items.map(\.name)).count == items.count else { throw PrivateTaxWire.fail() }
    let query = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    let base: Set<String> = ["client_id", "redirect_uri", "response_type", "state", "nonce"]
    let expected = base.union(provider == "google" ? ["scope", "code_challenge", "code_challenge_method", "prompt"] : ["response_mode"])
    func matches(_ value: String?, _ pattern: String) -> Bool {
      guard let value, let match = value.range(of: pattern, options: .regularExpression) else { return false }
      return match == value.startIndex..<value.endIndex
    }
    guard Set(query.keys) == expected, matches(query["client_id"], #"^[A-Za-z0-9._-]{1,255}$"#), query["redirect_uri"] == pins.workspaceOrigin + "/api/auth/social/" + provider + "/callback", query["response_type"] == "code", ["state", "nonce"].allSatisfy({ matches(query[$0], #"^[A-Za-z0-9_-]{43}$"#) }) else { throw PrivateTaxWire.fail() }
    if provider == "google" {
      guard components.host == "accounts.google.com", components.path == "/o/oauth2/v2/auth", query["scope"] == "openid", matches(query["code_challenge"], #"^[A-Za-z0-9_-]{43}$"#), query["code_challenge_method"] == "S256", query["prompt"] == "select_account" else { throw PrivateTaxWire.fail() }
    } else {
      guard components.host == "appleid.apple.com", components.path == "/auth/authorize", query["response_mode"] == "query" else { throw PrivateTaxWire.fail() }
    }
    return url
  }
}
