import DriverCore
import SwiftUI

@MainActor private final class CaptureDiagnosticsMonitor: ObservableObject {
  @Published var captures: [CapturedOfferEnvelope] = []
  @Published var session: OfferReaderSession?
  @Published var status: OfferCaptureStatus?
  @Published var now = Date()
  func observe(_ model: DriverModel) async {
    while !Task.isCancelled {
      model.refreshCapturedOffers()
      captures = OfferCaptureStore.offers(scope: model.journalScope)
      session = OfferCaptureStore.session().flatMap { $0.scope == model.journalScope ? $0 : nil }
      status = OfferCaptureStore.status().flatMap {
        $0.scope == model.journalScope && $0.sessionId == session?.id ? $0 : nil
      }
      now = Date()
      do { try await Task.sleep(for: .seconds(2)) } catch { break }
    }
  }
  func report(_ platform: GigPlatform, model: DriverModel) -> GigCaptureDiagnosticReport {
    OfferCaptureDiagnostics.evaluate(platform: platform, captures: captures.filter { $0.scope == model.journalScope }.map(\.normalizedOffer),
      journalOffers: model.journal.gigOffers ?? [], profile: model.offerProfitProfile,
      routeEvidence: model.offerRouteEvidence, commitments: model.journal.gigCommitments ?? [], now: now)
  }
}

struct OfferCaptureDiagnosticsView: View {
  @EnvironmentObject private var model: DriverModel
  @StateObject private var monitor = CaptureDiagnosticsMonitor()
  var body: some View {
    List {
      Section {
        Label("Check each app separately", systemImage: "waveform.path.ecg").font(.headline).foregroundStyle(Brand.link)
        Text("See provider access, captured offers, readable fields and the evidence Shuug needs for advice. Each app has its own results.").font(.footnote)
      }
      Section("Apps on your dashboard") {
        ForEach(GigPlatform.allCases) { platform in
          let report = monitor.report(platform, model: model)
          NavigationLink { CapturePlatformDiagnostics(platform: platform) } label: {
            HStack(spacing: 12) {
              GigPlatformIcon(platform: platform, size: 40)
              VStack(alignment: .leading, spacing: 5) {
                GigPlatformWordmark(platform: platform, width: 100, height: 22)
                Text("Provider: \(connectionLabel(report.connection))").font(.caption).foregroundStyle(Brand.muted)
                Text(report.latestCapture == nil ? "No captured offer saved" : "Offer detected · \(report.capturedOfferCount) saved captures")
                  .font(.caption).foregroundStyle(report.latestCapture == nil ? Brand.muted : Brand.link)
                Text(report.sufficientForRecommendation ? "Shuug: enough evidence for advice" : "Shuug: more evidence needed")
                  .font(.caption2).foregroundStyle(report.sufficientForRecommendation ? .green : .orange)
              }
            }.padding(.vertical, 5)
          }.accessibilityIdentifier("capture.platform.\(platform.rawValue)")
        }
      }
      Section("What this verifies") {
        Text("A saved capture confirms that some visible offer fields were read under the selected platform. A screenshot’s source app and current availability still need your review. Reading one app does not verify another.").font(.footnote)
        Text("Manual offers and the sample shift do not count as detected offers. Full screenshots and screen transcripts are not stored.").font(.footnote)
        Text("Screen sharing is tested on a physical iPhone. Simulator checks cover the app and chosen-image path.").font(.caption).foregroundStyle(Brand.muted)
      }
    }.driverScreen().navigationTitle("Capture diagnostics").navigationBarTitleDisplayMode(.inline)
      .task(id: model.journalScope) { await monitor.observe(model) }
  }
}

