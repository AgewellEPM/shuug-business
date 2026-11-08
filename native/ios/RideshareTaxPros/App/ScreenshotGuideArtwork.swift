import SwiftUI

enum ScreenshotPhone: String, CaseIterable, Identifiable {
  case faceID = "No Home button", home = "Has a Home button"
  var id: String { rawValue }
  var firstButton: String { self == .faceID ? "Volume up" : "Home" }
}

/// Practice controls surround DoorDash's published offer-screen example.
struct ScreenshotPhoneDiagram: View {
  let phone: ScreenshotPhone
  @Binding var pressed: Set<String>
  var body: some View {
    VStack(spacing: 16) {
      HStack(spacing: 6) {
        if phone == .faceID {
          VStack {
            Text("Volume up").font(.caption.bold())
            GuideArrow(symbol: "arrow.right")
            hardware("Volume up", id: "first", symbol: "plus")
          }.frame(maxWidth: .infinity)
        } else { Spacer().frame(maxWidth: .infinity) }
        VStack(spacing: 12) {
          Capsule().fill(.black).frame(width: 62, height: 16)
          GuideExampleOffer(compact: true)
            .frame(maxHeight: phone == .home ? 180 : 300)
          if phone == .home {
            hardware("Home", id: "first", symbol: "circle")
            GuideArrow(symbol: "arrow.up")
            Text("Home button").font(.caption.bold())
          } else { Capsule().fill(.white.opacity(0.6)).frame(width: 60, height: 4) }
        }.padding(12).frame(width: 168)
          .background(Brand.panel, in: RoundedRectangle(cornerRadius: 28))
          .overlay { RoundedRectangle(cornerRadius: 28).stroke(Brand.border, lineWidth: 2) }
        VStack {
          Text("Side button").font(.caption.bold())
          GuideArrow(symbol: "arrow.left")
          hardware("Side", id: "side", symbol: "minus")
        }.frame(maxWidth: .infinity)
      }
      Label(pressed.count == 2 ? "You found both buttons!" : "Tap both pink buttons in this picture.",
        systemImage: pressed.count == 2 ? "checkmark.circle.fill" : "hand.tap.fill")
        .font(.subheadline.bold()).foregroundStyle(pressed.count == 2 ? Brand.income : Brand.link)
        .accessibilityIdentifier("guide.buttons.status")
    }
  }
  private func hardware(_ label: String, id: String, symbol: String) -> some View {
    Button { pressed.insert(id) } label: {
      Image(systemName: pressed.contains(id) ? "checkmark" : symbol)
        .font(.title2.bold()).foregroundStyle(.white).frame(minWidth: 44, minHeight: 48)
        .background(pressed.contains(id) ? Brand.income.opacity(0.25) : Brand.pink.opacity(0.3),
          in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(Brand.pink, lineWidth: 3) }
    }.accessibilityLabel("Practice \(label) button").accessibilityIdentifier("guide.hardware.\(id)")
  }
}

struct GuideArrow: View {
  var symbol = "arrow.down"
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let alternate = !reduceMotion && Int(context.date.timeIntervalSinceReferenceDate) % 2 == 0
      Image(systemName: symbol).font(.system(size: 28, weight: .heavy))
        .foregroundStyle(Brand.pink).shadow(color: Brand.pink.opacity(0.6), radius: 7)
        .offset(x: symbol == "arrow.right" ? (alternate ? 4 : -2) : symbol == "arrow.left" ? (alternate ? -4 : 2) : 0,
          y: symbol == "arrow.down" ? (alternate ? 4 : -2) : symbol == "arrow.up" ? (alternate ? -4 : 2) : 0)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.7), value: alternate)
    }.frame(height: 40).accessibilityHidden(true)
  }
}

struct GuideExampleOffer: View {
  var compact = false
  var highlightNumbers = false
  var body: some View {
    VStack(spacing: compact ? 6 : 12) {
      if !compact { Text("DOORDASH EXAMPLE · PRACTICE ONLY").font(.caption2.bold()).foregroundStyle(Brand.link) }
      DoorDashReferenceScreen(highlightNumbers: highlightNumbers)
        .frame(maxWidth: compact ? .infinity : 224)
      if !compact {
        Text("$7.50 guaranteed · 1.6 miles shown").font(.subheadline.bold())
      }
    }.frame(maxWidth: .infinity)
  }
}

/// Keep the publisher's original 600×586 PNG intact. Display only its new-design
/// screen, excluding the second offer and caption, with a SwiftUI viewport.
private struct DoorDashReferenceScreen: View {
  var highlightNumbers: Bool
  var body: some View {
    GeometryReader { geometry in
      let scale = geometry.size.width / 229
      ZStack(alignment: .topLeading) {
        Image("DoorDashOfferReference").resizable()
          .frame(width: 600 * scale, height: 586 * scale)
          .offset(x: -343 * scale, y: -29 * scale)
          .accessibilityHidden(true).allowsHitTesting(false)
        if highlightNumbers {
          RoundedRectangle(cornerRadius: 7).stroke(Brand.pink, lineWidth: 3)
            .frame(width: 216 * scale, height: 48 * scale)
            .offset(x: 5 * scale, y: 283 * scale)
          GuideArrow().position(x: 196 * scale, y: 258 * scale)
        }
      }.frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
        .clipped().contentShape(Rectangle())
    }.aspectRatio(229.0 / 491, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: 16))
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("DoorDash's published example: $7.50 guaranteed including tips, 1.6 miles, deliver by 10:45 AM, Frosty Bear pickup and customer drop-off.")
      .accessibilityIdentifier("guide.doordash.reference")
  }
}

struct GuideTarget<Content: View>: View {
  let label: String, id: String
  let action: () -> Void
  @ViewBuilder var content: () -> Content
  var body: some View {
    VStack(spacing: 3) {
      GuideArrow()
      Button(action: action) {
        content().padding(16).frame(maxWidth: .infinity, minHeight: 52)
          .background(Brand.pink.opacity(0.16), in: RoundedRectangle(cornerRadius: 18))
          .overlay { RoundedRectangle(cornerRadius: 18).stroke(Brand.pink, lineWidth: 3) }
      }.buttonStyle(.plain).accessibilityLabel(label).accessibilityIdentifier(id)
    }
  }
}
