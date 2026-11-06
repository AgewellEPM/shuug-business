import Combine
import CoreLocation
import DriverCore

@MainActor final class LocationTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
  @Published private(set) var status = "GPS is off until you start a drive"
  @Published private(set) var recording = false
  private let manager = CLLocationManager()
  private weak var model: DriverModel?
  private var pendingStart: (TripClassification, String)?
  var onObservation: (([CLLocation]) -> Void)?
  var onManualStop: (() -> Void)?
  override init() {
    super.init()
    manager.delegate = self
    manager.activityType = .automotiveNavigation
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.distanceFilter = 5
    manager.pausesLocationUpdatesAutomatically = false
    manager.showsBackgroundLocationIndicator = true
  }
  func attach(_ model: DriverModel) {
    self.model = model
    if model.journal.activeTripId != nil {
      _ = model.commit { $0.markLocationGap() }
      resume()
    }
  }
  func start(classification: TripClassification, purpose: String) {
    Task { [weak self] in
      let servicesEnabled = await Task.detached {
        CLLocationManager.locationServicesEnabled()
      }.value
      self?.startAfterServiceCheck(
        classification: classification, purpose: purpose, servicesEnabled: servicesEnabled)
    }
  }
  private func startAfterServiceCheck(
    classification: TripClassification, purpose: String, servicesEnabled: Bool
  ) {
    guard let model, model.storageHealthy, model.journal.activeTripId == nil else { return }
    guard servicesEnabled else {
      model.message =
        "Turn on Location Services in Settings to record a drive, or enter a trip manually."
      return
    }
    switch manager.authorizationStatus {
    case .notDetermined:
      pendingStart = (classification, purpose)
      manager.requestWhenInUseAuthorization()
    case .authorizedAlways, .authorizedWhenInUse: begin(classification, purpose)
    default:
      model.message =
        "Location access is off. Enable it in iPhone Settings to record live mileage. Manual trip entry remains available."
    }
  }
  private func begin(_ classification: TripClassification, _ purpose: String) {
    guard let model,
      model.commit({ _ = $0.beginTrip(classification: classification, purpose: purpose) })
    else { return }
    if manager.accuracyAuthorization == .reducedAccuracy {
      manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "TripMileage")
      _ = model.commit { $0.markLocationGap() }
    }
    resume()
  }
  func resume() {
    guard model?.journal.activeTripId != nil else { return }
    guard [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) else {
      status = "Location access is off · Your saved trip is kept"
      return
    }
    manager.allowsBackgroundLocationUpdates = true
    manager.startUpdatingLocation()
    recording = true
    status = "Waiting for a reliable GPS fix…"
  }
  func stop(automatic: Bool = false) {
    manager.stopUpdatingLocation()
    manager.allowsBackgroundLocationUpdates = false
    recording = false
    status = "Drive saved on this iPhone"
    model?.finishTrip()
    if !automatic { onManualStop?() }
  }
  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor [weak self] in self?.authorizationChanged() }
  }
  private func authorizationChanged() {
    if [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) {
      if let pendingStart {
        self.pendingStart = nil
        begin(pendingStart.0, pendingStart.1)
      } else if model?.journal.activeTripId != nil {
        resume()
      }
    } else if manager.authorizationStatus != .notDetermined {
      pendingStart = nil
      recording = false
      status = "Location permission is off"
      _ = model?.commit { $0.markLocationGap() }
    }
  }
  nonisolated func locationManager(
    _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
  ) {
    let fixes = locations.map {
      LocationFix(
        latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude,
        accuracy: $0.horizontalAccuracy, timestamp: $0.timestamp)
    }
    Task { @MainActor [weak self] in
      self?.accept(fixes)
      self?.onObservation?(locations)
    }
  }
  private func accept(_ fixes: [LocationFix]) {
    guard model?.journal.activeTripId != nil else { return }
    for fix in fixes.sorted(by: { $0.timestamp < $1.timestamp }) { model?.location(fix) }
    if let last = fixes.last {
      status =
        last.accuracy >= 0 && last.accuracy <= 50
          && abs(last.timestamp.timeIntervalSinceNow) <= 20
        ? "GPS recording · Continues while your phone locks"
        : "Waiting for a better GPS signal · Review gaps"
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor [weak self] in
      self?.status = "GPS interrupted · Your saved mileage is kept"
      _ = self?.model?.commit { $0.markLocationGap() }
    }
  }
}
