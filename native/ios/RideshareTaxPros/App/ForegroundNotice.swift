import DriverCore
import SwiftUI

/// Foreground notices are app content. Notification permissions remain owned by iOS.
struct ForegroundNoticeView: View {
  let hostID: UUID
  @EnvironmentObject private var model: DriverModel
  @ObservedObject private var notifications = DriverRuntime.shared.notifications
  @State private var review: ForegroundNoticeReview?

  var body: some View {
    Group {
      if notifications.foregroundHostID == hostID, let notice = notifications.foregroundNotice,
         notice.scope == nil || notice.scope == model.journalScope {
        noticeCard(notice).padding(.horizontal, 12).padding(.top, 8)
          .frame(maxWidth: 620).accessibilityIdentifier("notice.foreground")
      }
    }
    .sheet(item: $review) { target in
      NavigationStack {
        Group {
          if target.scope != model.journalScope {
            ContentUnavailableView("Notice unavailable", systemImage: "person.crop.circle.badge.exclamationmark",
              description: Text("This notice belongs to another account."))
          } else if let offerID = target.offerID {
            if let offer = matchingOffer(offerID),
               let row = DispatchPlanner.rank([offer], profile: model.offerProfitProfile,
                 preferences: nil, routes: [:], commitments: model.journal.gigCommitments ?? []).first {
              GigOfferDetailView(recommendation: row, profile: model.offerProfitProfile)
            } else {
              ContentUnavailableView("Offer unavailable", systemImage: "bolt.slash.fill",
                description: Text("This offer is no longer in the saved inbox. Check the provider app for current availability."))
                .driverScreen()
            }
          } else {
            DriverAlertsView()
          }
        }.toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button("Done") { review = nil }.accessibilityIdentifier("notice.review.close")
          }
        }
      }.environmentObject(model)
    }
    .onChange(of: model.journalScope) { _, _ in review = nil }
  }

  private func noticeCard(_ notice: ForegroundDriverNotice) -> some View {
    let style = presentation(notice)
    return VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 10) {
        Image("BrandMark").resizable().scaledToFit().frame(width: 30, height: 30)
          .accessibilityHidden(true)
        Text("GIG TAX PROS").font(.caption2.bold()).tracking(1.2).foregroundStyle(Brand.link)
        Spacer(minLength: 8)
        Image(systemName: style.icon).font(.headline).foregroundStyle(style.accent).accessibilityHidden(true)
      }
      Text(notice.title).font(.headline).foregroundStyle(.white).fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      if !notice.body.isEmpty {
        Text(notice.body).font(.subheadline).foregroundStyle(Brand.muted)
          .lineLimit(3).fixedSize(horizontal: false, vertical: true)
      }
      HStack(spacing: 12) {
        if notice.scope == model.journalScope, notice.alertID != nil || notice.offerID != nil {
          Button(notice.offerID == nil ? "Review alert" : "Review offer") { openReview(notice) }
            .buttonStyle(BrandActionStyle()).accessibilityIdentifier("notice.review")
        }
        Button("Dismiss") { dismiss(notice) }.buttonStyle(BrandActionStyle(primary: false))
          .accessibilityIdentifier("notice.dismiss")
      }
    }.gigCard(highlight: true, inset: 16, accent: style.accent)
      .shadow(color: .black.opacity(0.4), radius: 18, y: 8)
      .accessibilityElement(children: .contain)
  }

  private func dismiss(_ notice: ForegroundDriverNotice) {
    if notifications.foregroundNotice?.id == notice.id { notifications.foregroundNotice = nil }
  }
  private func openReview(_ notice: ForegroundDriverNotice) {
    guard let scope = notice.scope, scope == model.journalScope else { return }
    if notice.offerID != nil { model.refreshCapturedOffers() }
    review = ForegroundNoticeReview(id: notice.id, scope: scope, offerID: notice.offerID)
    dismiss(notice)
  }
  private func matchingOffer(_ id: UUID) -> UniversalGigOffer? {
    model.journal.gigOffers?.first(where: { $0.id == id }) ?? model.journal.gigOffers?.offer(capturedAs: id)
  }
  private func presentation(_ notice: ForegroundDriverNotice) -> (icon: String, accent: Color) {
    if notice.title == "Action needs attention" { return ("exclamationmark.triangle.fill", Brand.danger) }
    switch notice.category {
    case "startTrip", "endTrip": return ("car.fill", Brand.route)
    case "classifyTrip": return ("tag.fill", Brand.caution)
    case "tripFare": return ("dollarsign.circle.fill", Brand.income)
    case "expense": return ("receipt.fill", Brand.expense)
    case "gig.offer", "gig.offer.review": return ("bolt.fill", Brand.caution)
    default: return ("bell.badge.fill", Brand.link)
    }
  }
}

private struct ForegroundNoticeReview: Identifiable {
  let id: String
  let scope: String
  let offerID: UUID?
}
