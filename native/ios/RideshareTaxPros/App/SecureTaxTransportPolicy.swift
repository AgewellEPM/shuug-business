import Foundation

enum SecureTaxTransportPolicyError: LocalizedError {
  case configuration, encryptedReplacementRequired
  var errorDescription: String? {
    switch self {
    case .configuration: "The app’s protected-workspace configuration needs review. Legacy data transfers are paused."
    case .encryptedReplacementRequired: "This workspace requires client-encrypted data. This action was paused before upload while its protected replacement and migration are completed. Your local data is kept."
    }
  }
}

/// A public pin bundled with the signed app is a local security decision. API
/// enrollment/status cannot downgrade it to plaintext, even before enrollment.
enum SecureTaxTransportPolicy {
  // This application distribution is client-only. Generic compatibility proofs
  // use the explicit configuration/protectedWorkspace overloads below.
  static let clientOnlyBuild = true
  enum Group { case driver, customer }
  static func requiresProtectedTransport(origin: URL, bundle: Bundle = .main) throws -> Bool {
    guard let url = bundle.url(forResource: "SecureTaxTrustedPins", withExtension: "json") else {
      if clientOnlyBuild { throw SecureTaxTransportPolicyError.configuration }
      return false
    }
    let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
    return try requiresProtectedTransport(origin: origin, configuration: file.read(upToCount: 16_385) ?? Data())
  }
  /// Validation here only chooses a stricter transport policy. Cryptographic
  /// point/signature validation remains in SecureTaxManifest, without a fallback.
  static func requiresProtectedTransport(origin: URL, configuration: Data?) throws -> Bool {
    guard let configuration else {
      if origin.absoluteString == "https://gig-tax-pros-production.up.railway.app" { throw SecureTaxTransportPolicyError.configuration }
      return false
    }
    if let value = try? JSONSerialization.jsonObject(with: configuration) as? [String: Any], value["version"] as? Int == 2 {
      guard configuration.count <= 4096, Set(value.keys) == ["version", "profile", "workspaceOrigin", "workspaceId", "signerPublicKey"], value["profile"] as? String == "client-only-v1", let pinned = value["workspaceOrigin"] as? String, let parsed = URLComponents(string: pinned), parsed.scheme == "https", parsed.host?.contains(".") == true, parsed.path.isEmpty, parsed.user == nil, parsed.password == nil, parsed.query == nil, parsed.fragment == nil, parsed.port == nil, parsed.url?.absoluteString == pinned, (value["workspaceId"] as? String)?.isEmpty == false, (value["signerPublicKey"] as? String)?.isEmpty == false else { throw SecureTaxTransportPolicyError.configuration }
      if origin.absoluteString == "https://gig-tax-pros-production.up.railway.app", pinned != origin.absoluteString { throw SecureTaxTransportPolicyError.configuration }
      guard origin.absoluteString == pinned else { throw SecureTaxTransportPolicyError.configuration }
      return true
    }
    if origin.absoluteString == "https://gig-tax-pros-production.up.railway.app" { throw SecureTaxTransportPolicyError.configuration }
    guard configuration.count <= 16_384,
      let value = try? JSONSerialization.jsonObject(with: configuration) as? [String: Any],
      Set(value.keys) == ["version", "workspaceOrigin", "workspaceId", "signerPublicKey", "firmRecoveryPublicKey"],
      let version = value["version"] as? Int, version == 1,
      let pinned = value["workspaceOrigin"] as? String,
      let parsed = URLComponents(string: pinned), parsed.scheme == "https", let host = parsed.host, host.contains("."),
      parsed.path.isEmpty, parsed.user == nil, parsed.password == nil, parsed.query == nil, parsed.fragment == nil,
      parsed.port == nil, parsed.url?.absoluteString == pinned,
      ["workspaceId", "signerPublicKey", "firmRecoveryPublicKey"].allSatisfy({ (value[$0] as? String)?.isEmpty == false }) else {
      throw SecureTaxTransportPolicyError.configuration
    }
    return origin.absoluteString == pinned
  }
  static func assertLegacyAllowed(origin: URL, group: Group, path: String, method: String,
    body: Data? = nil) throws {
    if clientOnlyBuild { throw SecureTaxTransportPolicyError.encryptedReplacementRequired }
    try assertLegacyAllowed(protectedWorkspace: requiresProtectedTransport(origin: origin), group: group,
      path: path, method: method, body: body)
  }
  static func assertLegacyAllowed(protectedWorkspace: Bool, group: Group, path: String,
    method: String, body: Data? = nil) throws {
    guard protectedWorkspace else { return }
    let method = method.uppercased()
    // Existing plaintext downloads remain available for explicit migration and
    // review; they do not become protected just because writes are blocked.
    if ["GET", "HEAD"].contains(method) { return }
    if group == .driver, path == "session", ["POST", "DELETE"].contains(method) { return }
    if group == .driver, path == "banks", method == "POST", let body,
      let value = try? JSONSerialization.jsonObject(with: body) as? [String: String] {
      if value["action"] == "disconnect", Set(value.keys) == ["action", "itemId"], value["itemId"]?.isEmpty == false { return }
      if value["action"] == "cancel", Set(value.keys) == ["action", "sessionId"], value["sessionId"]?.isEmpty == false { return }
    }
    throw SecureTaxTransportPolicyError.encryptedReplacementRequired
  }
}
