import SwiftUI

// Shared visual values from public/rideshare-tax-pros/styles.css and favicon.svg.
enum Brand {
  static let background = color(0x03060C)
  static let surface = color(0x080B12)
  static let ink = color(0x080811)
  static let purple = color(0xA627F6)
  static let pink = color(0xF70CE8)
  static let muted = color(0xD5D1DF)
  static let link = color(0xE3A0FF)
  static let border = color(0x9053B7)
  static let panelTop = color(0x1D122C)
  static let action = LinearGradient(
    colors: [color(0x9129FF), color(0xF306E5)],
    startPoint: .leading, endPoint: .trailing)
  static let panel = LinearGradient(
    colors: [panelTop, surface],
    startPoint: .topLeading, endPoint: .bottomTrailing)
  private static func color(_ hex: UInt32) -> Color {
    Color(
      red: Double((hex >> 16) & 255) / 255,
      green: Double((hex >> 8) & 255) / 255,
      blue: Double(hex & 255) / 255)
  }
  static func usd(_ cents: Int) -> String {
    (Double(cents) / 100).formatted(.currency(code: "USD"))
  }
  static func miles(_ meters: Double) -> String {
    (meters / 1609.344).formatted(.number.precision(.fractionLength(2)))
  }
  static func parseDay(_ text: String) -> Date {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: text) ?? Date()
  }
}

struct BrandHeader: View {
  var compact = false
  var body: some View {
    HStack(spacing: 12) {
      Image("BrandMark").resizable().scaledToFit().frame(width: compact ? 42 : 52, height: compact ? 42 : 52)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 5) {
        Text("Gig Tax Pros")
          .font(.custom("Arial-BoldMT", size: compact ? 20 : 22, relativeTo: .headline))
          .tracking(-0.6).lineLimit(1).minimumScaleFactor(0.7)
        Text("POWERED BY SHUUG").font(.system(size: 9, weight: .medium))
          .tracking(1.3).foregroundStyle(Brand.link)
      }
    }.foregroundStyle(.white).accessibilityElement(children: .combine)
  }
}

struct BrandActionStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var primary = true
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.headline).foregroundStyle(.white)
      .padding(.horizontal, 14).padding(.vertical, 14)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background {
        if primary {
          RoundedRectangle(cornerRadius: 18).fill(Brand.action)
        } else {
          RoundedRectangle(cornerRadius: 18).fill(Brand.ink)
        }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 18)
          .strokeBorder(primary ? Brand.pink.opacity(0.35) : Brand.border, lineWidth: 1)
      }
      .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
      .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: configuration.isPressed)
  }
}

private struct DriverScreen: ViewModifier {
  var compactNavigation: Bool
  func body(content: Content) -> some View {
    Group {
      if compactNavigation {
        content.navigationBarTitleDisplayMode(.inline)
          .contentMargins(.top, 8, for: .scrollContent)
      } else {
        content
      }
    }.scrollContentBackground(.hidden)
      .background(Brand.background.ignoresSafeArea())
      .toolbar(.visible, for: .navigationBar)
      .toolbarBackground(Brand.background, for: .navigationBar, .tabBar)
      .toolbarBackground(.visible, for: .navigationBar, .tabBar)
      .toolbarColorScheme(.dark, for: .navigationBar, .tabBar)
  }
}
extension View {
  func driverScreen(compactNavigation: Bool = true) -> some View {
    modifier(DriverScreen(compactNavigation: compactNavigation))
  }
}
