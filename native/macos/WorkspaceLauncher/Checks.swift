import AppKit
import Foundation

@main enum LauncherChecks {
    @MainActor static func main() async throws {
        let sample = """
        {"base":"http://127.0.0.1:3126","source":"/private/test-workspace","keychainService":"com.shuug.rideshare-tax-pros.owner","buildId":"test-build","service":"com.shuug.rideshare-tax-pros"}
        """
        let configuration = try WorkspaceConfiguration.decode(Data(sample.utf8))
        precondition(configuration.workspaceURL.host == "127.0.0.1")
        for wrong in ["https://example.com:3126", "http://127.0.0.1:3000", "http://owner:password@127.0.0.1:3126"] {
            let modified = sample.replacingOccurrences(of: "http://127.0.0.1:3126", with: wrong)
            do { _ = try WorkspaceConfiguration.decode(Data(modified.utf8)); fatalError("Unsafe workspace endpoint was accepted") }
            catch {}
        }
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let clipboard = CredentialClipboard(pasteboard: pasteboard)
        precondition(clipboard.copy("synthetic-test-only", seconds: 0.04))
        try await Task.sleep(nanoseconds: 100_000_000)
        precondition(pasteboard.string(forType: .string) == nil, "Owned credential did not expire")
        clipboard.copy("synthetic-test-only", seconds: 0.04)
        pasteboard.clearContents()
        pasteboard.setString("another application's copied text", forType: .string)
        try await Task.sleep(nanoseconds: 100_000_000)
        precondition(pasteboard.string(forType: .string) == "another application's copied text", "Expiry overwrote unrelated clipboard data")
        clipboard.copy("first-synthetic-copy", seconds: 0.04)
        clipboard.copy("second-synthetic-copy", seconds: 0.25)
        try await Task.sleep(nanoseconds: 100_000_000)
        precondition(pasteboard.string(forType: .string) == "second-synthetic-copy", "An older timer cleared a newer copy")
        precondition(clipboard.clearIfOwned())
        print("{\"ok\":true,\"checks\":[\"loopback-only installation\",\"credential expiry\",\"unrelated clipboard preserved\",\"newer copy preserved\"],\"realKeychainRead\":false,\"generalClipboardTouched\":false}")
    }
}
