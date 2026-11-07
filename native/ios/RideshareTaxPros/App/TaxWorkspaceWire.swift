import Foundation

struct TaxWorkspaceReply: Codable {
  var apiVersion: Int
  var tax: TaxWorkspaceSummary?
}
struct TaxWorkspaceSummary: Codable {
  var engagements: [ClientTaxEngagement]
  var quarterly: [ClientQuarterlyReview]
}
struct ClientTaxEngagement: Codable {
  var name: String
  var year: Int?
  var stage: String
  var message: String
  var documents: [ClientDocumentRequest]
  var records: [ClientTaxRecordStatus]
}
struct ClientDocumentRequest: Codable, Identifiable {
  var id: UUID
  var name: String
  var status: String
  var requestedBy: String
  var message: String
  var submissions: [ClientTaxDocument]
  var uploadAvailable: Bool
}
struct ClientTaxDocument: Codable, Identifiable {
  var id: UUID
  var name: String
  var mime: String
  var size: Int
  var createdAt: Date
  var status: String
  var reviewedAt: Date?

  var statusLabel: String {
    switch status {
    case "received": "Received by your firm"
    case "reviewed": "Staff marked reviewed"
    case "replacement_requested": "Replacement requested"
    default: status.replacingOccurrences(of: "_", with: " ")
    }
  }
}
struct ClientTaxRecordStatus: Codable {
  var name: String
  var platform: String
  var income: String
  var mileage: String
  var expenses: String
  var message: String
}
struct ClientQuarterlyReview: Codable {
  var name: String
  var year: Int?
  var quarter: String
  var status: String
  var reviewOn: String
  var message: String
}

struct TaxUploadFile: Sendable {
  static let maximumBytes = 10 * 1024 * 1024
  var name: String
  var bytes: Data
  var mime: String

  init(name: String, bytes: Data) throws {
    guard !bytes.isEmpty, bytes.count <= Self.maximumBytes else {
      throw WorkspaceError.message("Choose one document between 1 byte and 10 MB.")
    }
    let mime: String
    if bytes.starts(with: Data("%PDF-".utf8)) { mime = "application/pdf" }
    else if bytes.starts(with: Data([0xff, 0xd8, 0xff])) { mime = "image/jpeg" }
    else if bytes.starts(with: Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) { mime = "image/png" }
    else { throw WorkspaceError.message("Choose a PDF, JPEG or PNG document.") }
    let clean = name.components(separatedBy: .controlCharacters).joined(separator: "_")
      .replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\\", with: "_")
      .replacingOccurrences(of: "/", with: "_").trimmingCharacters(in: .whitespacesAndNewlines)
    self.name = clean.isEmpty ? "Tax document" : String(clean.prefix(160))
    self.bytes = bytes
    self.mime = mime
  }
  static func read(_ url: URL) throws -> Self {
    let access = url.startAccessingSecurityScopedResource()
    defer { if access { url.stopAccessingSecurityScopedResource() } }
    let input = try FileHandle(forReadingFrom: url)
    defer { try? input.close() }
    var bytes = Data()
    while let chunk = try input.read(upToCount: min(64 * 1024, maximumBytes + 1 - bytes.count)), !chunk.isEmpty {
      bytes.append(chunk)
      guard bytes.count <= maximumBytes else { throw WorkspaceError.message("This document exceeds 10 MB.") }
    }
    return try Self(name: url.lastPathComponent, bytes: bytes)
  }
  func multipart(requestID: UUID, boundary: String) -> Data {
    var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"requestId\"\r\n\r\n\(requestID.uuidString.lowercased())\r\n".utf8)
    body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
    body.append(bytes)
    body.append(Data("\r\n--\(boundary)--\r\n".utf8))
    return body
  }
}
