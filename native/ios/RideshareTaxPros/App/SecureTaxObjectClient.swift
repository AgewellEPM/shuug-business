import Foundation

struct SecureTaxObjectReceipt: Codable {
  var objectId: String
  var revision: Int
  var sequence: Int
  var deleted: Bool
  var duplicate: Bool?
  func validate() throws {
    try SecureTaxJournalSnapshot.validateObjectID(objectId)
    guard (1...1_000_000_001).contains(revision), (1...9_007_199_254_740_991).contains(sequence) else {
      throw SecureTaxSetupError.message("The encrypted workspace returned an invalid object revision.")
    }
  }
}
struct SecureTaxObjectPage: Decodable {
  var changes: [SecureTaxObjectReceipt]
  var cursor: Int
  var hasMore: Bool
}
struct SecureTaxStoredObject: Decodable {
  var objectId: String
  var revision: Int
  var sequence: Int
  var deleted: Bool
  var envelope: SecureTaxEnvelope?
}
protocol SecureTaxObjectTransport {
  func changes(after: Int, limit: Int) async throws -> SecureTaxObjectPage
  func object(_ objectId: String) async throws -> SecureTaxStoredObject
  func put(_ upload: SecureTaxSnapshotUpload) async throws -> SecureTaxObjectReceipt
  func delete(_ objectId: String, expectedRevision: Int) async throws -> SecureTaxObjectReceipt
}
private final class SecureTaxObjectNoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Real opaque-object CRUD. Only the encrypted envelope and routing/CAS metadata
/// enter request bodies. No plaintext journal or private key is accepted here.
final class SecureTaxObjectClient: SecureTaxObjectTransport {
  private let session: URLSession
  private let origin: URL
  private let token: String
  private let scope: SecureTaxKeyScope
  init(origin: URL, token: String, scope: SecureTaxKeyScope, pins: SecureTaxPublicPins) throws {
    try pins.validate()
    guard origin.absoluteString == pins.workspaceOrigin,
      try scope == SecureTaxKeyScope(pins: pins, identity: scope.identity) else {
      throw SecureTaxSetupError.message("The encrypted transport does not match this independently trusted workspace.")
    }
    self.origin = origin; self.token = token; self.scope = scope
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false; config.httpCookieStorage = nil
    config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 25; config.timeoutIntervalForResource = 60
    session = URLSession(configuration: config, delegate: SecureTaxObjectNoRedirects(), delegateQueue: nil)
  }
  deinit { session.invalidateAndCancel() }
  private func request<T: Decodable>(_ objectId: String? = nil, method: String = "GET",
    query: [URLQueryItem] = [], body: Data? = nil, maximum: Int = 65_536) async throws -> T {
    if let objectId { try SecureTaxJournalSnapshot.validateObjectID(objectId) }
    var url = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
    url.path = "/api/website/customer/secure/objects" + (objectId.map { "/" + $0 } ?? "")
    url.queryItems = query.isEmpty ? nil : query
    var request = URLRequest(url: url.url!)
    request.httpMethod = method; request.httpBody = body
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    let (stream, raw) = try await session.bytes(for: request)
    guard let response = raw as? HTTPURLResponse, response.expectedContentLength <= Int64(maximum) else {
      throw SecureTaxSetupError.message("The encrypted workspace response exceeds its size limit.")
    }
    var data = Data()
    for try await byte in stream {
      guard data.count < maximum else { throw SecureTaxSetupError.message("The encrypted workspace response exceeds its size limit.") }
      data.append(byte)
    }
    guard (200...299).contains(response.statusCode) else {
      if response.statusCode == 409 {
        throw SecureTaxSetupError.message("The encrypted snapshot changed. Keep your current journal and review the latest remote version before retrying.")
      }
      throw SecureTaxSetupError.message("The encrypted workspace request was not confirmed (\(response.statusCode)). Keep the local journal and retry.")
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
  func changes(after: Int, limit: Int = 100) async throws -> SecureTaxObjectPage {
    guard (0...9_007_199_254_740_991).contains(after), (1...200).contains(limit) else {
      throw SecureTaxSetupError.message("Choose a supported encrypted sync cursor and page size.")
    }
    let page: SecureTaxObjectPage = try await request(query: [.init(name: "after", value: String(after)), .init(name: "limit", value: String(limit))])
    guard page.changes.count <= limit, page.cursor == (page.changes.last?.sequence ?? after),
      !page.hasMore || !page.changes.isEmpty else { throw SecureTaxSetupError.message("The encrypted sync cursor is invalid.") }
    var sequence = after
    for row in page.changes {
      try row.validate()
      guard row.sequence > sequence else { throw SecureTaxSetupError.message("The encrypted sync sequence moved backwards.") }
      sequence = row.sequence
    }
    return page
  }
  func object(_ objectId: String) async throws -> SecureTaxStoredObject {
    let object: SecureTaxStoredObject = try await request(objectId, maximum: 24 * 1024 * 1024)
    try SecureTaxObjectReceipt(objectId: object.objectId, revision: object.revision, sequence: object.sequence, deleted: object.deleted).validate()
    guard object.objectId == objectId, object.deleted == (object.envelope == nil) else {
      throw SecureTaxSetupError.message("The encrypted object does not match the requested snapshot.")
    }
    if let context = object.envelope?.context {
      guard context.workspaceId == scope.workspaceId, context.accountId == scope.identity.accountId,
        context.objectId == objectId, context.revision == object.revision else {
        throw SecureTaxSetupError.message("The encrypted object belongs to a different account or revision.")
      }
    }
    return object
  }
  func put(_ upload: SecureTaxSnapshotUpload) async throws -> SecureTaxObjectReceipt {
    struct Input: Encodable { var mutationId: String; var expectedRevision: Int; var envelope: SecureTaxEnvelope }
    try SecureTaxJournalSnapshot.validateObjectID(upload.mutationId)
    let context = upload.envelope.context
    guard (0..<1_000_000_000).contains(upload.expectedRevision),
      context.workspaceId == scope.workspaceId, context.accountId == scope.identity.accountId,
      context.domain == .driverState, context.revision == upload.expectedRevision + 1,
      upload.envelope.version == 2 else {
      throw SecureTaxSetupError.message("The encrypted snapshot upload belongs to another account or revision.")
    }
    let data = try JSONEncoder().encode(Input(mutationId: upload.mutationId, expectedRevision: upload.expectedRevision, envelope: upload.envelope))
    guard data.count <= 24 * 1024 * 1024 else { throw SecureTaxSetupError.message("The encrypted snapshot exceeds its transport size limit.") }
    let receipt: SecureTaxObjectReceipt = try await request(context.objectId, method: "PUT", body: data)
    try receipt.validate()
    guard receipt.objectId == context.objectId, receipt.revision == context.revision, !receipt.deleted else {
      throw SecureTaxSetupError.message("The workspace acknowledgment does not match the encrypted snapshot sent.")
    }
    return receipt
  }
  func delete(_ objectId: String, expectedRevision: Int) async throws -> SecureTaxObjectReceipt {
    struct Input: Encodable { var expectedRevision: Int }
    guard (1...1_000_000_001).contains(expectedRevision) else { throw SecureTaxSetupError.message("The snapshot deletion revision is invalid.") }
    let receipt: SecureTaxObjectReceipt = try await request(objectId, method: "DELETE", body: JSONEncoder().encode(Input(expectedRevision: expectedRevision)))
    try receipt.validate()
    guard receipt.objectId == objectId, receipt.deleted,
      [expectedRevision, expectedRevision + 1].contains(receipt.revision) else {
      throw SecureTaxSetupError.message("The workspace did not confirm this snapshot’s deletion.")
    }
    return receipt
  }
}
