import CoreLocation
import DriverCore
import Foundation

@MainActor final class OfficeHelpModel: NSObject, ObservableObject, CLLocationManagerDelegate {
  @Published private(set) var directory: OfficeDirectory?
  @Published private(set) var loading = false
  @Published private(set) var locating = false
  @Published private(set) var searching = false
  @Published private(set) var error: String?
  @Published private(set) var locationError: String?
  @Published private(set) var point: OfficeCoordinate?
  @Published private(set) var areaLabel: String?
  @Published private(set) var refreshedAt: Date?
  private let location = CLLocationManager(), geocoder = CLGeocoder()
  private var generation = 0
  private var locationTimeout: Task<Void, Never>?
  private let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 20
    return URLSession(configuration: config)
  }()
  var offices: [DirectoryOffice] { directory?.ranked(near: point) ?? [] }
  override init() { super.init(); location.delegate = self; location.desiredAccuracy = kCLLocationAccuracyKilometer }
  func refresh() async {
    guard !loading else { return }; loading = true; error = nil
    defer { loading = false }
    do {
      let (data, response) = try await session.data(from: WorkspaceClient.websiteURL.appendingPathComponent("api/offices"))
      guard let response = response as? HTTPURLResponse, response.url?.scheme == "https",
        ["gigtax.pro", "www.gigtax.pro"].contains(response.url?.host ?? ""), data.count <= 2_000_000 else { throw URLError(.badServerResponse) }
      if response.statusCode == 404 { error = "The office directory is being prepared. Please check again soon."; return }
      guard response.statusCode == 200 else { throw URLError(.badServerResponse) }
      let result = try JSONDecoder().decode(OfficeDirectory.self, from: data)
      guard result.version == 1, result.offices.count <= 10_000 else { throw URLError(.cannotParseResponse) }
      directory = result; refreshedAt = Date()
    } catch is CancellationError { }
    catch { self.error = directory == nil ? "Could not load office details. Check your connection and try again." : "Could not refresh. Showing the office details from your last update." }
  }
  func locate() {
    cancelLocation(); locationError = nil; locating = true
    locationTimeout = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 20_000_000_000)
      guard !Task.isCancelled, let self, self.locating else { return }
      self.cancelLocation(); self.locationError = "Could not find a recent location. Try your ZIP code instead."
    }
    switch location.authorizationStatus {
    case .notDetermined: location.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways: location.requestLocation()
    default: cancelLocation(); locationError = "Location access is off. Enter a ZIP code, or allow location in iPhone Settings."
    }
  }
  func searchZIP(_ input: String) async {
    let zip = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard zip.range(of: #"^[0-9]{5}$"#, options: .regularExpression) != nil else { locationError = "Enter a five-digit US ZIP code."; return }
    cancelLocation(); let run = generation; searching = true; locationError = nil
    defer { if run == generation { searching = false } }
    do {
      let places = try await geocoder.geocodeAddressString("\(zip), United States")
      guard run == generation else { return }
      guard let place = places.first(where: { $0.isoCountryCode == "US" && $0.postalCode?.hasPrefix(zip) == true }),
        let fix = place.location else { locationError = "No location found for that ZIP code. Check it and try again."; return }
      point = OfficeCoordinate(latitude: fix.coordinate.latitude, longitude: fix.coordinate.longitude); areaLabel = "ZIP \(zip)"
    } catch { if run == generation { locationError = "ZIP search is unavailable. Try again or use your location." } }
  }
  func cancelLocation() {
    generation += 1; locating = false; searching = false; locationTimeout?.cancel(); locationTimeout = nil
    geocoder.cancelGeocode(); location.stopUpdatingLocation()
  }
  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor [weak self] in
      guard let self, self.locating else { return }
      switch self.location.authorizationStatus {
      case .authorizedAlways, .authorizedWhenInUse: self.location.requestLocation()
      case .denied, .restricted: self.cancelLocation(); self.locationError = "Location access is off. You can search by ZIP code instead."
      default: break
      }
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor [weak self] in
      guard let self, self.locating else { return }; self.cancelLocation()
      guard let fix = locations.last, (0...5000).contains(fix.horizontalAccuracy), abs(fix.timestamp.timeIntervalSinceNow) <= 60 else {
        self.locationError = "A recent location is unavailable. Try your ZIP code instead."; return
      }
      self.point = OfficeCoordinate(latitude: fix.coordinate.latitude, longitude: fix.coordinate.longitude)
      self.areaLabel = "your location"; self.locationError = nil
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor [weak self] in
      guard let self, self.locating else { return }; self.cancelLocation()
      self.locationError = "Could not find your location. You can search by ZIP code instead."
    }
  }
}
