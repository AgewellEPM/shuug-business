import SwiftUI

struct BrandedDialogAction: Identifiable {
  let title: String
  var role: ButtonRole?
  var action: () -> Void
  var id: String { title }
  init(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void = {}) {
    self.title = title; self.role = role; self.action = action
  }
}

/// App-owned confirmations only. iOS and provider permission/sign-in UI keep their native presentation.
private struct BrandedDialogModifier: ViewModifier {
  let title: String
  @Binding var isPresented: Bool
  let message: String
  let icon: String
  let accent: Color
  let cancelTitle: String?
  let allowsBackdropDismiss: Bool
  let actions: () -> [BrandedDialogAction]

  func body(content: Content) -> some View {
    content.background {
      Color.clear.frame(width: 0, height: 0)
        .fullScreenCover(isPresented: $isPresented) {
          BrandedDialogPanel(title: title, message: message, icon: icon, accent: accent,
            cancelTitle: cancelTitle, allowsBackdropDismiss: allowsBackdropDismiss,
            actions: actions(), close: { isPresented = false })
            .presentationBackground(.clear)
            .interactiveDismissDisabled()
        }
        // Scope this transaction to the presentation anchor; normal screen animations stay intact.
        .transaction(value: isPresented) { transaction in transaction.disablesAnimations = true }
    }
  }
}

struct BrandedDialogPanel: View {
  let title: String
  let message: String
  let icon: String
  let accent: Color
  let cancelTitle: String?
  let allowsBackdropDismiss: Bool
  let actions: [BrandedDialogAction]
  let close: () -> Void
  @AccessibilityFocusState private var titleFocused: Bool

  private var presentedActions: [BrandedDialogAction] {
    guard let cancelTitle, !actions.contains(where: { $0.role == .cancel }) else { return actions }
    return actions + [.init(cancelTitle, role: .cancel)]
  }
  private func cancel() {
    let cancelAction = presentedActions.first { $0.role == .cancel }
    guard cancelAction != nil || allowsBackdropDismiss else { return }
    close()
    cancelAction?.action()
  }
  var body: some View {
    GeometryReader { geometry in
      ZStack {
        Color.black.opacity(0.78).ignoresSafeArea()
          .contentShape(Rectangle())
          .onTapGesture { if allowsBackdropDismiss { cancel() } }
          .accessibilityHidden(true)
        ScrollView {
          VStack(spacing: 0) {
            Spacer(minLength: 24).frame(maxWidth: .infinity)
              .contentShape(Rectangle()).onTapGesture { if allowsBackdropDismiss { cancel() } }
            panel
            Spacer(minLength: 24).frame(maxWidth: .infinity)
              .contentShape(Rectangle()).onTapGesture { if allowsBackdropDismiss { cancel() } }
          }.frame(minHeight: geometry.size.height)
        }.scrollIndicators(.hidden).scrollBounceBehavior(.basedOnSize)
          .frame(maxWidth: 420).padding(.horizontal, 24)
      }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }.preferredColorScheme(.dark)
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isModal)
      .accessibilityAction(.escape) { cancel() }
      .onAppear { titleFocused = true }
  }
  private var panel: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(spacing: 12) {
        Image(systemName: icon).font(.title2.weight(.semibold)).foregroundStyle(accent)
          .frame(width: 48, height: 48)
          .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
          .overlay { RoundedRectangle(cornerRadius: 15).strokeBorder(accent.opacity(0.5), lineWidth: 1) }
          .accessibilityHidden(true)
        Text("GIG TAX PROS").font(.caption.weight(.bold)).tracking(1.4).foregroundStyle(Brand.link)
      }
      Text(title).font(.title3.bold()).foregroundStyle(.white)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader).accessibilityFocused($titleFocused)
      if !message.isEmpty {
        Text(message).font(.body).foregroundStyle(Brand.muted)
          .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
      }
      VStack(spacing: 10) {
        ForEach(presentedActions) { action in
          if action.role == .cancel {
            actionButton(action).keyboardShortcut(.cancelAction)
          } else {
            actionButton(action)
          }
        }
      }.padding(.top, 2)
    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
      .background(Brand.panel, in: RoundedRectangle(cornerRadius: 26))
      .overlay {
        RoundedRectangle(cornerRadius: 26).strokeBorder(
          LinearGradient(colors: [accent.opacity(0.95), Brand.purple.opacity(0.65), Brand.border.opacity(0.5)],
            startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.3)
      }
      .shadow(color: accent.opacity(0.2), radius: 28, y: 8)
      .contentShape(RoundedRectangle(cornerRadius: 26))
      .onTapGesture {} // A tap on the panel never dismisses it as a backdrop tap.
      .accessibilityIdentifier("brandedDialog")
  }
  private func actionButton(_ action: BrandedDialogAction) -> some View {
    Button(role: action.role) {
      close()
      action.action()
    } label: {
      HStack(spacing: 8) {
        if action.role == .destructive { Image(systemName: "exclamationmark.triangle.fill") }
        Text(action.title).multilineTextAlignment(.center)
      }.frame(maxWidth: .infinity, minHeight: 22)
    }.buttonStyle(BrandedDialogButtonStyle(role: action.role, accent: accent))
  }
}

private struct BrandedDialogButtonStyle: ButtonStyle {
  let role: ButtonRole?
  let accent: Color
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.headline)
      .foregroundStyle(role == .destructive ? Brand.danger : .white)
      .padding(.horizontal, 16).padding(.vertical, 14)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background {
        if role == nil {
          RoundedRectangle(cornerRadius: 15).fill(Brand.action)
        } else {
          RoundedRectangle(cornerRadius: 15).fill(role == .destructive ? Brand.danger.opacity(0.1) : Brand.ink)
        }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 15).strokeBorder(
          role == .destructive ? Brand.danger.opacity(0.75) : accent.opacity(role == .cancel ? 0.35 : 0.65), lineWidth: 1)
      }
      .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
  }
}

extension View {
  func brandedDialog(_ title: String, isPresented: Binding<Bool>, message: String = "",
                     icon: String = "exclamationmark.bubble.fill", accent: Color = Brand.pink,
                     cancelTitle: String? = "Cancel", allowsBackdropDismiss: Bool = true,
                     actions: @escaping () -> [BrandedDialogAction]) -> some View {
    modifier(BrandedDialogModifier(title: title, isPresented: isPresented, message: message,
      icon: icon, accent: accent, cancelTitle: cancelTitle,
      allowsBackdropDismiss: allowsBackdropDismiss, actions: actions))
  }
}
