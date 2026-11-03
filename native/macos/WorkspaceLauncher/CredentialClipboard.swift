import AppKit
import Security

enum OwnerCredentialResult: Sendable {
    case available(String)
    case unavailable(OSStatus)
}

enum OwnerCredential {
    // Called only from the user's Copy button, on a background task.
    static func read() -> OwnerCredentialResult {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: WorkspaceConfiguration.ownerService,
            kSecAttrAccount as String: "owner",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data,
              let password = String(data: data, encoding: .utf8), !password.isEmpty else {
            return .unavailable(status)
        }
        return .available(password)
    }
}

@MainActor final class CredentialClipboard {
    private let pasteboard: NSPasteboard
    private var ownedChange: Int?
    private var expiry: Task<Void, Never>?
    var onExpired: (() -> Void)?

    init(pasteboard: NSPasteboard = .general) { self.pasteboard = pasteboard }

    @discardableResult func copy(_ password: String, seconds: Double = 30) -> Bool {
        guard !password.isEmpty else { return false }
        expiry?.cancel()
        pasteboard.clearContents()
        guard pasteboard.setString(password, forType: .string) else { return false }
        pasteboard.setData(Data([1]), forType: .init("org.nspasteboard.ConcealedType"))
        ownedChange = pasteboard.changeCount
        expiry = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: UInt64(max(0.01, seconds) * 1_000_000_000)) }
            catch { return }
            guard let self else { return }
            self.clearIfOwned()
            self.onExpired?()
        }
        return true
    }

    @discardableResult func clearIfOwned() -> Bool {
        expiry?.cancel()
        expiry = nil
        guard let version = ownedChange else { return false }
        ownedChange = nil
        guard pasteboard.changeCount == version else { return false }
        pasteboard.clearContents()
        return true
    }
}