private struct CapturePlatformDiagnostics: View {
  let platform: GigPlatform
  @EnvironmentObject private var model: DriverModel
  @StateObject private var monitor = CaptureDiagnosticsMonitor()
  private var report: GigCaptureDiagnosticReport { monitor.report(platform, model: model) }
  private var readerSelected: Bool { monitor.session?.platform == platform && monitor.session?.scope == model.journalScope }
  private var currentStatus: OfferCaptureStatus? {
    monitor.status.flatMap { $0.scope == model.journalScope && $0.platform == platform && (0...15).contains(monitor.now.timeIntervalSince($0.updatedAt)) ? $0 : nil }
  }
  var body: some View {
    List {
      Section {
        HStack(spacing: 14) {
          GigPlatformIcon(platform: platform, size: 52)
          GigPlatformWordmark(platform: platform, width: 150, height: 34)
        }.padding(.vertical, 5)
      }
      Section("1 · Connection & capture") {
        LabeledContent("Provider account", value: connectionLabel(report.connection)).accessibilityIdentifier("capture.connection")
        LabeledContent("Reader for this shift", value: readerSelected ? "Enabled for \(platform.rawValue)" : "Not selected")
        LabeledContent("Screen sharing", value: sharingLabel)
        if let status = currentStatus { Text(status.message).font(.caption).foregroundStyle(Brand.muted) }
        if let frame = currentStatus?.lastFrameAt { LabeledContent("Last processed frame", value: frame.formatted(date: .omitted, time: .standard)) }
        Text("Provider access is unavailable for this app. Reader permission enables chosen captures; Apple starts screen sharing only when you request it.").font(.caption).foregroundStyle(Brand.muted)
        NavigationLink { OfferReaderView(startingPlatform: platform) } label: {
          Label("Test \(platform.rawValue) capture", systemImage: "viewfinder")
        }.accessibilityIdentifier("capture.test")
      }
      Section("2 · Actual offer detection") {
        LabeledContent("Detected offer", value: report.latestCapture == nil ? "None saved" : "Captured fields found")
          .accessibilityIdentifier("capture.detected")
        if let capture = report.latestCapture {
          LabeledContent("Source", value: sourceLabel(capture.source))
          LabeledContent("Last captured", value: capture.lastObservedAt.formatted(date: .abbreviated, time: .standard))
          LabeledContent("Capture freshness", value: capture.validForComparison(now: monitor.now) ? "Within 60-second review window" : "Stale or expired")
          LabeledContent("Platform attribution", value: capture.source == .screenShare ? "Selected platform visible in text" : "Platform selected by you")
          Text("Detection establishes readable fields, not an authenticated provider connection or an available job.").font(.caption).foregroundStyle(Brand.muted)
        }
      }
      if let capture = report.latestCapture {
        Section("3 · Fields from the capture") {
          ForEach(capturedFields(capture)) { field in
            LabeledContent(field.title, value: field.value ?? "Not extracted")
              .foregroundStyle(field.value == nil ? Brand.muted : .white)
          }
          LabeledContent("Currency · text or reader setting", value: capture.currency ?? "Unknown")
          Text("These values come from the retained capture before your manual edits. A displayed total does not establish complete job mileage or service time.").font(.caption).foregroundStyle(Brand.muted)
        }
      }
      Section("4 · Shuug recommendation") {
        LabeledContent("Enough evidence", value: report.sufficientForRecommendation ? "Yes · calculated for driver review" : "No · needs review")
          .accessibilityIdentifier("capture.recommendation")
        if let financial = report.financial {
          LabeledContent("Estimated cash after reserve", value: moneyRange(financial.availableCash))
          ForEach(financial.issues, id: \.rawValue) { Text(issueLabel($0)).font(.caption).foregroundStyle(.orange) }
        }
        ForEach(Array(report.blockers.enumerated()), id: \.offset) { _, reason in
          Label(reason, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.orange)
        }
        if report.sufficientForRecommendation, let row = report.recommendation {
          Text(recommendationTitle(row.kind)).font(.headline).foregroundStyle(Brand.link)
          ForEach(row.reasons, id: \.self) { Text($0).font(.footnote) }
        }
        if let offer = report.reviewedOffer, model.journal.gigOffers?.contains(where: { $0.id == offer.id }) == true {
          NavigationLink("Review this offer & its route") {
            let row = DispatchPlanner.rank([offer], profile: model.offerProfitProfile, preferences: nil,
              routes: [:], commitments: model.journal.gigCommitments ?? [], now: monitor.now)[0]
            GigOfferDetailView(recommendation: row, profile: model.offerProfitProfile)
          }.accessibilityIdentifier("capture.review")
        }
        Text("Complete, reviewed fields, fresh road estimates and your costs are required. Estimates can change; accept or decline in the original gig app.").font(.caption).foregroundStyle(Brand.muted)
      }
    }.driverScreen().navigationTitle("\(platform.rawValue) diagnostics").navigationBarTitleDisplayMode(.inline)
      .task(id: model.journalScope) { await monitor.observe(model) }
  }
  private var sharingLabel: String {
    guard readerSelected else { return "No active reader for this app" }
    guard let status = currentStatus else { return "No recent capture heartbeat" }
    switch status.phase {
    case "running": return status.lastFrameAt == nil ? "Started · awaiting frames" : "Frames received"
    case "paused": return "Paused"
    case "stopped": return "Stopped"
    default: return "Needs attention"
    }
  }
}

