import DriverCore
import SwiftUI

struct DriverAlertsView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    List {
      Section("Your alerts") {
        let pending = (model.journal.driverAlerts ?? []).filter { $0.handledAt == nil && $0.expiresAt > Date() && $0.scope == model.journalScope }
        if pending.isEmpty {
          VStack(alignment: .leading, spacing: 12) {
            Label("You’re up to date", systemImage: "checkmark.bubble.fill")
              .font(.headline).foregroundStyle(Brand.income)
            Text("Trip and purchase prompts will appear here and in notifications.")
              .font(.subheadline).foregroundStyle(Brand.muted)
          }.gigCard(accent: Brand.income)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
            .listRowSeparator(.hidden)
        }
        ForEach(pending) { alert in
          DriverAlertRow(alert: alert)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
            .listRowSeparator(.hidden)
        }
      }
      Section {
        VStack(alignment: .leading, spacing: 14) {
          Label("Your reminders", systemImage: "bell.badge.fill")
            .font(.headline).foregroundStyle(Brand.link)
          Text("Send a trip prompt or choose when driving and expense reminders appear.")
            .font(.subheadline).foregroundStyle(Brand.muted)
          Button {
            Task {
              await DriverRuntime.shared.notifications.requestPermission()
              if model.journal.activeTripId == nil { DriverRuntime.shared.notifications.offerStart() }
              else { DriverRuntime.shared.notifications.offerEnd() }
            }
          } label: {
            Label("Send a trip alert", systemImage: "bell.and.waves.left.and.right.fill")
          }.buttonStyle(BrandActionStyle()).accessibilityIdentifier("assistance.tripAlert")
          NavigationLink { AssistanceView() } label: {
            Label("Driving & expense reminders", systemImage: "slider.horizontal.3")
          }.buttonStyle(BrandActionStyle(primary: false))
        }.gigCard(accent: Brand.link)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
          .listRowSeparator(.hidden)
      }
    }.driverScreen().navigationTitle("Alerts & reminders")
  }
}

private struct DriverAlertRow: View {
  let alert: DriverAlert
  @State private var reply = ""
  @State private var error: String?
  private var accent: Color {
    switch alert.kind {
    case .startTrip, .endTrip, .classifyTrip: Brand.route
    case .tripFare: Brand.income
    case .expense: Brand.expense
    }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label("GIG TAX PROS · ACTION NEEDED", systemImage: "bell.badge.fill")
        .font(.caption2.bold()).foregroundStyle(accent)
      switch alert.kind {
      case .startTrip:
        Text("Start a new trip?").font(.headline)
        Button("Yes, start trip") { answer(.startTrip) }.buttonStyle(DriverAlertActionStyle(accent: accent))
      case .endTrip:
        Text("Have you finished this trip?").font(.headline)
        HStack {
          Button("Yes, end trip") { answer(.endTrip) }.buttonStyle(DriverAlertActionStyle(accent: accent))
          Button("Keep recording") { answer(.keepRecording) }.buttonStyle(DriverAlertActionStyle(accent: Brand.link))
        }
      case .classifyTrip:
        Text("Business or personal?").font(.headline)
        HStack {
          Button("Business") { answer(.business) }.buttonStyle(DriverAlertActionStyle(accent: accent))
          Button("Personal") { answer(.personal) }.buttonStyle(DriverAlertActionStyle(accent: Brand.link))
        }
      case .tripFare:
        Text("Add this drive’s earnings").font(.headline)
        Text("Fare and platform fees · USD").font(.caption).foregroundStyle(Brand.muted)
        TextField("fare=20 fees=3", text: $reply).textInputAutocapitalization(.never)
          .autocorrectionDisabled().driverAlertField(accent: accent)
          .accessibilityLabel("Fare and platform fees")
          .accessibilityHint("For example, fare equals 20, space, fees equals 3")
        Button("Save earnings") { answer(.tripFare) }.buttonStyle(DriverAlertActionStyle(accent: accent))
      case .expense:
        Text("Purchase to record?").font(.headline)
        Text("Purchase amount · USD").font(.caption).foregroundStyle(Brand.muted)
        TextField("12.34", text: $reply).keyboardType(.decimalPad)
          .driverAlertField(accent: accent).accessibilityLabel("Purchase amount in US dollars")
        Button("Save amount for review") { answer(.logExpense) }.buttonStyle(DriverAlertActionStyle(accent: accent))
      }
      Button("Dismiss") { answer(.dismiss) }.font(.subheadline.weight(.semibold)).foregroundStyle(Brand.link)
        .frame(minHeight: 44).buttonStyle(.plain)
      if let error {
        Label(error, systemImage: "exclamationmark.triangle.fill")
          .font(.footnote).foregroundStyle(Brand.danger).padding(12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(Brand.danger.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
          .accessibilityElement(children: .combine)
      }
    }.foregroundStyle(.white).gigCard(highlight: true, accent: accent)
  }
  private func answer(_ action: DriverAlertAction) {
    Task {
      do { _ = try await DriverRuntime.shared.notifications.perform(alert.id, action: action, scope: alert.scope, text: reply) }
      catch { self.error = error.localizedDescription }
    }
  }
}

private struct DriverAlertActionStyle: ButtonStyle {
  let accent: Color
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.headline).foregroundStyle(accent)
      .padding(.horizontal, 12).padding(.vertical, 12)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background(accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
      .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(accent.opacity(0.65), lineWidth: 1) }
      .opacity(configuration.isPressed ? 0.7 : 1)
  }
}

private extension View {
  func driverAlertField(accent: Color) -> some View {
    textFieldStyle(.plain).font(.body).foregroundStyle(.white).tint(accent)
      .padding(14).frame(minHeight: 48)
      .background(Brand.ink, in: RoundedRectangle(cornerRadius: 14))
      .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(accent.opacity(0.5), lineWidth: 1) }
  }
}
