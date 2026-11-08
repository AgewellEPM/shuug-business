import DriverCore
import MapKit
import SwiftUI

struct OfficeHelpView: View {
  @Environment(\.scenePhase) private var scenePhase
  @StateObject private var model = OfficeHelpModel()
  @State private var zip = ""
  @State private var selectedID: String?
  @State private var camera: MapCameraPosition = .region(MKCoordinateRegion(
    center: CLLocationCoordinate2D(latitude: 39.8, longitude: -98.6), span: MKCoordinateSpan(latitudeDelta: 48, longitudeDelta: 65)))
  @FocusState private var editingZIP: Bool
  private var shownOffices: [DirectoryOffice] {
    if let selectedID, let selected = model.offices.first(where: { $0.id == selectedID }) {
      return [selected] + model.offices.filter { $0.id != selectedID }
    }
    return model.offices
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Text("A local office. A real person.").font(.largeTitle.bold())
        Text("Find a Gig Tax Pros office, get help, or arrange an appointment.").foregroundStyle(Brand.muted)
        NavigationLink { GettingStartedView() } label: { Label("Watch the getting-started video", systemImage: "play.circle.fill") }
          .accessibilityIdentifier("help.tour")
        if let support = model.directory?.support, support.callURL != nil || support.bookingURL != nil {
          VStack(alignment: .leading, spacing: 12) {
            Label(support.shows24x7 ? "Help by phone · 24/7" : "Talk to Gig Tax Pros", systemImage: "phone.fill").font(.headline)
            contact(support, prefix: "support")
          }.gigCard(highlight: true)
        }
        VStack(alignment: .leading, spacing: 12) {
          Button { model.locate() } label: { Label("Find offices near me", systemImage: "location.fill") }
            .buttonStyle(BrandActionStyle()).disabled(model.locating || model.searching).accessibilityIdentifier("help.locate")
          HStack {
            TextField("ZIP code", text: $zip).keyboardType(.numberPad).textContentType(.postalCode).focused($editingZIP)
              .padding(12).background(Brand.panel, in: RoundedRectangle(cornerRadius: 10)).accessibilityIdentifier("help.zip")
            Button("Search") { editingZIP = false; selectedID = nil; Task { await model.searchZIP(zip) } }
              .disabled(model.searching || model.locating).accessibilityIdentifier("help.search")
          }
          if model.locating || model.searching { ProgressView("Finding your area…") }
          if let error = model.locationError { Text(error).font(.footnote).foregroundStyle(Brand.caution).accessibilityIdentifier("help.location.error") }
        }
        Map(position: $camera, selection: $selectedID) {
          ForEach(model.offices) { office in
            Marker(office.name, systemImage: "building.2.fill", coordinate: coordinate(office.coordinate)).tint(Brand.pink).tag(office.id)
          }
          if let point = model.point {
            Annotation("Search area", coordinate: coordinate(point)) { Image(systemName: "location.circle.fill").font(.title).foregroundStyle(Brand.route) }
          }
        }.mapStyle(.standard(elevation: .flat)).frame(height: 280).clipShape(RoundedRectangle(cornerRadius: 20))
          .accessibilityIdentifier("help.map")
        if model.loading { ProgressView("Updating office details…") }
        if let error = model.error { Text(error).font(.subheadline).foregroundStyle(Brand.caution).accessibilityIdentifier("help.directory.error") }
        if model.offices.isEmpty && !model.loading {
          VStack(alignment: .leading, spacing: 10) {
            Text("New offices are joining the network").font(.headline)
            Text("Confirmed locations, contact numbers and appointment options will appear here as offices join. Pull down to refresh.")
          }.gigCard().accessibilityIdentifier("help.empty")
        } else if let area = model.areaLabel {
          Text("Offices nearest \(area) · Straight-line miles").font(.footnote).foregroundStyle(Brand.muted)
        }
        ForEach(shownOffices) { office in officeCard(office) }
        if let date = model.refreshedAt { Text("Updated \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(Brand.muted) }
        Link("Visit GigTax.pro", destination: WorkspaceClient.websiteURL).accessibilityIdentifier("help.website")
        Text("Distance sorting happens on your phone. Apple Maps receives map areas, ZIP searches and directions you request. Your search location is not saved to your tax records.")
          .font(.footnote).foregroundStyle(Brand.muted)
      }.padding(20).frame(maxWidth: 620).frame(maxWidth: .infinity)
    }.driverScreen().navigationTitle("Get help").navigationBarTitleDisplayMode(.inline)
      .task { await model.refresh() }.refreshable { await model.refresh() }
      .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await model.refresh() } } }
      .onChange(of: model.point) { _, _ in selectedID = nil; centerMap() }
      .onChange(of: model.directory?.updatedAt) { _, _ in
        if !model.offices.contains(where: { $0.id == selectedID }) { selectedID = nil }
        centerMap()
      }
      .onDisappear { model.cancelLocation() }
      .toolbar {
        ToolbarItem(placement: .keyboard) { Button("Done") { editingZIP = false }.accessibilityIdentifier("help.dismissKeyboard") }
        ToolbarItem(placement: .topBarTrailing) {
          Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise") }
            .accessibilityLabel("Refresh office directory").accessibilityIdentifier("help.refresh").disabled(model.loading)
        }
      }
  }
  private func officeCard(_ office: DirectoryOffice) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(office.name).font(.title3.bold())
      Text(office.fullAddress)
      OfficeExteriorView(office: office).id("\(office.id)|\(office.latitude)|\(office.longitude)")
      if let point = model.point { Text(String(format: "%.1f miles away · straight-line", point.miles(to: office.coordinate))).font(.footnote).foregroundStyle(Brand.muted) }
      if office.contact.shows24x7 { Label("Phone help available 24/7", systemImage: "phone.fill").foregroundStyle(Brand.income) }
      contact(office.contact, prefix: "office.\(office.id)")
      Button {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate(office.coordinate))); item.name = office.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
      } label: { Label("Get directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
        .accessibilityIdentifier("help.directions.\(office.id)")
    }.gigCard(highlight: office.id == selectedID).accessibilityIdentifier("help.office.\(office.id)")
  }
  @ViewBuilder private func contact(_ contact: OfficeContact, prefix: String) -> some View {
    if !contact.hours.isEmpty { Text(contact.hours).font(.subheadline).foregroundStyle(Brand.muted) }
    if let url = contact.callURL {
      Link(destination: url) { Label("Call \(contact.phone)", systemImage: "phone.fill") }
        .accessibilityIdentifier("help.call.\(prefix)")
    }
    if let url = contact.bookingURL {
      Link(destination: url) { Label("Book an appointment", systemImage: "calendar.badge.plus") }
        .accessibilityIdentifier("help.book.\(prefix)")
    } else if contact.callURL != nil { Text("Call to arrange an appointment.").font(.footnote).foregroundStyle(Brand.muted) }
  }
  private func coordinate(_ point: OfficeCoordinate) -> CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude) }
  private func centerMap() {
    if let point = model.point {
      var rect = MKMapRect(origin: MKMapPoint(coordinate(point)), size: MKMapSize(width: 1, height: 1))
      for office in model.offices.prefix(3) { rect = rect.union(MKMapRect(origin: MKMapPoint(coordinate(office.coordinate)), size: MKMapSize(width: 1, height: 1))) }
      let margin = max(20_000, max(rect.width, rect.height) * 0.2)
      camera = .rect(rect.insetBy(dx: -margin, dy: -margin))
    } else if !model.offices.isEmpty { camera = .automatic }
  }
}

struct OfficeHelpCard: View {
  var body: some View {
    NavigationLink { OfficeHelpView() } label: {
      HStack(spacing: 14) {
        Image(systemName: "map.fill").font(.title2).foregroundStyle(Brand.pink)
        VStack(alignment: .leading, spacing: 4) {
          Text("Find an office & get help").font(.headline)
          Text("Locations · Phone help · Appointments").font(.caption).foregroundStyle(Brand.muted)
        }
        Spacer(); Image(systemName: "chevron.right")
      }.gigCard()
    }.buttonStyle(.plain).accessibilityIdentifier("help.open")
  }
}
