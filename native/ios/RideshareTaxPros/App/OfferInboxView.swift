import DriverCore
import SwiftUI

struct OfferInboxView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var sample = false
  @State private var entering = false
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack {
          VStack(alignment: .leading, spacing: 4) {
            Text("YOUR NEXT MOVE").font(.caption.weight(.semibold)).foregroundStyle(Brand.link)
            Text("Incoming offers").font(.system(size: 29, weight: .bold, design: .rounded))
          }
          Spacer()
          NavigationLink { GigConnectionsView() } label: { Image(systemName: "slider.horizontal.3").font(.title3).padding(10) }
            .accessibilityLabel("Offer settings and platforms")
        }
        Text("Compare observed offers across your gig apps. Availability is checked in the original app.")
          .font(.caption).foregroundStyle(Brand.muted)
        HStack {
          NavigationLink { OfferReaderView() } label: { Label("Read an offer", systemImage: "viewfinder") }
          Button { entering = true } label: { Label("Enter", systemImage: "plus") }.accessibilityIdentifier("offers.enter")
        }.buttonStyle(BrandActionStyle(primary: false))
        NavigationLink { OfferCaptureDiagnosticsView() } label: {
          Label("Offer Capture Diagnostics", systemImage: "waveform.path.ecg")
        }.font(.footnote).accessibilityIdentifier("offers.diagnostics")
        ActiveGigWorkCard()
        TimelineView(.periodic(from: .now, by: 5)) { context in
          let rows = DispatchPlanner.rank(model.journal.gigOffers ?? [], profile: model.offerProfitProfile,
            preferences: nil, routes: [:], commitments: model.journal.gigCommitments ?? [], now: context.date)
          if rows.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              Image(systemName: "bolt.badge.clock").font(.largeTitle).foregroundStyle(Brand.pink)
              Text("Your next offer starts here.").font(.title2.bold())
              Text("Share a screenshot or text, or enter an offer while parked. Missing information stays visible for review.").font(.subheadline).foregroundStyle(Brand.muted)
              Button("Explore a sample shift") { sample = true }.accessibilityIdentifier("offers.sample")
            }.gigCard(highlight: true)
          } else {
            ForEach(rows) { row in
              NavigationLink { GigOfferDetailView(recommendation: row, profile: model.offerProfitProfile) } label: { UnifiedOfferCard(row: row) }
                .buttonStyle(.plain)
            }
          }
        }
        Button("View simulated multi-platform offers") { sample = true }.font(.footnote)
      }.padding(16)
    }.driverScreen().navigationTitle("Offers").navigationBarTitleDisplayMode(.inline)
      .sheet(isPresented: $sample) { SampleShiftView(initialTab: 1) }
      .sheet(isPresented: $entering) { NavigationStack { GigOfferEditor(offer: UniversalGigOffer(platform: .doorDash, source: .manual)) } }
      .task(id: model.journalScope) {
        while !Task.isCancelled {
          model.refreshCapturedOffers()
          do { try await Task.sleep(for: .seconds(2)) } catch { break }
        }
      }
  }
}

struct UnifiedOfferCard: View {
  let row: GigDispatchRecommendation
  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      HStack {
        GigPlatformIcon(platform: row.offer.platform, size: 32)
        GigPlatformWordmark(platform: row.offer.platform, width: 110, height: 24)
        Spacer()
        Text(row.offer.source == .simulation ? "SIMULATED" : "OBSERVED").font(.system(size: 10, weight: .bold)).foregroundStyle(Brand.link)
      }
      HStack(alignment: .firstTextBaseline) {
        Text(row.offer.payoutCents.map(Brand.usd) ?? "Unknown payout").font(.system(size: 35, weight: .bold, design: .rounded)).minimumScaleFactor(0.6).lineLimit(1)
        Spacer()
        Image(systemName: "chevron.right").foregroundStyle(Brand.pink)
      }
      HStack {
        DashboardMetric(title: "Cash after reserve", value: moneyRange(row.financial.availableCash), icon: "dollarsign.circle")
        DashboardMetric(title: "Per working hour", value: moneyRange(row.financial.effectiveHourly), icon: "clock")
      }
      Label(recommendationTitle(row.kind), systemImage: row.kind == .recommended ? "checkmark.circle.fill" : "info.circle")
        .font(.subheadline.bold()).foregroundStyle(row.kind == .recommended ? .green : Brand.link)
      if let reason = row.reasons.first { Text(reason).font(.caption).foregroundStyle(Brand.muted) }
    }.gigCard(highlight: row.kind == .recommended).foregroundStyle(.white)
      .accessibilityIdentifier("offer.card.\(row.offer.platform.rawValue)")
  }
}

func moneyRange(_ range: GigMoneyRange?) -> String {
  guard let range else { return "—" }
  return range.isPoint ? Brand.usd(range.lowerCents) : "\(Brand.usd(range.lowerCents))–\(Brand.usd(range.upperCents))"
}
func recommendationTitle(_ kind: GigRecommendationKind) -> String {
  switch kind { case .recommended: "Fits your trip home"; case .tradeoff: "Profitable, with a route tradeoff"; case .needsReview: "Review before deciding"; case .skip: "Skip this opportunity" }
}

