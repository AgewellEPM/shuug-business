import SwiftUI

struct ConnectionView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var origin = ""
  @State private var email = ""
  @State private var password = ""
  @State private var includeOffline = false
  @State private var busy = false
  @State private var signingIn = false
  @State private var notice: String?
  @State private var signingOut = false
  var body: some View {
    Form {
      Section {
        BrandHeader()
        Text("Your driving records, connected to your firm’s private Shuug workspace.")
      }.listRowBackground(Brand.surface)
      if let connection = model.connection, !signingIn {
        Section("Your client account") {
          Text(connection.session.account.name).font(.headline)
          Text(connection.session.account.email).privacySensitive()
          LabeledContent("Firm", value: connection.session.branding.name)
          Text(connection.origin.host ?? "").font(.caption).foregroundStyle(.secondary)
          Label(model.syncStatus, systemImage: "icloud")
          if let date = model.journal.lastSyncAt {
            LabeledContent("Last successful sync", value: date.formatted())
          }
          if model.pendingCount > 0 {
            Text("\(model.pendingCount) records or receipts are waiting to sync.")
          }
          if let detail = model.syncDetail {
            Text(detail).font(.footnote).foregroundStyle(.secondary)
          }
          Button {
            Task { await model.sync() }
          } label: {
            if model.syncing {
              ProgressView("Syncing…")
            } else {
              Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
            }
          }.disabled(model.syncing)
          Button("Sign in again") {
            origin = connection.origin.absoluteString
            email = connection.session.account.email
            password = ""
            signingIn = true
          }
          Link(
            "Open client portal",
            destination: connection.origin.appendingPathComponent("api/website/customer"))
          Button("Sign out on this phone", role: .destructive) { signingOut = true }.disabled(
            model.syncing)
        }
      } else {
        Section("Connect your invited client account") {
          TextField("HTTPS workspace address", text: $origin).textContentType(.URL).keyboardType(
            .URL
          ).textInputAutocapitalization(.never).autocorrectionDisabled()
          Button("Find my firm’s workspace") {
            Task {
              busy = true
              defer { busy = false }
              do {
                if let url = try await WorkspaceClient.discover() {
                  origin = url.absoluteString
                  notice = nil
                } else {
                  notice =
                    "Your firm’s public workspace connection is still being prepared. You can keep recording on this iPhone."
                }
              } catch { notice = error.localizedDescription }
            }
          }.disabled(busy)
          TextField("Client email", text: $email).textContentType(.username).keyboardType(
            .emailAddress
          ).textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
          SecureField("Client password", text: $password).textContentType(.password)
          if model.guest && !model.journal.visible.isEmpty {
            Toggle(
              "Copy my \(model.journal.visible.count) offline records to this client account",
              isOn: $includeOffline)
            if includeOffline {
              Text("Your offline source stays on this iPhone. Existing account records are kept; copied records sync with your firm.")
                .font(.footnote).foregroundStyle(.secondary)
            }
          }
          Button {
            Task { await connect() }
          } label: {
            if busy {
              ProgressView("Connecting…")
            } else {
              Text("Connect & sync my records").font(.headline)
            }
          }.disabled(
            busy || email.isEmpty || password.isEmpty || origin.isEmpty || !model.storageHealthy)
          if signingIn {
            Button("Cancel sign-in") {
              signingIn = false
              password = ""
            }
          }
          Text(
            "Use the client account your firm invited you to. Activate your invitation in the client portal first. Your owner or staff login is separate."
          ).font(.footnote).foregroundStyle(.secondary)
        }
      }
      if let notice { Section { Text(notice).font(.footnote) } }
      Section { NavigationLink("Driving & expense reminders") { AssistanceView() } }
      Section { NavigationLink("Driver Rewards · Referrals & points") { ReferralView() } }
      Section("On your iPhone") {
        Text(
          "Records save locally before syncing. Signing out keeps each account’s journal separate; reconnect to the same account to see its saved records."
        )
        Text(
          "GPS route points are not shared with your firm. Trip details, recorded mileage, expenses, income and the receipts you attach are shared when you connect and sync."
        )
        Text(
          "Bank imports and receipt suggestions need your review. There is no automatic tax filing. Direct bank linking requires your firm's configured provider."
        )
      }.font(.footnote)
      Section {
        Link(
          "Tax firm website",
          destination: URL(string: "https://rideshare-tax-pros.pages.dev")!)
        NavigationLink("App privacy & data") { DriverPrivacyView() }
        Button("Open iPhone app settings") {
          if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
          }
        }
        Text("Driver app · Version 0.1.0").font(.caption).foregroundStyle(.secondary)
      }
    }.driverScreen().navigationTitle("Your account").scrollDismissesKeyboard(.interactively)
      .confirmationDialog(
        "Sign out? Your account’s unsynced records will stay on this iPhone and return when you reconnect to that same account.",
        isPresented: $signingOut, titleVisibility: .visible
      ) { Button("Sign out", role: .destructive) { Task { await model.disconnect() } } }
  }
  private func connect() async {
    busy = true
    notice = nil
    defer {
      busy = false
      password = ""
    }
    do {
      try await model.connect(
        origin: WorkspaceAddress.parse(origin),
        email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password,
        includeOffline: includeOffline)
      signingIn = false
    } catch { notice = error.localizedDescription }
  }
}