private func connectionLabel(_ connection: GigProviderConnection) -> String {
  switch connection { case .authorized: "Connected"; case .notConfigured: "Not configured"; case .unavailable: "Not connected · unavailable" }
}
private func sourceLabel(_ source: GigOfferSource) -> String {
  switch source {
  case .sharedScreenshot: "Chosen screenshot"
  case .sharedText: "Shared text"
  case .screenShare: "User-started screen sharing"
  case .notification: "Notification"
  case .authorizedAPI: "Authorized provider API"
  case .manual: "Manually entered"
  case .simulation: "Sample data"
  }
}
private struct CapturedDiagnosticField: Identifiable {
  var title: String, value: String?
  var id: String { title }
}
private func capturedFields(_ offer: UniversalGigOffer) -> [CapturedDiagnosticField] {
  func distance(_ value: Double?) -> String? { value.map { String(format: "%.2f mi", $0) } }
  func minutes(_ value: Double?) -> String? { value.map { String(format: "%g min", $0) } }
  return [
    .init(title: "Payout", value: offer.payoutCents.map(Brand.usd)),
    .init(title: "Guaranteed pay", value: offer.guaranteedPayoutCents.map(Brand.usd)),
    .init(title: "Pickup", value: offer.pickupLocation?.label),
    .init(title: "Drop-off", value: offer.dropoffLocation?.label),
    .init(title: "Pickup miles", value: distance(offer.pickupMiles)),
    .init(title: "Delivery miles", value: distance(offer.deliveryMiles)),
    .init(title: "Displayed total miles", value: distance(offer.displayedTotalMiles)),
    .init(title: "Complete working miles", value: offer.uncertainty.totalMiles.map { String(format: "%.2f–%.2f mi", $0.lower, $0.upper) }),
    .init(title: "Repositioning miles", value: distance(offer.repositionMiles)),
    .init(title: "Displayed duration", value: minutes(offer.estimatedMinutes)),
    .init(title: "Time coverage", value: offer.durationCoverage == .unknown ? nil : offer.durationCoverage == .allWorkingTime ? "All working time" : "Travel excludes wait"),
    .init(title: "Pickup/service wait", value: minutes(offer.waitMinutes)),
    .init(title: "Additional costs", value: offer.additionalCostsCents.map(Brand.usd)),
    .init(title: "Tip treatment", value: offer.tipTreatment == .unknown ? nil : offer.tipTreatment == .includedInQuote ? "Included in quote" : "Separate from quote"),
    .init(title: "Expiration", value: offer.expiresAt?.formatted(date: .abbreviated, time: .standard))
  ]
}
