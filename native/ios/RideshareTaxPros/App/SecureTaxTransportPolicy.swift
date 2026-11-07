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
  enum Group { case driver, customer }
  static func requiresProtectedTransport(origin: URL, bundle: Bundle = .main) throws -> Bool {
    guard let url = bundle.url(forResource: "SecureTaxTrustedPins", withExtension: "json") else { return false }
    let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
    return try requiresProtectedTransport(origin: origin, configuration: file.read(upToCount: 16_385) ?? Data())
  }
  /// Validation here only chooses a stricter transport policy. Cryptographic
  /// point/signature validation remains in SecureTaxManifest, without a fallback.
  static func requiresProtectedTransport(origin: URL, configuration: Data?) throws -> Bool {
    guard let configuration else { return false }
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
