import DriverCore
import SwiftUI

struct AssistanceView: View {
  @EnvironmentObject private var model: DriverModel
  @EnvironmentObject private var assistant: DrivingAssistant
  var body: some View {
    Form {
      Section("Optional automatic assistance") {
        Toggle("Detect drives & send trip alerts", isOn: Binding(get: { model.journal.assistance?.automaticDrives ?? false }, set: { assistant.update(automatic: $0) }))
          .accessibilityIdentifier("assistance.drives")
        Toggle("Remind me near expense stops", isOn: Binding(get: { model.journal.assistance?.placeReminders ?? false }, set: { assistant.update(reminders: $0) }))
          .accessibilityIdentifier("assistance.places")
        Text(assistant.status).font(.footnote).foregroundStyle(Brand.link)
        Button("Send a trip alert") {
          Task {
            await DriverRuntime.shared.notifications.requestPermission()
            if model.journal.activeTripId == nil { DriverRuntime.shared.notifications.offerStart() }
            else { DriverRuntime.shared.notifications.offerEnd() }
          }
        }.accessibilityIdentifier("assistance.tripAlert")
        Text("Check the alert controls once while parked. Expand the alert to start or end a trip without opening the app.").font(.footnote)
      }.listRowBackground(Brand.surface)
      Section("Driving detection") {
        Text("Sustained movement prompts Start a new trip? A prolonged stop prompts End trip? Expand the alert to answer without opening the app. Completed drives can be classified and have earnings entered from follow-up alerts.")
        Text("Recording begins when you confirm. Review any earlier miles and GPS gaps. The app cannot identify a passenger or a paid gig. Ending or declining a drive pauses new start prompts for five minutes.")
      }.font(.footnote)
      Section("Expense reminders") {
        Text("After a stop, Apple Maps looks for nearby gas stations, chargers, restaurants, cafés, auto repair, parts stores and dealerships. Reminders suggest a merchant and category; you confirm the purchase, amount and purpose.")
        Text("Place coverage and location accuracy vary. Adjacent businesses can be confused. Prompts are limited to six per day with a six-hour cooldown per place; they never prove you made a purchase.")
      }.font(.footnote)
      Section("Background access & privacy") {
        Text("Choose Always location access for background detection and allow notifications for alerts. Movement detection can use more battery. iOS can delay updates, and force-quitting can stop assistance. Start a drive manually when complete mileage matters.")
        Text("Location is used for Apple Maps place lookup. Route points stay on your phone. Turning both options off stops assistance; an already-running drive continues until you end it.")
        Button("Open iPhone settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
      }.font(.footnote)
    }.driverScreen().navigationTitle("Driving assistance")
  }
}

struct StopPromptsView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Purchases to log?").font(.headline)
      ForEach(Array((model.journal.placePrompts ?? []).filter { !$0.dismissed }.reversed().prefix(6))) { prompt in
        VStack(alignment: .leading, spacing: 6) {
          Text(prompt.merchant).font(.headline)
          Text("\(prompt.category.label) · \(prompt.detectedAt.formatted(date: .abbreviated, time: .shortened))").font(.caption)
          HStack {
            Button("Log purchase") { model.requestedPrompt = prompt }
            Spacer()
            Button("Not a purchase") {
              _ = model.commit { j in
                if let index = j.placePrompts?.firstIndex(where: { $0.id == prompt.id }) { j.placePrompts?[index].dismissed = true }
              }
            }
          }
        }
      }
    }.insightPanel()
  }
}
