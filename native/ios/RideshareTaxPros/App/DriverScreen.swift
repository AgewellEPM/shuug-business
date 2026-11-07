import SwiftUI

/// App-only presentation. Brand.swift also compiles in the notification extension.
private struct DriverScreen: ViewModifier {
  @EnvironmentObject private var model: DriverModel
  @ObservedObject private var notifications = DriverRuntime.shared.notifications
  @State private var noticeHostID = UUID()
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
      .disabled(model.message != nil)
      .accessibilityHidden(model.message != nil)
      .overlay(alignment: .top) {
        ForegroundNoticeView(hostID: noticeHostID)
          .allowsHitTesting(model.message == nil)
          .accessibilityHidden(model.message != nil)
      }
      .overlay {
        if let message = model.message, notifications.foregroundHostID == noticeHostID {
          BrandedDialogPanel(title: "Gig Tax Pros", message: message, icon: "bell.badge.fill",
            accent: Brand.caution, cancelTitle: nil, allowsBackdropDismiss: false,
            actions: [BrandedDialogAction("OK")], close: { model.message = nil })
            .ignoresSafeArea()
        }
      }
      .onAppear { notifications.activateForegroundHost(noticeHostID) }
      .onDisappear { notifications.deactivateForegroundHost(noticeHostID) }
  }
}

extension View {
  func driverScreen(compactNavigation: Bool = true) -> some View {
    modifier(DriverScreen(compactNavigation: compactNavigation))
  }
}
