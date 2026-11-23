import SwiftUI
import WebKit

@MainActor
final class SDRBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    enum Sidebar { case research, demo, docs }

    struct Export: Identifiable {
        let id = UUID()
        let url: URL
    }

    static let linkedIn = URL(string: "https://www.linkedin.com/feed/")!
    private static let researchStoreID = UUID(uuidString: "EE33A091-95D2-437B-B08C-9F88374CD3BD")!
    private static let savedAddress = "sdr.workspaceAddress"

    @Published private(set) var address: WorkspaceAddress?
    @Published private(set) var sidebar: Sidebar = .research
    @Published private(set) var sidebarShown = true
    @Published private(set) var workspaceSelected = true
    @Published private(set) var workspaceError: String?
    @Published private(set) var researchError: String?
    @Published private(set) var researchHost: String?
    @Published private(set) var canCapture = false
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published var export: Export?
    @Published var exportError: String?

    let workspace: WKWebView
    let research: WKWebView
    private var researchURLObservation: NSKeyValueObservation?
    private var downloads: [WKDownload: URL] = [:]

    override init() {
        let workspaceConfig = WKWebViewConfiguration()
        workspaceConfig.defaultWebpagePreferences.preferredContentMode = .mobile
        WorkspacePresentation.install(in: workspaceConfig.userContentController)
        workspace = WKWebView(frame: .zero, configuration: workspaceConfig)
        let researchConfig = WKWebViewConfiguration()
        researchConfig.websiteDataStore = WKWebsiteDataStore(forIdentifier: Self.researchStoreID)
        research = WKWebView(frame: .zero, configuration: researchConfig)
        super.init()
        for webView in [workspace, research] {
            webView.navigationDelegate = self
            webView.uiDelegate = self
            webView.allowsBackForwardNavigationGestures = true
        }
        researchURLObservation = research.observe(\.url, options: [.new]) { [weak self] _, _ in
            Task { @MainActor in
                guard let self, !self.research.isLoading, self.researchError == nil else { return }
                self.updateResearchPage()
            }
        }
        if let saved = UserDefaults.standard.string(forKey: Self.savedAddress),
           let address = WorkspaceAddress(saved) {
            connect(address)
        }
    }

    func connect(_ address: WorkspaceAddress) {
        workspace.stopLoading()
        self.address = address
        UserDefaults.standard.set(address.salesURL.absoluteString, forKey: Self.savedAddress)
        showWorkspace()
    }

    func showWorkspace() {
        guard let address else { return }
        workspaceSelected = true
        workspaceError = nil
        workspace.load(URLRequest(url: address.salesURL))
    }

    func showProspects() {
        guard let address,
              let url = SDRCapture.destination(workspace: address.salesURL) else { return }
        workspaceSelected = true
        workspaceError = nil
        workspace.load(URLRequest(url: url))
    }

    func startResearch() {
        if research.url == nil && !research.isLoading { loadResearch(Self.linkedIn) }
    }

    func showLinkedIn() {
        showSidebar(.research)
        if let url = research.url, SDRCapture.isLinkedIn(url), researchError == nil { return }
        loadResearch(Self.linkedIn)
    }

    func showSidebar(_ pane: Sidebar) {
        sidebar = pane
        sidebarShown = true
        workspaceSelected = false
    }

    func toggleSidebar() {
        sidebarShown.toggle()
        workspaceSelected = !sidebarShown
    }

    func captureProspect() {
        guard canCapture, !research.isLoading, let address, let profile = research.url.flatMap(SDRCapture.profile),
              let destination = SDRCapture.destination(workspace: address.salesURL, profile: profile, title: research.title)
        else { return }
        workspaceSelected = true
        workspaceError = nil
        workspace.load(URLRequest(url: destination))
    }

    func reloadResearch() {
        researchError = nil
        if research.reload() == nil { loadResearch(Self.linkedIn) }
    }

    private func loadResearch(_ url: URL) {
        researchHost = url.host()
        researchError = nil
        canCapture = false
        research.load(URLRequest(url: url))
    }

    private func routeExternal(_ url: URL) {
        guard url.user == nil, url.password == nil else { return }
        if url.scheme == "https" {
            showSidebar(.research)
            loadResearch(url)
        } else if ["mailto", "tel"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if webView === workspace {
            if action.navigationType == .linkActivated && action.sourceFrame.isMainFrame &&
                address?.contains(action.sourceFrame.request.url) == true && url.scheme == "sdr-ipad" {
                switch url.host() {
                case "demo": showSidebar(.demo)
                case "docs": showSidebar(.docs)
                default: break
                }
                decisionHandler(.cancel)
                return
            }
            if action.shouldPerformDownload && action.sourceFrame.isMainFrame && address?.contains(workspace.url) == true {
                decisionHandler(.download)
                return
            }
            if address?.contains(url) == true {
                decisionHandler(.allow)
                return
            }
            if action.targetFrame != nil && action.navigationType == .linkActivated { routeExternal(url) }
            decisionHandler(action.targetFrame == nil ? .allow : .cancel)
        } else {
            decisionHandler(url.scheme == "https" && url.user == nil && url.password == nil ? .allow : .cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if webView === workspace && address?.contains(url) == true {
            workspace.load(action.request)
        } else if webView === research && url.scheme == "https" && url.user == nil && url.password == nil {
            research.load(action.request)
        } else if webView === workspace {
            routeExternal(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, webView === workspace {
            guard address?.contains(response.response.url) == true else { decisionHandler(.cancel); return }
            if let status = (response.response as? HTTPURLResponse)?.statusCode, status >= 400 {
                workspaceError = "The workspace returned HTTP \(status). Check the address and try again."
                decisionHandler(.cancel)
                return
            }
            if !response.canShowMIMEType {
                decisionHandler(.download)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if webView === research {
            canCapture = false
            researchError = nil
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === research {
            updateResearchPage()
        } else {
            workspaceError = nil
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(error, in: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError(error, in: webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === workspace { showWorkspace() } else { reloadResearch() }
    }

    private func showError(_ error: Error, in webView: WKWebView) {
        let failure = error as NSError
        guard !(failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled) else { return }
        if webView === workspace {
            workspaceError = "Couldn’t reach the workspace. Check the address and your connection."
        } else {
            researchError = "Couldn’t load this page."
            updateResearchHistory()
        }
    }

    private func updateResearchHistory() {
        canGoBack = research.canGoBack
        canGoForward = research.canGoForward
    }

    private func updateResearchPage() {
        researchHost = research.url?.host()
        canCapture = research.url.flatMap(SDRCapture.profile) != nil
        updateResearchHistory()
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let name = (suggestedFilename as NSString).lastPathComponent
        let destination = directory.appendingPathComponent(["", ".", "..", "/"].contains(name) ? "SDR Export" : name)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            downloads[download] = destination
            completionHandler(destination)
        } catch {
            exportError = "Couldn’t create the export file."
            completionHandler(nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let file = downloads.removeValue(forKey: download) { export = Export(url: file) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloads.removeValue(forKey: download) {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        exportError = "The export couldn’t finish."
    }
}
