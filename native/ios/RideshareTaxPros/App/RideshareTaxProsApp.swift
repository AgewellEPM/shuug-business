import SwiftUI

@main struct RideshareTaxProsApp: App {
  @UIApplicationDelegateAdaptor(DriverAppDelegate.self) private var appDelegate
  @StateObject private var model = DriverRuntime.shared.model
  @StateObject private var location = DriverRuntime.shared.location
  @StateObject private var assistant = DriverRuntime.shared.assistant
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(model).environmentObject(location)
        .environmentObject(assistant)
        .preferredColorScheme(.dark)
        .task {
          await model.sync()
        }
        .onChange(of: phase) { _, value in if value == .active { assistant.configure(); Task { await model.sync() } } }
        .onChange(of: model.connection?.session.account.id) { _, _ in assistant.configure() }
    }
  }
}
