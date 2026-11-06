import DriverCore
import MapKit
import SwiftUI

struct RideProfitDetails: View {
  let profit: RideProfit
  var body: some View {
    LabeledContent("Fare + tips", value: profit.earningsCents.map(Brand.usd) ?? "Not recorded")
    LabeledContent("Platform fees", value: profit.feesRecorded ? Brand.usd(profit.feesCents) : "Not recorded")
    LabeledContent("Estimated vehicle cost", value: profit.estimatedVehicleCents.map(Brand.usd) ?? "Set cost in Insights → Goals")
    if let net = profit.estimatedNetCents {
      LabeledContent("Estimated ride net", value: Brand.usd(net)).foregroundStyle(net < 0 ? Color.orange : Brand.link)
        .accessibilityIdentifier("trip.estimatedNet")
      if let rate = profit.hourlyCents { LabeledContent("Net per recorded hour", value: Brand.usd(Int(rate.rounded()))) }
      if let rate = profit.netCentsPerMile { LabeledContent("Net per mile", value: Brand.usd(Int(rate.rounded()))) }
      Text(net < 0 ? "This drive falls below break-even using your operating estimate." : "This drive covers your entered vehicle-cost estimate. Unrecorded costs can change the result.")
        .font(.footnote)
    } else {
      Text("Add the fare, fees (0 if none), and vehicle cost to see whether this drive covered its costs.").font(.footnote)
    }
    Text("Estimated before tax. Uses this drive's recorded time and miles; include unpaid pickup, waiting and repositioning in your day review. Fuel and repairs already included in your per-mile estimate are not deducted twice.")
      .font(.caption).foregroundStyle(Brand.muted)
    if profit.needsMileageReview { Text("GPS gaps may understate distance and operating cost. Review mileage.").font(.caption).foregroundStyle(.orange) }
  }
}

struct RouteOptionsView: View {
  let points: [LocationFix]
  let distanceMeters: Double
  let costCentsPerMile: Double?
  @State private var routes: [MKRoute] = []
  @State private var loading = false
  @State private var error: String?
  @State private var directions: MKDirections?
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Button("Compare routes for these endpoints") { Task { await compare() } }.disabled(loading || points.count < 2)
      Text("Sends the saved start and end points to Apple Maps when you tap. Routes use current conditions, may omit original stops and do not prove which route was best during this trip.")
        .font(.caption).foregroundStyle(Brand.muted)
      if loading { ProgressView("Checking route options…") }
      if let error { Text(error).font(.caption).foregroundStyle(.orange) }
      ForEach(Array(routes.enumerated()), id: \.offset) { _, route in
        VStack(alignment: .leading, spacing: 4) {
          Text(route.name).font(.headline)
          Text("\(Brand.miles(route.distance)) mi · about \(Int((route.expectedTravelTime/60).rounded())) min now")
          let saved = distanceMeters - route.distance
          if saved > 160.9344, let costCentsPerMile {
            Text("\(Brand.miles(saved)) fewer miles than recorded · about \(Brand.usd(Int((saved/1609.344*costCentsPerMile).rounded()))) less estimated vehicle cost")
              .font(.caption)
          }
          Text("Check traffic, tolls, access and required stops before choosing a route.").font(.caption).foregroundStyle(Brand.muted)
        }
      }
    }.onDisappear { directions?.cancel() }
  }
  @MainActor private func compare() async {
    guard let first = points.first, let last = points.last else { return }
    loading = true; error = nil
    defer { loading = false }
    let request = MKDirections.Request()
    request.source = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: first.latitude, longitude: first.longitude)))
    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: last.latitude, longitude: last.longitude)))
    request.transportType = .automobile; request.requestsAlternateRoutes = true
    let query = MKDirections(request: request); directions = query
    do {
      routes = try await query.calculate().routes.sorted { $0.distance < $1.distance }
      if routes.isEmpty { error = "No driving routes are available for these endpoints." }
    } catch { self.error = "Route comparison is unavailable. Your recorded trip is unchanged." }
  }
}
