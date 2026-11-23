import Foundation

struct WorkspaceAddress {
    let salesURL: URL

    init?(_ rawAddress: String) {
        let address = rawAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = address.contains("://") ? address : "https://" + address
        guard var parts = URLComponents(string: candidate),
              let host = parts.host?.lowercased(), !host.isEmpty,
              let scheme = parts.scheme?.lowercased(),
              parts.user == nil, parts.password == nil,
              parts.percentEncodedQuery == nil, parts.percentEncodedFragment == nil,
              ["", "/", "/sales", "/sales/"].contains(parts.percentEncodedPath),
              parts.port.map({ (1...65535).contains($0) }) ?? true,
              scheme == "https" || Self.isSimulatorLoopback(scheme: scheme, host: host)
        else { return nil }
        parts.scheme = scheme
        parts.host = host
        parts.path = "/sales"
        guard let url = parts.url else { return nil }
        salesURL = url
    }

    func contains(_ url: URL?) -> Bool {
        guard let url, url.user == nil, url.password == nil,
              url.scheme?.lowercased() == salesURL.scheme,
              url.host()?.lowercased() == salesURL.host() else { return false }
        let defaultPort = salesURL.scheme == "https" ? 443 : 80
        return (url.port ?? defaultPort) == (salesURL.port ?? defaultPort)
    }

    private static func isSimulatorLoopback(scheme: String, host: String) -> Bool {
        #if DEBUG && targetEnvironment(simulator)
        return scheme == "http" && host == "127.0.0.1"
        #else
        return false
        #endif
    }
}
