import CoreLocation
import DriverCore
import MapKit
import SwiftUI

struct WaitingAreaRoadResult: Identifiable {
  let area: HistoricalWaitingArea
  let approach: MKRoute, onward: MKRoute
  let repositionCents: Int, hourlyCents: Int, roadProgressMeters: Double
  let deadlineMarginMinutes: Double?
  var id: String { area.id }
}

@MainActor final class WaitingAreaPlanner: ObservableObject {
  @Published private(set) var results: [WaitingAreaRoadResult] = []
  @Published private(set) var direct: MKRoute?
  @Published private(set) var loading = false
  @Published private(set) var status = "Use your completed jobs to find starts that have taken you toward this destination."
  @Published private(set) var calculatedAt: Date?
  private var query: MKDirections?
  private var generation = 0

  func cancel() { generation += 1; query?.cancel(); query = nil; loading = false }
  func find(model: DriverModel, origin: CLLocation, destination: MKMapItem, deadline: Date?) async {
    cancel(); let run = generation; let scope = model.journalScope
    results = []; direct = nil; calculatedAt = nil
    guard abs(origin.timestamp.timeIntervalSinceNow) <= 120 else { status = "Update your current location before finding waiting areas."; return }
    loading = true; status = "Checking your recorded jobs and Apple Maps road routes…"
    defer { if run == generation { loading = false; query = nil } }
    let goals = model.journal.goals ?? DriverGoals()
    let records = Array(model.journal.visible.map(\.record).prefix(500))
    let disk = model.disk
    do {
      let start = MKMapItem(placemark: MKPlacemark(coordinate: origin.coordinate))
      let direct = try await road(start, destination)
      guard run == generation, scope == model.journalScope else { return }
      self.direct = direct; calculatedAt = Date()
      guard let cost = goals.vehicleCostCentsPerMile, cost.isFinite, (0...10_000).contains(cost),
        let hourlyTarget = goals.targetHourlyCents, hourlyTarget > 0 else {
        status = "Your direct road route is shown. Set vehicle cost and an hourly target in Earnings before comparing waiting areas."; return
      }
      let history = await Task.detached { () -> [HistoricalPositioningTrip] in
        var history: [HistoricalPositioningTrip] = []
        for record in records {
          if Task.isCancelled { break }
          guard case .trip(let trip) = record.payload, trip.classification == .business,
            [.ride, .delivery].contains(trip.rideRole), trip.automaticallyDetected != true, !trip.hasGaps,
            let ended = trip.endedAt, let profit = RideProfit(record: record, goals: goals),
            let net = profit.estimatedNetCents, let route = try? disk?.readRoute(record.id),
            !route.hasDamagedRecords, let first = route.points.first, let last = route.points.last,
            route.points.count >= 2, abs(first.timestamp.timeIntervalSince(trip.startedAt)) <= 120,
            abs(last.timestamp.timeIntervalSince(ended)) <= 120,
            !route.points.dropFirst().contains(where: { $0.startsSegment == true }) else { continue }
          history.append(HistoricalPositioningTrip(origin: PositionPoint(first.latitude, first.longitude),
            dropoff: PositionPoint(last.latitude, last.longitude), area: trip.workArea ?? "",
            netCents: net, minutes: profit.minutes, completedAt: ended))
        }
        return history
      }.value
      guard run == generation, scope == model.journalScope else { return }
      let candidates = DestinationPositioning.candidates(history,
        current: PositionPoint(origin.coordinate.latitude, origin.coordinate.longitude),
        destination: PositionPoint(destination.placemark.coordinate.latitude, destination.placemark.coordinate.longitude))
      var ranked: [WaitingAreaRoadResult] = []
      for area in candidates.prefix(3) {
        guard run == generation, scope == model.journalScope, !Task.isCancelled else { return }
        let approach = try await road(start, item(area.origin))
        let onward = try await road(item(area.typicalDropoff), destination)
        let reposition = Int((approach.distance / 1609.344 * cost).rounded())
        let adjustedNet = area.averageNetCents - Double(reposition)
        let hourly = Int((adjustedNet * 60 / (area.averageMinutes + approach.expectedTravelTime / 60)).rounded())
        let progress = direct.distance - onward.distance
        let margin = deadline.map { ($0.timeIntervalSinceNow - approach.expectedTravelTime - area.averageMinutes * 60 - onward.expectedTravelTime) / 60 }
        guard progress >= 500, adjustedNet > 0, hourly >= hourlyTarget, margin.map({ $0 >= 0 }) ?? true else { continue }
        ranked.append(WaitingAreaRoadResult(area: area, approach: approach, onward: onward,
          repositionCents: reposition, hourlyCents: hourly, roadProgressMeters: progress, deadlineMarginMinutes: margin))
      }
      guard run == generation, scope == model.journalScope else { return }
      results = ranked.sorted { $0.hourlyCents > $1.hourlyCents }
      status = results.isEmpty
        ? "No supported waiting-area match yet. A nearby start needs three complete priced job routes, mostly toward your destination, meeting your target after positioning costs. Your direct road route is still available."
        : "Personal-history matches after estimated positioning cost. Current job availability and waiting time are unknown."
    } catch { if run == generation { status = "Apple Maps could not complete the waiting-area comparison. Try again with a recent location and connection." } }
  }
  private func item(_ point: PositionPoint) -> MKMapItem {
    MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude)))
  }
  private func road(_ from: MKMapItem, _ to: MKMapItem) async throws -> MKRoute {
    let request = MKDirections.Request(); request.source = from; request.destination = to; request.transportType = .automobile
    let operation = MKDirections(request: request); query = operation
    guard let route = try await operation.calculate().routes.first else { throw CocoaError(.fileReadUnknown) }
    return route
  }
}
