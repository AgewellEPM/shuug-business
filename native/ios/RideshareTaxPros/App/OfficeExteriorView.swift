import DriverCore
import MapKit
import SwiftUI

struct OfficeExteriorView: View {
  let office: DirectoryOffice
  @State private var scene: MKLookAroundScene?
  @State private var loading = false
  @State private var checked = false
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let url = office.exteriorURL {
        AsyncImage(url: url) { phase in
          if let image = phase.image {
            image.resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: 280)
              .clipShape(RoundedRectangle(cornerRadius: 14))
              .accessibilityLabel("Exterior photo of \(office.name)")
          } else if phase.error != nil { Text("The office exterior photo could not load.").font(.footnote).foregroundStyle(Brand.muted) }
          else { ProgressView("Loading office exterior…").frame(maxWidth: .infinity, minHeight: 100) }
        }
      }
      if let scene {
        Text("Nearby street view · Apple Maps").font(.caption).foregroundStyle(Brand.muted)
        LookAroundPreview(initialScene: scene).frame(height: 220).clipShape(RoundedRectangle(cornerRadius: 14))
      } else if loading { ProgressView("Finding street view…") }
      else if checked { Text("Street view is unavailable here. Use the office photo and directions to find the entrance.").font(.footnote).foregroundStyle(Brand.muted) }
      else {
        Button {
          loading = true
          Task {
            scene = try? await MKLookAroundSceneRequest(coordinate: CLLocationCoordinate2D(latitude: office.latitude, longitude: office.longitude)).scene
            loading = false; checked = true
          }
        } label: { Label("See outside in street view", systemImage: "binoculars.fill") }
          .accessibilityIdentifier("help.exterior.\(office.id)")
      }
    }
  }
}
