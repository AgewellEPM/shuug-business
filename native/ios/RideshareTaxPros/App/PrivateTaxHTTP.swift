import Foundation

struct PrivateTaxSession: Codable, Equatable {
  var apiVersion: Int
  var token: String
  var expiresAt: String
  var identity: SecureTaxIdentity
  var recoveryCodes: [String]?
  func validate(now: Date = Date()) throws {
    try SecureTaxManifest.validateId(identity.accountId); try SecureTaxManifest.validateId(identity.clientId)
    guard apiVersion == 1, token.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil, token.count == 64, try PrivateTaxWire.date(expiresAt) > now, (recoveryCodes?.count ?? 0) <= 10 else { throw PrivateTaxWire.fail("The private sign-in response is invalid or expired.") }
  }
}
struct PrivateTaxMFA: Decodable {
  var apiVersion: Int; var mfaRequired: Bool; var challengeToken: String
  var enrollmentRequired: Bool; var expiresAt: String; var secret: String?
  func validate(now: Date = Date()) throws {
    let expires = try PrivateTaxWire.date(expiresAt)
    guard apiVersion == 1, mfaRequired, challengeToken.count == 64, challengeToken.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil, expires > now, expires <= now.addingTimeInterval(360), !enrollmentRequired || secret?.range(of: #"^[A-Z2-7]{32}$"#, options: .regularExpression) != nil else { throw PrivateTaxWire.fail("Restart private sign-in to obtain a current authenticator challenge.") }
  }
}
private final class PrivateTaxNoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
protocol PrivateTaxObjectTransport {
  var pins: PrivateTaxPins { get }
  func putObject(_ objectId: String, token: String, body: Data) async throws -> Data
}
final class PrivateTaxHTTP: PrivateTaxObjectTransport {
  struct Response { var status: Int; var data: Data
    var object: [String: Any] { get throws {
      guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw PrivateTaxWire.fail() }; return object
    } }
  }
  let pins: PrivateTaxPins
  private let session: URLSession
  init(pins: PrivateTaxPins) throws {
    try pins.validate(); self.pins = pins
    let config = URLSessionConfiguration.ephemeral; config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData; config.timeoutIntervalForRequest = 25; config.timeoutIntervalForResource = 60
    session = URLSession(configuration: config, delegate: PrivateTaxNoRedirects(), delegateQueue: nil)
  }
  deinit { session.invalidateAndCancel() }
  func makeRequest(_ path: String, method: String = "GET", token: String? = nil, body: Data? = nil) throws -> URLRequest {
    guard let matched = path.range(of: #"^(native-session|status|enroll|account|objects(/[A-Za-z0-9._:-]+)?(\?after=[0-9]+&limit=[0-9]+)?|social/(config|start|result))$"#, options: .regularExpression), matched == path.startIndex..<path.endIndex, (body?.count ?? 0) <= 24 * 1024 * 1024, let url = URL(string: pins.workspaceOrigin + "/api/website/customer/client-only/" + path) else { throw PrivateTaxWire.fail() }
    var request = URLRequest(url: url); request.httpMethod = method; request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Accept"); if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
    return request
  }
  func putObject(_ objectId: String, token: String, body: Data) async throws -> Data {
    try SecureTaxJournalSnapshot.validateObjectID(objectId)
    return try await request("objects/" + objectId, method: "PUT", token: token, body: body).data
  }
  func request(_ path: String, method: String = "GET", token: String? = nil, body: Data? = nil, maximum: Int = 65_536, allowMFA: Bool = false) async throws -> Response {
    let request = try makeRequest(path, method: method, token: token, body: body), url = request.url!
    let (stream, raw) = try await session.bytes(for: request)
    guard let http = raw as? HTTPURLResponse, http.url?.absoluteString == url.absoluteString, http.expectedContentLength <= maximum else { throw PrivateTaxWire.fail("The private workspace response exceeded its expected origin or size.") }
    var bytes = Data()
    for try await byte in stream { guard bytes.count < maximum else { throw PrivateTaxWire.fail("The private workspace response is too large.") }; bytes.append(byte) }
    guard (200...299).contains(http.statusCode) || (allowMFA && http.statusCode == 428) else {
      if http.statusCode == 409 { throw PrivateTaxWire.fail("The encrypted account or object changed. Keep the local data and review before retrying.") }
      throw PrivateTaxWire.fail("The private workspace did not confirm this request (\(http.statusCode)). Your local data and pending ciphertext are kept.")
    }
    return Response(status: http.statusCode, data: bytes)
  }
  func status(_ authenticated: PrivateTaxSession) async throws -> PrivateTaxManifest {
    try authenticated.validate()
    let response = try await request("status", token: authenticated.token), object = try response.object
    guard object["profile"] as? String == PrivateTaxWire.profile, object["enrolled"] as? Bool == true, let identity = object["identity"] as? [String: Any], identity["accountId"] as? String == authenticated.identity.accountId, identity["clientId"] as? String == authenticated.identity.clientId, let manifest = object["manifest"] else { throw PrivateTaxWire.fail("This account has no matching client-owned enrollment. Use its new-profile invitation in the portal first.") }
    return try PrivateTaxManifest.decode(PrivateTaxWire.json(manifest))
  }
}

struct PrivateTaxSessionStore {
  private let storage: any SecureTaxKeyStore
  init(storage: any SecureTaxKeyStore = SecureTaxKeychainStore()) { self.storage = storage }
  private struct Stored: Codable { var version = 2; var profile = PrivateTaxWire.profile; var origin: String; var session: PrivateTaxSession? }
  func read(pins: PrivateTaxPins) throws -> PrivateTaxSession? {
    guard let data = try storage.read(account: "client-only-session") else { return nil }
    let stored = try JSONDecoder().decode(Stored.self, from: data)
    guard stored.version == 2, stored.profile == PrivateTaxWire.profile, stored.origin == pins.workspaceOrigin else { throw PrivateTaxWire.fail() }
    try stored.session?.validate(); return stored.session
  }
  func save(_ session: PrivateTaxSession?, pins: PrivateTaxPins) throws {
    try session?.validate()
    let stored = Stored(origin: pins.workspaceOrigin, session: session), account = "client-only-session", data = try JSONEncoder().encode(stored)
    if try storage.read(account: account) == nil { try storage.add(data, account: account) } else { try storage.update(data, account: account) }
  }
}
