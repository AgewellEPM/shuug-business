import CoreLocation
import DriverCore
import MapKit
import SwiftUI

struct PositioningView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: 12) {
          Label("Your best next move", systemImage: "scope").font(.title2.bold()).foregroundStyle(Brand.link)
          Text("Wait where your past jobs have taken you toward home.").font(.headline)
          Text("Select the actual destination. We compare eligible job starts from your own saved routes, positioning costs and road travel. This does not predict live demand.").font(.footnote).foregroundStyle(Brand.muted)
        }.padding(.vertical, 6)
      }
      MissionRouteSection(deadline: model.journal.mission?.deadline, waitMinutes: nil, positioningOnly: true)
        .id(model.journalScope)
    }.driverScreen().navigationTitle("Positioning")
  }
}

struct DestinationPositioningSection: View {
  @EnvironmentObject private var model: DriverModel
  let origin: CLLocation, destination: MKMapItem, deadline: Date?
  @StateObject private var planner = WaitingAreaPlanner()
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Label("Position yourself toward home", systemImage: "scope").font(.headline).foregroundStyle(Brand.pink)
      Button("Find waiting areas from my job history") { Task { await planner.find(model: model, origin: origin, destination: destination, deadline: deadline) } }
        .disabled(planner.loading)
      if planner.loading { ProgressView("Checking routes…"); Button("Cancel") { planner.cancel() } }
      Text(planner.status).font(.footnote).foregroundStyle(Brand.muted)
      if let direct = planner.direct {
        Map(initialPosition: .automatic) {
          MapPolyline(direct.polyline).stroke(Brand.purple, lineWidth: 5)
          Marker("Current", coordinate: origin.coordinate)
          Marker("Destination", systemImage: "house.fill", coordinate: destination.placemark.coordinate).tint(Brand.pink)
          ForEach(planner.results) { row in
            Marker(row.area.name, coordinate: CLLocationCoordinate2D(latitude: row.area.origin.latitude, longitude: row.area.origin.longitude)).tint(Brand.pink)
          }
        }.mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll)).environment(\.colorScheme, .dark)
          .frame(height: 215).clipShape(RoundedRectangle(cornerRadius: 18))
        Text("Direct home: \(Brand.miles(direct.distance)) mi · about \(Int(direct.expectedTravelTime / 60)) min").font(.caption)
      }
      ForEach(Array(planner.results.enumerated()), id: \.element.id) { index, row in
        VStack(alignment: .leading, spacing: 10) {
          HStack {
            Text("\(index + 1)").font(.title3.bold()).frame(width: 34, height: 34).background(Brand.action, in: RoundedRectangle(cornerRadius: 9))
            Text(row.area.name).font(.headline); Spacer()
            Image(systemName: "arrow.up.right").foregroundStyle(Brand.pink)
          }
          Text("\(row.area.matchingJobs) of \(row.area.totalJobs) eligible past jobs went toward this destination.").font(.caption)
          Text("\(Brand.miles(row.approach.distance)) mi to position · \(Brand.usd(row.repositionCents)) estimated vehicle cost").font(.caption)
          Text("\(Brand.usd(row.hourlyCents))/active hour using your matched history and positioning time.").font(.footnote).foregroundStyle(Brand.link)
          if let margin = row.deadlineMarginMinutes { Text("Illustrative \(Int(margin)) min deadline buffer if another job matched the recorded duration. Finding/waiting for a job is excluded.").font(.caption) }
          Button("Open this waiting area in Apple Maps") {
            let item = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: row.area.origin.latitude, longitude: row.area.origin.longitude)))
            item.name = row.area.name; item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
          }.font(.footnote)
        }.gigCard(highlight: index == 0)
      }
      Text("Job availability, waiting and future routes are unknown. Historical matches are personal observations; they do not guarantee profitable offers or arrival. Choose a legal, safe place to wait.").font(.caption2).foregroundStyle(Brand.muted)
    }.onDisappear { planner.cancel() }
  }
}
