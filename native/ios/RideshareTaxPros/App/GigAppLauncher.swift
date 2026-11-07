import SwiftUI
import UIKit

struct GigAppLauncherRow: View {
  @EnvironmentObject private var model: DriverModel
  @State private var openingID: String?

  var body: some View {
    ScrollView(.horizontal, showsIndicators: true) {
      HStack(alignment: .top, spacing: 14) {
        ForEach(GigAppCatalog.apps) { app in
          Button { launch(app) } label: {
            VStack(spacing: 6) {
              Image(app.iconAsset).renderingMode(.original).resizable().scaledToFit()
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 9))
                .accessibilityHidden(true)
              Text(app.name).font(.system(size: 10, weight: .semibold))
                .lineLimit(2).multilineTextAlignment(.center).frame(minHeight: 24)
              Text(openingID == app.id ? "Opening…" : "Open app")
                .font(.system(size: 9)).foregroundStyle(Brand.link)
            }.foregroundStyle(.white).frame(width: 66)
          }.buttonStyle(.plain).disabled(openingID != nil)
            .accessibilityLabel("Open \(app.name)")
            .accessibilityHint("Opens the app or its official App Store listing.")
            .accessibilityIdentifier("gig.launcher.\(app.id)")
        }
        NavigationLink { UniversalGigSettingsView(workType: .delivery) } label: {
          configuredTile("Universal Delivery", icon: "shippingbox.fill", accent: Brand.route)
        }.buttonStyle(.plain).accessibilityIdentifier("gig.launcher.universal-delivery")
          .accessibilityLabel("Configure Universal Delivery Driver")
        NavigationLink { UniversalGigSettingsView(workType: .shopping) } label: {
          configuredTile("In-store Shopper", icon: "basket.fill", accent: Brand.income)
        }.buttonStyle(.plain).accessibilityIdentifier("gig.launcher.in-store-shopper")
          .accessibilityLabel("Configure In-store Shopper")
      }.padding(.horizontal, 3).padding(.bottom, 4)
    }.gigCard(inset: 12).accessibilityIdentifier("gig.launcher.row")
  }

  private func configuredTile(_ title: String, icon: String, accent: Color) -> some View {
    VStack(spacing: 6) {
      Image(systemName: icon).font(.system(size: 21, weight: .semibold)).foregroundStyle(accent)
        .frame(width: 38, height: 38)
        .background(Brand.panel, in: RoundedRectangle(cornerRadius: 9))
        .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(accent.opacity(0.7), lineWidth: 1) }
        .accessibilityHidden(true)
      Text(title).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
        .lineLimit(2).multilineTextAlignment(.center).frame(minHeight: 24)
      Text("Configure").font(.system(size: 9)).foregroundStyle(accent)
    }.frame(width: 66)
  }
  private func launch(_ app: GigAppCatalogEntry) {
    guard openingID == nil else { return }
    openingID = app.id
    Task {
      defer { openingID = nil }
      if !(await GigAppLauncher.open(app)) {
        model.message = "\(app.name) and its App Store listing could not be opened. Try again when your iPhone can open the App Store."
      }
    }
  }
}

@MainActor enum GigAppLauncher {
  /// Catalog URLs come from publisher sources. A failed universal link must not
  /// open a website as though the provider app had launched.
  static func open(_ app: GigAppCatalogEntry) async -> Bool {
    let application = UIApplication.shared
    if let appURL = app.appURL, application.canOpenURL(appURL), await application.open(appURL) {
      return true
    }
    if let universalLink = app.universalLink,
       await application.open(universalLink, options: [.universalLinksOnly: true]) {
      return true
    }
    return await application.open(app.appStoreURL)
  }
}
