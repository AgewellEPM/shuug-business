import DriverCore
import Foundation

@main struct NativeTaxWorkspaceWireProof {
  static func main() throws {
    var checks: [String] = []
    let requestID = UUID(), documentID = UUID()
    let fixture = """
    {"apiVersion":1,"tax":{"engagements":[{"name":"Synthetic preparation","year":2026,"stage":"Awaiting documents","message":"Shared client update","documents":[{"id":"\(requestID)","name":"Annual summary","status":"Requested","requestedBy":"2026-12-01","message":"Upload a readable copy","submissions":[{"id":"\(documentID)","name":"Summary.pdf","mime":"application/pdf","size":12,"createdAt":"2026-11-07T05:45:00.000Z","status":"received","reviewedAt":null}],"uploadAvailable":true}],"records":[{"name":"Driver records","platform":"Uber","income":"Received","mileage":"Requested","expenses":"To review","message":"Staff-visible update"}]}],"quarterly":[{"name":"Q4 review","year":2026,"quarter":"Q4","status":"Scheduled","reviewOn":"2026-12-02","message":"Review your records"}]}}
    """
    let reply = try WireJSON.decoder().decode(TaxWorkspaceReply.self, from: Data(fixture.utf8))
    guard reply.apiVersion == 1, let tax = reply.tax,
      tax.engagements[0].documents[0].id == requestID,
      tax.engagements[0].documents[0].submissions[0].id == documentID,
      tax.engagements[0].documents[0].submissions[0].statusLabel == "Received by your firm",
      tax.quarterly[0].year == 2026
    else { throw Failure.failed("Native client could not decode the shared tax-workspace contract.") }
    checks.append("Shared engagements, request UUIDs, document timestamps/status and quarterly updates decode with the native wire decoder")

    let pdf = Data("%PDF-1.4\nSynthetic wire fixture\n%%EOF".utf8)
    let file = try TaxUploadFile(name: "summary\"\r\nX-Injected: bad.pdf", bytes: pdf)
    guard file.mime == "application/pdf", !file.name.contains("\""), !file.name.contains("\r"), !file.name.contains("\n") else { throw Failure.failed("Unsafe upload filename was retained.") }
    let body = file.multipart(requestID: requestID, boundary: "SyntheticBoundary")
    guard body.range(of: Data("name=\"requestId\"\r\n\r\n\(requestID.uuidString.lowercased())".utf8)) != nil,
      body.range(of: Data("name=\"file\"; filename=\"\(file.name)\"".utf8)) != nil,
      body.range(of: pdf) != nil,
      body.suffix(Data("\r\n--SyntheticBoundary--\r\n".utf8).count) == Data("\r\n--SyntheticBoundary--\r\n".utf8)
    else { throw Failure.failed("Multipart request did not preserve the selected request and original bytes.") }
    checks.append("Confirmed multipart upload binds the original bytes to the request and strips filename header injection")

    guard rejects({ _ = try TaxUploadFile(name: "empty.pdf", bytes: Data()) }),
      rejects({ _ = try TaxUploadFile(name: "unsafe.html", bytes: Data("<html>fixture</html>".utf8)) }),
      rejects({ _ = try TaxUploadFile(name: "large.pdf", bytes: Data(repeating: 0, count: TaxUploadFile.maximumBytes + 1)) })
    else { throw Failure.failed("Invalid or oversized local document was accepted.") }
    checks.append("Empty, unsupported and greater-than-10MB documents are rejected before upload")

    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("native-tax-wire-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let selected = directory.appendingPathComponent("Original.pdf")
    try pdf.write(to: selected)
    guard try TaxUploadFile.read(selected).bytes == pdf, try Data(contentsOf: selected) == pdf else { throw Failure.failed("File selection changed the source document.") }
    let large = directory.appendingPathComponent("Too-large.pdf")
    try Data(repeating: 0, count: TaxUploadFile.maximumBytes + 1).write(to: large)
    guard rejects({ _ = try TaxUploadFile.read(large) }) else { throw Failure.failed("Bounded file reader accepted an oversized source.") }
    checks.append("Bounded Files reading preserves the original document and stops at the byte limit")

    let profile = ConnectionProfile(origin: URL(string: "https://workspace.example.com")!, session: LoginReply(apiVersion: 1, token: String(repeating: "a", count: 64), expiresAt: Date().addingTimeInterval(3600), account: ClientAccount(id: UUID(), name: "Synthetic client", email: "synthetic@example.com"), branding: WorkspaceBrand(name: "Gig Tax Pros", primaryColor: "#9425e8", accentColor: "#f51eea")))
    guard profile.taxDocumentsURL.absoluteString == "https://workspace.example.com/api/website/customer#tax-work" else { throw Failure.failed("Private portal fallback link did not retain the workspace origin.") }
    checks.append("Private browser fallback remains on the authenticated firm's origin")
    let receipt: [String: Any] = ["ok": true, "checks": checks, "scope": "Native tax wire and bounded local files; no live server or real client documents", "verifiedAt": ISO8601DateFormatter().string(from: Date())]
    print(String(data: try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
  }
  private static func rejects(_ operation: () throws -> Void) -> Bool { do { try operation(); return false } catch { return true } }
  private enum Failure: Error { case failed(String) }
}
