import SwiftUI

extension View {
  func gigCard(highlight: Bool = false, inset: CGFloat = 16) -> some View {
    padding(inset).frame(maxWidth: .infinity, alignment: .leading)
      .background(Brand.panel, in: RoundedRectangle(cornerRadius: 22))
      .overlay {
        RoundedRectangle(cornerRadius: 22).strokeBorder(
          LinearGradient(colors: [Brand.pink.opacity(highlight ? 0.95 : 0.55), Brand.purple.opacity(0.35), Brand.border.opacity(0.35)],
            startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: highlight ? 1.4 : 0.8)
      }
      .shadow(color: Brand.purple.opacity(highlight ? 0.16 : 0.05), radius: 16, y: 5)
  }
}

struct DashboardMetric: View {
  let title: String, value: String, icon: String
  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: icon).font(.system(size: 21, weight: .medium)).foregroundStyle(Brand.pink)
      VStack(alignment: .leading, spacing: 4) {
        Text(value).font(.system(.headline, design: .rounded)).lineLimit(1).minimumScaleFactor(0.65)
        Text(title).font(.system(size: 10, weight: .medium)).foregroundStyle(Brand.muted).lineLimit(2)
      }
    }.frame(maxWidth: .infinity, alignment: .leading).accessibilityElement(children: .combine)
  }
}

struct DashboardQuickAction: View {
  let title: String, icon: String
  var count = 0
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      VStack(spacing: 8) {
        Image(systemName: icon).font(.system(size: 27, weight: .semibold)).foregroundStyle(Brand.action)
          .shadow(color: Brand.pink.opacity(0.3), radius: 8)
        Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
      }.frame(maxWidth: .infinity).frame(height: 72)
        .background(Brand.panel, in: RoundedRectangle(cornerRadius: 17))
        .overlay { RoundedRectangle(cornerRadius: 17).strokeBorder(Brand.border.opacity(0.6), lineWidth: 0.8) }
        .overlay(alignment: .topTrailing) {
          if count > 0 {
            Text("\(min(count, 99))").font(.caption2.bold()).foregroundStyle(.white).padding(5)
              .background(Brand.action, in: Circle()).offset(x: 3, y: -3)
          }
        }
    }.buttonStyle(.plain)
  }
}

struct HomeRoadArtwork: View {
  var body: some View {
    Canvas { context, size in
      for index in 0..<7 {
        var line = Path()
        let start = CGFloat(index) / 6 * size.width
        line.move(to: CGPoint(x: start, y: size.height))
        line.addCurve(to: CGPoint(x: size.width * 0.58, y: 0),
          control1: CGPoint(x: start, y: size.height * 0.4),
          control2: CGPoint(x: size.width * 0.68, y: size.height * 0.5))
        context.stroke(line, with: .linearGradient(Gradient(colors: [Brand.purple.opacity(0.3), Brand.pink.opacity(0.85)]),
          startPoint: .zero, endPoint: CGPoint(x: size.width, y: size.height)), lineWidth: index == 3 ? 2 : 0.7)
      }
    }.accessibilityHidden(true)
  }
}
