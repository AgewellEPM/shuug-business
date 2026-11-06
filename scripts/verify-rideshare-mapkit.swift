// Compile with `swiftc -parse-as-library -framework MapKit scripts/verify-rideshare-mapkit.swift -o /private/tmp/rtp-mapkit-probe`.
// Run with a bounded timeout; this uses public synthetic landmarks, never a user's location.
import Foundation
import MapKit

@main struct Probe {
  static func main() async {
    let points = [(47.6097, -122.3331), (47.6205, -122.3493), (47.6491, -122.3502)]
    let legs = [(0,2), (0,1), (1,2)]
    do {
      for (a,b) in legs {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: points[a].0, longitude: points[a].1)))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: points[b].0, longitude: points[b].1)))
        request.transportType = .automobile
        guard let route = try await MKDirections(request: request).calculate().routes.first,
          route.distance > 0, route.expectedTravelTime > 0 else { throw NSError(domain: "Probe", code: 1) }
        print("leg \(a)->\(b): \(Int(route.distance)) m, \(Int(route.expectedTravelTime)) s")
      }
    } catch {
      print("MapKit route service did not return all three routes: \(error.localizedDescription)")
      exit(1)
    }
  }
}
