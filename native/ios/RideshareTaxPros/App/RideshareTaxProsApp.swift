import SwiftUI

@main struct RideshareTaxProsApp: App {
  @StateObject private var model = DriverModel()
  @StateObject private var location = LocationTracker()
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(model).environmentObject(location)
        .preferredColorScheme(.dark)
        .task {
          location.attach(model)
          await model.sync()
        }
        .onChange(of: phase) { _, value in if value == .active { Task { await model.sync() } } }
    }
  }
}
