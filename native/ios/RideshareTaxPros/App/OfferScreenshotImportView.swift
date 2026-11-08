import DriverCore
import PhotosUI
import SwiftUI

/// A chosen image needs no broadcast session. Nothing is saved until review.
struct OfferScreenshotImportView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var platform: GigPlatform = .doorDash
  @State private var photo: PhotosPickerItem?
  @State private var draft: UniversalGigOffer?
  @State private var capture: ParsedOfferCapture?
  @State private var saved: UniversalGigOffer?
  @State private var busy = false
  @State private var error: String?
  @State private var requestID = UUID()
  @State private var showingResult = false
  var body: some View {
    Form {
      Section("Check a job from a screenshot") {
        Text("Park first. Pick the gig app, then choose a clear picture of its offer.")
        Picker("Gig app", selection: $platform) {
          ForEach(GigPlatform.allCases) { Text($0.rawValue).tag($0) }
        }.disabled(busy)
        PhotosPicker(selection: $photo, matching: .images) {
          Label("Choose screenshot", systemImage: "photo.badge.plus")
        }.disabled(busy || !model.storageHealthy).accessibilityIdentifier("screenshot.choose")
        if busy { ProgressView("Reading your screenshot…") }
        if let error { Text(error).foregroundStyle(Brand.caution) }
        Text("We read the picture on this phone. Review the numbers before saving. The picture and full text are not kept by Gig Tax Pros.").font(.footnote)
      }
      Section("What happens next") {
        Text("Check the pay, total miles, time and costs. Missing details stay blank. The app uses your vehicle cost and pay goal to make an estimate.").font(.footnote)
        NavigationLink("Set my vehicle cost & pay goal") { GoalsEditor() }
        Text("A picture can show an old job. Go back to the gig app to see if it is still there and make your choice.").font(.footnote)
      }
      Section { ScreenshotGuideButton() }
    }.driverScreen().navigationTitle("Choose screenshot")
      .task(id: photo) { await readSelectedPhoto() }
      .sheet(item: $draft, onDismiss: {
        if saved != nil { showingResult = true }
      }) { offer in
        NavigationStack {
          GigOfferEditor(offer: offer, onSave: { reviewed in
            saved = reviewed
            if let capture, capture.normalized.id == reviewed.id {
              do { try OfferCaptureStore.keepReviewedScreenshot(capture, scope: model.journalScope) }
              catch { model.message = "Your reviewed offer was saved. Its original read could not be kept for diagnostics." }
            }
          })
        }
      }
      .navigationDestination(isPresented: $showingResult) {
        if let saved, let row = DispatchPlanner.rank([saved], profile: model.offerProfitProfile,
          preferences: nil, routes: [:], commitments: model.journal.gigCommitments ?? []).first {
          GigOfferDetailView(recommendation: row, profile: model.offerProfitProfile)
        }
      }
      .onChange(of: model.journalScope) { _, _ in
        requestID = UUID(); photo = nil; draft = nil; capture = nil; saved = nil; error = nil
        showingResult = false; busy = false
      }
  }
  @MainActor private func readSelectedPhoto() async {
    guard let photo else { return }
    let request = UUID(), scope = model.journalScope, chosenPlatform = platform
    requestID = request; busy = true; error = nil; saved = nil; capture = nil
    defer { if requestID == request { busy = false; self.photo = nil } }
    do {
      guard let bytes = try await photo.loadTransferable(type: Data.self) else { throw DriverAlertError.unavailable }
      try Task.checkCancellation()
      let parsed = try await Task.detached(priority: .userInitiated) {
        try ParsedOfferCapture.read(OfferOCR.text(in: OfferOCR.image(from: bytes), accurate: true),
          platform: chosenPlatform, source: .sharedScreenshot)
      }.value
      try Task.checkCancellation()
      guard requestID == request, model.journalScope == scope, model.storageHealthy else { return }
      capture = parsed; draft = parsed.normalized
    } catch is CancellationError {
      // Closing the picker or changing accounts must not leak a draft into another scope.
    } catch {
      guard requestID == request, model.journalScope == scope else { return }
      self.error = "We could not read that picture. Try a clear screenshot with the pay and miles visible."
    }
  }
}

struct ScreenshotGuideButton: View {
  @State private var showing = false
  var body: some View {
    Button { showing = true } label: {
      Label("Show me how · Try the guide", systemImage: "hand.tap.fill")
    }.accessibilityIdentifier("screenshot.guide")
      .fullScreenCover(isPresented: $showing) { NavigationStack { OfferScreenshotGuide() } }
  }
}

struct ScreenshotHelpCard: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label("Is this job worth it?", systemImage: "viewfinder").font(.headline)
      Text("Take a screenshot. Bring it here. Check the pay after costs.")
        .font(.subheadline).foregroundStyle(Brand.muted)
      ScreenshotGuideButton().buttonStyle(BrandActionStyle())
      NavigationLink { OfferScreenshotImportView() } label: {
        Label("Choose screenshot", systemImage: "photo.badge.plus")
      }.buttonStyle(BrandActionStyle(primary: false)).accessibilityIdentifier("offers.screenshot")
    }.gigCard(highlight: true)
  }
}
