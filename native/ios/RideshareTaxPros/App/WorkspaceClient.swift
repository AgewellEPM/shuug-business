import DriverCore
import Foundation

struct ClientAccount: Codable {
  var id: UUID
  var name: String
  var email: String
}
struct WorkspaceBrand: Codable {
  var name: String
  var primaryColor: String
  var accentColor: String
}
struct LoginReply: Codable {
  var apiVersion: Int
  var token: String
  var expiresAt: Date
  var account: ClientAccount
  var branding: WorkspaceBrand
}
struct ConnectionProfile: Codable {
  var origin: URL
  var session: LoginReply

  var portalURL: URL { origin.appendingPathComponent("api/website/customer") }
}
enum WorkspaceError: LocalizedError {
  case message(String)
  case server(Int, String, ServerRecord?)
  var errorDescription: String? {
    switch self {
    case .message(let message), .server(_, let message, _): message
    }
  }
}
enum WorkspaceAddress {
  static func parse(_ text: String) throws -> URL {
    guard var c = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
      c.scheme?.lowercased() == "https", let host = c.host?.lowercased(), host.contains("."),
      c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
      c.port == nil || c.port == 443,
      ["", "/", "/api/website/customer", "/api/website/customer/"].contains(c.path),
      !host.hasSuffix(".local"), !host.hasSuffix(".internal"), !host.hasSuffix(".localhost"),
      !host.contains(":"), !host.allSatisfy({ $0.isNumber || $0 == "." })
    else {
      throw WorkspaceError.message(
        "Use your firm’s public HTTPS workspace address or client sign-in link.")
    }
    c.scheme = "https"
    c.host = host
    c.path = ""
    c.port = nil
    guard let result = c.url else { throw WorkspaceError.message("Check the workspace address.") }
    return result
  }
}
private final class SameOriginRedirects: NSObject, URLSessionTaskDelegate {
  let origin: URL
  init(_ origin: URL) { self.origin = origin }
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard request.url?.scheme == origin.scheme, request.url?.host == origin.host,
      (request.url?.port ?? 443) == (origin.port ?? 443)
    else {
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }
}
final class WorkspaceClient {
  static let websiteURL = URL(string: "https://gigtax.pro")!
  static let discoveryURL = websiteURL.appendingPathComponent("site-config.json")
  let origin: URL, token: String?
  private let session: URLSession
  init(origin: URL, token: String? = nil) {
    self.origin = origin
    self.token = token
    let c = URLSessionConfiguration.ephemeral
    c.httpShouldSetCookies = false
    c.httpCookieStorage = nil
    c.urlCache = nil
    c.requestCachePolicy = .reloadIgnoringLocalCacheData
    c.timeoutIntervalForRequest = 25
    c.timeoutIntervalForResource = 60
    session = URLSession(
      configuration: c, delegate: SameOriginRedirects(origin), delegateQueue: nil)
  }
  deinit { session.invalidateAndCancel() }
  private struct Failure: Decodable {
    var error: String?
    var current: ServerRecord?
  }
  private func send(
    _ path: String, method: String = "GET", query: [URLQueryItem] = [], body: Data? = nil,
    mime: String = "application/json"
  ) async throws -> (Data, HTTPURLResponse) {
    var c = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
    c.path = "/api/website/customer/driver/" + path
    c.queryItems = query.isEmpty ? nil : query
    var request = URLRequest(url: c.url!)
    request.httpMethod = method
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if body != nil { request.setValue(mime, forHTTPHeaderField: "Content-Type") }
    if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
    let (data, raw) = try await session.data(for: request)
    guard let response = raw as? HTTPURLResponse, data.count <= 8 * 1024 * 1024 else {
      throw WorkspaceError.message("The workspace returned an unexpected response.")
    }
    guard (200...299).contains(response.statusCode) else {
      let failure = try? WireJSON.decoder().decode(Failure.self, from: data)
      throw WorkspaceError.server(
        response.statusCode,
        failure?.error ?? "The workspace could not complete this request (\(response.statusCode)).",
        failure?.current)
    }
    return (data, response)
  }
  func login(email: String, password: String) async throws -> LoginReply {
    struct Input: Encodable {
      let email: String
      let password: String
    }
    let (data, _) = try await send(
      "session", method: "POST",
      body: WireJSON.encoder().encode(Input(email: email, password: password)))
    let reply = try WireJSON.decoder().decode(LoginReply.self, from: data)
    guard reply.apiVersion == 1,
      reply.token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    else { throw WorkspaceError.message("This workspace uses an unsupported driver connection.") }
    return reply
  }
  func logout() async throws { _ = try await send("session", method: "DELETE") }
  func save(_ mutation: DriverMutation) async throws -> ServerRecord {
    let (data, _) = try await send(
      "records", method: "POST", body: WireJSON.encoder().encode(mutation))
    return try WireJSON.decoder().decode(ServerRecord.self, from: data)
  }
  func records(after: Int) async throws -> SyncPage {
    let (data, _) = try await send(
      "records", query: [URLQueryItem(name: "after", value: String(after))])
    return try WireJSON.decoder().decode(SyncPage.self, from: data)
  }
  func upload(_ receipt: LocalReceipt, data: Data) async throws {
    _ = try await send(
      "receipts/" + receipt.id.uuidString.lowercased(), method: "PUT", body: data,
      mime: receipt.mime)
  }
  func receipt(_ id: UUID) async throws -> (Data, String) {
    let (data, response) = try await send("receipts/" + id.uuidString.lowercased())
    return (data, response.mimeType ?? "application/octet-stream")
  }
  func banks() async throws -> BankStatusReply {
    let (data, _) = try await send("banks")
    return try WireJSON.decoder().decode(BankStatusReply.self, from: data)
  }
  func referrals(_ action: [String: String]? = nil) async throws -> ReferralSummary {
    let (data, _) = try await send("referrals", method: action == nil ? "GET" : "POST", body: try action.map { try JSONEncoder().encode($0) })
    return try WireJSON.decoder().decode(ReferralSummary.self, from: data)
  }
  func bankAction<T: Decodable>(_ body: [String: String], as type: T.Type) async throws -> T {
    let (data, _) = try await send("banks", method: "POST", body: JSONEncoder().encode(body))
    return try WireJSON.decoder().decode(type, from: data)
  }
  func bankFeed(after: Int) async throws -> BankFeedReply {
    let (data, _) = try await send("banks", query: [URLQueryItem(name: "after", value: String(after))])
    return try WireJSON.decoder().decode(BankFeedReply.self, from: data)
  }
  func coach(from: String, through: String) async throws -> CoachState {
    let (data, _) = try await send("coach", query: [URLQueryItem(name: "from", value: from), URLQueryItem(name: "through", value: through)])
    return try WireJSON.decoder().decode(CoachState.self, from: data)
  }
  func coachMessage(_ message: CoachPendingMessage) async throws -> CoachState {
    struct Input: Encodable {
      let action = "message"
      let mutationId: UUID, messageId: UUID, text: String, from: String, through: String
      let preferences: CoachPreferences
    }
    let input = Input(mutationId: message.id, messageId: message.id, text: message.text,
      from: message.from, through: message.through, preferences: message.preferences)
    let (data, _) = try await send("coach", method: "POST", body: WireJSON.encoder().encode(input))
    return try WireJSON.decoder().decode(CoachState.self, from: data)
  }
  func coachIntake(_ intake: CoachIntake, mutationId: UUID) async throws -> CoachState {
    struct Input: Encodable {
      let action = "intake"
      let mutationId: UUID
      let answers: CoachIntake
      let confirmed = true
    }
    let (data, _) = try await send("coach", method: "POST", body: WireJSON.encoder().encode(Input(mutationId: mutationId, answers: intake)))
    return try WireJSON.decoder().decode(CoachState.self, from: data)
  }
  static func discover() async throws -> URL? {
    let client = WorkspaceClient(origin: websiteURL)
    var request = URLRequest(url: discoveryURL)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = 15
    let (data, response) = try await client.session.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
      throw WorkspaceError.message("The firm’s connection information is unavailable.")
    }
    return try discoveredWorkspace(from: data)
  }
  static func discoveredWorkspace(from data: Data) throws -> URL? {
    struct Config: Decodable { var workspaceUrl: String? }
    guard data.count < 32_000 else {
      throw WorkspaceError.message("The firm’s connection information is unavailable.")
    }
    guard let text = try JSONDecoder().decode(Config.self, from: data).workspaceUrl else {
      return nil
    }
    return try WorkspaceAddress.parse(text)
  }
}
