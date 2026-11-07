import DriverCore
import SwiftUI
import SafariServices

struct GigConnectionsView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    Form {
      Section("Copilot mode") {
        Label("You make the final offer decision", systemImage: "person.crop.circle.badge.checkmark")
        Text("Review recommendations here, then return to the gig app to accept or decline. No provider has an authorized acceptance integration configured.").font(.footnote)
      }
      Section("My connected accounts") {
        NavigationLink("Connected jobs & pay") { ConnectedWorkView() }
        if let connection = model.connection,
          let url = URL(string: connection.portalURL.absoluteString + "#gig-connections") {
          Link("Uber account connection & imported history", destination: url)
          Text("Use your client profile to authorize the firm’s approved Uber connection and review imported provider records. Bank deposits and your tax journal remain separate until reviewed.")
            .font(.footnote)
        } else {
          Text("Connect your invited client account in Your account to manage provider authorizations.")
        }
      }
      Section("Check an offer with a screenshot") {
        ScreenshotGuideButton()
        NavigationLink("Choose screenshot") { OfferScreenshotImportView() }
      }
      Section("Gig platforms") {
        NavigationLink("Offer Capture Diagnostics") { OfferCaptureDiagnosticsView() }
        ForEach(GigPlatform.allCases) { platform in
          NavigationLink { OfferReaderView(startingPlatform: platform) } label: {
            HStack(spacing: 12) {
              GigPlatformIcon(platform: platform, size: 42)
              VStack(alignment: .leading, spacing: 6) {
                GigPlatformWordmark(platform: platform, width: 120, height: 24)
                Text("Screenshot / shared text · Optional screen sharing").font(.caption)
                Text(platform == .uber ? "Offer reading · Driver account sync through your client profile" : "Offer reading · No authorized account connector configured").font(.caption2).foregroundStyle(Brand.muted)
              }
            }
          }
        }
      }
      Section("Costs and reserves") {
        NavigationLink("Vehicle cost & hourly goals") { GoalsEditor() }
        NavigationLink("Planning reserves & history") { ReserveAndHistoryView() }
        Text("Offer cash estimates apply your tax reserve to profit after operating costs. Vehicle health savings are a separate allocation and are not charged as another operating cost.").font(.footnote)
      }
      Section("Permissions and control") {
        NavigationLink("Offer reading permissions") { OfferReaderView() }
        NavigationLink("Trip & expense alerts") { DriverAlertsView() }
        Text("Shared offers and decisions stay in protected storage on this iPhone. Full screenshots and transcripts are discarded. Stop reading in Offer reader or use Apple’s recording control to end screen sharing.").font(.footnote)
      }
    }.driverScreen().navigationTitle("Platforms & settings")
  }
}

private struct ConnectedWorkBrowser: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
struct ConnectedWorkView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var summary: ConnectedWorkSummary?
  @State private var error: String?
  @State private var busy = false
  @State private var browserURL: URL?
  @State private var showingBrowser = false
  var body: some View {
    List {
      Section("Your work accounts") {
        Text("Link your gig accounts once. See the jobs and pay each service shares with your own client profile.")
        if model.connection == nil { Text("Connect your invited client profile in Your account first.") }
        if let summary {
          Text(summary.availability).font(.footnote)
          Text("Connection: \(summary.status)")
          if summary.environment == "sandbox" { Label("Provider test records only", systemImage: "testtube.2").foregroundStyle(.orange) }
          if summary.ready || summary.canDisconnect {
            Button("Connect or manage gig accounts") { Task { await openAccounts() } }.disabled(busy)
          }
          if summary.ready {
            Button("Check for updates") { Task { await checkUpdates() } }.disabled(busy)
          }
          if let time = summary.lastSyncAt { Text("Last received: \(time)").font(.caption) }
          if let problem = summary.lastError { Text(problem).foregroundStyle(.orange) }
        }
        if busy { ProgressView("Updating…") }
        if let error { Text(error).foregroundStyle(.orange) }
      }
      Section("Need to check a job now?") {
        Text("A screenshot can help when account updates have not arrived.").font(.footnote)
        ScreenshotGuideButton()
        NavigationLink("Choose screenshot") { OfferScreenshotImportView() }
      }
      if let summary {
        ForEach(summary.accounts) { account in
          Section(account.name) {
            Text(account.status)
            Text("Provider refresh: \(account.refreshFrequency ?? "not confirmed")").font(.footnote)
            if let limits = account.limitations { Text(limits).font(.footnote) }
          }
        }
        Section("Jobs and pay received") {
          if summary.records.isEmpty { Text("No work records have arrived yet.") }
          ForEach(Array(summary.records.prefix(100)), id: \.key) { record in
            VStack(alignment: .leading, spacing: 7) {
              Text(record.platform ?? "Connected work").font(.headline)
              Text("\(record.kind) · \(record.status ?? "unknown")").font(.subheadline)
              if record.removedAt != nil { Text("Removed by provider · saved history").foregroundStyle(.orange) }
              if let rating = record.rating { Text("Provider rating: \(rating) / 5") }
              if let rate = record.acceptanceRate { Text("Acceptance rate: \(rate) (0–1)").font(.caption) }
              if let rate = record.ontimeRate { Text("On-time rate: \(rate) (0–1)").font(.caption) }
              if let value = record.income?["total"] ?? nil {
                Text("\((record.income?["currency"] ?? nil) ?? "") \(value)")
              }
              if let time = record.sourceUpdatedAt { Text("Source updated: \(time)").font(.caption) }
              Text("Received: \(record.observedAt)").font(.caption)
              if let delay = record.deliveryDelaySeconds { Text("Delivery delay: \(delay) seconds").font(.caption) }
            }
          }
          Text(summary.accountingNote).font(.footnote)
        }
        Section("How current is this?") { Text(summary.liveOfferNote).font(.footnote) }
      }
    }.driverScreen().navigationTitle("Connected work")
      .task(id: model.connection?.session.token) {
        summary = nil; error = nil
        while !Task.isCancelled && model.connection != nil {
          await refresh()
          do { try await Task.sleep(for: .seconds(10)) } catch { break }
        }
      }
      .onChange(of: model.connection?.session.token) { _, _ in
        summary = nil; error = nil; browserURL = nil; showingBrowser = false; busy = false
      }
      .sheet(isPresented: $showingBrowser, onDismiss: { Task { await refresh() } }) {
        if let browserURL { ConnectedWorkBrowser(url: browserURL) }
      }
  }
  @MainActor private func refresh() async {
    guard let connection = model.connection else { return }
    do {
      let result = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).connectedWork()
      guard connection.session.token == model.connection?.session.token else { return }
      summary = result; error = nil
    } catch {
      guard connection.session.token == model.connection?.session.token else { return }
      self.error = error.localizedDescription
    }
  }
  @MainActor private func openAccounts() async {
    guard !busy, let connection = model.connection else { return }
    busy = true; defer { busy = false }
    do {
      let url = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).connectedWorkLink()
      guard connection.session.token == model.connection?.session.token else { return }
      browserURL = url; showingBrowser = true
    } catch { if connection.session.token == model.connection?.session.token { self.error = error.localizedDescription } }
  }
  @MainActor private func checkUpdates() async {
    guard !busy, let connection = model.connection else { return }
    busy = true; defer { busy = false }
    do { try await WorkspaceClient(origin: connection.origin, token: connection.session.token).checkConnectedWork(); await refresh() }
    catch { if connection.session.token == model.connection?.session.token { self.error = error.localizedDescription } }
  }
}
