import SwiftUI

@main struct RideshareTaxProsApp: App {
  @StateObject private var model = DriverModel()
  @StateObject private var location = LocationTracker()
  @StateObject private var assistant = DrivingAssistant()
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(model).environmentObject(location)
        .environmentObject(assistant)
        .preferredColorScheme(.dark)
        .task {
          location.attach(model)
          assistant.attach(model, tracker: location)
          await model.sync()
        }
        .onChange(of: phase) { _, value in if value == .active { assistant.configure(); Task { await model.sync() } } }
        .onChange(of: model.connection?.session.account.id) { _, _ in assistant.configure() }
    }
  }
}
