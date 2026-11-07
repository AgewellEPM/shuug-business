import DriverCore
import SwiftUI

struct DriverAlertsView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    List {
      Section("Your alerts") {
        let pending = (model.journal.driverAlerts ?? []).filter { $0.handledAt == nil && $0.expiresAt > Date() && $0.scope == model.journalScope }
        if pending.isEmpty { Text("You’re up to date. Trip and purchase prompts will appear here and in notifications.") }
        ForEach(pending) { alert in
          DriverAlertRow(alert: alert)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
            .listRowSeparator(.hidden)
        }
      }
      Section {
        Button("Send a trip alert") {
          Task {
            await DriverRuntime.shared.notifications.requestPermission()
            if model.journal.activeTripId == nil { DriverRuntime.shared.notifications.offerStart() }
            else { DriverRuntime.shared.notifications.offerEnd() }
          }
        }.accessibilityIdentifier("assistance.tripAlert")
        NavigationLink("Driving & expense reminders") { AssistanceView() }
      }
    }.driverScreen().navigationTitle("Alerts & reminders")
  }
}

private struct DriverAlertRow: View {
  let alert: DriverAlert
  @State private var reply = ""
  @State private var error: String?
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label("GIG TAX PROS · ACTION NEEDED", systemImage: "bell.badge.fill")
        .font(.caption2.bold()).foregroundStyle(Brand.link)
      switch alert.kind {
      case .startTrip:
        Text("Start a new trip?").font(.headline)
        Button("Yes, start trip") { answer(.startTrip) }
      case .endTrip:
        Text("Have you finished this trip?").font(.headline)
        HStack { Button("Yes, end trip") { answer(.endTrip) }; Button("Keep recording") { answer(.keepRecording) } }
      case .classifyTrip:
        Text("Business or personal?").font(.headline)
        HStack { Button("Business") { answer(.business) }; Button("Personal") { answer(.personal) } }
      case .tripFare:
        Text("Add this drive’s earnings").font(.headline)
        TextField("fare=20 fees=3", text: $reply).textInputAutocapitalization(.never)
        Button("Save earnings") { answer(.tripFare) }
      case .expense:
        Text("Purchase to record?").font(.headline)
        TextField("Amount, such as 12.34", text: $reply).keyboardType(.decimalPad)
        Button("Save amount for review") { answer(.logExpense) }
      }
      Button("Dismiss") { answer(.dismiss) }.font(.caption).tint(Brand.link)
      if let error { Text(error).font(.footnote).foregroundStyle(.orange) }
    }.buttonStyle(BrandActionStyle(primary: false)).gigCard(highlight: true)
  }
  private func answer(_ action: DriverAlertAction) {
    Task {
      do { _ = try await DriverRuntime.shared.notifications.perform(alert.id, action: action, scope: alert.scope, text: reply) }
      catch { self.error = error.localizedDescription }
    }
  }
}
