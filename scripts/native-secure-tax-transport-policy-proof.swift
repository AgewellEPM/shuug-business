import Foundation

@main struct SecureTaxTransportPolicyProof {
  struct Failure: Error {}
  static func main() throws {
    let origin = URL(string: "https://synthetic.invalid")!
    let publicOnly: [String: Any] = ["version": 1, "workspaceOrigin": origin.absoluteString, "workspaceId": "synthetic-workspace",
      "signerPublicKey": "synthetic-public-pin-placeholder", "firmRecoveryPublicKey": "separate-synthetic-public-pin-placeholder"]
    let configuration = try JSONSerialization.data(withJSONObject: publicOnly)
    var checks: [String] = []
    func require(_ value: Bool) throws { if !value { throw Failure() } }
    func blocked(_ label: String, group: SecureTaxTransportPolicy.Group = .driver, path: String, method: String = "POST", input: [String: String]? = nil) throws {
      do {
        try SecureTaxTransportPolicy.assertLegacyAllowed(protectedWorkspace: true, group: group, path: path, method: method,
          body: try input.map { try JSONEncoder().encode($0) })
        throw Failure()
      } catch is SecureTaxTransportPolicyError { checks.append(label) }
    }
    try require(try !SecureTaxTransportPolicy.requiresProtectedTransport(origin: origin, configuration: nil))
    checks.append("no bundled pin leaves preexisting workspace behavior unchanged")
    try require(try SecureTaxTransportPolicy.requiresProtectedTransport(origin: origin, configuration: configuration))
    checks.append("bundled workspace pin requires protected transport before enrollment")
    try require(try !SecureTaxTransportPolicy.requiresProtectedTransport(origin: URL(string: "https://other.invalid")!, configuration: configuration))
    checks.append("public workspace pin is scoped to its exact API origin")
    do { _ = try SecureTaxTransportPolicy.requiresProtectedTransport(origin: origin, configuration: Data("{}".utf8)); throw Failure() }
    catch is SecureTaxTransportPolicyError { checks.append("invalid present configuration fails closed") }
    try blocked("record writes stopped before transport", path: "records")
    try blocked("receipt writes stopped before transport", path: "receipts/opaque-id", method: "PUT")
    try blocked("profile mutation stopped before transport", path: "profile", method: "PATCH")
    try blocked("tax multipart upload stopped before transport", group: .customer, path: "documents")
    try blocked("bank Link creation stopped before transport", path: "banks", input: ["action": "link"])
    try blocked("bank token exchange stopped before transport", path: "banks", input: ["action": "exchange", "publicToken": "synthetic"])
    try blocked("bank provider sync stopped before transport", path: "banks", input: ["action": "sync", "itemId": "synthetic"])
    try blocked("referral payout mutation stopped before transport", path: "referrals", input: ["action": "redeem"])
    try blocked("merged Tax and Goals coach message or intake stopped before transport", path: "coach", input: ["action": "message", "text": "synthetic private context"])
    try blocked("unknown future mutation fails closed", path: "future-feature")
    try blocked("disconnect cannot smuggle sensitive extra fields", path: "banks", input: ["action": "disconnect", "itemId": "synthetic", "publicToken": "forbidden"])
    for (action, field) in [("disconnect", "itemId"), ("cancel", "sessionId")] {
      try SecureTaxTransportPolicy.assertLegacyAllowed(protectedWorkspace: true, group: .driver, path: "banks", method: "POST",
        body: JSONEncoder().encode(["action": action, field: "synthetic-routing-id"]))
    }
    checks.append("bank disconnect and unfinished-session cancellation remain available")
    for method in ["POST", "DELETE"] {
      try SecureTaxTransportPolicy.assertLegacyAllowed(protectedWorkspace: true, group: .driver, path: "session", method: method)
    }
    checks.append("authentication and logout routing remain available")
    try SecureTaxTransportPolicy.assertLegacyAllowed(protectedWorkspace: true, group: .driver, path: "records", method: "GET")
    try SecureTaxTransportPolicy.assertLegacyAllowed(protectedWorkspace: true, group: .customer, path: "documents/opaque-id", method: "GET")
    checks.append("existing plaintext downloads stay explicitly available for migration without a protection claim")
    let result: [String: Any] = ["ok": true, "syntheticOnly": true, "checks": checks, "scope": "Local bundled-pin policy decisions; no network, live pins or user data"]
    print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))
  }
}
