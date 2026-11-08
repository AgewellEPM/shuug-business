// Nonvisual layout checks in macOS system WebKit. No downloaded browser runtime.
// Usage: swift layout-audit.swift http://127.0.0.1:8767 /path/to/site-manifest.json
import AppKit
import WebKit

let base = CommandLine.arguments[1]
let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))) as! [String: Any]
let pages = [""] + (manifest["aliases"] as! [String]).filter { !["sales", "office-signup"].contains($0) }
let widths = [320, 375, 390, 430, 768, 1024, 1440]

final class Audit: NSObject, WKNavigationDelegate {
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 390, height: 844))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 390, height: 844), styleMask: [], backing: .buffered, defer: false)
    var index = 0
    var results = [[String: Any]]()
    override init() {
        super.init()
        view.navigationDelegate = self
        window.contentView = view
    }
    func next() {
        guard index < pages.count * widths.count else {
            let failures = results.filter { !($0["passed"] as! Bool) }
            let report: [String: Any] = ["engine": "macOS system WebKit", "kind": "nonvisual responsive layout", "checks": results.count, "failures": failures.count, "results": results]
            let data = try! JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            print(String(data: data, encoding: .utf8)!)
            exit(failures.isEmpty ? 0 : 1)
        }
        let width = widths[index % widths.count]
        let slug = pages[index / widths.count]
        window.setContentSize(NSSize(width: width, height: 844))
        view.frame = NSRect(x: 0, y: 0, width: width, height: 844)
        let path = slug.isEmpty ? "/index.html" : "/\(slug).html"
        view.load(URLRequest(url: URL(string: base + path)!))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { self.measure() }
    }
    func measure() {
        let js = #"""
        return await (async () => {
          const visible = el => { const s = getComputedStyle(el); return el.getBoundingClientRect().height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const w = document.documentElement.clientWidth;
          const overflow = [...document.querySelectorAll('main *, .public-header *')].filter(el => {
            if (el.closest('svg') || !visible(el)) return false;
            const r = el.getBoundingClientRect(); return r.left < -1 || r.right > w + 1;
          }).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.trim().slice(0,50), width: el.getBoundingClientRect().width }));
          const hiddenHeadings = [...document.querySelectorAll('main h1,main h2,main h3')].filter(el => !el.closest('[hidden]') && (!visible(el) || el.getBoundingClientRect().width < 10)).map(el => el.textContent);
          const tinyActions = [...document.querySelectorAll('.page-link, .hero-actions a, .public-menu-toggle, .service-filter button')].filter(el => visible(el) && !el.closest('[hidden]') && (el.getBoundingClientRect().height < 43 || el.getBoundingClientRect().width < 43)).map(el => el.textContent.trim());
          const h1 = document.querySelector('h1');
          const hero = document.querySelector('.services-hero,.how-hero,.drivers-hero,.about-hero,.app-hero,.home-native .hero');
          const gaps = [];
          if (hero && w <= 430) {
            const rects = [...hero.children].filter(visible).map(el => el.getBoundingClientRect()).sort((a,b) => a.top - b.top);
            for(let i=1;i<rects.length;i++) if(rects[i].top-rects[i-1].bottom > 70) gaps.push(Math.round(rects[i].top-rects[i-1].bottom));
          }
          const interactionFailures = [];
          if(w <= 430) {
            const opener = document.querySelector('[data-menu]');
            opener.click();
            const menu = document.querySelector('#navigation');
            if(!menu.open || opener.getAttribute('aria-expanded') !== 'true') interactionFailures.push('Mobile menu did not open');
            const closed = new Promise(resolve => menu.addEventListener('close', resolve, {once: true}));
            menu.querySelector('[data-close]').click();
            await closed;
            if(menu.open || document.activeElement !== opener) interactionFailures.push('Mobile menu did not close and return focus');
          }
          if(w === 390 && document.querySelector('[data-service-filters]')) {
            document.querySelector('[data-filter="records"]').click();
            if(document.querySelectorAll('.services-card:not([hidden])').length !== 2) interactionFailures.push('Service filter did not update');
            document.querySelector('[data-filter="all"]').click();
            const destination = document.querySelector('#how-it-works');
            document.documentElement.style.scrollBehavior = 'auto';
            document.querySelector('.section-nav a[href="#how-it-works"]').click();
            await new Promise(resolve => setTimeout(resolve, 500));
            const targetTop = destination.getBoundingClientRect().top;
            if(window.scrollY < 100 || targetTop < 60 || targetTop > 220) interactionFailures.push('Section link did not scroll below header');
            if(!matchMedia('(prefers-reduced-motion: reduce)').matches && !destination.classList.contains('section-entered')) interactionFailures.push('Scroll animation did not trigger');
          }
          return { width:w, documentWidth:document.documentElement.scrollWidth, overflow, hiddenHeadings, tinyActions, heroGaps:gaps, interactionFailures, headingSize:parseFloat(getComputedStyle(h1).fontSize), passed:document.documentElement.scrollWidth<=w+1 && !overflow.length && !hiddenHeadings.length && !tinyActions.length && !gaps.length && !interactionFailures.length };
        })()
        """#
        view.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { outcome in
            var result: [String: Any]
            switch outcome {
            case .success(let value): result = (value as? [String: Any]) ?? ["passed": false, "error": "No layout result"]
            case .failure(let error): result = ["passed": false, "error": error.localizedDescription]
            }
            result["page"] = pages[self.index / widths.count].isEmpty ? "/" : pages[self.index / widths.count]
            result["requestedWidth"] = widths[self.index % widths.count]
            self.results.append(result)
            self.index += 1
            self.next()
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fputs("Layout audit navigation failed: \(error)\n", stderr)
        exit(2)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let audit = Audit()
DispatchQueue.main.asyncAfter(deadline: .now() + 150) { fputs("Layout audit timed out\n", stderr); exit(2) }
audit.next()
app.run()
