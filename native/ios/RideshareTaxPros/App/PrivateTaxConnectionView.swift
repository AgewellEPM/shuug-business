import SwiftUI
import UniformTypeIdentifiers

struct PrivateTaxConnectionView: View {
  @EnvironmentObject private var model: DriverModel
  @ObservedObject var controller: PrivateTaxController
  @State private var accountCode = ""
  @State private var password = ""
  @State private var code = ""
  @State private var passphrase = ""
  @State private var includeOffline = false
  @State private var selectingBackup = false
  @State private var backup: Data?
  var body: some View {
    Form {
      Section {
        BrandHeader()
        Text("Your client key encrypts the Journal and receipts before they leave this iPhone. Keep your encrypted key backup and its passphrase somewhere you control.")
        Text(controller.status).font(.footnote)
      }
      if let session = controller.authenticated {
        Section("Private account") {
          LabeledContent("Account code", value: session.identity.accountId).privacySensitive()
          LabeledContent("Key access", value: controller.ready ? "Original client key verified" : "Backup import needed")
          Link("Open private portal", destination: URL(string: "https://portal.gigtax.pro")!)
          Button("Sign out / switch private account", role: .destructive) { Task { await controller.signOut(model: model) } }.disabled(controller.busy || controller.syncing || model.active != nil)
        }
        if !controller.ready {
          Section("Import your original client key") {
            Text("Use the encrypted backup saved during setup in the new private portal. The backup cannot select a profile or replace your original account key. Neither this file nor its passphrase is sent to the workspace.").font(.footnote)
            Button(backup == nil ? "Choose encrypted key backup" : "Encrypted backup selected · Choose another") { selectingBackup = true }
            SecureField("Separate backup passphrase", text: $passphrase).textContentType(.password).privacySensitive()
            Button("Verify & save key on this iPhone") {
              guard let backup else { return }; let secret = passphrase; passphrase = ""; self.backup = nil
              Task { await controller.importBackup(backup, passphrase: secret, model: model) }
            }.disabled(backup == nil || passphrase.isEmpty || controller.busy || controller.syncing)
          }
        }
        Section("Encrypted Journal & receipts") {
          Button { Task { await controller.sync(model: model) } } label: {
            if controller.syncing { ProgressView("Syncing encrypted records…") } else { Label("Sync encrypted records now", systemImage: "lock.icloud") }
          }.disabled(!controller.ready || controller.syncing || controller.busy)
          Text("Local originals stay on this iPhone. This upload includes Journal records and locally available receipt files. Remote restore and merging need a separate review.").font(.footnote)
        }
      } else {
        Section("Sign in to your client-owned account") {
          if let challenge = controller.mfa {
            if challenge.enrollmentRequired, let secret = challenge.secret {
              Text("Add this private setup key to your authenticator, then enter its current six-digit code.").font(.footnote)
              Text(secret).font(.system(.body, design: .monospaced)).privacySensitive().textSelection(.enabled)
            }
            TextField("Authenticator or unused recovery code", text: $code).textContentType(.oneTimeCode).textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
          } else {
            TextField("Private account code", text: $accountCode).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
            SecureField("Account password", text: $password).textContentType(.password)
          }
          if model.guest && !model.journal.visible.isEmpty {
            Toggle("Copy my phone-only records and receipt files", isOn: $includeOffline)
            Text("Your phone-only source remains saved separately. Copying does not import any old enrollment or upload queue.").font(.footnote)
          }
          Button(controller.mfa == nil ? "Sign in privately" : "Verify & sign in") {
            let secret = password, factor = code; password = ""; code = ""
            Task { await controller.signIn(accountCode: accountCode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), password: secret, code: factor, model: model, includeOffline: includeOffline) }
          }.disabled(controller.busy || controller.syncing || controller.socialWaiting || model.active != nil || (controller.mfa == nil ? accountCode.isEmpty || password.isEmpty : code.isEmpty))
          if controller.mfa != nil || controller.socialWaiting { Button("Cancel sign-in") { controller.cancelSignIn(); password = ""; code = "" } }
          Text("Activate a new client-owned invitation in the private portal first. Older firm-recovery accounts require an explicit separate plan.").font(.footnote)
          Link("Open private portal setup", destination: URL(string: "https://portal.gigtax.pro")!)
        }
        if controller.mfa == nil {
          Section("Connected sign-in") {
            ForEach(["google", "apple"], id: \.self) { provider in
              Button("Continue with " + (provider == "google" ? "Google" : "Apple")) {
                Task { if let url = await controller.beginSocial(provider, model: model) { await UIApplication.shared.open(url) } }
              }.disabled(controller.busy || controller.socialWaiting || model.active != nil)
            }
            if controller.socialWaiting { ProgressView("Waiting for Safari sign-in…") }
            Text("Connect the provider in your private portal first. Provider sign-in still requires your account’s second factor and original encryption key.").font(.footnote)
          }
        }
      }
      if !controller.recoveryCodes.isEmpty {
        Section("Save these recovery codes privately") {
          Text(controller.recoveryCodes.joined(separator: "\n")).font(.system(.body, design: .monospaced)).privacySensitive().textSelection(.enabled)
          Button("I saved my recovery codes") { controller.recoveryCodes = [] }
        }
      }
      if controller.busy { Section { ProgressView("Verifying private setup…") } }
      if let error = controller.error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
    }.driverScreen().navigationTitle("Client-owned private sync").scrollDismissesKeyboard(.interactively)
      .fileImporter(isPresented: $selectingBackup, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
        do {
          guard let url = try result.get().first else { return }; let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
          let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }; let bytes = try handle.read(upToCount: 16_385) ?? Data()
          guard bytes.count <= 16_384 else { throw PrivateTaxWire.fail("Choose the small encrypted client-key backup JSON file.") }; backup = bytes
        } catch { controller.error = error.localizedDescription }
      }
      .task(id: controller.socialWaiting) { if controller.socialWaiting { await controller.pollSocial(model: model, includeOffline: includeOffline) } }
      .onDisappear { passphrase = ""; password = ""; code = ""; backup = nil }
  }
}
