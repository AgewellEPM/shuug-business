import WebKit

enum WorkspacePresentation {
    @MainActor
    static func install(in controller: WKUserContentController) {
        let bundle = Bundle.main
        guard let scriptURL = bundle.url(forResource: "workspace", withExtension: "js", subdirectory: "WorkspaceStyle"),
              let styleURL = bundle.url(forResource: "workspace", withExtension: "css", subdirectory: "WorkspaceStyle"),
              let artURL = bundle.url(forResource: "town", withExtension: "webp", subdirectory: "WorkspaceStyle"),
              let script = try? String(contentsOf: scriptURL, encoding: .utf8),
              let stylesheet = try? String(contentsOf: styleURL, encoding: .utf8),
              let art = try? Data(contentsOf: artURL) else { return }
        let css = stylesheet.replacingOccurrences(of: "SDR_TOWN_ART", with: "data:image/webp;base64," + art.base64EncodedString())
        guard let payload = try? JSONEncoder().encode(css),
              let encodedCSS = String(data: payload, encoding: .utf8) else { return }
        controller.addUserScript(WKUserScript(source: script + "(" + encodedCSS + ")",
                                              injectionTime: .atDocumentEnd,
                                              forMainFrameOnly: true,
                                              in: .world(name: "UniversalSDR.WorkspacePresentation")))
    }
}
