import DriverCore
import SwiftUI

struct GigConnectionsView: View {
  var body: some View {
    Form {
      Section("Copilot mode") {
        Label("You make the final offer decision", systemImage: "person.crop.circle.badge.checkmark")
        Text("Review recommendations here, then return to the gig app to accept or decline. No provider has an authorized acceptance integration configured.").font(.footnote)
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
                Text("Live offers, account status & acceptance API: unavailable").font(.caption2).foregroundStyle(Brand.muted)
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
