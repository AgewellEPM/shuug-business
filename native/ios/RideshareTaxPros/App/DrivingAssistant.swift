import Combine
import CoreLocation
import CoreMotion
import DriverCore
import MapKit
import UserNotifications

/// Optional assistance uses one idle location manager, then hands recording to the
/// existing trip tracker. Every detected drive remains unclassified for review.
@MainActor final class DrivingAssistant: NSObject, ObservableObject, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
  @Published private(set) var status = "Automatic assistance is off"
  private weak var model: DriverModel?
  private weak var tracker: LocationTracker?
  private let manager = CLLocationManager()
  private let motion = CMMotionActivityManager()
  private var window = MovementWindow(), buffer: [LocationFix] = []
  private var autoSuspendedUntil = Date.distantPast, lastSearch = Date.distantPast
  private var automotive: Bool?, motionAt = Date.distantPast, lastFix: CLLocation?
  private var burstEnd: Task<Void, Never>?
  private var searching = false, requestedAlways = false, motionRunning = false
  private var settings: AssistanceSettings { model?.journal.assistance ?? AssistanceSettings() }
  override init() {
    super.init()
    manager.delegate = self; manager.activityType = .automotiveNavigation
    manager.desiredAccuracy = kCLLocationAccuracyBest; manager.distanceFilter = 5
    manager.pausesLocationUpdatesAutomatically = true; manager.showsBackgroundLocationIndicator = true
  }
  func attach(_ model: DriverModel, tracker: LocationTracker) {
    self.model = model; self.tracker = tracker
    UNUserNotificationCenter.current().delegate = self
    tracker.onObservation = { [weak self] locations in self?.consume(locations) }
    tracker.onManualStop = { [weak self] in
      self?.autoSuspendedUntil = Date().addingTimeInterval(300)
      self?.window = MovementWindow(); self?.buffer = []
      self?.configure()
    }
    configure()
  }
  func update(automatic: Bool? = nil, reminders: Bool? = nil) {
    guard let model else { return }
    var next = settings
    if let automatic { next.automaticDrives = automatic }
    if let reminders { next.placeReminders = reminders }
    guard model.commit({ $0.assistance = next }) else { return }
    if reminders == true {
      Task {
        do {
          let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
          if !allowed { status = "Notifications are off. Stop prompts will still appear in Today." }
        } catch { status = "Notifications are unavailable. Stop prompts stay in Today." }
      }
    }
    configure(requestPermission: true)
  }
  func configure(requestPermission: Bool = false) {
    guard model?.storageHealthy == true else { return }
    let enabled = settings.automaticDrives || settings.placeReminders
    if !enabled {
      manager.stopMonitoringVisits(); manager.stopMonitoringSignificantLocationChanges()
      manager.stopUpdatingLocation(); manager.allowsBackgroundLocationUpdates = false
      motion.stopActivityUpdates(); motionRunning = false
      burstEnd?.cancel(); window = MovementWindow(); buffer = []
      status = "Automatic assistance is off"; return
    }
    switch manager.authorizationStatus {
    case .notDetermined:
      status = "Location permission is needed for assistance"
      if requestPermission { manager.requestWhenInUseAuthorization() }
      return
    case .denied, .restricted:
      status = "Location is off. Enable it in iPhone Settings for assistance."; return
    default: break
    }
    if requestPermission, manager.authorizationStatus == .authorizedWhenInUse, !requestedAlways {
      requestedAlways = true; manager.requestAlwaysAuthorization()
    }
    if manager.authorizationStatus == .authorizedAlways {
      manager.startMonitoringVisits(); manager.startMonitoringSignificantLocationChanges()
      status = "Assistance enabled · Detected drives and stops need review"
    } else {
      status = "Foreground assistance enabled · Choose Always in Settings for background detection"
    }
    if CMMotionActivityManager.isActivityAvailable(), !motionRunning {
      motionRunning = true
      motion.startActivityUpdates(to: .main) { [weak self] activity in
        guard let activity, activity.confidence != .low else { return }
        Task { @MainActor [weak self] in
          guard let self else { return }
          self.automotive = activity.automotive; self.motionAt = activity.startDate
          if activity.automotive { self.startBurst() }
        }
      }
    }
    startBurst()
  }
  private func startBurst() {
    guard settings.automaticDrives || settings.placeReminders,
      [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus),
      model?.journal.activeTripId == nil else { return }
    manager.allowsBackgroundLocationUpdates = manager.authorizationStatus == .authorizedAlways
    manager.startUpdatingLocation()
    burstEnd?.cancel()
    burstEnd = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(150)) } catch { return }
      self?.manager.stopUpdatingLocation()
    }
  }
  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      self.configure(requestPermission: self.settings.automaticDrives || self.settings.placeReminders)
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor [weak self] in self?.consume(locations) }
  }
  private func consume(_ locations: [CLLocation]) {
    guard let model, settings.automaticDrives || settings.placeReminders else { return }
    for location in locations.sorted(by: { $0.timestamp < $1.timestamp }) {
      guard location.horizontalAccuracy >= 0, location.horizontalAccuracy <= 50,
        abs(location.timestamp.timeIntervalSinceNow) <= 30,
        lastFix.map({ location.timestamp > $0.timestamp }) ?? true else { continue }
      lastFix = location
      let fix = LocationFix(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                            accuracy: location.horizontalAccuracy, timestamp: location.timestamp)
      buffer.append(fix); buffer.removeAll { location.timestamp.timeIntervalSince($0.timestamp) > 90 }
      let decision = window.observe(fix, speed: location.speed)
      if decision.beganDriving, settings.automaticDrives, model.journal.activeTripId == nil,
        Date() >= autoSuspendedUntil,
        !(automotive == false && Date().timeIntervalSince(motionAt) < 120) {
        beginDetected(buffer)
      }
      if decision.arrivedAtStop, settings.placeReminders { Task { await searchPlaces(at: location) } }
      if decision.parkedLongEnough, case .trip(let trip) = model.active?.record.payload,
        trip.automaticallyDetected == true,
        !(automotive == true && Date().timeIntervalSince(motionAt) < 120) {
        tracker?.stop(automatic: true); status = "Detected drive saved · Review mileage, classification and fare"
        buffer = []; startBurst()
      }
    }
  }
  private func beginDetected(_ fixes: [LocationFix]) {
    guard let model, let first = fixes.first, model.journal.activeTripId == nil else { return }
    guard model.commit({ j in
      guard let id = j.beginTrip(classification: .unclassified, purpose: "Detected drive · review", now: first.timestamp),
        let i = j.entries.firstIndex(where: { $0.id == id }), case .trip(var trip) = j.entries[i].record.payload else { return }
      trip.automaticallyDetected = true; trip.hasGaps = true
      trip.notes = "Detected from movement. Review the start/end, missing mileage and whether this was business. It may contain several rides."
      j.entries[i].record.payload = .trip(trip)
    }) else { return }
    for fix in fixes { model.location(fix, now: fix.timestamp) }
    _ = model.commit { $0.markLocationGap() }
    manager.stopUpdatingLocation(); burstEnd?.cancel(); tracker?.resume()
    status = "Detected drive recording · Review after arrival"
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
    Task { @MainActor [weak self] in
      guard let self, visit.horizontalAccuracy >= 0, visit.horizontalAccuracy <= 90 else { return }
      if visit.departureDate == .distantFuture, self.settings.placeReminders {
        let point = CLLocation(coordinate: visit.coordinate, altitude: 0, horizontalAccuracy: visit.horizontalAccuracy,
                               verticalAccuracy: -1, timestamp: Date())
        await self.searchPlaces(at: point)
      } else if self.settings.automaticDrives { self.startBurst() }
    }
  }
  private func searchPlaces(at location: CLLocation) async {
    guard let model, settings.placeReminders, !searching, Date().timeIntervalSince(lastSearch) > 600 else { return }
    searching = true; lastSearch = Date()
    let scope = model.journalScope
    defer { searching = false }
    var categories: [MKPointOfInterestCategory] = [.gasStation, .evCharger, .restaurant, .cafe, .bakery]
    if #available(iOS 18.0, *) { categories.append(.automotiveRepair) }
    let request = MKLocalPointsOfInterestRequest(center: location.coordinate, radius: 160)
    request.pointOfInterestFilter = MKPointOfInterestFilter(including: categories)
    do {
      var items = try await MKLocalSearch(request: request).start().mapItems
      // Auto parts/dealers are not consistently assigned a MapKit POI category.
      let autoRequest = MKLocalSearch.Request()
      autoRequest.naturalLanguageQuery = "auto parts car dealership"
      autoRequest.region = MKCoordinateRegion(center: location.coordinate, latitudinalMeters: 350, longitudinalMeters: 350)
      autoRequest.resultTypes = .pointOfInterest
      if let autos = try? await MKLocalSearch(request: autoRequest).start().mapItems { items += autos }
      let candidates = items.compactMap { item -> PlaceCandidate? in
        guard let name = item.name, let place = item.placemark.location else { return nil }
        let category: ExpenseCategory
        switch item.pointOfInterestCategory {
        case .gasStation: category = .fuel
        case .evCharger: category = .evCharging
        case .restaurant, .cafe, .bakery: category = .meals
        default: category = MerchantCategory.suggest(name) ?? .repairs
        }
        return PlaceCandidate(id: "\(name.lowercased())|\(String(format: "%.4f,%.4f", place.coordinate.latitude, place.coordinate.longitude))",
          name: String(name.prefix(160)), address: String((item.placemark.title ?? name).prefix(240)),
          category: category, distanceMeters: location.distance(from: place))
      }
      guard scope == model.journalScope, settings.placeReminders,
        !(lastFix.map { abs($0.timestamp.timeIntervalSinceNow) < 30 && ($0.speed > 3 || $0.distance(from: location) > 120) } ?? false),
        let candidate = PlaceReminderPolicy.choose(candidates, history: model.journal.placePrompts ?? []) else { return }
      let prompt = ExpensePrompt(placeId: candidate.id, merchant: candidate.name, address: candidate.address, category: candidate.category)
      guard model.commit({ j in
        var prompts = j.placePrompts ?? []; prompts.append(prompt)
        j.placePrompts = Array(prompts.suffix(100))
      }) else { return }
      let content = UNMutableNotificationContent()
      content.title = "Expense to record?"
      content.body = "Near \(candidate.name)? Add a receipt if you made a purchase."
      content.sound = .default; content.userInfo = ["expensePrompt": prompt.id.uuidString]
      try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: prompt.id.uuidString, content: content, trigger: nil))
    } catch { status = "Place lookup is unavailable · Manual expense entry still works" }
  }
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .list]) }
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void) {
    let identifier = response.notification.request.content.userInfo["expensePrompt"] as? String
    Task { @MainActor [weak self] in
      if let identifier, let id = UUID(uuidString: identifier) {
        self?.model?.requestedPrompt = self?.model?.journal.placePrompts?.first { $0.id == id && !$0.dismissed }
      }
      completionHandler()
    }
  }
}
