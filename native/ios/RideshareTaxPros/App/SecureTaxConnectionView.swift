import SwiftUI
import UniformTypeIdentifiers

struct SecureTaxConnectionView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var pins: SecureTaxPublicPins?
  @State private var scope: SecureTaxKeyScope?
  @State private var server: SecureTaxServerStatus?
  @State private var keyState: SecureTaxDeviceKeys.State?
  @State private var publicRequest: String?
  @State private var error: String?
  @State private var notice: String?
  @State private var loading = false
  @State private var creating = false
  @State private var importing = false
  @State private var importScope: String?
  @State private var loadedIdentity: String?
  private let keys = SecureTaxDeviceKeys()
  private var connectionIdentity: String {
    guard let connection = model.connection else { return "signed-out" }
    return connection.origin.absoluteString + "|" + connection.session.account.id.uuidString + "|" + connection.session.token
  }
  var body: some View {
    Form {
      Section("Protection status") {
        Label("Encrypted sync is not activated", systemImage: "lock.shield")
        Text("This setup prepares and verifies your device key. Existing records and documents have not been migrated to this protection.")
          .font(.footnote).foregroundStyle(.secondary)
        if loading { ProgressView("Checking this account’s setup…") }
        if let error { Text(error).font(.footnote).foregroundStyle(.secondary) }
        if let notice { Text(notice).font(.footnote) }
      }
      Section("1 · Your device key") {
        if let keyState {
          Label("Client key saved on this iPhone", systemImage: "key.fill")
          Text("The key stays in this device’s Keychain while unlocked. It does not sync through iCloud or transfer to another phone.")
            .font(.footnote).foregroundStyle(.secondary)
          DisclosureGroup("Public key fingerprint") { Text(keyState.client.keyId).font(.caption.monospaced()).textSelection(.enabled) }
        } else {
          Button("Create this iPhone’s client key") { creating = true }
            .disabled(pins == nil || scope == nil || loading)
            .accessibilityIdentifier("secureTax.createClientKey")
          Text("Create a key only for the signed-in client account. Your firm must approve its public key before protected data can use it.")
            .font(.footnote).foregroundStyle(.secondary)
        }
      }
      Section("2 · Ask your firm to approve this key") {
        if let publicRequest {
          ShareLink("Share public enrollment request", item: publicRequest)
          DisclosureGroup("View public request") {
            Text(publicRequest).font(.caption.monospaced()).textSelection(.enabled).privacySensitive()
          }
        }
        Button("Import signed enrollment JSON") { importScope = connectionIdentity; importing = true }
          .disabled(keyState == nil || scope == nil || loading)
          .accessibilityIdentifier("secureTax.importManifest")
        if let manifest = server?.manifest {
          Button("Verify workspace’s signed enrollment") { stage(manifest, expected: connectionIdentity) }
            .disabled(keyState == nil || scope == nil || loading)
        }
        Text("Your firm signs the public request on its separate trusted device. This app verifies that signature against public keys included in the signed app.")
          .font(.footnote).foregroundStyle(.secondary)
      }
      Section("3 · Verified enrollment and migration") {
        if let manifest = keyState?.stagedManifest {
          Label("Signed enrollment verified on this device", systemImage: "checkmark.shield")
          LabeledContent("Key version", value: String(manifest.epoch))
          LabeledContent("Approval expires", value: manifest.expiresAt)
        } else { Text("No signed key enrollment has been verified for this device.") }
        if server?.enrolled == true { Text("The workspace reports an enrollment. A valid local key and signed approval are still required to open protected data.") }
        if server?.legacyMigrationRequired == true {
          Text("Existing workspace data needs a verified migration and removal review before full protection can be claimed.")
        }
        Text("Activation is unavailable while encrypted sync and migration are being completed. Importing approval here stages it locally and does not change your workspace enrollment.")
          .font(.footnote).foregroundStyle(.secondary)
        Button("Check setup again") { Task { await reload(connectionIdentity) } }.disabled(loading)
      }
    }.driverScreen().navigationTitle("Protected data setup")
      .task(id: connectionIdentity) {
        pins = nil; scope = nil; server = nil; keyState = nil; publicRequest = nil
        notice = nil; error = nil; importScope = nil; loadedIdentity = nil; loading = false
        await reload(connectionIdentity)
      }
      .confirmationDialog("Create a device-only client key for this account? Keep this iPhone until firm approval and recovery have been verified.",
        isPresented: $creating, titleVisibility: .visible) {
        Button("Create client key") { createKey() }
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
        let expected = importScope
        importScope = nil
        guard let expected, expected == connectionIdentity else { return }
        do {
          guard let url = try result.get().first else { return }
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let file = try FileHandle(forReadingFrom: url)
          defer { try? file.close() }
          let data = try file.read(upToCount: 16_385) ?? Data()
          guard data.count <= 16_384 else { throw SecureTaxSetupError.message("The signed enrollment file exceeds its size limit.") }
          stage(try SecureTaxManifest.decode(data), expected: expected)
        } catch { if expected == connectionIdentity { self.error = error.localizedDescription } }
      }
  }
  @MainActor private func reload(_ expected: String) async {
    guard let connection = model.connection, expected == connectionIdentity else { return }
    loading = true; error = nil
    defer { if expected == connectionIdentity { loading = false } }
    do {
      let pins = try SecureTaxPublicPins.bundled()
      let server = try await SecureTaxEnrollmentClient(origin: connection.origin, token: connection.session.token)
        .status(pins: pins, accountId: connection.session.account.id.uuidString.lowercased())
      guard expected == connectionIdentity, !Task.isCancelled else { return }
      let scope = try SecureTaxKeyScope(pins: pins, identity: server.identity)
      self.pins = pins; self.scope = scope; self.server = server
      loadedIdentity = expected
      try refreshLocal(scope)
    } catch { if expected == connectionIdentity, !Task.isCancelled { self.error = error.localizedDescription } }
  }
  private func refreshLocal(_ scope: SecureTaxKeyScope) throws {
    keyState = try keys.state(for: scope)
    publicRequest = try keyState.map { try SecureTaxEnrollmentRequest(scope: scope, client: $0.client).publicJSON() }
    if keyState?.stagedManifest != nil, let pins {
      do { _ = try keys.verifiedRecipients(scope: scope, pins: pins) }
      catch { self.error = error.localizedDescription; keyState?.stagedManifest = nil }
    }
  }
  private func createKey() {
    guard let scope, pins != nil, !loading, loadedIdentity == connectionIdentity, model.connection != nil else { return }
    do {
      _ = try keys.createClientKey(for: scope)
      try refreshLocal(scope)
      notice = "Your client key is saved. Share the public request with your firm for approval."
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  private func stage(_ manifest: SecureTaxManifest, expected: String) {
    guard expected == connectionIdentity, loadedIdentity == expected, let scope, let pins else { return }
    do {
      _ = try keys.stage(manifest, scope: scope, pins: pins)
      try refreshLocal(scope)
      error = nil; notice = "The firm signature, this account, both public keys and approval version were verified. Activation remains pending."
    } catch { self.error = error.localizedDescription }
  }
}
