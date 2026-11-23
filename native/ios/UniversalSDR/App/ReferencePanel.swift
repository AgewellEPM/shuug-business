import PDFKit
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct ReferencePanel: View {
    let kind: ReferenceKind
    @ObservedObject var library: ReferenceLibrary
    @State private var editingLink = false
    @State private var choosingPDF = false
    @State private var importError = false

    var body: some View {
        Group {
            if let source = library.sources[kind] {
                VStack(spacing: 0) {
                    header(source)
                    Divider()
                    switch source {
                    case .link(let url):
                        ReferenceWebPage(url: url)
                            .id(url)
                    case .pdf(let id, _):
                        ReferencePDF(file: library.pdfURL(id))
                            .id(id)
                    }
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(kind == .demo ? "Open a demo" : "Open documentation")
                            .font(.title2.bold())
                        ReferenceLinkForm(kind: kind, initialURL: nil, save: saveLink)
                        if kind == .docs {
                            Button("Open PDF from Files", systemImage: "doc") { choosingPDF = true }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("sdr.reference.pdf")
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: 460)
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .background(Color(uiColor: .systemBackground))
        .sheet(isPresented: $editingLink) {
            NavigationStack {
                Form {
                    ReferenceLinkForm(kind: kind, initialURL: currentLink, save: saveLink)
                }
                .navigationTitle(kind == .demo ? "Demo Link" : "Documentation Link")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { editingLink = false }
                    }
                }
            }
        }
        .fileImporter(isPresented: $choosingPDF, allowedContentTypes: [.pdf]) { result in
            do { try library.importPDF(result.get()) }
            catch { importError = true }
        }
        .alert("Couldn’t open PDF", isPresented: $importError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Choose a readable PDF from Files.")
        }
    }

    private var currentLink: URL? {
        if case .link(let url) = library.sources[kind] { return url }
        return nil
    }

    private func header(_ source: ReferenceSource) -> some View {
        HStack {
            switch source {
            case .link(let url):
                Label(url.host() ?? kind.title, systemImage: "link")
                    .lineLimit(1)
            case .pdf(_, let name):
                Label(name, systemImage: "doc")
                    .lineLimit(1)
            }
            Spacer()
            Menu("Options", systemImage: "ellipsis.circle") {
                Button(currentLink == nil ? "Open Documentation Link" : "Change Link", systemImage: "link") {
                    editingLink = true
                }
                if kind == .docs {
                    Button("Open PDF from Files", systemImage: "doc") { choosingPDF = true }
                }
                Button("Clear", systemImage: "xmark", role: .destructive) { library.clear(kind) }
            }
            .accessibilityIdentifier("sdr.reference.options")
            .labelStyle(.iconOnly)
            .frame(minWidth: 44, minHeight: 44)
        }
        .font(.subheadline)
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .background(.bar)
    }

    private func saveLink(_ url: URL) {
        library.saveLink(url, for: kind)
        editingLink = false
    }
}

private struct ReferenceLinkForm: View {
    let kind: ReferenceKind
    let save: (URL) -> Void
    @State private var input: String
    @State private var invalid = false

    init(kind: ReferenceKind, initialURL: URL?, save: @escaping (URL) -> Void) {
        self.kind = kind
        self.save = save
        _input = State(initialValue: initialURL?.absoluteString ?? "")
    }

    var body: some View {
        TextField(kind == .demo ? "Demo link" : "Documentation link", text: $input)
            .accessibilityIdentifier("sdr.reference.link")
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
            .submitLabel(.go)
            .onSubmit(submit)
        if invalid {
            Text("Enter a valid HTTPS link.")
                .foregroundStyle(.red)
        }
        Button("Open Link", action: submit)
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("sdr.reference.open")
    }

    private func submit() {
        guard let url = SDRWebAddress.components(input)?.url else {
            invalid = true
            return
        }
        invalid = false
        save(url)
    }
}

private struct ReferenceWebPage: View {
    let url: URL
    @State private var failed = false
    @State private var revision = 0

    var body: some View {
        ZStack {
            ReferenceWebView(url: url, failed: $failed)
                .id(revision)
                .accessibilityHidden(failed)
            if failed {
                ContentUnavailableView {
                    Label("Page unavailable", systemImage: "network.slash")
                } description: {
                    Text("Check the link or your connection.")
                } actions: {
                    Button("Try Again") {
                        failed = false
                        revision += 1
                    }
                    .buttonStyle(.borderedProminent)
                }
                .background(Color(uiColor: .systemBackground))
            }
        }
    }
}

private struct ReferenceWebView: UIViewRepresentable {
    let url: URL
    @Binding var failed: Bool

    func makeCoordinator() -> Coordinator { Coordinator(failed: $failed) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        @Binding var failed: Bool

        init(failed: Binding<Bool>) { _failed = failed }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
                return
            }
            let allowed = action.request.url.map { SDRWebAddress.allowsNavigation(to: $0) } ?? false
            decisionHandler(allowed ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url, SDRWebAddress.allowsNavigation(to: url) {
                webView.load(action.request)
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let error = error as NSError
            if error.domain != NSURLErrorDomain || error.code != NSURLErrorCancelled { failed = true }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { failed = true }
    }
}

private struct ReferencePDF: UIViewRepresentable {
    let file: URL

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.displayMode = .singlePageContinuous
        view.document = PDFDocument(url: file)
        view.autoScales = true
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}
}
