import Foundation

struct SecureTaxEnrollmentRequest: Encodable {
  let version = 1
  var workspaceId: String
  var accountId: String
  var clientId: String
  var client: SecureTaxManifest.PublicRecipient

  init(scope: SecureTaxKeyScope, client: SecureTaxManifest.PublicRecipient) {
    workspaceId = scope.workspaceId; accountId = scope.identity.accountId
    clientId = scope.identity.clientId; self.client = client
  }
  func publicJSON() throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return String(decoding: try encoder.encode(self), as: UTF8.self)
  }
}

struct SecureTaxServerStatus: Decodable {
  var enrolled: Bool
  var secureRequired: Bool?
  var keyProvisioningEnabled: Bool
  var identity: SecureTaxIdentity
  var manifest: SecureTaxManifest?
  var legacyMigrationRequired: Bool?
  var legacyProviderAuthorizationPresent: Bool?
  func validate(accountId: String) throws {
    guard identity.accountId == accountId, enrolled == (manifest != nil) else {
      throw SecureTaxSetupError.message("The workspace encryption status does not match this account or enrollment.")
    }
    try SecureTaxManifest.validateId(identity.accountId)
    try SecureTaxManifest.validateId(identity.clientId)
  }
}

private final class SecureTaxNoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Public status only. This setup foundation deliberately has no enrollment
/// POST: activation must wait for a verified encrypted replacement for sync.
final class SecureTaxEnrollmentClient {
  private let session: URLSession
  private let origin: URL
  private let token: String
  init(origin: URL, token: String) {
    self.origin = origin; self.token = token
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false; config.httpCookieStorage = nil
    config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 30
    session = URLSession(configuration: config, delegate: SecureTaxNoRedirects(), delegateQueue: nil)
  }
  deinit { session.invalidateAndCancel() }
  func status(pins: SecureTaxPublicPins, accountId: String) async throws -> SecureTaxServerStatus {
    try pins.validate()
    guard origin.absoluteString == pins.workspaceOrigin else {
      throw SecureTaxSetupError.message("This connection does not match the workspace pinned in the signed app.")
    }
    var url = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
    url.path = "/api/website/customer/secure/status"
    var request = URLRequest(url: url.url!)
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (stream, raw) = try await session.bytes(for: request)
    guard let response = raw as? HTTPURLResponse, response.expectedContentLength <= 65_536 else {
      throw SecureTaxSetupError.message("The workspace returned an invalid encryption status.")
    }
    var data = Data()
    for try await byte in stream {
      guard data.count < 65_536 else { throw SecureTaxSetupError.message("The workspace encryption status is too large.") }
      data.append(byte)
    }
    guard response.statusCode == 200 else {
      throw SecureTaxSetupError.message("The workspace could not confirm this account’s encryption setup (\(response.statusCode)).")
    }
    let value = try JSONDecoder().decode(SecureTaxServerStatus.self, from: data)
    try value.validate(accountId: accountId)
    if value.manifest != nil,
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], let manifest = object["manifest"] {
      _ = try SecureTaxManifest.decode(JSONSerialization.data(withJSONObject: manifest))
    }
    return value
  }
}
