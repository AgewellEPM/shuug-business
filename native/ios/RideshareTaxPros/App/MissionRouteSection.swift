import CoreLocation
import DriverCore
import MapKit
import SwiftUI

/// The user chooses each search result; neither addresses nor coordinates enter the journal.
struct MissionRouteSection: View {
  let deadline: Date?
  let waitMinutes: Double?
  @StateObject private var planner = MissionRoutePlanner()
  @State private var destinationQuery = ""
  @State private var dropoffQuery = ""
  var body: some View {
    Section("Get paid going home") {
      Text("While parked, select a destination and an offer's drop-off to compare actual road routes. The offer is still entered by you; no marketplace offers are fetched.")
        .font(.footnote)
      Text("When you search or compare, Apple Maps receives your search terms and, for the route, your current location and selected endpoints. The app does not save these details in your journal or send them to the firm.")
        .font(.caption).foregroundStyle(Brand.muted)
      Button(planner.current == nil ? "Use my current location" : "Update my current location") { planner.locate() }
        .disabled(planner.locating || planner.loading)
      if planner.locating { ProgressView("Finding a recent location…") }
      if let fix = planner.current { Text("Location measured \(fix.timestamp.formatted(date: .omitted, time: .shortened)); accuracy about \(Int(fix.horizontalAccuracy.rounded())) m.").font(.caption) }
      if let error = planner.locationError { Text(error).font(.caption).foregroundStyle(.orange) }

      TextField("Destination address or place", text: $destinationQuery).textInputAutocapitalization(.words).autocorrectionDisabled()
        .onChange(of: destinationQuery) { _, _ in planner.clearDestination() }
      Button("Search destination") { Task { await planner.search(destinationQuery, for: .destination) } }
        .disabled(planner.loading || destinationQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      if let item = planner.destination { Text("Destination: \(planner.display(item))").font(.footnote) }
      if planner.searching == .destination { ProgressView("Searching destinations…") }
      if planner.resultKind == .destination { candidates }

      TextField("Offer drop-off address or place", text: $dropoffQuery).textInputAutocapitalization(.words).autocorrectionDisabled()
        .onChange(of: dropoffQuery) { _, _ in planner.clearDropoff() }
      Button("Search offer drop-off") { Task { await planner.search(dropoffQuery, for: .dropoff) } }
        .disabled(planner.loading || dropoffQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      if let item = planner.dropoff { Text("Drop-off: \(planner.display(item))").font(.footnote) }
      if planner.searching == .dropoff { ProgressView("Searching drop-offs…") }
      if planner.resultKind == .dropoff { candidates }
      if let error = planner.error { Text(error).font(.caption).foregroundStyle(.orange) }

      Button("Compare road routes") { Task { await planner.compare() } }
        .disabled(planner.current == nil || planner.destination == nil || planner.dropoff == nil || planner.loading || planner.searching != nil)
      if planner.loading { ProgressView("Calculating routes with Apple Maps…"); Button("Cancel route lookup") { planner.cancel() } }
      if let routes = planner.routes {
        TimelineView(.periodic(from: .now, by: 60)) { context in
          routeResults(routes, now: context.date)
        }
      }
      Text("The route to the drop-off starts at your current position and does not include an unknown pickup or other stops. Add those and restaurant wait yourself; they can change the deadline and cost. Road routes and traffic can change. Never interact with the app while driving.")
        .font(.caption).foregroundStyle(Brand.muted)
    }.onDisappear { planner.cancel() }
  }
  private var candidates: some View {
    VStack(alignment: .leading) {
      Text("Choose the correct result:").font(.caption)
      ForEach(Array(planner.candidates.enumerated()), id: \.offset) { _, item in
        Button(planner.display(item)) { planner.choose(item) }.font(.footnote)
      }
    }
  }
  @ViewBuilder private func routeResults(_ routes: MissionRoutes, now: Date) -> some View {
    let age = now.timeIntervalSince(routes.calculatedAt)
    let wait = waitMinutes.flatMap { $0.isFinite && (0...240).contains($0) ? $0 * 60 : nil }
    let comparison = DestinationRouteComparison(directMeters: routes.direct.distance, directSeconds: routes.direct.expectedTravelTime,
      toDropoffMeters: routes.toDropoff.distance, toDropoffSeconds: routes.toDropoff.expectedTravelTime,
      onwardMeters: routes.onward.distance, onwardSeconds: routes.onward.expectedTravelTime,
      waitSeconds: wait, deadline: deadline, now: now)
    VStack(alignment: .leading, spacing: 8) {
      Map(initialPosition: .automatic) {
        MapPolyline(routes.direct.polyline).stroke(.purple.opacity(0.65), lineWidth: 4)
        MapPolyline(routes.toDropoff.polyline).stroke(.pink, lineWidth: 5)
        MapPolyline(routes.onward.polyline).stroke(.cyan, lineWidth: 5)
        Marker("Current", coordinate: routes.origin.coordinate)
        Marker("Drop-off", coordinate: routes.dropoff.placemark.coordinate)
        Marker("Destination", coordinate: routes.destination.placemark.coordinate)
      }.frame(height: 220).clipShape(RoundedRectangle(cornerRadius: 14))
      Text("Purple: direct · Pink: to drop-off · Blue: onward").font(.caption)
      Text("Direct: \(Brand.miles(routes.direct.distance)) mi · \(minutes(routes.direct.expectedTravelTime)) min")
      Text("Via drop-off: \(Brand.miles(routes.toDropoff.distance + routes.onward.distance)) mi · \(minutes(routes.toDropoff.expectedTravelTime + routes.onward.expectedTravelTime)) min driving")
      if let comparison {
        let change = comparison.distanceChangeMeters
        Text(abs(change) < 160.9344 ? "Drop-off is about the same road distance from your destination." :
          "Drop-off is \(Brand.miles(abs(change))) mi \(change > 0 ? "closer to" : "farther from") your destination by road.")
        let extra = comparison.extraTravelSeconds
        Text("Via drop-off: \(minutes(abs(extra))) min \(extra >= 0 ? "longer" : "shorter") than driving directly, before wait and omitted stops.")
        if age > 300 || now.timeIntervalSince(routes.origin.timestamp) > 120 {
          Text("Your location or route estimate is old. Update your location and compare again before using a deadline estimate.").foregroundStyle(.orange)
        }
        else if let buffer = comparison.deadlineBufferSeconds {
          Text(buffer >= 0 ? "Estimated \(minutes(buffer)) min before your deadline" : "Estimated \(minutes(-buffer)) min after your deadline").foregroundStyle(buffer >= 0 ? .green : .orange)
          Text("Includes your entered wait; unknown pickup and other stops are excluded. Arrival is not guaranteed.").font(.caption)
        } else if deadline == nil { Text("Save a mission deadline to compare arrival time.").font(.caption) }
        else { Text("Enter a pickup wait above, including 0 when known, to see a deadline estimate.").font(.caption) }
      }
      Text("Road estimates requested \(routes.calculatedAt.formatted(date: .omitted, time: .shortened)); compare again after conditions change.")
        .font(.caption).foregroundStyle(Brand.muted)
    }
  }
  private func minutes(_ seconds: Double) -> Int { Int((seconds / 60).rounded()) }
}

struct MissionRoutes {
  let direct: MKRoute, toDropoff: MKRoute, onward: MKRoute
  let origin: CLLocation, dropoff: MKMapItem, destination: MKMapItem
  let calculatedAt: Date
}

@MainActor final class MissionRoutePlanner: NSObject, ObservableObject, CLLocationManagerDelegate {
  enum Kind { case destination, dropoff }
  @Published private(set) var current: CLLocation?
  @Published private(set) var destination: MKMapItem?
  @Published private(set) var dropoff: MKMapItem?
  @Published private(set) var locating = false
  @Published private(set) var loading = false
  @Published private(set) var searching: Kind?
  @Published private(set) var resultKind: Kind?
  @Published private(set) var candidates: [MKMapItem] = []
  @Published private(set) var routes: MissionRoutes?
  @Published private(set) var error: String?
  @Published private(set) var locationError: String?
  private let location = CLLocationManager()
  private var wantsLocation = false
  private var searchRequest: MKLocalSearch?, directions: MKDirections?
  private var generation = 0
  override init() { super.init(); location.delegate = self; location.desiredAccuracy = kCLLocationAccuracyHundredMeters }
  func locate() {
    invalidate(); current = nil; locationError = nil; wantsLocation = true; locating = true
    switch location.authorizationStatus {
    case .notDetermined: location.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways: location.requestLocation()
    default: wantsLocation = false; locating = false; locationError = "Allow location while using the app in Settings, then try again."
    }
  }
  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor [weak self] in
      guard let self, self.wantsLocation else { return }
      switch self.location.authorizationStatus {
      case .authorizedWhenInUse, .authorizedAlways: self.location.requestLocation()
      case .denied, .restricted: self.wantsLocation = false; self.locating = false; self.locationError = "Location access is off. Enable it in Settings to compare from your current position."
      default: break
      }
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor [weak self] in
      guard let self, self.wantsLocation else { return }; self.wantsLocation = false; self.locating = false
      guard let fix = locations.last, fix.horizontalAccuracy >= 0, fix.horizontalAccuracy <= 200,
        abs(fix.timestamp.timeIntervalSinceNow) <= 60 else {
        self.locationError = "A recent, accurate location is unavailable. Try again when parked with a clear GPS signal."; return
      }
      self.current = fix; self.locationError = nil
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor [weak self] in
      guard let self, self.wantsLocation else { return }; self.wantsLocation = false; self.locating = false
      self.locationError = "Could not determine your location. Check permissions and GPS, then try again."
    }
  }
  func display(_ item: MKMapItem) -> String {
    let title = item.placemark.title ?? ""; let name = item.name ?? ""
    if title.isEmpty || title == name { return name.isEmpty ? "Selected place" : name }
    return name.isEmpty ? title : "\(name) · \(title)"
  }
  func clearDestination() { destination = nil; clearSearch(); invalidate() }
  func clearDropoff() { dropoff = nil; clearSearch(); invalidate() }
  private func clearSearch() { searchRequest?.cancel(); searchRequest = nil; searching = nil; candidates = []; resultKind = nil }
  private func invalidate() { generation += 1; directions?.cancel(); directions = nil; routes = nil; loading = false; error = nil }
  func cancel() { invalidate(); clearSearch(); wantsLocation = false; locating = false; location.stopUpdatingLocation() }
  func choose(_ item: MKMapItem) {
    if resultKind == .destination { destination = item } else if resultKind == .dropoff { dropoff = item }
    candidates = []; resultKind = nil; invalidate()
  }
  func search(_ query: String, for kind: Kind) async {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.count <= 200 else { error = "Enter a place or address under 200 characters."; return }
    clearSearch(); invalidate(); let run = generation; searching = kind
    let request = MKLocalSearch.Request(); request.naturalLanguageQuery = trimmed
    if let fix = current, abs(fix.timestamp.timeIntervalSinceNow) <= 60 {
      request.region = MKCoordinateRegion(center: fix.coordinate, latitudinalMeters: 100_000, longitudinalMeters: 100_000)
    }
    let query = MKLocalSearch(request: request); searchRequest = query
    do {
      let response = try await query.start(); guard run == generation else { return }
      candidates = Array(response.mapItems.prefix(8)); resultKind = kind
      if candidates.isEmpty { resultKind = nil; error = "No matching places. Try a more complete address." }
    } catch { if run == generation { self.error = "Apple Maps could not search for that place. Check your connection and try again." } }
    if run == generation { searching = nil; searchRequest = nil }
  }
  func compare() async {
    guard let origin = current, let destination, let dropoff else { return }
    guard abs(origin.timestamp.timeIntervalSinceNow) <= 120 else { locationError = "Your current location is old. Update it before comparing routes."; current = nil; return }
    invalidate(); let run = generation; loading = true
    defer { if run == generation { loading = false; directions = nil } }
    let start = MKMapItem(placemark: MKPlacemark(coordinate: origin.coordinate))
    do {
      let direct = try await route(from: start, to: destination); guard generation == run else { return }
      let toDropoff = try await route(from: start, to: dropoff); guard generation == run else { return }
      let onward = try await route(from: dropoff, to: destination); guard generation == run else { return }
      routes = MissionRoutes(direct: direct, toDropoff: toDropoff, onward: onward, origin: origin,
                             dropoff: dropoff, destination: destination, calculatedAt: Date())
    } catch { if run == generation { self.error = "Apple Maps could not calculate all three routes. Check the locations and connection, then try again." } }
  }
  private func route(from: MKMapItem, to: MKMapItem) async throws -> MKRoute {
    let request = MKDirections.Request(); request.source = from; request.destination = to; request.transportType = .automobile
    let query = MKDirections(request: request); directions = query
    guard let route = try await query.calculate().routes.first else { throw RouteError.unavailable }
    return route
  }
  private enum RouteError: Error { case unavailable }
}
