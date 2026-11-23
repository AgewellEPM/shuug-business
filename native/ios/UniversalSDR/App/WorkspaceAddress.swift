import Foundation

struct WorkspaceAddress {
    let salesURL: URL

    init?(_ rawAddress: String) {
        guard var parts = SDRWebAddress.components(rawAddress),
              parts.percentEncodedQuery == nil, parts.percentEncodedFragment == nil,
              ["", "/", "/sales", "/sales/"].contains(parts.percentEncodedPath)
        else { return nil }
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
}

enum SDRWebAddress {
    static func components(_ rawAddress: String) -> URLComponents? {
        let address = rawAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = address.contains("://") ? address : "https://" + address
        guard var parts = URLComponents(string: candidate),
              let host = parts.host?.lowercased(), !host.isEmpty,
              let scheme = parts.scheme?.lowercased(),
              parts.user == nil, parts.password == nil,
              parts.port.map({ (1...65535).contains($0) }) ?? true,
              scheme == "https" || isSimulatorLoopback(scheme: scheme, host: host)
        else { return nil }
        parts.scheme = scheme
        parts.host = host
        return parts
    }

    static func allowsNavigation(to url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), let host = url.host(), !host.isEmpty,
              url.user == nil, url.password == nil else { return false }
        return scheme == "https" || isSimulatorLoopback(scheme: scheme, host: host)
    }

    private static func isSimulatorLoopback(scheme: String, host: String) -> Bool {
        #if DEBUG && targetEnvironment(simulator)
        return scheme == "http" && host == "127.0.0.1"
        #else
        return false
        #endif
    }
}
