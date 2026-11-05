import DriverCore
import SwiftUI
import UniformTypeIdentifiers

enum Brand {
  static let purple = Color(red: 148 / 255, green: 37 / 255, blue: 232 / 255)
  static let ink = Color(red: 20 / 255, green: 12 / 255, blue: 36 / 255)
  static let pink = Color(red: 245 / 255, green: 30 / 255, blue: 234 / 255)
  static func usd(_ cents: Int) -> String {
    (Double(cents) / 100).formatted(.currency(code: "USD"))
  }
  static func miles(_ meters: Double) -> String {
    (meters / 1609.344).formatted(.number.precision(.fractionLength(2)))
  }
}
struct RootView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    TabView {
      NavigationStack { TodayView() }.tabItem { Label("Today", systemImage: "speedometer") }
      NavigationStack { TripsView() }.tabItem { Label("Trips", systemImage: "car.fill") }
      NavigationStack { MoneyView() }.tabItem { Label("Money", systemImage: "receipt") }
      NavigationStack { ConnectionView() }.tabItem {
        Label("Account", systemImage: "person.crop.circle")
      }
    }.tint(Brand.purple)
      .alert(
        "Rideshare Tax Pros",
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
  @EnvironmentObject private var model: DriverModel
  @EnvironmentObject private var location: LocationTracker
  @State private var starting = false
  @State private var addingExpense = false
  @State private var addingIncome = false
  @State private var exporting = false
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
      VStack(alignment: .leading, spacing: 22) {
        HStack(spacing: 12) {
          Image(systemName: "car.side.hill.up.fill").font(.title).foregroundStyle(.white).padding(
            14
          ).background(Brand.purple.gradient, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityHidden(true)
          VStack(alignment: .leading) {
            Text("RIDESHARE TAX PROS").font(.headline)
            Text("You drive. We handle the taxes.").font(.subheadline).foregroundStyle(.secondary)
          }
        }
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
            Button(action: location.stop) {
              Label("End drive & save", systemImage: "stop.circle.fill").font(.headline).frame(
                maxWidth: .infinity
              ).padding(.vertical, 8)
            }.buttonStyle(.borderedProminent).tint(.white).foregroundStyle(Brand.ink)
          } else {
            Text("Mileage saved as you drive.").font(.title2.bold())
            Text(
              "Start a drive, then end it when you arrive. Recording continues while the phone locks; stopping this app can interrupt tracking."
            ).font(.subheadline)
            Button {
              starting = true
            } label: {
              Label("Start a drive", systemImage: "play.circle.fill").font(.headline).frame(
                maxWidth: .infinity
              ).padding(.vertical, 8)
            }.buttonStyle(.borderedProminent).tint(.white).foregroundStyle(Brand.ink).disabled(
              !model.storageHealthy)
          }
        }.padding(22).foregroundStyle(.white).frame(maxWidth: .infinity, alignment: .leading)
          .background(
            LinearGradient(
              colors: [Brand.ink, Brand.purple], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 24))
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
        HStack {
          Button {
            addingExpense = true
          } label: {
            Label("Add expense", systemImage: "plus.circle.fill").frame(
              maxWidth: .infinity, minHeight: 48)
          }
          Button {
            addingIncome = true
          } label: {
            Label("Add income", systemImage: "plus.circle").frame(
              maxWidth: .infinity, minHeight: 48)
          }
        }.buttonStyle(.bordered).disabled(!model.storageHealthy)
        if model.connection == nil {
          Text(
            "Your records stay on this iPhone until you connect your invited client account. A website preparation plan is separate from these records."
          ).font(.footnote).foregroundStyle(.secondary)
        }
        Text(
          "Review trip classifications and receipt details. Recorded mileage is not a calculated tax deduction, and expense entry does not connect to a bank."
        ).font(.footnote).foregroundStyle(.secondary)
        Button {
          exporting = true
        } label: {
          Label("Export my records as CSV", systemImage: "square.and.arrow.up")
        }.disabled(!model.storageHealthy)
      }.padding()
    }.background(Color(.systemGroupedBackground)).navigationTitle("Your driving day")
      .navigationBarTitleDisplayMode(.inline)
      .sheet(isPresented: $starting) { NavigationStack { StartDriveView() } }
      .sheet(isPresented: $addingExpense) { NavigationStack { ExpenseEditor() } }
      .sheet(isPresented: $addingIncome) { NavigationStack { IncomeEditor() } }
      .fileExporter(
        isPresented: $exporting, document: DriverCSV(records: model.journal.visible.map(\.record)),
        contentType: .commaSeparatedText,
        defaultFilename: "RideshareTaxPros-\(DriverRecord.day(Date()))"
      ) { result in
        if case .failure(let error) = result { model.message = error.localizedDescription }
      }
  }
  private func metric(_ title: String, _ value: String, _ icon: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(title, systemImage: icon).font(.caption).foregroundStyle(.secondary)
      Text(value).font(.title2.bold()).minimumScaleFactor(0.6).lineLimit(1)
    }.padding().frame(maxWidth: .infinity, alignment: .leading).background(
      Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
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
