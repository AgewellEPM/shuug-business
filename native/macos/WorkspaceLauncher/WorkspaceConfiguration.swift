import Foundation

struct WorkspaceConfiguration: Decodable, Sendable {
    let base: String
    let source: String
    let keychainService: String
    let buildId: String
    let service: String

    static let ownerService = "com.shuug.rideshare-tax-pros.owner"
    static let launchService = "com.shuug.rideshare-tax-pros"
    static let website = URL(string: "https://rideshare-tax-pros.vercel.app")!
    static var installationURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Shuug/Rideshare Tax Pros/installation.json")
    }

    var workspaceURL: URL { URL(string: base)! }
    var buildFile: URL { URL(fileURLWithPath: source).appendingPathComponent(".next/BUILD_ID") }

    static func decode(_ data: Data) throws -> Self {
        guard data.count < 32_768 else { throw ConfigurationError.invalid }
        let value = try JSONDecoder().decode(Self.self, from: data)
        guard let url = URL(string: value.base), url.scheme == "http", url.host == "127.0.0.1",
              url.port == 3126, url.user == nil, url.password == nil, url.query == nil,
              url.fragment == nil, ["", "/"].contains(url.path), value.source.hasPrefix("/"),
              value.service == launchService, value.keychainService == ownerService,
              !value.buildId.isEmpty else { throw ConfigurationError.invalid }
        return value
    }

    static func load() throws -> Self {
        guard FileManager.default.fileExists(atPath: installationURL.path) else {
            throw ConfigurationError.notInstalled
        }
        return try decode(Data(contentsOf: installationURL))
    }

    enum ConfigurationError: LocalizedError {
        case notInstalled, invalid
        var errorDescription: String? {
            switch self {
            case .notInstalled: return "Install the Rideshare Tax Pros workspace before opening owner access."
            case .invalid: return "The workspace installation details need review. No credentials were accessed."
            }
        }
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct WorkspaceHealth: Encodable, Sendable {
    let ready: Bool
    let detail: String
    let workspace: String
    let buildId: String

    static func check(_ configuration: WorkspaceConfiguration) async -> Self {
        let state: (Bool, String)
        if !FileManager.default.fileExists(atPath: configuration.buildFile.path) {
            state = (false, "Connect the drive containing your installed workspace and try again.")
        } else if (try? String(contentsOf: configuration.buildFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)) != configuration.buildId {
            state = (false, "The workspace build changed. Run the workspace installer to verify this version.")
        } else {
            let settings = URLSessionConfiguration.ephemeral
            settings.httpShouldSetCookies = false
            settings.timeoutIntervalForRequest = 4
            settings.timeoutIntervalForResource = 6
            let session = URLSession(configuration: settings, delegate: NoRedirects(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            do {
                let (data, response) = try await session.data(from: configuration.workspaceURL.appendingPathComponent("api/auth/login"))
                let text = String(decoding: data, as: UTF8.self)
                let correct = (response as? HTTPURLResponse)?.statusCode == 200
                    && text.contains("Rideshare Tax Pros") && text.contains("name=\"csrf\"")
                state = correct ? (true, "Your private workspace is responding. Sign in as owner to continue.")
                    : (false, "The expected Shuug sign-in page did not respond. Refresh or start the installed workspace.")
            } catch {
                state = (false, "The private workspace is not responding yet. You can start its installed service below.")
            }
        }
        return .init(ready: state.0, detail: state.1, workspace: configuration.base, buildId: configuration.buildId)
    }
}
