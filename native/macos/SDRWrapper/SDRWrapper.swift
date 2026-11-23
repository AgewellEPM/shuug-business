import AppKit
import WebKit

@main
struct SDRApplication {
    static func main() {
        let app = NSApplication.shared
        let delegate = SDRWindow()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor
final class SDRWindow: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private let localURL: URL = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "SDRProspectsURL") as? String
        return URL(string: configured ?? "http://127.0.0.1:8740/sales")!
    }()
    private let gigTaxURL = URL(string: "https://gigtax.pro/sales")!
    private let linkedinURL = URL(string: "https://www.linkedin.com/feed/")!
    private let hostedMode = (Bundle.main.object(forInfoDictionaryKey: "SDRGigTaxMode") as? Bool) == true
    private let arguments = CommandLine.arguments
    private var window: NSWindow?
    private let salesHost = NSView()
    private let liveView = WKWebView()
    private let localView = WKWebView()
    private let researchView = WKWebView()
    private let browserAddress = NSTextField(labelWithString: "linkedin.com")
    private let browserStatus = NSTextField(labelWithString: "")
    private var captureButton: NSButton!
    private var lastLinkedInURL: URL?
    private var triedLocalCode = false
    private var triedHostedCode = false
    private var proof: [String: Any] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        let title = hostedMode ? "Gig Tax Pros SDR" : "Universal SDR"
        let appMenu = NSMenu()
        let appItem = NSMenuItem()
        appItem.submenu = NSMenu(title: title)
        appItem.submenu?.addItem(withTitle: "Quit " + title, action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenu.addItem(appItem)
        NSApp.mainMenu = appMenu

        for view in [liveView, localView, researchView] {
            view.navigationDelegate = self
            view.uiDelegate = self
            view.allowsBackForwardNavigationGestures = true
        }
        [liveView, localView].forEach(addSalesPane)
        let workspace = NSButton(title: hostedMode ? "Gig Tax Pros" : "Workspace", target: self, action: #selector(showWorkspace))
        let prospects = NSButton(title: "Prospects", target: self, action: #selector(showProspects))
        let linkedin = NSButton(title: "LinkedIn", target: self, action: #selector(showLinkedIn))
        captureButton = NSButton(title: "Add profile to Prospects", target: self, action: #selector(captureProfile))
        captureButton.bezelStyle = .rounded
        captureButton.isEnabled = false
        let bar = NSStackView(views: [workspace, prospects, NSView(), linkedin, captureButton])
        bar.orientation = .horizontal
        bar.spacing = 8
        bar.edgeInsets = NSEdgeInsets(top: 9, left: 12, bottom: 9, right: 12)

        let back = NSButton(title: "‹", target: self, action: #selector(backInResearch))
        back.setAccessibilityLabel("Back in research pane")
        let forward = NSButton(title: "›", target: self, action: #selector(forwardInResearch))
        forward.setAccessibilityLabel("Forward in research pane")
        let reload = NSButton(title: "Reload", target: self, action: #selector(reloadResearch))
        browserAddress.lineBreakMode = .byTruncatingTail
        browserAddress.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let nav = NSStackView(views: [back, forward, reload, browserAddress])
        nav.spacing = 5
        nav.edgeInsets = NSEdgeInsets(top: 5, left: 8, bottom: 5, right: 8)
        browserStatus.lineBreakMode = .byTruncatingTail
        browserStatus.textColor = .secondaryLabelColor
        browserStatus.isHidden = true
        let research = NSStackView(views: [nav, browserStatus, researchView])
        research.orientation = .vertical
        research.alignment = .leading
        research.spacing = 0
        NSLayoutConstraint.activate([
            nav.widthAnchor.constraint(equalTo: research.widthAnchor),
            researchView.widthAnchor.constraint(equalTo: research.widthAnchor),
            browserStatus.leadingAnchor.constraint(equalTo: research.leadingAnchor, constant: 8),
            browserStatus.trailingAnchor.constraint(lessThanOrEqualTo: research.trailingAnchor, constant: -8),
        ])

        let split = NSSplitView()
        split.isVertical = true
        split.dividerStyle = .thin
        split.addArrangedSubview(salesHost)
        split.addArrangedSubview(research)
        split.setHoldingPriority(.defaultLow, forSubviewAt: 0)
        split.setHoldingPriority(.defaultLow, forSubviewAt: 1)
        let root = NSStackView(views: [bar, split])
        root.orientation = .vertical
        root.alignment = .leading
        root.spacing = 0
        NSLayoutConstraint.activate([
            bar.widthAnchor.constraint(equalTo: root.widthAnchor),
            split.widthAnchor.constraint(equalTo: root.widthAnchor),
        ])

        let visible = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1280, height: 860)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: min(1440, visible.width - 30), height: min(920, visible.height - 55)),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.title = title
        window.minSize = NSSize(width: 900, height: 580)
        window.contentView = root
        window.center()
        self.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate()
        split.layoutSubtreeIfNeeded()
        split.setPosition(split.bounds.width * 0.52, ofDividerAt: 0)

        showWorkspace()
        researchView.load(URLRequest(url: linkedinURL))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func addSalesPane(_ view: WKWebView) {
        view.translatesAutoresizingMaskIntoConstraints = false
        salesHost.addSubview(view)
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: salesHost.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: salesHost.trailingAnchor),
            view.topAnchor.constraint(equalTo: salesHost.topAnchor),
            view.bottomAnchor.constraint(equalTo: salesHost.bottomAnchor),
        ])
        view.isHidden = true
    }

    private func select(_ view: WKWebView) {
        liveView.isHidden = view !== liveView
        localView.isHidden = view !== localView
    }

    @objc private func showWorkspace() {
        let pane = hostedMode ? liveView : localView
        select(pane)
        if pane.url == nil { pane.load(URLRequest(url: hostedMode ? gigTaxURL : localURL)) }
    }

    @objc private func showProspects() {
        select(localView)
        if let url = SDRCapture.destination(workspace: localURL) {
            localView.load(URLRequest(url: url))
        }
    }

    @objc private func showLinkedIn() {
        researchView.load(URLRequest(url: lastLinkedInURL ?? linkedinURL))
    }

    @objc private func captureProfile() {
        guard let opened = researchView.url, let profile = SDRCapture.profile(opened),
              let destination = SDRCapture.destination(workspace: localURL, profile: profile, title: researchView.title) else { return }
        select(localView)
        localView.load(URLRequest(url: destination))
    }

    @objc private func backInResearch() { if researchView.canGoBack { researchView.goBack() } }
    @objc private func forwardInResearch() { if researchView.canGoForward { researchView.goForward() } }
    @objc private func reloadResearch() { researchView.reload() }

    private func flag(_ key: String) -> String? {
        guard let index = arguments.firstIndex(of: key), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    private func saveProof(_ key: String, _ value: Any) {
        guard let path = flag("--proof-file"), path.hasPrefix("/private/tmp/") else { return }
        proof[key] = value
        if let data = try? JSONSerialization.data(withJSONObject: proof, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }

    private func localOrigin(_ url: URL) -> Bool {
        url.scheme == localURL.scheme && url.host() == localURL.host() && url.port == localURL.port
    }

    private func hostedOrigin(_ url: URL) -> Bool {
        url.scheme == "https" && url.port == nil && ["gigtax.pro", "www.gigtax.pro", "portal.gigtax.pro"].contains(url.host() ?? "")
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if webView === researchView {
            decisionHandler(url.scheme == "https" && url.user == nil && url.password == nil ? .allow : .cancel)
        } else if (webView === localView && localOrigin(url)) || (webView === liveView && hostedOrigin(url)) {
            decisionHandler(.allow)
        } else if (action.navigationType == .linkActivated || action.targetFrame == nil) && url.scheme == "https" && url.user == nil && url.password == nil {
            researchView.load(action.request)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url, url.user == nil, url.password == nil else { return nil }
        if webView === liveView && hostedOrigin(url) { liveView.load(action.request) }
        else if webView === localView && localOrigin(url) { localView.load(action.request) }
        else if url.scheme == "https" { researchView.load(action.request) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse {
            let key = webView === researchView ? "researchHTTP" : webView === liveView ? "hostedHTTP" : "localHTTP"
            saveProof(key, ["host": http.url?.host() ?? "", "status": http.statusCode])
        }
        decisionHandler(response.canShowMIMEType ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url else { return }
        if webView === researchView {
            if SDRCapture.isLinkedIn(url) { lastLinkedInURL = url }
            browserAddress.stringValue = url.host() ?? "Web"
            captureButton.isEnabled = SDRCapture.profile(url) != nil
            browserStatus.isHidden = true
            webView.evaluateJavaScript("""
                (() => ({ visible: document.visibilityState === 'visible',
                  loginForm: !!document.querySelector('input#username,input[name=session_key],input[autocomplete=username]'),
                  challengeForm: !!document.querySelector('form[action*="checkpoint"],iframe[title*="challenge"]'),
                  documentLoaded: !!document.body.firstElementChild }))()
                """) { [weak self] value, _ in
                if let value = value as? [String: Any] { self?.saveProof("researchView", value) }
            }
        } else {
            trySignIn(webView, url: url)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self, weak webView] in
                guard let self, let webView, webView.url == url else { return }
                let name = webView === self.liveView ? "hostedWorkspace" : "localWorkspace"
                webView.evaluateJavaScript("""
                    (() => ({ workspaceVisible: !!document.querySelector('#sales-workspace:not([hidden])')?.getClientRects().length,
                      prospectsVisible: !!document.querySelector('[data-tab=prospects]:not([hidden])')?.getClientRects().length,
                      editorVisible: !!document.querySelector('#sales-prospect-editor:not([hidden])')?.getClientRects().length }))()
                    """) { [weak self] value, _ in
                    if let value = value as? [String: Any] { self?.saveProof(name, value) }
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let failure = error as NSError
        if failure.code == NSURLErrorCancelled { return }
        if webView === researchView {
            browserStatus.stringValue = "The page could not load. Use Reload to try again."
            browserStatus.isHidden = false
            captureButton.isEnabled = false
        }
        saveProof(webView === researchView ? "researchError" : "workspaceError", failure.code)
    }

    private func code(at path: String?) -> String? {
        guard let path, path.hasPrefix("/"),
              let values = try? URL(fileURLWithPath: path).resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]),
              values.isRegularFile == true, values.isSymbolicLink != true,
              let attributes = try? FileManager.default.attributesOfItem(atPath: path),
              let mode = attributes[.posixPermissions] as? NSNumber, mode.intValue & 0o077 == 0,
              let value = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
        let secret = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return secret.range(of: #"^[A-Za-z0-9_-]{35,100}$"#, options: .regularExpression) == nil ? nil : secret
    }

    private func trySignIn(_ webView: WKWebView, url: URL) {
        if webView === localView && localOrigin(url) && url.path == "/sales" && !triedLocalCode,
           let value = code(at: flag("--local-owner-code-file")) {
            triedLocalCode = true
            webView.callAsyncJavaScript("""
                if (location.origin !== expected || location.pathname !== '/sales' ||
                    !document.body.hasAttribute('data-standalone-sdr')) return false;
                const response = await fetch('/api/sales', {method:'POST', credentials:'same-origin',
                  headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'login',code})});
                return response.ok;
                """, arguments: ["expected": url.scheme! + "://" + url.host()! + (url.port.map { ":" + String($0) } ?? ""), "code": value],
                in: nil, in: .page) { [weak webView] result in
                if case .success(let value) = result, value as? Bool == true { webView?.reload() }
            }
        }
        if webView === liveView && url.absoluteString == "https://portal.gigtax.pro/" && !triedHostedCode,
           let value = code(at: flag("--hosted-owner-code-file")) {
            triedHostedCode = true
            webView.callAsyncJavaScript("""
                if (location.href !== 'https://portal.gigtax.pro/') return false;
                for (let attempt = 0; attempt < 40; attempt++) {
                  const form = document.querySelector('#workspace-access-code');
                  const field = form?.querySelector('input[name=code][type=password]:not(:disabled)');
                  const email = form?.querySelector('input[name=email]');
                  const button = form?.querySelector('button[type=submit]:not(:disabled)');
                  if (field && email && button && typeof form.onsubmit === 'function') {
                    if (field.value || email.value) return false;
                    document.querySelector('#workspace-options').open = true;
                    field.value = code;
                    form.requestSubmit(button);
                    return true;
                  }
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
                return false;
                """, arguments: ["code": value], in: nil, in: .page) { _ in }
        }
    }
}