struct GigOfferDetailView: View {
  let recommendation: GigDispatchRecommendation, profile: GigProfitProfile
  @EnvironmentObject private var model: DriverModel
  @State private var editing = false
  @State private var notice: String?
  private var offer: UniversalGigOffer {
    recommendation.offer.source == .simulation ? recommendation.offer : model.journal.gigOffers?.first { $0.id == recommendation.id } ?? recommendation.offer
  }
  var body: some View {
    let financial = OfferProfitabilityEngine.assess(offer, profile: profile)
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 12) {
          GigPlatformIcon(platform: offer.platform, size: 42)
          GigPlatformWordmark(platform: offer.platform, width: 140, height: 30)
        }
        Text(offer.source == .simulation ? "SIMULATED OFFER · PAUSED SCENARIO" : "OBSERVED OFFER · RECHECK AVAILABILITY")
          .font(.caption.bold()).foregroundStyle(Brand.link)
        Text(offer.payoutCents.map(Brand.usd) ?? "Payout unknown").font(.system(size: 47, weight: .bold, design: .rounded))
        VStack(spacing: 12) {
          line("Vehicle operating cost", moneyRange(financial.vehicleCost))
          line("Additional costs", offer.additionalCostsCents.map(Brand.usd) ?? "Unknown")
          Divider()
          line("Profit before reserve", moneyRange(financial.profitBeforeReserve))
          line("Planning reserve (\(profile.taxReserveBasisPoints / 100)%)", moneyRange(financial.reserve))
          line("Estimated available cash", moneyRange(financial.availableCash)).foregroundStyle(Brand.pink)
          line("Effective hourly earnings", moneyRange(financial.effectiveHourly))
          Text("Vehicle costs are counted once. A reserve is money set aside, not a tax calculation. Ranges reflect entered uncertainty.").font(.caption2).foregroundStyle(Brand.muted)
        }.gigCard(highlight: true)
        if !financial.issues.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            Text("What needs review").font(.headline)
            ForEach(financial.issues, id: \.rawValue) { issue in Text(issueLabel(issue)).font(.caption) }
          }.gigCard()
        }
        if offer.source == .simulation {
          journeyCard
          Text("All offers, routes and earnings here are examples. Return to your data to analyze a real offer.").font(.caption).foregroundStyle(Brand.muted)
        } else {
          Button("Review extracted fields") { editing = true }.buttonStyle(BrandActionStyle(primary: false))
          NavigationLink { GigOfferRouteView(offer: offer, profile: profile) } label: { Label("Compare the full route home", systemImage: "point.topleft.down.to.point.bottomright.curvepath") }.buttonStyle(BrandActionStyle())
          Text("Use the app switcher to return to \(offer.platform.rawValue) and accept or decline there. Gig Tax Pros records your advice choices locally.").font(.footnote).foregroundStyle(Brand.muted)
          HStack {
            Button("Keep advice") { if model.decide(.consider, offer: offer) { notice = "Advice saved on this iPhone." } }
            Button("Skip advice") { if model.decide(.skipAdvice, offer: offer) { notice = "Advice skipped. The offer in your gig app is unchanged." } }
          }.buttonStyle(BrandActionStyle(primary: false))
          GigWorkActions(offer: offer)
        }
        if let notice { Text(notice).font(.footnote).foregroundStyle(Brand.link) }
      }.padding(16)
    }.driverScreen().navigationTitle(offer.platform.rawValue)
      .sheet(isPresented: $editing) { NavigationStack { GigOfferEditor(offer: offer) } }
  }
  private var journeyCard: some View {
    let result = recommendation.destination
    return VStack(alignment: .leading, spacing: 12) {
      Label(recommendationTitle(recommendation.kind), systemImage: "house.fill").font(.headline).foregroundStyle(Brand.pink)
      if let value = result.additionalMiles { line("Miles versus going directly", String(format: "%+.1f to %+.1f mi", value.lower, value.upper)) }
      if let value = result.additionalMinutes { line("Additional travel time", String(format: "%+.0f to %+.0f min", value.lower, value.upper)) }
      line("Extra cash versus going directly", moneyRange(result.incrementalAvailableCash))
      if let arrival = result.latestArrival { line("Latest estimated arrival", arrival.formatted(date: .omitted, time: .shortened)) }
      ForEach(result.reasons, id: \.self) { Text($0).font(.caption).foregroundStyle(Brand.muted) }
    }.gigCard()
  }
  private func line(_ title: String, _ value: String) -> some View {
    HStack(alignment: .firstTextBaseline) { Text(title).font(.subheadline); Spacer(); Text(value).font(.subheadline.weight(.semibold)).multilineTextAlignment(.trailing) }
  }
}

func issueLabel(_ issue: GigProfitIssue) -> String {
  switch issue {
  case .unsupportedCurrency: "Only confirmed USD offers can be compared with this cost profile."
  case .invalidAmount: "Check payout, tips, the hourly goal and reserve settings."
  case .missingVehicleCost: "Enter your vehicle's operating cost per mile."
  case .missingMiles: "Confirm all pickup, delivery and necessary unpaid miles."
  case .missingWorkingTime: "Confirm total working time, including pickup and repositioning."
  case .missingWait: "Enter the expected pickup wait or a complete working-time estimate."
  case .missingAdditionalCosts: "Enter additional costs, including 0 only when known."
  case .uncertainTips: "Pay may change because tips or guarantees are uncertain."
  case .uncertainMileage: "Mileage is an entered range."
  case .uncertainTravelTime: "Travel or waiting time is an entered range."
  case .unknownPayGuarantee: "The minimum guaranteed pay is unknown."
  case .uncertainThreshold: "The range crosses your earnings target or break-even point."
  }
}
