import WebKit
import XCTest
@testable import UniversalSDR

final class WorkspacePresentationTests: XCTestCase {
    @MainActor
    func testStylesApplyUnderWorkspaceContentSecurityPolicy() async throws {
        let config = WKWebViewConfiguration()
        WorkspacePresentation.install(in: config.userContentController)
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 620, height: 700), configuration: config)
        let loaded = expectation(description: "workspace document loaded")
        let observer = PageObserver(loaded)
        view.navigationDelegate = observer
        let address = try XCTUnwrap(URL(string: "https://sdr.example.test/sales"))
        view.loadHTMLString("""
            <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; img-src 'self' data:">
            <body data-standalone-sdr>
              <div id="sales-workspace"><main id="sales-main">
                <section data-tab-panel="campaigns">
                  <div class="sdr-card"><form id="sales-campaign-form"></form></div>
                  <div class="sdr-card"><div id="sales-campaign-results"></div></div>
                </section>
              </main></div>
            </body>
            """, baseURL: address)
        await fulfillment(of: [loaded], timeout: 10)
        withExtendedLifetime(observer) {}
        let styleApplied = try await view.evaluateJavaScript("""
            (() => {
              const heading = document.querySelector('.ipad-page-hero h1');
              return heading?.textContent === 'Campaigns' &&
                getComputedStyle(heading).color === 'rgb(255, 255, 255)' &&
                getComputedStyle(heading.closest('header')).backgroundImage.includes('data:image/webp;base64,') &&
                getComputedStyle(heading.closest('section')).display === 'grid';
            })()
            """)
        XCTAssertEqual(styleApplied as? Bool, true)
    }

    private final class PageObserver: NSObject, WKNavigationDelegate {
        let loaded: XCTestExpectation
        init(_ loaded: XCTestExpectation) { self.loaded = loaded }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded.fulfill() }
    }
}
