import DriverCore
import SwiftUI

/// Practice stays in view state. The same profit engine powers real offer review.
struct OfferScreenshotGuide: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var step = 0
  @State private var phone: ScreenshotPhone = .faceID
  @State private var pressed = Set<String>()
  @State private var saveMenu = false
  @State private var photoSaved = false
  @State private var shareRoute = false
  @State private var transferStage = 0
  @State private var payout = "7.50"
  @FocusState private var editing: Bool
  private let titles = ["Take a screenshot", "Save the picture", "Pick a way to bring it in", "Bring the picture in", "Check the numbers", "See what you could keep"]
  private var ready: Bool {
    switch step {
    case 0: pressed.count == 2
    case 1: photoSaved
    case 2: false
    case 3: transferStage >= (shareRoute ? 5 : 1)
    case 4: practice != nil
    default: false
    }
  }
  private var practice: GigProfitAssessment? {
    guard let cents = StatementImport.signedCents(payout), (0...100_000_000).contains(cents) else { return nil }
    var offer = UniversalGigOffer(platform: .doorDash, source: .simulation)
    offer.currency = "USD"; offer.payoutCents = cents; offer.guaranteedPayoutCents = cents
    offer.tipTreatment = .includedInQuote; offer.unconfirmedTipCents = 0
    offer.uncertainty.totalMiles = GigNumericBounds(1.6, 1.6)
    offer.estimatedMinutes = 20; offer.durationCoverage = .allWorkingTime
    offer.additionalCostsCents = 0
    return OfferProfitabilityEngine.assess(offer,
      profile: GigProfitProfile(vehicleCostCentsPerMile: 50, minimumNetHourlyCents: 2000))
  }
  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          HStack {
            Label("PRACTICE · NOTHING IS SAVED", systemImage: "sparkles")
              .font(.caption2.bold()).foregroundStyle(Brand.link)
            Spacer()
            Text("\(step + 1) of 6").font(.caption.monospacedDigit())
          }.id("top")
          ProgressView(value: Double(step + 1), total: 6).tint(Brand.pink)
          Text(titles[step]).font(.system(.largeTitle, design: .rounded, weight: .bold))
            .accessibilityAddTraits(.isHeader).accessibilityIdentifier("guide.title")
          lesson
        }.frame(maxWidth: 520).padding(20).padding(.bottom, 64).frame(maxWidth: .infinity)
      }.onChange(of: step) { _, _ in proxy.scrollTo("top", anchor: .top) }
    }
    .background(Brand.background.opacity(0.98).ignoresSafeArea()).foregroundStyle(.white)
    .navigationTitle("Screenshot guide").navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(Brand.background, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button("Close") { dismiss() }.accessibilityIdentifier("guide.close")
      }
      ToolbarItem(placement: .keyboard) {
        Button("Done") { editing = false }.accessibilityIdentifier("guide.keyboard.done")
      }
    }
    .safeAreaInset(edge: .bottom) {
      HStack(spacing: 12) {
        if step > 0 {
          Button("Back") { move(to: step - 1) }.buttonStyle(BrandActionStyle(primary: false))
            .accessibilityIdentifier("guide.back")
        }
        if step != 2 && step < 5 {
          Button(step == 4 ? "Check this job" : "Next") { move(to: step + 1) }
            .buttonStyle(BrandActionStyle()).disabled(!ready).accessibilityIdentifier("guide.next")
        }
        if step == 5 {
          Button("Done") { dismiss() }.buttonStyle(BrandActionStyle()).accessibilityIdentifier("guide.done")
        }
      }.padding(16).background(Brand.background)
    }
    .preferredColorScheme(.dark).tint(Brand.pink)
  }
  @ViewBuilder private var lesson: some View {
    switch step {
    case 0:
      Text("Park safely first. Open a job offer in your gig app.").font(.headline)
      Picker("Your iPhone", selection: $phone) {
        ForEach(ScreenshotPhone.allCases) { Text($0.rawValue).tag($0) }
      }.pickerStyle(.segmented).onChange(of: phone) { _, _ in pressed = [] }
      Text("Press \(phone.firstButton) + Side together. Let go right away. Do not hold them down.")
      ScreenshotPhoneDiagram(phone: phone, pressed: $pressed)
      Text("This is DoorDash’s published offer example. Your app may look different.")
        .font(.footnote).foregroundStyle(Brand.muted)
      Link("DoorDash’s example screen", destination: URL(string: "https://help.doordash.com/en-us/dashers/article/redesigned-accept-modal")!)
        .font(.footnote)
      Text("These taps are practice. Use the real buttons on the edge of your phone when taking a screenshot.")
        .font(.footnote).foregroundStyle(Brand.muted)
      Link("Apple’s screenshot steps", destination: URL(string: "https://support.apple.com/en-us/102616")!).font(.footnote)
    case 1:
      Text("If the picture fills your screen, tap the save button, then Save to Photos.")
      GuideExampleOffer()
      if photoSaved {
        success("Practice picture saved. You can find your real screenshot in Photos.")
      } else if saveMenu {
        GuideTarget(label: "Save to Photos", id: "guide.save.photo", action: { photoSaved = true }) {
          Label("Save to Photos", systemImage: "photo")
        }
      } else {
        GuideTarget(label: "Practice save button", id: "guide.save.menu", action: { saveMenu = true }) {
          Label("Save", systemImage: "checkmark")
        }
      }
      Text("Only see a small picture in the corner? On older iOS versions it saves to Photos on its own.")
        .font(.footnote).foregroundStyle(Brand.muted)
    case 2:
      Text("Both ways work. Let’s try one with our practice picture.")
      GuideTarget(label: "Practice Choose screenshot", id: "guide.route.picker", action: {
        shareRoute = false; transferStage = 0; move(to: 3)
      }) {
        VStack(alignment: .leading, spacing: 8) {
          Label("Choose screenshot", systemImage: "photo.badge.plus").font(.headline)
          Text("Come back to Gig Tax Pros. Tap Choose screenshot on Home or Offers.").font(.subheadline)
        }
      }
      Button {
        shareRoute = true; transferStage = 0; move(to: 3)
      } label: {
        Label("Try sharing from Photos", systemImage: "square.and.arrow.up")
      }.buttonStyle(BrandActionStyle(primary: false)).accessibilityIdentifier("guide.route.share")
      Text("To switch apps: swipe up from the bottom and pause, or double-click Home. Tap Gig Tax Pros.")
        .font(.footnote).foregroundStyle(Brand.muted)
    case 3:
      if shareRoute { shareLesson } else { pickerLesson }
    case 4:
      Text("Pictures can be read wrong. Check pay, all miles, time and costs before saving a real job.")
      GuideExampleOffer(highlightNumbers: true)
      Text("The pink outline shows the pay and miles to check. “Deliver by 10:45 AM” is a deadline. The number beside Accept is a countdown. Neither tells us all your working time.")
        .font(.subheadline)
      VStack(alignment: .leading, spacing: 16) {
        Text("PRACTICE NUMBERS").font(.caption.bold()).foregroundStyle(Brand.link)
        Text("Guaranteed pay, including tips").font(.subheadline)
        TextField("Pay ($)", text: $payout).keyboardType(.decimalPad).focused($editing)
          .font(.title.bold()).padding(12).background(Brand.background, in: RoundedRectangle(cornerRadius: 12))
          .accessibilityIdentifier("guide.pay")
        Text("Miles shown: 1.6 · Practice time: 20 minutes")
        Text("For this lesson, assume 1.6 miles covers all driving and the job takes 20 minutes. Those are practice assumptions. For a real job, include extra driving, pickup and waiting time.")
          .font(.footnote).foregroundStyle(Brand.muted)
        Text("Practice costs: 50¢ per mile, $0 extra costs, no money set aside, and a $20/hour goal.")
          .font(.footnote).foregroundStyle(Brand.muted)
      }.gigCard(highlight: true)
      Text("Try changing the pay. The result will change too.").foregroundStyle(Brand.link)
      if practice == nil { Text("Enter a valid dollar amount.").foregroundStyle(Brand.caution) }
    default:
      resultLesson
    }
  }
  @ViewBuilder private var pickerLesson: some View {
    Text("This is a practice photo picker. Tap the job picture.")
    if transferStage == 0 {
      GuideTarget(label: "Practice offer screenshot", id: "guide.photo", action: { transferStage = 1 }) {
        GuideExampleOffer()
      }
    } else { success("Picture chosen. Next, check the numbers we read.") }
    Text("For a real job, choose its gig app before opening the picker. You can cancel the picker at any time.")
      .font(.footnote).foregroundStyle(Brand.muted)
  }
  @ViewBuilder private var shareLesson: some View {
    Text("Before a real share: open Offer reader in Gig Tax Pros and enable it for this shift. You do not need to start screen sharing.")
      .font(.footnote).foregroundStyle(Brand.muted)
    switch transferStage {
    case 0:
      Text("Open Photos. Tap your job screenshot. Try it here.")
      GuideTarget(label: "Open practice photo", id: "guide.photo", action: { transferStage = 1 }) { GuideExampleOffer() }
    case 1:
      GuideExampleOffer()
      Text("Tap Share — the square with an arrow pointing up.")
      GuideTarget(label: "Practice Share", id: "guide.share", action: { transferStage = 2 }) {
        Label("Share", systemImage: "square.and.arrow.up").font(.title2)
      }
    case 2:
      Text("Tap Gig Tax Pros in the row of apps.")
      GuideTarget(label: "Share to Gig Tax Pros", id: "guide.share.app", action: { transferStage = 3 }) {
        BrandHeader(compact: true)
      }
      Text("Can’t see it? Swipe across the app row and tap More. If it is still missing, use Choose screenshot inside Gig Tax Pros.")
        .font(.footnote).foregroundStyle(Brand.muted)
    case 3:
      Text("Choose the right gig app. Then tap Read shared offer.")
      GuideTarget(label: "Read shared offer", id: "guide.share.read", action: { transferStage = 4 }) {
        Label("Read shared offer", systemImage: "viewfinder")
      }
    case 4:
      Text("Keep the offer, then return to Gig Tax Pros → Offers to check it.")
      GuideTarget(label: "Keep offer and show comparison alert", id: "guide.share.keep", action: { transferStage = 5 }) {
        Text("Keep offer & show comparison alert")
      }
      Text("You can open Offers even if alerts are off.").font(.footnote).foregroundStyle(Brand.muted)
    default: success("Practice share complete. Next, review the numbers.")
    }
  }
  @ViewBuilder private var resultLesson: some View {
    if let result = practice {
      VStack(alignment: .leading, spacing: 16) {
        Text("PRACTICE ESTIMATE").font(.caption.bold()).foregroundStyle(Brand.link)
        Text(moneyRange(result.profitBeforeReserve)).font(.system(size: 48, weight: .bold, design: .rounded))
          .foregroundStyle(gigMoneyTint(result.profitBeforeReserve)).accessibilityIdentifier("guide.result.net")
        Text("after vehicle costs, before any tax savings")
        Text("Vehicle cost: \(moneyRange(result.vehicleCost))")
        Text("Per working hour: \(moneyRange(result.effectiveHourly))")
        Text(result.outcome == .positiveMeetsTarget ? "This example meets the $20/hour goal." :
          result.outcome == .estimatedLoss ? "This example costs more than it pays." : "This example is below the $20/hour goal.")
          .font(.headline)
      }.gigCard(highlight: true, accent: gigMoneyTint(result.profitBeforeReserve))
    }
    Text("For your own job, use your own costs. Missing details or extra driving can change the result. Check that the job is still there, then choose in the gig app.")
    NavigationLink { OfferScreenshotImportView() } label: {
      Label("Try my own screenshot", systemImage: "photo.badge.plus")
    }.buttonStyle(BrandActionStyle()).accessibilityIdentifier("guide.real")
    NavigationLink("Set up sharing from Photos") { OfferReaderView() }.font(.footnote)
    Button("Try the guide again") {
      pressed = []; saveMenu = false; photoSaved = false; transferStage = 0; payout = "7.50"; move(to: 0)
    }.accessibilityIdentifier("guide.restart")
    Text("Practice jobs never go into your earnings or saved offers.").font(.footnote).foregroundStyle(Brand.muted)
  }
  private func success(_ text: String) -> some View {
    Label(text, systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(Brand.income)
      .padding(20).frame(maxWidth: .infinity, alignment: .leading).background(Brand.panel, in: RoundedRectangle(cornerRadius: 18))
  }
  private func move(to value: Int) {
    editing = false
    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { step = value }
  }
}
