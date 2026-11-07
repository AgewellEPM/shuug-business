import DriverCore
import PhotosUI
import ReplayKit
import SwiftUI

struct OfferReaderView: View {
  var startingPlatform: GigPlatform? = nil
  @EnvironmentObject private var model: DriverModel
  @State private var platform: GigPlatform = .doorDash
  @State private var fees = ""
  @State private var wait = ""
  @State private var active = false
  @State private var busy = false
  @State private var photo: PhotosPickerItem?
  @State private var observations: [CapturedOfferEnvelope] = []
  @State private var notice = "Enable reading once, then start screen sharing with Apple’s button below."
  @FocusState private var editing: Bool
  var body: some View {
    Form {
      Section("Should I take this job?") {
        Text("Read a visible offer, check its estimated profit, then make the actual decision in your gig app.").font(.headline)
        Text("Payout − fees − total miles × your vehicle cost. Pickup, waiting and unpaid travel matter. Home direction stays unknown until the drop-off and route are checked.").font(.footnote)
        NavigationLink("Set hourly target & vehicle cost") { InsightsView() }
        NavigationLink("Offer Capture Diagnostics") { OfferCaptureDiagnosticsView() }
      }
      Section("Your offer assumptions") {
        Picker("Gig app", selection: $platform) { ForEach(GigPlatform.allCases) { Text($0.rawValue).tag($0) } }
        TextField("Fees per offer ($; enter 0 only if known)", text: $fees).keyboardType(.decimalPad).focused($editing)
        TextField("Expected pickup wait (minutes)", text: $wait).keyboardType(.decimalPad).focused($editing)
        Text("These are your estimates. Visible miles and time must cover the entire job; screen reading cannot verify missing stops or fees.").font(.footnote)
        Button(active ? "Update reader for this shift" : "Enable reader for this shift") { enable() }.disabled(busy || !model.storageHealthy)
        if active { Button("Stop offer reading", role: .destructive) { OfferCaptureStore.deactivate(); active = false; notice = "Reading is off. Apple’s screen-sharing indicator stops when the broadcast ends." } }
      }
      Section("Read the shared screen") {
        Text("Apple’s screen-sharing picker lets you choose Gig Tax Pros Offer Reader. Start it yourself, then open the chosen gig app. Apple shows a recording indicator while sharing.").font(.footnote)
        OfferBroadcastPicker().frame(height: 54).disabled(!active)
        Text("Only visible offer text can be read. The selected platform must be identifiable on screen. Hidden offers, protected screens and other apps’ private notification inboxes are unavailable.").font(.footnote)
        Text(notice).font(.footnote).foregroundStyle(Brand.link)
      }
      Section("Screenshot fallback") {
        PhotosPicker("Choose an offer screenshot", selection: $photo, matching: .images)
          .disabled(!active || busy)
        Text("The chosen screenshot is processed on this device. Images and full screen transcripts are not saved or uploaded. A screenshot may show an expired offer.").font(.footnote)
      }
      Section("Offers seen on this phone") {
        if observations.isEmpty { Text("No readable offers yet. Complete details can be compared; missing fields stay unknown.") }
        ForEach(observations, id: \.offer.id) { envelope in
          let offer = envelope.offer
          VStack(alignment: .leading, spacing: 8) {
            Text("\(offer.platform.rawValue) · \(offer.payoutCents.map(Brand.usd) ?? "Payout unknown")").font(.headline)
            Text("\(offer.displayedMiles.map { String(format: "%.1f mi shown", $0) } ?? "Miles unknown") · \(offer.displayedMinutes.map { String(format: "%.0f min shown", $0) } ?? "Time unknown")")
            Text("Read \(offer.observedAt.formatted(date: .omitted, time: .shortened)) · \(offer.source == .screenShare ? "Shared screen" : "Chosen screenshot")").font(.caption)
            if let session = OfferCaptureStore.session(), let estimate = offer.estimate(session: session) {
              Text("\(Brand.usd(estimate.netCents)) estimated net · \(Brand.usd(Int(estimate.hourlyCents.rounded())))/active hour")
              Text(estimate.meetsGoal ? "Meets your entered pay target; destination impact unknown." : "Below your entered pay target.").font(.footnote)
              Button("Confirm total miles/time & save comparison") {
                do { try DriverRuntime.shared.notifications.confirmObservedOffer(offer.id, sessionId: envelope.sessionId, scope: envelope.scope); refresh() }
                catch { notice = error.localizedDescription }
              }.disabled(!offer.isFresh() || model.journal.observedOffers?.contains(where: { $0.id == offer.id && $0.comparisonSavedAt != nil }) == true)
            }
            if !offer.isFresh() { Text("This observation is older than 60 seconds. Review the current offer in its app.").font(.caption).foregroundStyle(.orange) }
          }
        }
      }
      Section("Your control") {
        Text("Reading lasts up to four hours and ends when you stop it or change accounts. Shared screens can include sensitive information: stop sharing before opening banking, messages or passwords. Only parsed offer fields are kept locally. No gig is accepted or declined automatically.").font(.footnote)
        Text("Screen sharing requires a physical iPhone. It is unavailable in Apple’s Simulator. Initial permissions, screen-sharing setup and receipt photos use the app or Apple’s system screens.").font(.footnote)
      }
    }.driverScreen().navigationTitle("Offer reader")
      .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { editing = false } } }
      .onAppear {
        if let session = OfferCaptureStore.session(), session.scope == model.journalScope {
          active = true; platform = startingPlatform ?? session.platform
          fees = session.feesCents.map { String(format: "%.2f", Double($0) / 100) } ?? ""
          wait = session.waitMinutes.map { String($0) } ?? ""
        } else if let startingPlatform { platform = startingPlatform }
        refresh()
      }
      .task {
        while !Task.isCancelled {
          refresh()
          do { try await Task.sleep(for: .seconds(2)) } catch { break }
        }
      }
      .onChange(of: photo) { _, value in
        guard let value else { return }
        busy = true
        Task {
          defer { busy = false }
          do {
            guard let session = OfferCaptureStore.session(), session.scope == model.journalScope,
              let bytes = try await value.loadTransferable(type: Data.self) else { throw DriverAlertError.unavailable }
            let parsed = try await Task.detached {
              let image = try OfferOCR.image(from: bytes)
              return try ParsedOfferCapture.read(OfferOCR.text(in: image), platform: session.platform, source: .sharedScreenshot)
            }.value
            try OfferCaptureStore.save(parsed.observation, session: session, normalized: parsed.normalized)
            notice = "Screenshot read. Check the extracted fields and the offer’s availability before confirming."
            refresh()
          } catch { notice = error.localizedDescription }
        }
      }
  }
  private func enable() {
    let feeText = fees.trimmingCharacters(in: .whitespacesAndNewlines)
    let waitText = wait.trimmingCharacters(in: .whitespacesAndNewlines)
    let cents = feeText.isEmpty ? nil : StatementImport.signedCents(feeText)
    let minutes = waitText.isEmpty ? nil : Double(waitText)
    guard feeText.isEmpty || cents.map({ $0 >= 0 }) == true,
      waitText.isEmpty || minutes.map({ $0.isFinite && (0...240).contains($0) }) == true else {
      notice = "Check the entered fee and wait estimates."; return
    }
    do {
      try OfferCaptureStore.activate(OfferReaderSession(scope: model.journalScope, platform: platform,
        feesCents: cents, waitMinutes: minutes, goals: model.journal.goals ?? DriverGoals()))
      active = true; editing = false
      notice = "Reader ready. Start screen sharing below, or choose a screenshot."
      Task { await DriverRuntime.shared.notifications.requestPermission() }
    } catch { notice = error.localizedDescription }
  }
  private func refresh() {
    observations = OfferCaptureStore.offers(scope: model.journalScope)
    if let session = OfferCaptureStore.session(), session.scope == model.journalScope,
      let status = OfferCaptureStore.status(), status.sessionId == session.id,
      status.scope == model.journalScope, Date().timeIntervalSince(status.updatedAt) < 15 { notice = status.message }
    active = OfferCaptureStore.session()?.scope == model.journalScope
  }
}

private struct OfferBroadcastPicker: UIViewRepresentable {
  func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
    let view = RPSystemBroadcastPickerView(frame: .zero)
    view.preferredExtension = OfferCaptureStore.extensionBundle
    view.showsMicrophoneButton = false
    view.accessibilityLabel = "Start or stop screen sharing for offers"
    return view
  }
  func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}
