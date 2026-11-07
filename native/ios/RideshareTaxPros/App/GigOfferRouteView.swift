import CoreLocation
import DriverCore
import MapKit
import SwiftUI

/// A parked-driver comparison. Selected route endpoints remain in memory.
struct GigOfferRouteView: View {
  let offer: UniversalGigOffer, profile: GigProfitProfile
  @EnvironmentObject private var model: DriverModel
  @StateObject private var planner = MissionRoutePlanner()
  @State private var destinationQuery = ""
  @State private var pickupQuery = ""
  @State private var dropoffQuery = ""
  @State private var deadline = Date().addingTimeInterval(3600)
  @State private var wait = ""
  @State private var delayBuffer = ""
  @State private var extraMiles = "10"
  @State private var extraMinutes = "30"
  @State private var completeRouteConfirmed = false
  @State private var risk = GigRiskTolerance.conservative
  @State private var platforms = Set(GigPlatform.allCases)
  @State private var initialized = false
  @FocusState private var editing: Bool
  private var currentOffer: UniversalGigOffer {
    model.journal.gigOffers?.first { $0.id == offer.id } ?? offer
  }
  private var sourceEndpoints: String {
    "\(currentOffer.pickupLocation?.label ?? "")|\(currentOffer.dropoffLocation?.label ?? "")|\(currentOffer.pickupLocation?.latitude ?? 0)|\(currentOffer.pickupLocation?.longitude ?? 0)|\(currentOffer.dropoffLocation?.latitude ?? 0)|\(currentOffer.dropoffLocation?.longitude ?? 0)"
  }
  private var settingsKey: String {
    "\(wait)|\(delayBuffer)|\(extraMiles)|\(extraMinutes)|\(deadline.timeIntervalSince1970)|\(risk.rawValue)|\(completeRouteConfirmed)|\(platforms.map(\.rawValue).sorted())|\(destinationQuery)|\(pickupQuery)|\(dropoffQuery)"
  }
  var body: some View {
    Form {
      Section {
        Label("Earn on your way home", systemImage: "house.fill").font(.title2.bold()).foregroundStyle(Brand.route)
        Text("Compare going directly with completing this entire job first. Confirm the pickup and drop-off from the original offer while parked.").font(.footnote)
        Text("Apple Maps receives the places you search and the endpoints of routes you request. Selected places stay in this screen.").font(.caption).foregroundStyle(Brand.muted)
      }
      Section("Your destination & arrival") {
        Button(planner.current == nil ? "Use my current location" : "Update my current location") { planner.locate() }
          .disabled(planner.locating || planner.loading)
        if planner.locating { ProgressView("Finding current location…") }
        if let fix = planner.current { Text("Location measured \(fix.timestamp.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(Brand.route) }
        if let error = planner.locationError { Text(error).font(.caption).foregroundStyle(Brand.caution) }
        RoutePlaceSearch(planner: planner, query: $destinationQuery, kind: .destination, title: "Destination")
        DatePicker("Must arrive by", selection: $deadline, displayedComponents: [.date, .hourAndMinute])
          .accessibilityIdentifier("offerRoute.deadline")
      }
      Section("The complete job") {
        RoutePlaceSearch(planner: planner, query: $pickupQuery, kind: .pickup, title: "Offer pickup")
        RoutePlaceSearch(planner: planner, query: $dropoffQuery, kind: .dropoff, title: "Offer drop-off")
        TextField("Pickup/service wait · minutes", text: $wait).keyboardType(.decimalPad).focused($editing)
        TextField("Additional delay allowance · minutes", text: $delayBuffer).keyboardType(.decimalPad).focused($editing)
        Text("Include loading, shopping and hand-off time in service wait. Enter an extra delay allowance, including 0 only when you choose to assume no extra delay. The allowance expands the upper travel-time estimate.").font(.caption)
        Toggle("Pickup, drop-off and home cover all remaining stops", isOn: $completeRouteConfirmed)
        if let reposition = currentOffer.repositionMiles, reposition > 0 {
          Text("This offer includes additional repositioning. Its extra stops must be routed before a complete recommendation is possible.").font(.caption).foregroundStyle(Brand.caution)
        }
      }
      Section("Your limits") {
        TextField("Maximum extra miles", text: $extraMiles).keyboardType(.decimalPad).focused($editing)
        TextField("Maximum extra minutes", text: $extraMinutes).keyboardType(.decimalPad).focused($editing)
        Picker("Uncertainty tolerance", selection: $risk) {
          Text("Conservative").tag(GigRiskTolerance.conservative)
          Text("Balanced").tag(GigRiskTolerance.balanced)
        }
        Text("Both choices enforce your arrival deadline using the latest estimated arrival. Conservative also rejects wide time ranges.").font(.caption)
        DisclosureGroup("Preferred platforms") {
          ForEach(GigPlatform.allCases) { platform in
            Toggle(platform.rawValue, isOn: Binding(get: { platforms.contains(platform) }, set: { allowed in
              if allowed { platforms.insert(platform) } else { platforms.remove(platform) }
            }))
          }
        }
      }
      Section("Compare the alternatives") {
        Button("Calculate the full route") { editing = false; Task { await planner.compare() } }
          .disabled(planner.current == nil || planner.destination == nil || planner.pickup == nil || planner.dropoff == nil || planner.loading || planner.searching != nil)
          .accessibilityIdentifier("offerRoute.compare")
        if planner.loading { ProgressView("Checking all four road legs…"); Button("Cancel lookup") { planner.cancel() } }
        if let error = planner.error { Text(error).font(.caption).foregroundStyle(Brand.caution) }
        if let routes = planner.routes {
          MissionRouteMap(routes: routes)
          TimelineView(.periodic(from: .now, by: 2)) { context in results(routes, now: context.date) }
        }
      }
    }.driverScreen().navigationTitle("Offer route home")
      .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { editing = false } } }
      .onAppear {
        guard !initialized else { return }; initialized = true
        pickupQuery = currentOffer.pickupLocation?.label ?? ""; dropoffQuery = currentOffer.dropoffLocation?.label ?? ""
        wait = currentOffer.waitMinutes.map { String(format: "%g", $0) } ?? ""
        if let mission = model.journal.mission {
          destinationQuery = mission.destination; deadline = mission.deadline
        }
      }
      .onChange(of: sourceEndpoints) { _, _ in planner.clearAll(); completeRouteConfirmed = false }
      .onChange(of: settingsKey) { _, _ in model.offerRouteEvidence.removeValue(forKey: offer.id) }
      .onChange(of: model.journalScope) { _, _ in planner.clearAll(); completeRouteConfirmed = false }
      .onDisappear { planner.cancel() }
  }
  @ViewBuilder private func results(_ routes: MissionRoutes, now: Date) -> some View {
    if let waitMinutes = number(wait, maximum: 240), let allowance = number(delayBuffer, maximum: 240),
      let mileLimit = number(extraMiles, maximum: 10000), let minuteLimit = number(extraMinutes, maximum: 1440),
      completeRouteConfirmed, currentOffer.repositionMiles == nil || currentOffer.repositionMiles == 0 {
      let plan = routes.plan(offerId: currentOffer.id, delayBufferMinutes: allowance)
      let preferences = GigDestinationPreferences(destination: plan.destination, arrivalDeadline: deadline,
        maximumAdditionalMiles: mileLimit, maximumAdditionalMinutes: minuteLimit,
        preferredPlatforms: GigPlatform.allCases.filter { platforms.contains($0) }, riskTolerance: risk)
      let updated = routedOffer(waitMinutes: waitMinutes, routes: routes)
      let evidence = GigOfferRouteEvidence(sourceOffer: currentOffer, routedOffer: updated,
        profile: profile, preferences: preferences, plan: plan)
      let recommendation = DispatchPlanner.rank([updated], profile: profile, preferences: preferences,
        routes: [updated.id: plan], commitments: model.journal.gigCommitments ?? [], now: now).first!
      let journey = recommendation.destination
      VStack(alignment: .leading, spacing: 12) {
        Label(title(recommendation.kind), systemImage: recommendation.kind == .recommended ? "checkmark.circle.fill" : "info.circle")
          .font(.headline).foregroundStyle(gigRecommendationTint(recommendation.kind))
        ForEach(recommendation.reasons, id: \.self) { Text($0).font(.footnote) }
        LabeledContent("Go directly", value: "\(Brand.miles(routes.direct.distance)) mi · \(Int((routes.direct.expectedTravelTime / 60).rounded(.up))) min").foregroundStyle(Brand.route)
        if let miles = journey.additionalMiles { LabeledContent("Extra miles via this job", value: bounds(miles, unit: "mi")).foregroundStyle(Brand.route) }
        if let minutes = journey.additionalMinutes { LabeledContent("Extra time via this job", value: bounds(minutes, unit: "min")).foregroundStyle(Brand.route) }
        if let latest = journey.latestArrival { LabeledContent("Latest estimated arrival", value: latest.formatted(date: .omitted, time: .shortened)).foregroundStyle(Brand.route) }
        if let buffer = journey.remainingMinutes { LabeledContent("Deadline buffer", value: String(format: "%.0f min", floor(buffer))).foregroundStyle(buffer > 0 ? Brand.route : Brand.danger) }
        if let profit = journey.routeProfit?.availableCash { LabeledContent("Job cash after reserve", value: money(profit)).foregroundStyle(gigMoneyTint(profit)) }
        if let incremental = journey.incrementalAvailableCash { LabeledContent("Extra cash vs going directly", value: money(incremental)).foregroundStyle(gigMoneyTint(incremental)) }
        Text("Operating costs and your configured reserve are included. Reserve is a planning allocation. Traffic, service delays and availability can change; verify the actual offer in \(currentOffer.platform.rawValue) before accepting.")
          .font(.caption).foregroundStyle(Brand.muted)
        if !currentOffer.validForComparison(now: now) {
          Text("This observation is stale or expired. Review the current offer again before using a recommendation.").font(.caption).foregroundStyle(Brand.danger)
        }
      }.font(.subheadline)
        .task(id: try? WireJSON.encoder().encode(evidence)) {
          model.offerRouteEvidence[currentOffer.id] = evidence
        }
    } else {
      Text("Enter wait, delay allowance and travel limits, then confirm that the selected stops cover the entire job. Unknown stops or repositioning prevent a deadline recommendation.")
        .font(.footnote).foregroundStyle(Brand.caution)
    }
  }
  private func routedOffer(waitMinutes: Double, routes: MissionRoutes) -> UniversalGigOffer {
    var value = currentOffer
    value.waitMinutes = waitMinutes; value.uncertainty.waitMinutes = nil
    // The driver explicitly confirmed all remaining stops above. Real extra
    // repositioning still blocks the result rather than being overwritten.
    value.repositionMiles = 0
    value.pickupLocation = GigOfferLocation(label: planner.display(routes.pickup), latitude: routes.pickup.placemark.coordinate.latitude, longitude: routes.pickup.placemark.coordinate.longitude)
    value.dropoffLocation = GigOfferLocation(label: planner.display(routes.dropoff), latitude: routes.dropoff.placemark.coordinate.latitude, longitude: routes.dropoff.placemark.coordinate.longitude)
    value.pickupMiles = routes.toPickup.distance / 1609.344; value.deliveryMiles = routes.delivery.distance / 1609.344
    value.estimatedMinutes = routes.jobTravelTime / 60; value.durationCoverage = .travelExcludingWait
    value.uncertainty.workingMinutes = nil; value.uncertainty.totalMiles = nil
    value.refreshMissingFields(); return value
  }
  private func number(_ input: String, maximum: Double) -> Double? {
    guard let number = Double(input.trimmingCharacters(in: .whitespacesAndNewlines)), number.isFinite, (0...maximum).contains(number) else { return nil }
    return number
  }
  private func money(_ range: GigMoneyRange) -> String {
    range.isPoint ? Brand.usd(range.lowerCents) : "\(Brand.usd(range.lowerCents))–\(Brand.usd(range.upperCents))"
  }
  private func bounds(_ range: GigSignedBounds, unit: String) -> String {
    abs(range.upper - range.lower) < 0.05 ? String(format: "%.1f %@", range.upper, unit) : String(format: "%.1f–%.1f %@", range.lower, range.upper, unit)
  }
  private func title(_ kind: GigRecommendationKind) -> String {
    switch kind { case .recommended: "Fits your journey"; case .tradeoff: "Profitable route tradeoff"; case .needsReview: "More review needed"; case .skip: "Skip this comparison" }
  }
}

