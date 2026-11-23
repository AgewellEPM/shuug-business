import SwiftUI
import WebKit

@main
struct UniversalSDRApp: App {
    var body: some Scene {
        WindowGroup { SDRWindow() }
    }
}

private struct SDRWindow: View {
    @StateObject private var browser = SDRBrowser()
    @StateObject private var references = ReferenceLibrary()
    @State private var editingAddress = false
    @State private var exportToCleanUp: URL?

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= 900
            let workspaceVisible = wide || browser.workspaceSelected
            let sidebarVisible = browser.address != nil && (wide ? browser.sidebarShown : !workspaceVisible)
            let split = wide && sidebarVisible
            let workspaceWidth = workspaceVisible ? geometry.size.width * (split ? 0.53 : 1) : 0
            let sidebarWidth = sidebarVisible ? geometry.size.width - workspaceWidth : 0

            VStack(spacing: 0) {
                toolbar(wide: wide, compact: geometry.size.width < 800, sidebarVisible: sidebarVisible)
                Divider()
                HStack(spacing: 0) {
                    workspacePane
                        .frame(width: workspaceWidth)
                        .clipped()
                        .accessibilityHidden(!workspaceVisible)
                    sidebarContent(visible: sidebarVisible)
                        .frame(width: sidebarWidth)
                        .clipped()
                        .accessibilityHidden(!sidebarVisible)
                        .overlay(alignment: .leading) { if split { Divider() } }
                }
            }
            .background(Color(uiColor: .systemBackground))
            .onChange(of: sidebarVisible && browser.sidebar == .research, initial: true) { _, visible in
                if visible { browser.startResearch() }
            }
        }
        .onChange(of: browser.address?.salesURL, initial: true) { _, address in
            references.selectWorkspace(address)
        }
        .sheet(isPresented: $editingAddress) {
            NavigationStack {
                WorkspaceConnection(current: browser.address, isSheet: true) { address in
                    browser.connect(address)
                    editingAddress = false
                }
            }
        }
        .sheet(item: $browser.export, onDismiss: removeSharedExport) { export in
            VStack(spacing: 18) {
                ShareLink(item: export.url) {
                    Label("Share Export", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)
                Text(export.url.lastPathComponent)
                    .foregroundStyle(.secondary)
                Button("Done") { browser.export = nil }
            }
            .padding(24)
            .presentationDetents([.medium])
            .onAppear { exportToCleanUp = export.url }
        }
        .alert("Export failed", isPresented: Binding(
            get: { browser.exportError != nil },
            set: { if !$0 { browser.exportError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(browser.exportError ?? "")
        }
    }

    private func toolbar(wide: Bool, compact: Bool, sidebarVisible: Bool) -> some View {
        HStack(spacing: compact ? 2 : 10) {
            Button("Workspace", systemImage: "rectangle.grid.2x2", action: browser.showWorkspace)
                .accessibilityIdentifier("sdr.workspace")
                .disabled(browser.address == nil)
            Button("Prospects", systemImage: "person.2", action: browser.showProspects)
                .accessibilityIdentifier("sdr.prospects")
                .disabled(browser.address == nil)
            Spacer(minLength: 4)
            sidebarButton("LinkedIn", icon: "link", pane: .research, id: "linkedin", visible: sidebarVisible,
                          action: browser.showLinkedIn)
            sidebarButton("Demo", icon: "play.rectangle", pane: .demo, id: "demo", visible: sidebarVisible) {
                browser.showSidebar(.demo)
            }
            sidebarButton("Docs", icon: "doc.text", pane: .docs, id: "docs", visible: sidebarVisible) {
                browser.showSidebar(.docs)
            }
            if sidebarVisible && browser.sidebar == .research {
                Button("Add to Prospects", systemImage: "person.badge.plus", action: browser.captureProspect)
                    .accessibilityIdentifier("sdr.capture")
                    .disabled(!browser.canCapture)
            }
            if wide && browser.address != nil {
                Button(browser.sidebarShown ? "Hide right pane" : "Show right pane",
                       systemImage: "sidebar.trailing", action: browser.toggleSidebar)
                    .labelStyle(.iconOnly)
                    .accessibilityIdentifier("sdr.toggleSidebar")
            }
            Button("Workspace settings", systemImage: "gearshape") { editingAddress = true }
                .labelStyle(.iconOnly)
                .accessibilityIdentifier("sdr.settings")
                .disabled(browser.address == nil)
        }
        .labelStyle(ToolbarLabelStyle(compact: compact))
        .buttonStyle(ToolbarButtonStyle())
        .padding(.horizontal, 12)
        .background(.bar)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Universal SDR")
    }

    private func sidebarButton(_ name: String, icon: String, pane: SDRBrowser.Sidebar, id: String,
                               visible: Bool, action: @escaping () -> Void) -> some View {
        let selected = visible && browser.sidebar == pane
        return Button(name, systemImage: icon, action: action)
            .background(selected ? Color.accentColor.opacity(0.11) : Color.clear,
                        in: RoundedRectangle(cornerRadius: 8))
            .accessibilityAddTraits(selected ? .isSelected : [])
            .accessibilityIdentifier("sdr." + id)
            .disabled(browser.address == nil)
    }

    @ViewBuilder
    private func sidebarContent(visible: Bool) -> some View {
        if visible {
            switch browser.sidebar {
            case .research:
                researchPane
            case .demo:
                ReferencePanel(kind: .demo, library: references)
            case .docs:
                ReferencePanel(kind: .docs, library: references)
            }
        } else {
            Color.clear
        }
    }

    private var workspacePane: some View {
        ZStack {
            SDRWebView(webView: browser.workspace)
                .accessibilityHidden(browser.address == nil || browser.workspaceError != nil)
            if let error = browser.workspaceError {
                ContentUnavailableView {
                    Label("Workspace unavailable", systemImage: "network.slash")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again", action: browser.showWorkspace)
                        .buttonStyle(.borderedProminent)
                    Button("Change Address") { editingAddress = true }
                        .buttonStyle(.bordered)
                }
                .background(Color(uiColor: .systemBackground))
            } else if browser.address == nil {
                WorkspaceConnection(current: nil, isSheet: false, connect: browser.connect)
                    .background(Color(uiColor: .systemBackground))
            }
        }
    }

    private var researchPane: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Button("Back", systemImage: "chevron.left") { browser.research.goBack() }
                    .disabled(!browser.canGoBack)
                Button("Forward", systemImage: "chevron.right") { browser.research.goForward() }
                    .disabled(!browser.canGoForward)
                Button("Reload", systemImage: "arrow.clockwise", action: browser.reloadResearch)
                Text(browser.researchHost ?? "LinkedIn")
                    .font(.footnote)
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 8)
                Spacer(minLength: 0)
            }
            .labelStyle(.iconOnly)
            .buttonStyle(ToolbarButtonStyle())
            .padding(.horizontal, 6)
            .background(.bar)
            Divider()
            ZStack {
                SDRWebView(webView: browser.research)
                    .accessibilityHidden(browser.researchError != nil)
                if let error = browser.researchError {
                    ContentUnavailableView {
                        Label("Page unavailable", systemImage: "network.slash")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Reload", action: browser.reloadResearch)
                            .buttonStyle(.borderedProminent)
                        Button("Open LinkedIn", action: browser.showLinkedIn)
                            .buttonStyle(.bordered)
                    }
                    .background(Color(uiColor: .systemBackground))
                }
            }
        }
    }

    private func removeSharedExport() {
        if let file = exportToCleanUp { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        exportToCleanUp = nil
    }
}

