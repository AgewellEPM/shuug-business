import AppKit
import SwiftUI
import Security

@MainActor final class WorkspaceModel: ObservableObject {
    @Published var title = "Checking your workspace…"
    @Published var detail = "Connecting to Shuug on this Mac."
    @Published var ready = false
    @Published var checking = false
    @Published var copying = false
    @Published var credentialMessage = "Owner: leave the email field blank on the sign-in page."
    let clipboard = CredentialClipboard()
    private(set) var configuration: WorkspaceConfiguration?

    init() {
        do { configuration = try .load() }
        catch { title = "Workspace setup needs attention"; detail = error.localizedDescription }
        clipboard.onExpired = { [weak self] in self?.credentialMessage = "The password copy has expired." }
    }

    func refresh() async {
        guard !checking else { return }
        do { configuration = try .load() }
        catch {
            configuration = nil
            ready = false
            title = "Workspace setup needs attention"
            detail = error.localizedDescription
            return
        }
        guard let configuration else { return }
        checking = true
        let state = await WorkspaceHealth.check(configuration)
        ready = state.ready
        title = ready ? "Your workspace is running" : "Workspace needs attention"
        detail = state.detail
        checking = false
    }

    func copyPassword() {
        guard !copying, configuration != nil else { return }
        copying = true
        credentialMessage = "Requesting your owner credential from macOS Keychain…"
        Task {
            let result = await Task.detached(priority: .userInitiated) { OwnerCredential.read() }.value
            switch result {
            case .available(let password):
                credentialMessage = clipboard.copy(password) ? "Password copied for 30 seconds. Paste it into Shuug’s sign-in page." : "The clipboard could not be updated."
            case .unavailable(let status):
                credentialMessage = status == errSecUserCanceled
                    ? "Keychain access was canceled. Your password was not copied."
                    : "macOS did not provide the owner credential. Check the Shuug owner entry in Keychain Access."
            }
            copying = false
        }
    }

    func open(_ url: URL) {
        guard let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
            detail = "Safari is needed to open the workspace from this launcher."
            return
        }
        NSWorkspace.shared.open([url], withApplicationAt: safari, configuration: .init()) { [weak self] _, error in
            if error != nil { Task { @MainActor in self?.detail = "Safari could not open this page. Try again." } }
        }
    }

    func startWorkspace() {
        guard let configuration, !checking else { return }
        checking = true
        Task {
            let success = await Task.detached {
                let command = Process()
                command.executableURL = URL(fileURLWithPath: "/bin/launchctl")
                command.arguments = ["kickstart", "gui/\(getuid())/\(configuration.service)"]
                command.standardOutput = FileHandle.nullDevice
                command.standardError = FileHandle.nullDevice
                do { try command.run(); command.waitUntilExit(); return command.terminationStatus == 0 }
                catch { return false }
            }.value
            checking = false
            if !success { detail = "The installed service could not be started. Check the workspace installation." }
            try? await Task.sleep(nanoseconds: 500_000_000)
            await refresh()
        }
    }
}

private struct WorkspaceView: View {
    @ObservedObject var model: WorkspaceModel
    private let purple = Color(red: 0.65, green: 0.17, blue: 0.93)

    var body: some View {
        VStack(alignment: .leading, spacing: 23) {
            HStack(spacing: 14) {
                Text("RTP").font(.system(size: 18, weight: .black)).frame(width: 60, height: 60)
                    .background(purple.gradient).clipShape(RoundedRectangle(cornerRadius: 17))
                VStack(alignment: .leading, spacing: 5) {
                    Text("Shuug Workspace").font(.system(size: 28, weight: .bold))
                    Text("Rideshare Tax Pros · Owner access").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                Label(model.title, systemImage: model.ready ? "checkmark.shield.fill" : "lock.shield")
                    .font(.headline).foregroundStyle(model.ready ? Color.green : Color.white)
                Text(model.detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Text("Private workspace on this Mac").font(.caption).foregroundStyle(.secondary)
            }
            .padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.045)).overlay(RoundedRectangle(cornerRadius: 17).stroke(purple.opacity(0.35)))
            .clipShape(RoundedRectangle(cornerRadius: 17))

            HStack(spacing: 12) {
                Button { if let url = model.configuration?.workspaceURL { model.open(url) } } label: {
                    Label("Open Shuug", systemImage: "arrow.up.right").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).tint(purple).disabled(!model.ready).keyboardShortcut(.defaultAction)
                Button { model.open(WorkspaceConfiguration.website) } label: {
                    Label("Website", systemImage: "globe").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered)
            }.controlSize(.large)
            VStack(alignment: .leading, spacing: 10) {
                Button { model.copyPassword() } label: {
                    Label(model.copying ? "Waiting for Keychain…" : "Copy owner password", systemImage: "key")
                }.disabled(model.copying || model.configuration == nil).controlSize(.large)
                Text(model.credentialMessage).font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true).accessibilityLabel(model.credentialMessage)
            }
            Divider().opacity(0.5)
            HStack {
                Text("Public client access is configured separately.").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if !model.ready && model.configuration != nil {
                    Button("Start workspace") { model.startWorkspace() }.disabled(model.checking)
                }
                Button("Refresh") { Task { await model.refresh() } }.disabled(model.checking)
            }
        }
        .padding(30).frame(minWidth: 500, idealWidth: 550, maxWidth: .infinity, minHeight: 480)
        .background(Color(red: 0.035, green: 0.033, blue: 0.06))
        .preferredColorScheme(.dark).task { await model.refresh() }
    }
}

@MainActor private final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private let model = WorkspaceModel()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 550, height: 510),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Rideshare Tax Pros Workspace"
        window.identifier = .init("RideshareTaxProsOwnerWorkspace")
        window.minSize = NSSize(width: 520, height: 520)
        window.titlebarAppearsTransparent = true
        window.contentView = NSHostingView(rootView: WorkspaceView(model: model))
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Shuug Workspace", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)
        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        menu.addItem(windowItem)
        NSApplication.shared.mainMenu = menu
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { model.clipboard.clearIfOwned() }
}

@main private enum WorkspaceEntrypoint {
    @MainActor static func main() async {
        if CommandLine.arguments.contains("--status-json") {
            do {
                let state = await WorkspaceHealth.check(try .load())
                let data = try JSONEncoder().encode(state)
                FileHandle.standardOutput.write(data)
                FileHandle.standardOutput.write(Data("\n".utf8))
                exit(state.ready ? 0 : 1)
            } catch {
                print("{\"ready\":false,\"detail\":\"Workspace installation is unavailable.\"}")
                exit(1)
            }
        }
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}
