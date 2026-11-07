import LinkKit
import SwiftUI

struct BankConnectionView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var link: PlaidLinkSession?
  @State private var presenting = false
  @State private var busy = false
  @State private var error: String?
  @State private var disconnecting: BankItem?
  var body: some View {
    List {
      Section {
        Text("Connect securely through Plaid").font(.headline)
        Text("Choose an available institution and the accounts you want to share. Your bank or Plaid handles sign-in. This app does not receive your bank password and cannot move money.")
        Text("Read-only transactions are stored in your firm's workspace and downloaded for your review. The feed is periodic, not instant; pending charges can change. Provider coverage varies. Statement import remains available for other banks.").font(.footnote)
      }.listRowBackground(Brand.surface)
      if model.connection == nil {
        Text("Connect your invited firm account in Account first. You can import bank statements without connecting to the firm.")
      } else if let status = model.bankStatus {
        Section {
          Text(status.reason)
          if status.environment == "sandbox" && status.ready { Label("Test banks only—no live financial accounts", systemImage: "testtube.2").foregroundStyle(.orange) }
          Button("Choose a bank") { Task { await openLink() } }.disabled(!status.ready || busy)
          Button("Check for bank updates") { Task { await model.refreshBanks(force: true) } }.disabled(model.bankSyncing || busy)
        }
        ForEach(status.items) { item in
          Section(item.label) {
            Text(item.connected == 1 ? "Connected · \(item.environment)" : "Disconnected")
            if let date = item.lastSync { Text("Last successful update: \(date.formatted())").font(.caption) }
            if let error = item.error { Text(error).foregroundStyle(.orange) }
            if item.connected == 1 {
              Button("Reconnect securely") { Task { await openLink(itemId: item.id) } }.disabled(busy || !status.ready)
              Button("Disconnect bank", role: .destructive) { disconnecting = item }.disabled(busy)
            }
          }
        }
      }
      if busy || model.bankSyncing { ProgressView("Updating bank connection…") }
      if let error = error ?? model.bankError { Text(error).foregroundStyle(.orange) }
      Section { Text("Before creating a new connection, check the list above to avoid linking the same bank twice. Disconnecting stops future access; reviewed journal entries and imported history remain.").font(.footnote) }
    }.driverScreen().navigationTitle("Bank connections")
      .task { await model.refreshBanks(force: true) }
      .sheet(isPresented: $presenting) { link?.sheet() }
      .brandedDialog("Disconnect this bank?",
        isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } }),
        message: "Disconnecting stops future access. Saved records remain.", icon: "building.columns.fill", accent: Brand.danger) {
        guard let item = disconnecting else { return [] }
        return [BrandedDialogAction("Disconnect bank", role: .destructive) {
          Task { await disconnect(item) }
        }]
      }
  }
  @MainActor private func openLink(itemId: String? = nil) async {
    guard let connection = model.connection else { return }
    busy = true; error = nil
    let scope = model.journalScope
    let client = WorkspaceClient(origin: connection.origin, token: connection.session.token)
    do {
      var input = ["action": "link"]; input["itemId"] = itemId
      let reply = try await client.bankAction(input, as: BankLinkReply.self)
      guard scope == model.journalScope else { busy = false; return }
      guard let redirect = URL(string: reply.redirectUri), redirect.scheme == "https",
        redirect.host == Bundle.main.object(forInfoDictionaryKey: "RTPBankLinkDomain") as? String else {
        throw WorkspaceError.message("This app's bank return link does not match your firm's setup. Ask the firm to finish the iPhone bank-link configuration.")
      }
      let configuration = LinkTokenConfiguration(token: reply.linkToken, onSuccess: { success in
        Task { @MainActor in
          presenting = false; busy = true
          defer { busy = false; link = nil }
          guard scope == model.journalScope else { return }
          do {
            _ = try await client.bankAction(["action": "exchange", "sessionId": reply.sessionId, "publicToken": success.publicToken], as: BankActionReply.self)
            await model.refreshBanks(force: true)
          } catch { self.error = error.localizedDescription }
        }
      }, onExit: { exit in
        Task { @MainActor in
          presenting = false; busy = false; link = nil
          if exit.error != nil { error = "Bank linking did not finish. Your existing records are kept." }
        }
      }, onEvent: nil, onLoad: {
        Task { @MainActor in busy = false; presenting = true }
      })
      link = try Plaid.createPlaidLinkSession(configuration: configuration)
    } catch { self.error = error.localizedDescription; busy = false }
  }
  @MainActor private func disconnect(_ item: BankItem) async {
    guard let connection = model.connection else { return }
    busy = true; defer { busy = false }
    do {
      _ = try await WorkspaceClient(origin: connection.origin, token: connection.session.token)
        .bankAction(["action": "disconnect", "itemId": item.id], as: BankActionReply.self)
      await model.refreshBanks(force: true)
    } catch { self.error = error.localizedDescription }
  }
}
