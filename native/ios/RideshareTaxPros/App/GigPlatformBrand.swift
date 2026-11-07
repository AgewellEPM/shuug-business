import DriverCore
import SwiftUI

/// Original publisher artwork is bundled for offline use. See the asset provenance receipt.
struct GigPlatformIcon: View {
  let platform: GigPlatform
  var size: CGFloat = 36
  var body: some View {
    Image("Platform\(platform.rawValue)Icon").renderingMode(.original).resizable().scaledToFit()
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
      .accessibilityLabel("\(platform.rawValue) app icon")
  }
}

struct GigPlatformWordmark: View {
  let platform: GigPlatform
  var width: CGFloat = 120
  var height: CGFloat = 24
  var body: some View {
    Image("Platform\(platform.rawValue)Logo").renderingMode(.original).resizable().scaledToFit()
      // Uber's published PNG includes a large transparent clear-space canvas.
      // Its original pixels stay intact; the view fits the mark in the label.
      .scaleEffect(platform == .uber ? 2.6 : 1)
      .frame(width: width, height: height, alignment: .leading)
      .clipped()
      .padding(platform == .spark ? 6 : 0)
      .background(platform == .spark ? Color.white : Color.clear, in: RoundedRectangle(cornerRadius: 5))
      .accessibilityLabel(platform.rawValue)
  }
}
