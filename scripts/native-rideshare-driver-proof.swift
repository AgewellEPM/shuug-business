import Foundation
import DriverCore

enum ProofFailure: Error { case failed(String) }
@main struct NativeDriverProof {
    static func check(_ condition: Bool, _ message: String) throws { if !condition { throw ProofFailure.failed(message) } }
    static func main() async throws {
        try check(WorkspaceClient.discoveryURL.absoluteString == "https://gigtax.pro/site-config.json", "The native app did not use the live Gig Tax Pros configuration.")
        try check(try WorkspaceClient.discoveredWorkspace(from: Data(#"{"workspaceUrl":null}"#.utf8)) == nil, "An unconnected workspace was represented as available.")
        let configuredWorkspace = try WorkspaceClient.discoveredWorkspace(from: Data(#"{"workspaceUrl":"https://workspace.example.com/api/website/customer"}"#.utf8))
        try check(configuredWorkspace?.absoluteString == "https://workspace.example.com", "The app could not use the portal's shared backend origin.")
        for destination in ["http://workspace.example.com", "https://127.0.0.1", "https://192.168.1.5", "https://[::1]", "https://workspace.local", "https://owner:secret@workspace.example.com", "https://workspace.example.com/another/path"] {
            do {
                let json = try JSONSerialization.data(withJSONObject: ["workspaceUrl": destination])
                _ = try WorkspaceClient.discoveredWorkspace(from: json)
                throw ProofFailure.failed("The public configuration admitted an unsafe workspace address.")
            } catch WorkspaceError.message(_) { }
        }
        guard CommandLine.arguments.count == 2, let origin = URL(string: CommandLine.arguments[1]), origin.scheme == "http", origin.host == "127.0.0.1", origin.port != nil else { throw ProofFailure.failed("Use the owned loopback fixture server only.") }
        let loginClient = WorkspaceClient(origin: origin)
        let first = try await loginClient.login(email: "ios.alpha@example.com", password: "Synthetic-native-driver-password")
        let second = try await loginClient.login(email: "ios.beta@example.com", password: "Synthetic-native-driver-password")
        let alpha = WorkspaceClient(origin: origin, token: first.token), beta = WorkspaceClient(origin: origin, token: second.token)
        try check(first.branding.name == "Rideshare Tax Pros", "Native sign-in did not receive the firm brand.")
        var tripBody = Trip(startedAt: ISO8601DateFormatter().date(from: "2026-11-05T02:30:00Z")!, classification: .business, purpose: "Native Swift fixture drive", timeZone: TimeZone(identifier: "America/New_York")!)
        tripBody.earningsCents = 2000; tripBody.platformFeesCents = 300; tripBody.rideRole = .ride
        tripBody.platform = "Uber"; tripBody.workArea = "Fixture area"; tripBody.automaticallyDetected = true
        let trip = DriverRecord(payload: .trip(tripBody))
        let mutation = DriverMutation(mutationId: UUID(), record: trip)
        let saved = try await alpha.save(mutation), duplicate = try await alpha.save(mutation)
        try check(saved == duplicate && saved.record.revision == 1, "An actual native retry was not idempotent.")
        try check(saved.record.dateLabel == "2026-11-04", "The server shifted a late-night drive to the next UTC date.")
        if case .trip(let value) = saved.record.payload { try check(value == tripBody, "The trip lost its time zone, earnings or assistance fields.") }
        let bankStatus = try await alpha.banks()
        try check(!bankStatus.ready && bankStatus.items.isEmpty, "An unconfigured provider was shown as connected.")
        try check(try await alpha.bankFeed(after: 0).transactions.isEmpty, "An unconfigured account received bank transactions.")
        let referral = try await alpha.referrals()
        try check(referral.points == 0 && referral.program.pointsPerReferral == 100 && referral.program.referralBonusCents == 2000, "The native reward program terms did not match.")
        let claimed = try await beta.referrals(["action": "claim", "code": referral.code])
        try check(claimed.referredBy?.status == "pending", "The native referral was not recorded for staff review.")
        let referrer = try await alpha.referrals()
        try check(referrer.claims.count == 1 && referrer.claims.first?.status == "pending" && referrer.rewards.isEmpty, "A referral was rewarded before paid-prep verification.")
        try check(try await beta.records(after: 0).records.isEmpty, "Another client received the driver's private trip.")
        do { _ = try await alpha.save(DriverMutation(mutationId: UUID(), record: trip)); throw ProofFailure.failed("A stale native update overwrote server data.") }
        catch WorkspaceError.server(let status, _, let current) { try check(status == 409 && current?.record.revision == 1, "The native client could not decode the conflict.") }
        let receipt = LocalReceipt(mime: "image/png")
        let image = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=")!
        try await alpha.upload(receipt, data: image)
        try await alpha.upload(receipt, data: image)
        let expense = DriverRecord(payload: .expense(Expense(date: DriverRecord.day(Date()), merchant: "Native fixture fuel", category: .fuel, amountCents: 1234, classification: .business, receiptId: receipt.id)))
        let expenseSaved = try await alpha.save(DriverMutation(mutationId: UUID(), record: expense))
        try check(expenseSaved.record.receiptId == receipt.id, "The expense lost its receipt binding.")
        let (downloaded, mime) = try await alpha.receipt(receipt.id)
        try check(downloaded == image && mime == "image/png", "The receipt did not survive actual native upload/download.")
        do { _ = try await beta.receipt(receipt.id); throw ProofFailure.failed("Another client downloaded the receipt.") }
        catch WorkspaceError.server(let status, _, _) { try check(status == 404, "A cross-client receipt request did not fail closed.") }
        var sourceExpense = Expense(date: DriverRecord.day(Date()), merchant: "Native fixture parking", category: .parking, amountCents: 650)
        sourceExpense.bankReference = BankReference(transactionId: "file:" + String(repeating: "a", count: 64), provider: "statement", accountLabel: "Fixture checking")
        let noReceipt = DriverRecord(payload: .expense(sourceExpense))
        let imported = try await alpha.save(DriverMutation(mutationId: UUID(), record: noReceipt))
        try check(imported.record.bankReference == sourceExpense.bankReference, "The statement source reference was lost.")
        do { _ = try await alpha.save(DriverMutation(mutationId: UUID(), record: DriverRecord(payload: .expense(sourceExpense)))); throw ProofFailure.failed("Duplicate bank reference accepted.") }
        catch WorkspaceError.server(let status, _, _) { try check(status == 409, "Duplicate source was not rejected.") }
        for category in ExpenseCategory.allCases {
            let detail = Expense(date: "2026-11-05", merchant: "Native category fixture · " + category.label, category: category, amountCents: 2450, classification: .business, businessPurpose: "Native fixture business purpose", businessUsePercent: 75, mealContext: "Native fixture participants", vehicle: "Native fixture vehicle", odometerMiles: 12345.6, paymentMethod: .platform, place: "Native fixture city")
            let result = try await alpha.save(DriverMutation(mutationId: UUID(), record: DriverRecord(payload: .expense(detail))))
            guard case .expense(let restored) = result.record.payload else { throw ProofFailure.failed("Expense changed kind during sync.") }
            try check(restored == detail, "A native expense category or its review details changed during sync.")
        }
        _ = try await alpha.save(DriverMutation(mutationId: UUID(), record: DriverRecord(payload: .income(Income(date: DriverRecord.day(Date()), platform: "uber", description: "Native fixture payout", amountCents: 20123)))))
        for platform in ["doordash", "instacart", "spark"] {
            let incoming = DriverRecord(payload: .income(Income(date: DriverRecord.day(Date()), platform: platform, description: "Synthetic gig payout", amountCents: 2000)))
            let returned = try await alpha.save(DriverMutation(mutationId: UUID(), record: incoming))
            guard case .income(let income) = returned.record.payload else { throw ProofFailure.failed("Gig payout changed record type.") }
            try check(income.platform == platform, "Gig platform did not survive actual native sync.")
        }
        var deleted = saved.record; deleted.deleted = true
        let tombstone = try await alpha.save(DriverMutation(mutationId: UUID(), record: deleted))
        let delta = try await alpha.records(after: saved.sequence)
        try check(delta.records.contains(where: { $0.record.id == trip.id && $0.record.deleted }) && tombstone.record.revision == 2, "A native incremental sync lost a deletion.")
        try await alpha.logout()
        do { _ = try await alpha.records(after: 0); throw ProofFailure.failed("The native session remained valid after logout.") }
        catch WorkspaceError.server(let status, _, _) { try check(status == 401, "Native logout was not enforced.") }
        let checks = ["real invited-client login and brand", "Swift JSON optional fields", "recorded local date and time zone round trip", "idempotent native retry", "stale-write conflict decoding", "client isolation", "private receipt byte round trip", "cross-client receipt denial", "expense without receipt", "all 23 expense categories", "meal and vehicle review details round trip", "income cents", "incremental deletion", "native session revocation"]
        let result: [String: Any] = ["ok": true, "scope": "Actual app WorkspaceClient against a compiled loopback Shuug server", "checks": checks + ["live Gig Tax Pros configuration origin", "unconnected workspace stays unavailable", "shared portal workspace discovery", "unsafe workspace configuration rejection", "fare/fees/platform/area and detection fields", "unconfigured bank status and isolated feed", "statement reference round trip and duplicate rejection", "native referral terms and points", "native referral claim round trip", "pending referral cannot issue reward", "DoorDash, Instacart and Spark income round trips"], "realClientDataUsed": false]
        print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))
    }
}
