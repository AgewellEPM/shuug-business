import DriverCore
import SwiftUI
import UniformTypeIdentifiers

enum DriverTab: Hashable { case home, offers, goHome, position, earnings }
enum DriverTool: String, Identifiable {
  case trips = "Trips", money = "Money", account = "Account", alerts = "Alerts & reminders"
  case diagnostics = "Offer Capture Diagnostics"
  var id: String { rawValue }
}
struct RootView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var tab: DriverTab = .home
  @State private var tool: DriverTool?
  var body: some View {
    TabView(selection: $tab) {
      NavigationStack { TodayView(tab: $tab, showTool: { tool = $0 }) }
        .tabItem { Label("Home", systemImage: "house.fill") }.tag(DriverTab.home)
      NavigationStack { OfferInboxView() }
        .tabItem { Label("Offers", systemImage: "bolt.fill") }.tag(DriverTab.offers)
      NavigationStack { MissionView() }
        .tabItem { Label("Go Home", systemImage: "location.north.fill") }.tag(DriverTab.goHome)
      NavigationStack { PositioningView() }
        .tabItem { Label("Position", systemImage: "scope") }.tag(DriverTab.position)
      NavigationStack { InsightsView() }
        .tabItem { Label("Earnings", systemImage: "chart.bar.fill") }.tag(DriverTab.earnings)
    }.tint(Brand.pink)
      .sheet(item: $tool) { selected in
        NavigationStack {
          Group {
            switch selected {
            case .trips: TripsView()
            case .money: MoneyView()
            case .account: ConnectionView()
            case .alerts: DriverAlertsView()
            case .diagnostics: OfferCaptureDiagnosticsView()
            }
          }.toolbar { ToolbarItem(placement: .topBarTrailing) {
            Button("Done") { tool = nil }.accessibilityIdentifier("tools.close")
          } }
        }
      }
      .sheet(item: $model.requestedPrompt) { prompt in NavigationStack { ExpenseEditor(placePrompt: prompt) } }
      .sheet(item: $model.requestedOffer) { offer in
        NavigationStack {
          let row = DispatchPlanner.rank([offer], profile: model.offerProfitProfile, preferences: nil,
            routes: [:], commitments: model.journal.gigCommitments ?? []).first!
          GigOfferDetailView(recommendation: row, profile: model.offerProfitProfile)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { model.requestedOffer = nil } } }
        }
      }
      .onChange(of: model.journalScope) { _, _ in model.requestedOffer = nil }
      .alert(
        "Gig Tax Pros",
        isPresented: Binding(get: { model.message != nil }, set: { if !$0 { model.message = nil } })
      ) {
        Button("OK") { model.message = nil }
      } message: {
        Text(model.message ?? "")
      }
  }
}
struct RecordStatus: View {
  var entry: LocalEntry
  var body: some View {
    Label(
      entry.conflict != nil
        ? "Review sync conflict"
        : entry.pendingMutationId != nil ? "Saved on phone · Sync pending" : "Synced to your firm",
      systemImage: entry.conflict != nil
        ? "exclamationmark.triangle"
        : entry.pendingMutationId != nil ? "iphone" : "checkmark.icloud"
    )
    .font(.caption).foregroundStyle(entry.conflict != nil ? .orange : .secondary)
  }
}
struct TodayView: View {
  @Binding var tab: DriverTab
  let showTool: (DriverTool) -> Void
  @EnvironmentObject private var model: DriverModel
  @EnvironmentObject private var location: LocationTracker
  @State private var starting = false
  @State private var addingExpense = false
  @State private var addingIncome = false
  @State private var exporting = false
  @State private var showingSample = false
  private var today: [DriverRecord] {
    model.journal.visible.map(\.record).filter { $0.dateLabel == DriverRecord.day(Date()) }
  }
  private var liveTrip: Trip? {
    if case .trip(let t) = model.active?.record.payload { return t }
    return nil
  }
  private var businessMeters: Double {
    today.reduce(0) { sum, r in
      if case .trip(let t) = r.payload, t.classification == .business {
        return sum + t.distanceMeters
      }
      return sum
    }
  }
  private var expenses: Int {
    today.reduce(0) { sum, r in
      if case .expense(let e) = r.payload { return sum + e.amountCents }
      return sum
    }
  }
  private var income: Int {
    today.reduce(0) { sum, r in
      if case .income(let i) = r.payload { return sum + i.amountCents }
      return sum
    }
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        VStack(spacing: 8) {
          HStack(spacing: 12) {
            Menu {
              Button("Trips", systemImage: "car.fill") { showTool(.trips) }
              Button("Money", systemImage: "receipt") { showTool(.money) }
              Button("Account", systemImage: "person.crop.circle") { showTool(.account) }
              Button("Alerts & reminders", systemImage: "bell") { showTool(.alerts) }
              Button("Offer Capture Diagnostics", systemImage: "waveform.path.ecg") { showTool(.diagnostics) }
              Button("Explore a sample shift", systemImage: "sparkles") { showingSample = true }
            } label: { Image(systemName: "line.3.horizontal").font(.title3).frame(width: 28, height: 44) }
              .accessibilityIdentifier("dashboard.menu").accessibilityLabel("More tools")
            BrandHeader(compact: true).frame(maxWidth: .infinity, alignment: .leading)
            Button { showTool(.alerts) } label: {
              Image(systemName: (model.journal.driverAlerts ?? []).contains(where: { $0.handledAt == nil && $0.expiresAt > Date() }) ? "bell.badge" : "bell")
                .font(.title3).frame(width: 30, height: 44)
            }.accessibilityLabel("Alerts and reminders")
          }.foregroundStyle(.white)
          Text("Drive smarter · Earn more · Get home paid")
            .font(.system(size: 12, weight: .medium)).foregroundStyle(Brand.muted)
        }
        HStack(spacing: 10) {
          DashboardQuickAction(title: "Trips", icon: "car.fill") { showTool(.trips) }
            .accessibilityIdentifier("quick.trips")
          DashboardQuickAction(title: "Expense", icon: "receipt.fill") { addingExpense = true }
            .accessibilityLabel("Quick add expense").accessibilityIdentifier("quick.expense")
          DashboardQuickAction(title: "Income", icon: "dollarsign.circle.fill") { addingIncome = true }
            .accessibilityLabel("Quick add income").accessibilityIdentifier("quick.income")
          DashboardQuickAction(title: "Alerts", icon: "bell.fill", count: (model.journal.driverAlerts ?? []).filter {
            $0.scope == model.journalScope && $0.handledAt == nil && $0.expiresAt > Date()
          }.count) { showTool(.alerts) }
            .accessibilityIdentifier("quick.alerts")
        }
        ShiftDashboardCard()
        GoHomeDashboardCard(destination: model.journal.mission?.destination) { tab = .goHome }
        PlatformReadersRow(scope: model.journalScope)
        EarningsPulseCard(records: model.journal.visible.map(\.record), goals: model.journal.goals ?? DriverGoals(), compact: true)
        Button { showingSample = true } label: {
          Label("Explore charts & offers with sample data", systemImage: "sparkles").font(.footnote.weight(.semibold))
        }.accessibilityIdentifier("dashboard.sample")
        VStack(alignment: .leading, spacing: 14) {
          Label(
            liveTrip == nil ? "Ready for your next drive" : "Drive in progress",
            systemImage: liveTrip == nil ? "steeringwheel" : "location.fill"
          ).font(.headline)
          if let trip = liveTrip {
            Text(Brand.miles(trip.distanceMeters) + " mi").font(
              .system(size: 48, weight: .bold, design: .rounded)
            ).minimumScaleFactor(0.5).lineLimit(1).accessibilityLabel(
              "\(Brand.miles(trip.distanceMeters)) miles recorded"
            )
            .accessibilityIdentifier("driver.liveMiles")
            Text(location.status).font(.subheadline)
            Text(trip.startedAt, style: .timer).monospacedDigit().font(.title3)
            if trip.hasGaps {
              Label(
                "Some mileage needs review because location was interrupted or imprecise.",
                systemImage: "exclamationmark.triangle"
              ).font(.caption)
            }
            Button { location.stop() } label: {
              Label("End drive & save", systemImage: "stop.circle.fill")
            }.buttonStyle(BrandActionStyle(primary: false))
          } else {
            Text("Mileage saved as you drive.").font(.title2.bold())
            Text(
              "Start a drive, then end it when you arrive. Recording continues while the phone locks; stopping this app can interrupt tracking."
            ).font(.subheadline)
            Button {
              starting = true
            } label: {
              Label("Start a drive", systemImage: "play.circle.fill")
            }.buttonStyle(BrandActionStyle()).disabled(
              !model.storageHealthy)
          }
        }.gigCard().foregroundStyle(.white)
        HStack {
          Label(model.syncStatus, systemImage: model.connection == nil ? "iphone" : "icloud").font(
            .caption)
          Spacer()
          if model.syncing { ProgressView() }
        }.foregroundStyle(.secondary)
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 145))], spacing: 12) {
          metric("Business miles today", Brand.miles(businessMeters), "car")
          metric("Expenses today", Brand.usd(expenses), "receipt")
          metric("Income today", Brand.usd(income), "dollarsign.circle")
        }
        if !(model.journal.placePrompts ?? []).filter({ !$0.dismissed }).isEmpty {
          StopPromptsView()
        }
        HStack {
          Button {
            addingExpense = true
          } label: {
            Label("Add expense", systemImage: "plus.circle.fill")
          }
          Button {
            addingIncome = true
          } label: {
            Label("Add income", systemImage: "plus.circle")
          }
        }.buttonStyle(BrandActionStyle(primary: false)).disabled(!model.storageHealthy)
        NavigationLink { ReferralView() } label: {
          Label("Earn $20 + points · Refer a tax-prep client", systemImage: "gift.fill")
        }.buttonStyle(BrandActionStyle(primary: false))
        if model.connection == nil {
          Text(
            "Your records stay on this iPhone until you connect your invited client account."
          ).font(.footnote).foregroundStyle(.secondary)
        }
        Text(
          "Review trip classifications and receipt details. Insights uses your recorded fares and costs; recorded mileage is not a calculated tax deduction."
        ).font(.footnote).foregroundStyle(.secondary)
        Button {
          exporting = true
        } label: {
          Label("Export my records as CSV", systemImage: "square.and.arrow.up")
        }.disabled(!model.storageHealthy)
      }.padding(.horizontal, 16).padding(.vertical, 10)
    }.driverScreen(compactNavigation: false).navigationTitle("")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar(.hidden, for: .navigationBar)
      .task {
        while !Task.isCancelled {
          model.refreshCapturedOffers()
          do { try await Task.sleep(for: .seconds(3)) } catch { break }
        }
      }
      .sheet(isPresented: $starting) { NavigationStack { StartDriveView() } }
      .sheet(isPresented: $addingExpense) { NavigationStack { ExpenseEditor() } }
      .sheet(isPresented: $addingIncome) { NavigationStack { IncomeEditor() } }
      .sheet(isPresented: $showingSample) { SampleShiftView() }
      .fileExporter(
        isPresented: $exporting, document: DriverCSV(records: model.journal.visible.map(\.record)),
        contentType: .commaSeparatedText,
        defaultFilename: "GigTaxPros-\(DriverRecord.day(Date()))"
      ) { result in
        if case .failure(let error) = result { model.message = error.localizedDescription }
      }
  }
  private func metric(_ title: String, _ value: String, _ icon: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(title, systemImage: icon).font(.caption).foregroundStyle(Brand.muted)
      Text(value).font(.title2.bold()).minimumScaleFactor(0.6).lineLimit(1)
    }.padding().frame(maxWidth: .infinity, alignment: .leading).background(
      Brand.panel, in: RoundedRectangle(cornerRadius: 16)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 16).strokeBorder(Brand.border.opacity(0.5), lineWidth: 1)
    }
  }
}
struct DriverCSV: FileDocument {
  static var readableContentTypes: [UTType] { [.commaSeparatedText] }
  var text: String
  init(records: [DriverRecord]) { text = JournalExport.csv(records) }
  init(configuration: ReadConfiguration) throws {
    text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: Data(text.utf8))
  }
}
