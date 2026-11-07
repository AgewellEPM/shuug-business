import Foundation

@main struct ConnectedWorkProof {
  static func main() async throws {
    let origin = URL(string: CommandLine.arguments[1])!
    guard origin.scheme == "http", origin.host == "127.0.0.1", origin.port != nil else {
      throw WorkspaceError.message("Use the disposable loopback fixture.")
    }
    let login = try await WorkspaceClient(origin: origin).login(email: "telemetry.alpha@example.com", password: "Synthetic-telemetry-password")
    let client = WorkspaceClient(origin: origin, token: login.token)
    let summary = try await client.connectedWork()
    guard summary.records.count == 1, summary.records[0].income?["total"] == "42.35",
      summary.records[0].rating == "4.98", summary.records[0].deliveryDelaySeconds == 60,
      summary.incomingOfferFeed == false, !summary.ready else {
      throw WorkspaceError.message("Actual native summary did not retain fixture data or readiness limits.")
    }
    let handoff = try await client.connectedWorkLink()
    guard handoff.host == origin.host, handoff.port == origin.port,
      !handoff.absoluteString.contains(login.token) else {
      throw WorkspaceError.message("Native handoff exposed a client credential or changed origin.")
    }
    try await client.checkConnectedWork()
    print(String(data: try JSONSerialization.data(withJSONObject: ["ok": true, "nativeSummaryDecoded": true,
      "nativeSyncQueued": true, "nativeHandoffValidated": true]), encoding: .utf8)!)
  }
}
