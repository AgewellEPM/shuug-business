import DriverCore
import SwiftUI

struct GigConnectionsView: View {
  @EnvironmentObject private var model: DriverModel
  var body: some View {
    Form {
      Section("Copilot mode") {
        Label("You make the final offer decision", systemImage: "person.crop.circle.badge.checkmark")
        Text("Review recommendations here, then return to the gig app to accept or decline. No provider has an authorized acceptance integration configured.").font(.footnote)
      }
      Section("My connected accounts") {
        if let connection = model.connection,
          let url = URL(string: connection.portalURL.absoluteString + "#gig-connections") {
          Link("Uber account connection & imported history", destination: url)
          Text("Use your client profile to authorize the firm’s approved Uber connection and review imported provider records. Bank deposits and your tax journal remain separate until reviewed.")
            .font(.footnote)
        } else {
          Text("Connect your invited client account in Your account to manage provider authorizations.")
        }
      }
      Section("Gig platforms") {
        NavigationLink("Offer Capture Diagnostics") { OfferCaptureDiagnosticsView() }
        ForEach(GigPlatform.allCases) { platform in
          NavigationLink { OfferReaderView(startingPlatform: platform) } label: {
            HStack(spacing: 12) {
              GigPlatformIcon(platform: platform, size: 42)
              VStack(alignment: .leading, spacing: 6) {
                GigPlatformWordmark(platform: platform, width: 120, height: 24)
                Text("Screenshot / shared text · Optional screen sharing").font(.caption)
                Text(platform == .uber ? "Offer reading · Driver account sync through your client profile" : "Offer reading · No authorized account connector configured").font(.caption2).foregroundStyle(Brand.muted)
              }
            }
          }
        }
      }
      Section("Costs and reserves") {
        NavigationLink("Vehicle cost & hourly goals") { GoalsEditor() }
        NavigationLink("Planning reserves & history") { ReserveAndHistoryView() }
        Text("Offer cash estimates apply your tax reserve to profit after operating costs. Vehicle health savings are a separate allocation and are not charged as another operating cost.").font(.footnote)
      }
      Section("Permissions and control") {
        NavigationLink("Offer reading permissions") { OfferReaderView() }
        NavigationLink("Trip & expense alerts") { DriverAlertsView() }
        Text("Shared offers and decisions stay in protected storage on this iPhone. Full screenshots and transcripts are discarded. Stop reading in Offer reader or use Apple’s recording control to end screen sharing.").font(.footnote)
      }
    }.driverScreen().navigationTitle("Platforms & settings")
  }
}