struct RoutePlaceSearch: View {
  @ObservedObject var planner: MissionRoutePlanner
  @Binding var query: String
  let kind: MissionRoutePlanner.Kind, title: String
  private var selected: MKMapItem? {
    switch kind { case .destination: planner.destination; case .pickup: planner.pickup; case .dropoff: planner.dropoff }
  }
  var body: some View {
    TextField("\(title) address or place", text: $query).textInputAutocapitalization(.words).autocorrectionDisabled()
      .onChange(of: query) { _, _ in
        switch kind { case .destination: planner.clearDestination(); case .pickup: planner.clearPickup(); case .dropoff: planner.clearDropoff() }
      }
    Button("Search \(title.lowercased())") { Task { await planner.search(query, for: kind) } }
      .disabled(planner.loading || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    if let selected { Text("\(title): \(planner.display(selected))").font(.footnote).foregroundStyle(Brand.route) }
    if planner.searching == kind { ProgressView("Searching…") }
    if planner.resultKind == kind {
      VStack(alignment: .leading, spacing: 8) {
        Text("Choose the correct result:").font(.caption)
        ForEach(Array(planner.candidates.enumerated()), id: \.offset) { _, item in
          Button(planner.display(item)) { planner.choose(item) }.font(.footnote)
        }
      }
    }
  }
}

struct MissionRouteMap: View {
  let routes: MissionRoutes
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Map(initialPosition: .automatic) {
        MapPolyline(routes.direct.polyline).stroke(Brand.purple.opacity(0.55), lineWidth: 4)
        MapPolyline(routes.toPickup.polyline).stroke(Brand.pink, lineWidth: 5)
        MapPolyline(routes.delivery.polyline).stroke(Brand.pink, lineWidth: 5)
        MapPolyline(routes.onward.polyline).stroke(Brand.route, lineWidth: 5)
        Marker("Current", coordinate: routes.origin.coordinate).tint(Brand.route)
        Marker("Pickup", systemImage: "bag.fill", coordinate: routes.pickup.placemark.coordinate).tint(Brand.pink)
        Marker("Drop-off", coordinate: routes.dropoff.placemark.coordinate).tint(Brand.pink)
        Marker("Destination", systemImage: "house.fill", coordinate: routes.destination.placemark.coordinate).tint(Brand.route)
      }.mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll)).environment(\.colorScheme, .dark)
        .frame(height: 220).clipShape(RoundedRectangle(cornerRadius: 16))
      Text("Purple: direct · Pink: pickup & delivery · Light: onward").font(.caption2).foregroundStyle(Brand.muted)
    }
  }
}
