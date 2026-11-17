import Combine
import CryptoKit
import DriverCore
import Foundation

@MainActor final class PrivateTaxController: ObservableObject {
  @Published private(set) var authenticated: PrivateTaxSession?
  @Published private(set) var mfa: PrivateTaxMFA?
  @Published private(set) var ready = false
  @Published private(set) var busy = false
  @Published private(set) var syncing = false
  @Published private(set) var status = "Records stay on this iPhone until private setup is complete."
  @Published var error: String?
  @Published var recoveryCodes: [String] = []
  @Published private(set) var socialWaiting = false
  private var socialPending: (requestId: String, verifier: String, expires: Date)?
  private var pendingAccountCode: String?
  private var generation = UUID()
  private var retry: Task<Void, Never>?
  private let keys = PrivateTaxDeviceKeys()
  private let sessions = PrivateTaxSessionStore()
  private var http: PrivateTaxHTTP?
  var scope: PrivateTaxScope? { guard let authenticated, let http else { return nil }; return try? PrivateTaxScope(pins: http.pins, identity: authenticated.identity) }
  var localNamespace: String? { scope.flatMap { try? "private-client-only-v1-" + $0.storageAccount } }
  var hasSession: Bool { authenticated != nil }
  func restore(model: DriverModel) {
    do {
      let pins = try PrivateTaxPins.bundled(); http = try PrivateTaxHTTP(pins: pins)
      guard let session = try sessions.read(pins: pins) else { return }
      authenticated = session
      if let scope { try model.openPrivateJournal(scope: scope, includeOffline: false); ready = try keys.load(scope: scope, pins: pins) != nil }
      status = ready ? "Client-owned records are ready to sync." : "Import this account’s original encrypted key backup."
    } catch { self.error = error.localizedDescription }
  }
  private func client() throws -> PrivateTaxHTTP {
    if let http { return http }
    let value = try PrivateTaxHTTP(pins: PrivateTaxPins.bundled()); http = value; return value
  }
  func signIn(accountCode: String, password: String, code: String, model: DriverModel, includeOffline: Bool) async {
    guard !busy, !syncing, model.active == nil else { return }
    busy = true; error = nil; let expected = generation
    defer { busy = false }
    do {
      let http = try client(), body: [String: Any]
      if let mfa { try mfa.validate(); body = ["challengeToken": mfa.challengeToken, "code": code, "privateAccount": true] }
      else {
        guard let id = UUID(uuidString: accountCode), id.uuidString.lowercased() == accountCode, !password.isEmpty, password.count <= 200 else { throw PrivateTaxWire.fail("Enter the private account code from your new client-owned invitation and its account password.") }
        pendingAccountCode = accountCode
        body = ["accountCode": accountCode, "password": password]
      }
      let response = try await http.request("native-session", method: "POST", body: PrivateTaxWire.json(body), allowMFA: true)
      guard generation == expected else { return }
      if response.status == 428 {
        let challenge = try JSONDecoder().decode(PrivateTaxMFA.self, from: response.data); try challenge.validate(); mfa = challenge
        status = challenge.enrollmentRequired ? "Add this account to your authenticator, then enter its current code." : "Enter the current authenticator code or an unused recovery code."
        return
      }
      let session = try JSONDecoder().decode(PrivateTaxSession.self, from: response.data); try session.validate()
      if let pendingAccountCode, session.identity.accountId != pendingAccountCode { throw PrivateTaxWire.fail("The sign-in response belongs to another private account.") }
      try await accept(session, http: http, model: model, includeOffline: includeOffline, expected: expected)
    } catch { if generation == expected { self.error = error.localizedDescription } }
  }
  func accept(_ session: PrivateTaxSession, http: PrivateTaxHTTP, model: DriverModel, includeOffline: Bool, expected: UUID? = nil) async throws {
    let expected = expected ?? generation
    try session.validate()
    let manifest = try await http.status(session)
    guard generation == expected else { throw CancellationError() }
    // A host cannot replace an already held key with a newly signed binding.
    let scope = try PrivateTaxScope(pins: http.pins, identity: session.identity)
    _ = try keys.refresh(manifest: manifest, scope: scope, pins: http.pins)
    try model.openPrivateJournal(scope: scope, includeOffline: includeOffline)
    var saved = session; recoveryCodes = session.recoveryCodes ?? []; saved.recoveryCodes = nil
    try sessions.save(saved, pins: http.pins)
    self.http = http; authenticated = saved; mfa = nil; pendingAccountCode = nil; ready = try keys.load(scope: scope, pins: http.pins) != nil
    status = ready ? "Client-owned sign-in verified. Your original local key is ready." : "Signed in. Import your client-held encrypted key backup to enable encrypted sync."
    if ready { await sync(model: model) }
  }
  func importBackup(_ data: Data, passphrase: String, model: DriverModel) async {
    guard !busy, !syncing, let session = authenticated, let scope else { return }
    busy = true; error = nil; let expected = generation
    defer { busy = false }
    do {
      let http = try client(), manifest = try await http.status(session)
      let key = try await Task.detached(priority: .userInitiated) { try PrivateTaxBackup.open(data, passphrase: passphrase) }.value
      guard generation == expected, authenticated?.token == session.token, model.journalScope == localNamespace else { throw CancellationError() }
      try keys.stage(key: key, manifest: manifest, scope: scope, pins: http.pins)
      ready = true; status = "Original client key verified and saved only in this iPhone’s device-only Keychain."
      await sync(model: model)
    } catch { if generation == expected { self.error = error.localizedDescription } }
  }
  func schedule(model: DriverModel) {
    guard ready, hasSession, model.journalScope == localNamespace else { return }
    retry?.cancel()
    retry = Task { [weak self, weak model] in
      do { try await Task.sleep(for: .milliseconds(750)) } catch { return }
      guard let self, let model else { return }; await self.sync(model: model)
    }
  }
  func sync(model: DriverModel) async {
    guard !syncing, let session = authenticated, let scope, model.journalScope == localNamespace, model.storageHealthy, let disk = model.disk else { return }
    syncing = true; error = nil; let expected = generation, namespace = model.journalScope
    defer { syncing = false }
    do {
      let http = try client(), manifest = try await http.status(session)
      guard try keys.refresh(manifest: manifest, scope: scope, pins: http.pins) else { ready = false; status = "Import this account’s original encrypted key backup to enable client-owned sync."; return }
      ready = true
      guard generation == expected, model.journalScope == namespace else { return }
      let captured = model.journal, service = try PrivateTaxSync(http: http, authenticated: session)
      status = "Uploading client-encrypted Journal and receipts…"
      for receipt in captured.receipts {
        guard generation == expected, model.journalScope == namespace else { return }
        let url = disk.receiptURL(receipt.id)
        if FileManager.default.fileExists(atPath: url.path) { try await service.receipt(receipt, bytes: disk.receipt(receipt.id)) }
      }
      guard generation == expected, model.journalScope == namespace else { return }
      try await service.journal(captured)
      guard generation == expected, model.journalScope == namespace else { return }
      status = "Encrypted Journal and available receipts acknowledged by your private workspace."
      if try SecureTaxJournalSnapshot.journalSHA256(captured) != SecureTaxJournalSnapshot.journalSHA256(model.journal) { schedule(model: model) }
    } catch { if generation == expected { status = "Saved on this iPhone · Encrypted sync pending"; self.error = error.localizedDescription } }
  }
  func beginSocial(_ provider: String, model: DriverModel) async -> URL? {
    guard !busy, !syncing, authenticated == nil, model.active == nil, ["google", "apple"].contains(provider) else { return nil }
    busy = true; error = nil; let expected = generation
    defer { busy = false }
    do {
      let http = try client(), bytes = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
      let verifier = SecureTaxEnvelope.encode(bytes), challenge = SecureTaxEnvelope.encode(Data(SHA256.hash(data: Data(verifier.utf8))))
      let response = try await http.request("social/start", method: "POST", body: PrivateTaxWire.json(["provider": provider, "audience": "secure-customer", "purpose": "login", "challenge": challenge]))
      let object = try response.object
      guard generation == expected, object["apiVersion"] as? Int == 1, let requestId = object["requestId"] as? String, UUID(uuidString: requestId) != nil, let address = object["authorizationUrl"] as? String, let expiry = object["expiresAt"] as? String else { throw PrivateTaxWire.fail() }
      let expires = try PrivateTaxWire.date(expiry)
      let url = try PrivateTaxSocialAuthorization.validate(address, provider: provider, pins: http.pins)
      guard expires > Date(), expires.timeIntervalSinceNow <= 900 else { throw PrivateTaxWire.fail() }
      pendingAccountCode = nil; socialPending = (requestId, verifier, expires); socialWaiting = true
      status = "Finish sign-in in Safari, return here, then enter your authenticator code."
      return url
    } catch { if generation == expected { self.error = error.localizedDescription }; return nil }
  }
  func pollSocial(model: DriverModel, includeOffline: Bool) async {
    let expected = generation
    while socialWaiting, generation == expected, let pending = socialPending, pending.expires > Date(), !Task.isCancelled {
      do {
        let http = try client(), response = try await http.request("social/result", method: "POST", body: PrivateTaxWire.json(["requestId": pending.requestId, "verifier": pending.verifier]))
        guard generation == expected else { return }
        let object = try response.object
        guard object["apiVersion"] as? Int == 1 else { throw PrivateTaxWire.fail() }
        if object["pending"] as? Bool != true {
          guard object["audience"] as? String == "secure-customer" else { throw PrivateTaxWire.fail() }
          let challenge = try JSONDecoder().decode(PrivateTaxMFA.self, from: response.data); try challenge.validate()
          mfa = challenge; socialWaiting = false; socialPending = nil; status = "Provider verified. Enter your account’s authenticator code."; return
        }
        try await Task.sleep(for: .seconds(2))
      } catch { if generation == expected, !Task.isCancelled { self.error = error.localizedDescription }; socialWaiting = false; socialPending = nil; return }
    }
    if generation == expected { socialWaiting = false; socialPending = nil }
  }
  func cancelSignIn() { generation = UUID(); mfa = nil; pendingAccountCode = nil; socialWaiting = false; socialPending = nil; retry?.cancel() }
  func signOut(model: DriverModel) async {
    guard !busy, !syncing, model.active == nil else { return }
    let previous = authenticated; generation = UUID(); retry?.cancel(); mfa = nil
    do {
      let http = try client(); try sessions.save(nil, pins: http.pins); try model.closePrivateJournal()
      authenticated = nil; ready = false; recoveryCodes = []; status = "Signed out. Original client keys, pending ciphertext and local account records are kept."
      if let previous { _ = try? await http.request("native-session", method: "DELETE", token: previous.token) }
    } catch { self.error = error.localizedDescription }
  }
}
