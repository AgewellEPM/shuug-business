import LinkKit
import SwiftUI

struct BankConnectionView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var link: PlaidLinkSession?
  @State private var presenting = false
  @State private var busy = false
  @State private var error: String?
  @State private var disconnecting: BankItem?
  @State private var linkAttempt = UUID()
  @State private var pendingLink: PendingLink?
  private struct PendingLink { let id: String; let client: WorkspaceClient }
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
          Button("Choose a bank") { Task { await openLink() } }.disabled(!status.ready || busy || model.bankSyncing || presenting)
          Button("Check for bank updates") { Task { await model.refreshBanks(force: true) } }.disabled(model.bankSyncing || busy)
        }
        ForEach(status.items) { item in
          Section(item.label) {
            Text(item.connected == 1 ? "Connected · \(item.environment)" : "Disconnected")
            if let date = item.lastSync { Text("Last successful update: \(date.formatted())").font(.caption) }
            if let error = item.error { Text(error).foregroundStyle(.orange) }
            if item.connected == 1 {
              Button("Reconnect securely") { Task { await openLink(itemId: item.id) } }.disabled(busy || !status.ready || model.bankSyncing || presenting)
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
      .onChange(of: model.connection?.session.token) { _, _ in
        cancelPendingLink()
        linkAttempt = UUID()
        presenting = false; link = nil; busy = false; error = nil; disconnecting = nil
      }
      .onDisappear {
        if !presenting {
          cancelPendingLink()
          linkAttempt = UUID(); link = nil; busy = false
        }
      }
      .confirmationDialog("Disconnect this bank and stop future access? Saved records remain.", isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } })) {
        Button("Disconnect bank", role: .destructive) {
          if let item = disconnecting { Task { await disconnect(item) } }
          disconnecting = nil
        }
      }
  }
  @MainActor private func openLink(itemId: String? = nil) async {
    guard !busy, !presenting, !model.bankSyncing, let connection = model.connection else { return }
    cancelPendingLink()
    link = nil
    busy = true; error = nil
    let scope = model.journalScope
    let token = connection.session.token
    let attempt = UUID(); linkAttempt = attempt
    let client = WorkspaceClient(origin: connection.origin, token: connection.session.token)
    do {
      var input = ["action": "link"]; input["itemId"] = itemId
      let reply = try await client.bankAction(input, as: BankLinkReply.self)
      guard scope == model.journalScope, token == model.connection?.session.token, attempt == linkAttempt else {
        _ = try? await client.bankAction(["action": "cancel", "sessionId": reply.sessionId], as: BankActionReply.self)
        return
      }
      pendingLink = PendingLink(id: reply.sessionId, client: client)
      try BankLinkReturn.validateConfiguration(reply.redirectUri,
        appDomain: Bundle.main.object(forInfoDictionaryKey: "RTPBankLinkDomain") as? String)
      let configuration = LinkTokenConfiguration(token: reply.linkToken, onSuccess: { success in
        Task { @MainActor in
          guard scope == model.journalScope, token == model.connection?.session.token, attempt == linkAttempt else { return }
          presenting = false; busy = true
          pendingLink = nil
          defer {
            if scope == model.journalScope && token == model.connection?.session.token && attempt == linkAttempt {
              busy = false; link = nil
            }
          }
          do {
            _ = try await client.bankAction(["action": "exchange", "sessionId": reply.sessionId, "publicToken": success.publicToken], as: BankActionReply.self)
            guard scope == model.journalScope, token == model.connection?.session.token, attempt == linkAttempt else { return }
            await model.refreshBanks(force: true)
          } catch {
            if scope == model.journalScope && token == model.connection?.session.token && attempt == linkAttempt { self.error = error.localizedDescription }
            _ = try? await client.bankAction(["action": "cancel", "sessionId": reply.sessionId], as: BankActionReply.self)
          }
        }
      }, onExit: { exit in
        Task { @MainActor in
          guard scope == model.journalScope, token == model.connection?.session.token, attempt == linkAttempt else { return }
          cancelPendingLink()
          presenting = false; busy = false; link = nil
          if exit.error != nil { error = "Bank linking did not finish. Your existing records are kept." }
        }
      }, onEvent: nil, onLoad: {
        Task { @MainActor in
          guard scope == model.journalScope, token == model.connection?.session.token, attempt == linkAttempt else { return }
          busy = false; presenting = true
        }
      })
      link = try Plaid.createPlaidLinkSession(configuration: configuration)
    } catch {
      if scope == model.journalScope && token == model.connection?.session.token && attempt == linkAttempt {
        cancelPendingLink()
        self.error = error.localizedDescription; busy = false; link = nil
      }
    }
  }
  @MainActor private func cancelPendingLink() {
    guard let pending = pendingLink else { return }
    pendingLink = nil
    Task { _ = try? await pending.client.bankAction(["action": "cancel", "sessionId": pending.id], as: BankActionReply.self) }
  }
  @MainActor private func disconnect(_ item: BankItem) async {
    guard !busy, !presenting, let connection = model.connection else { return }
    let scope = model.journalScope, token = connection.session.token
    let attempt = UUID(); linkAttempt = attempt
    let isCurrentAttempt = {
      scope == model.journalScope && token == model.connection?.session.token && attempt == linkAttempt
    }
    busy = true; error = nil
    defer { if isCurrentAttempt() { busy = false } }
    do {
      _ = try await WorkspaceClient(origin: connection.origin, token: connection.session.token)
        .bankAction(["action": "disconnect", "itemId": item.id], as: BankActionReply.self)
      guard isCurrentAttempt() else { return }
      await model.refreshBanks(force: true)
    } catch { if isCurrentAttempt() { self.error = error.localizedDescription } }
  }
}