private struct ToolbarLabelStyle: LabelStyle {
    let compact: Bool
    func makeBody(configuration: Configuration) -> some View {
        if compact {
            Label(configuration).labelStyle(.iconOnly)
        } else {
            Label(configuration).labelStyle(.titleAndIcon)
        }
    }
}

private struct ToolbarButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .foregroundStyle(isEnabled ? Color.accentColor : Color.secondary)
            .opacity(configuration.isPressed ? 0.55 : 1)
    }
}

private struct WorkspaceConnection: View {
    @Environment(\.dismiss) private var dismiss
    @State private var address: String
    @State private var invalid = false
    let isSheet: Bool
    let connect: (WorkspaceAddress) -> Void

    init(current: WorkspaceAddress?, isSheet: Bool, connect: @escaping (WorkspaceAddress) -> Void) {
        _address = State(initialValue: current?.salesURL.absoluteString ?? "")
        self.isSheet = isSheet
        self.connect = connect
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !isSheet { Text("Connect to Universal SDR").font(.title2.bold()) }
                Text("Enter your workspace’s HTTPS address.")
                    .foregroundStyle(.secondary)
                TextField("https://sdr.yourcompany.com", text: $address)
                    .accessibilityLabel("Workspace address")
                    .accessibilityIdentifier("sdr.address")
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.go)
                    .onSubmit(submit)
                if invalid {
                    Text("Enter an HTTPS workspace address or its /sales link.")
                        .foregroundStyle(.red)
                }
                Button("Connect", action: submit)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("sdr.connect")
            }
            .padding(24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
            .padding(.top, isSheet ? 0 : 44)
        }
        .navigationTitle(isSheet ? "Workspace Settings" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isSheet {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() {
        guard let parsed = WorkspaceAddress(address) else {
            invalid = true
            return
        }
        invalid = false
        connect(parsed)
    }
}

private struct SDRWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
