import Foundation

enum SDRCapture {
    static func isLinkedIn(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              let host = url.host()?.lowercased() else { return false }
        return host == "linkedin.com" || host.hasSuffix(".linkedin.com")
    }

    static func profile(_ url: URL) -> URL? {
        guard isLinkedIn(url), let host = url.host(),
              host.range(of: #"^(www\.|[a-z]{2}\.)?linkedin\.com$"#, options: .regularExpression) != nil,
              let original = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = original.percentEncodedPath.split(separator: "/")
        guard path.count >= 2, ["in", "company"].contains(path[0]),
              let slug = String(path[1]).removingPercentEncoding,
              slug.range(of: #"^[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]{0,179}$"#, options: .regularExpression) != nil else {
            return nil
        }
        var canonical = URLComponents()
        canonical.scheme = "https"
        canonical.host = "www.linkedin.com"
        canonical.path = "/" + path[0] + "/" + slug
        return canonical.url
    }

    static func destination(workspace: URL, profile: URL? = nil, title: String? = nil) -> URL? {
        guard var url = URLComponents(url: workspace, resolvingAgainstBaseURL: false) else { return nil }
        var fragment = URLComponents()
        var values = [URLQueryItem(name: "view", value: "prospects")]
        if let profile, let cleanProfile = self.profile(profile) {
            values.append(URLQueryItem(name: "profile", value: cleanProfile.absoluteString))
            if let title, title.hasSuffix(" | LinkedIn") {
                let name = title.dropLast(" | LinkedIn".count).trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty { values.append(URLQueryItem(name: "name", value: String(name.prefix(140)))) }
            }
        }
        fragment.queryItems = values
        url.percentEncodedFragment = fragment.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return url.url
    }
}
