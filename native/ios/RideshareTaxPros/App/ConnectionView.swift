import SwiftUI

struct ConnectionView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var origin = ""
  @State private var email = ""
  @State private var password = ""
  @State private var includeOffline = false
  @State private var discovering = false
  @State private var connecting = false
  @State private var checkedDiscovery = false
  @State private var signingIn = false
  @State private var notice: String?
  @State private var signingOut = false
  private var changingAccountBlocked: Bool { model.syncing || model.active != nil }
  private var portalURL: URL {
    if let origin = try? WorkspaceAddress.parse(origin) {
      return origin.appendingPathComponent("api/website/customer")
    }
    return WorkspaceClient.websiteURL.appendingPathComponent("client-portal")
  }
  var body: some View {
    Form {
      Section {
        BrandHeader()
        Text("Connect your client account to keep this app and your tax portal together in the same private workspace for your tax team’s review.")
      }.listRowBackground(Brand.surface)
      if let connection = model.connection, !signingIn {
        Section("Your client profile") {
          Text(connection.session.account.name).font(.headline)
          Text(connection.session.account.email).privacySensitive()
          LabeledContent("Firm", value: connection.session.branding.name)
          Text(connection.origin.host ?? "").font(.caption).foregroundStyle(.secondary)
          Label(model.syncStatus, systemImage: "icloud")
            .accessibilityIdentifier("account.syncStatus")
          if let date = model.journal.lastSyncAt {
            LabeledContent("Last successful sync", value: date.formatted())
          } else {
            Text("This account has not completed a sync on this phone yet.")
              .font(.footnote).foregroundStyle(.secondary)
          }
          if model.pendingCount > 0 {
            Text("\(model.pendingCount) records or receipts are saved on this phone and waiting to sync.")
          }
          if let detail = model.syncDetail {
            Text(detail).font(.footnote).foregroundStyle(.secondary)
          }
          Button {
            Task { await model.sync() }
          } label: {
            if model.syncing { ProgressView("Syncing…") }
            else { Label("Sync now", systemImage: "arrow.triangle.2.circlepath") }
          }.disabled(model.syncing).accessibilityIdentifier("account.sync")
          Link("Open my client portal", destination: connection.portalURL)
          Text("Use the same client email and password in the portal. The browser may ask you to sign in separately.")
            .font(.footnote).foregroundStyle(.secondary)
          Button("Sign in again") {
            origin = connection.origin.absoluteString
            email = connection.session.account.email
            password = ""
            notice = nil
            signingIn = true
          }.disabled(changingAccountBlocked)
          Button("Sign out / switch account", role: .destructive) { signingOut = true }
            .disabled(changingAccountBlocked)
          if model.active != nil {
            Text("Finish your current drive before signing out or changing accounts.")
              .font(.footnote).foregroundStyle(.secondary)
          }
        }
      } else {
        connectionSteps
      }
      if let notice { Section { Text(notice).font(.footnote) } }
      Section { NavigationLink("Driving & expense reminders") { AssistanceView() } }
      Section { NavigationLink("Read gig offers · Screen sharing & screenshots") { OfferReaderView() } }
      Section { NavigationLink("Driver Rewards · Referrals & points") { ReferralView() } }
      Section("On your iPhone") {
        Text("Records save locally before syncing. Signing out keeps each account’s journal separate; reconnect to the same account to see its saved records.")
        Text("GPS route points are not shared with your firm. Trip details, recorded mileage, expenses, income and the receipts you attach are shared when you connect and sync.")
        Text("Bank imports and receipt suggestions need your review. There is no automatic tax filing. Direct bank linking requires your firm’s configured provider.")
      }.font(.footnote)
      Section {
        Link("Gig Tax Pros website", destination: WorkspaceClient.websiteURL)
        NavigationLink("App privacy & data") { DriverPrivacyView() }
        Button("Open iPhone app settings") {
          if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        }
        Text("Driver app · Version 0.1.0").font(.caption).foregroundStyle(.secondary)
      }
    }.driverScreen().navigationTitle("Your account").scrollDismissesKeyboard(.interactively)
      .task {
        if model.connection != nil { await model.sync() }
        else if !checkedDiscovery { await findWorkspace() }
      }
      .confirmationDialog(
        "Sign out? Your account’s unsynced records stay on this iPhone and return when you reconnect to that same account.",
        isPresented: $signingOut, titleVisibility: .visible
      ) { Button("Sign out", role: .destructive) { Task { await model.disconnect() } } }
  }
  @ViewBuilder private var connectionSteps: some View {
    Section("1 · Open your client account") {
      if signingIn, let connection = model.connection {
        Text("Reconnect \(connection.session.account.email) at \(connection.origin.host ?? "your firm").")
          .privacySensitive()
        Text("To use another account, cancel and sign out first. Your saved records stay with their original account.")
          .font(.footnote).foregroundStyle(.secondary)
      } else {
        Text("Activate the invitation from your tax team in the client portal. Use that same email and password here.")
        Link("Open client portal / activate invitation", destination: portalURL)
        if !origin.isEmpty, let workspace = try? WorkspaceAddress.parse(origin) {
          Label(workspace.host ?? "Workspace found", systemImage: "checkmark.circle")
            .font(.footnote).foregroundStyle(Brand.link)
        }
        Button {
          Task { await findWorkspace() }
        } label: {
          if discovering { ProgressView("Finding your workspace…") }
          else { Text("Find my firm’s workspace") }
        }.disabled(discovering || connecting)
        DisclosureGroup("Use an address supplied by my firm") {
          TextField("HTTPS workspace address", text: $origin).textContentType(.URL).keyboardType(.URL)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .disabled(discovering || connecting)
            .accessibilityIdentifier("account.workspace")
        }
      }
    }
    Section("2 · Sign in to your profile") {
      TextField("Client email", text: $email).textContentType(.username).keyboardType(.emailAddress)
        .textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
        .disabled(connecting || (signingIn && model.connection != nil))
        .accessibilityIdentifier("account.email")
      SecureField("Client password", text: $password).textContentType(.password)
        .disabled(connecting)
        .accessibilityIdentifier("account.password")
      Text("Your owner or staff login is separate from your invited client account.")
        .font(.footnote).foregroundStyle(.secondary)
    }
    Section("3 · Choose your records and sync") {
      if model.guest && !model.journal.visible.isEmpty {
        Toggle("Copy my \(model.journal.visible.count) phone-only records to this client account", isOn: $includeOffline)
          .disabled(connecting)
          .accessibilityIdentifier("account.copyOffline")
        Text(includeOffline
          ? "Your phone-only source stays on this iPhone. Existing account records are kept; the copies sync with your tax team."
          : "Phone-only records stay separate. Only records already belonging to this client account will sync.")
          .font(.footnote).foregroundStyle(.secondary)
      } else {
        Text("This account’s trips, income, expenses and attached receipts stay together across the app, portal and your tax team’s workspace.")
          .font(.footnote).foregroundStyle(.secondary)
      }
      Button {
        Task { await connect() }
      } label: {
        if connecting { ProgressView("Connecting…") }
        else { Text("Connect & sync my records").font(.headline) }
      }.disabled(connecting || discovering || changingAccountBlocked || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty || origin.isEmpty || !model.storageHealthy)
        .accessibilityIdentifier("account.connect")
      if model.active != nil { Text("Finish your current drive before connecting an account.").font(.footnote) }
      if signingIn {
        Button("Cancel sign-in") { signingIn = false; password = ""; notice = nil }
          .disabled(connecting)
      }
    }
  }
  private func findWorkspace() async {
    guard !discovering, !connecting else { return }
    discovering = true
    checkedDiscovery = true
    defer { discovering = false }
    do {
      if let url = try await WorkspaceClient.discover() {
        origin = url.absoluteString
        notice = nil
      } else {
        notice = "Your firm’s online account connection is still being prepared. Your records remain saved on this iPhone; you can keep using the app."
      }
    } catch { notice = "Could not find the workspace. Try again, or use the HTTPS address supplied by your tax team. \(error.localizedDescription)" }
  }
  private func connect() async {
    guard !connecting, !discovering else { return }
    connecting = true
    notice = nil
    defer { connecting = false; password = "" }
    do {
      try await model.connect(origin: WorkspaceAddress.parse(origin), email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password, includeOffline: includeOffline)
      signingIn = false
      includeOffline = false
    } catch { notice = error.localizedDescription }
  }
}
