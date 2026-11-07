import DriverCore
import SwiftUI

struct GigWorkActions: View {
  let offer: UniversalGigOffer
  @EnvironmentObject private var model: DriverModel
  @State private var pending: GigDriverChoice?
  private var work: GigConfirmedWork? { model.journal.gigCommitments?.first { $0.offerId == offer.id } }
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Job status").font(.headline)
      if let work {
        Text(status(work.state)).font(.subheadline).foregroundStyle(Brand.link)
        if [.accepted, .inProgress].contains(work.state) {
          if work.state == .accepted { Button("Job started") { pending = .started } }
          HStack {
            Button("Job completed") { pending = .completed }.accessibilityIdentifier("work.complete")
            Button("Job canceled") { pending = .canceled }
          }
        }
      } else {
        Button("I accepted in the provider app") { pending = .acceptedInProvider }
          .accessibilityIdentifier("work.accepted")
      }
      Text("Your report reserves this time in the planner. Complete or cancel the job here when finished. Record actual earnings and mileage separately.")
        .font(.caption).foregroundStyle(Brand.muted)
    }.buttonStyle(BrandActionStyle(primary: false)).gigCard()
      .confirmationDialog("Confirm your job status", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
        if let pending {
          Button("Confirm") { model.decide(pending, offer: offer); self.pending = nil }
        }
        Button("Cancel", role: .cancel) { pending = nil }
      } message: {
        Text("This saves your report on this iPhone. Make any acceptance or cancellation in the provider app first.")
      }
  }
  private func status(_ state: GigCommitmentState) -> String {
    switch state {
    case .accepted: "Accepted · reported by you"
    case .inProgress: "In progress · reported by you"
    case .completed: "Completed · reported by you"
    case .canceled: "Canceled · reported by you"
    }
  }
}

struct ActiveGigWorkCard: View {
  @EnvironmentObject private var model: DriverModel
  private var active: [GigConfirmedWork] {
    (model.journal.gigCommitments ?? []).filter { [.accepted, .inProgress].contains($0.state) }
  }
  var body: some View {
    if !active.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        Label("Accepted work", systemImage: "briefcase.fill").font(.headline).accessibilityIdentifier("work.active")
        Text("Conflicting offers stay blocked until you finish or cancel these jobs.").font(.caption).foregroundStyle(Brand.muted)
        ForEach(active) { work in
          DisclosureGroup(work.platform.rawValue) { GigWorkActions(offer: displayOffer(work)) }
        }
      }.gigCard(highlight: true)
    }
  }
  private func displayOffer(_ work: GigConfirmedWork) -> UniversalGigOffer {
    if let offer = model.journal.gigOffers?.first(where: { $0.id == work.offerId }) { return offer }
    var offer = UniversalGigOffer(platform: work.platform, source: .manual, receivedAt: work.startsAt)
    offer.offerId = work.offerId
    return offer
  }
}
