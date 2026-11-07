import Combine
import UIKit

/// Initialize before notification responses, including a launch with no scene.
@MainActor final class DriverRuntime {
  static let shared = DriverRuntime()
  let model = DriverModel()
  let location = LocationTracker()
  let notifications = DriverNotifications()
  let assistant = DrivingAssistant()
  private var connections: AnyCancellable?
  private init() {
    location.attach(model)
    notifications.attach(model, tracker: location)
    assistant.attach(model, tracker: location, notifications: notifications)
    notifications.onDriveAction = { [weak self] in self?.assistant.didHandleDriveAlert() }
    connections = model.$connection.dropFirst().sink { _ in OfferCaptureStore.deactivate() }
  }
}

@MainActor final class DriverAppDelegate: NSObject, UIApplicationDelegate {
  func application(_ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    _ = DriverRuntime.shared
    return true
  }
}
