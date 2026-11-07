import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// Presentation only. System buttons continue to the app's guarded action handler.
@MainActor final class BrandedNotificationController: UIViewController, UNNotificationContentExtension {
  private let scroll = UIScrollView()
  private let stack = UIStackView()
  private let heading = UILabel()
  private let symbol = UIImageView()
  private let titleLabel = UILabel()
  private let messageLabel = UILabel()
  private let footer = UILabel()
  private let background = NotificationGradientView(colors: [UIColor(Brand.panelTop), UIColor(Brand.surface)])

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(Brand.background)
    background.translatesAutoresizingMaskIntoConstraints = false
    scroll.translatesAutoresizingMaskIntoConstraints = false
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(background); view.addSubview(scroll); scroll.addSubview(stack)
    stack.axis = .vertical; stack.alignment = .fill; stack.spacing = 14
    NSLayoutConstraint.activate([
      background.leadingAnchor.constraint(equalTo: view.leadingAnchor), background.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      background.topAnchor.constraint(equalTo: view.topAnchor), background.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scroll.topAnchor.constraint(equalTo: view.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 20),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40)
    ])
    let mark = UIImageView(image: UIImage(named: "BrandMark"))
    mark.contentMode = .scaleAspectFit; mark.isAccessibilityElement = false
    mark.widthAnchor.constraint(equalToConstant: 42).isActive = true
    mark.heightAnchor.constraint(equalToConstant: 42).isActive = true
    let name = label("Gig Tax Pros", style: .headline, color: .white)
    let powered = label("POWERED BY SHUUG", style: .caption2, color: UIColor(Brand.link))
    let names = UIStackView(arrangedSubviews: [name, powered]); names.axis = .vertical; names.spacing = 4
    let brand = UIStackView(arrangedSubviews: [mark, names]); brand.spacing = 12; brand.alignment = .center
    stack.addArrangedSubview(brand)
    let rule = NotificationGradientView(colors: [UIColor(Brand.purple), UIColor(Brand.pink)])
    rule.heightAnchor.constraint(equalToConstant: 2).isActive = true; stack.addArrangedSubview(rule)
    configure(heading, style: .caption1, color: UIColor(Brand.link))
    symbol.contentMode = .scaleAspectFit; symbol.tintColor = UIColor(Brand.pink)
    symbol.widthAnchor.constraint(equalToConstant: 19).isActive = true
    let kind = UIStackView(arrangedSubviews: [symbol, heading]); kind.spacing = 8; kind.alignment = .center
    stack.addArrangedSubview(kind)
    configure(titleLabel, style: .title3, color: .white)
    titleLabel.font = UIFont.preferredFont(forTextStyle: .title3).withTraits(.traitBold)
    configure(messageLabel, style: .subheadline, color: UIColor(Brand.muted))
    configure(footer, style: .caption2, color: UIColor(Brand.link))
    footer.text = "Review and respond when safely parked."
    stack.addArrangedSubview(titleLabel); stack.addArrangedSubview(messageLabel); stack.addArrangedSubview(footer)
  }
  func didReceive(_ notification: UNNotification) {
    loadViewIfNeeded()
    let content = notification.request.content
    let kind = presentation(content.categoryIdentifier)
    heading.text = kind.0; symbol.image = UIImage(systemName: kind.1)
    titleLabel.text = String(content.title.prefix(160))
    messageLabel.text = String(content.body.prefix(600)); messageLabel.isHidden = content.body.isEmpty
    footer.isHidden = content.categoryIdentifier == "gig.status"
    scroll.setContentOffset(.zero, animated: false)
    view.setNeedsLayout()
  }
  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard view.bounds.width > 40 else { return }
    let fitted = stack.systemLayoutSizeFitting(CGSize(width: view.bounds.width - 40, height: 0),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
    // Long messages and accessibility sizes remain reachable by scrolling.
    let height = min(560, max(210, ceil(fitted.height + 40)))
    if abs(preferredContentSize.height - height) > 1 {
      preferredContentSize = CGSize(width: view.bounds.width, height: height)
    }
  }
  private func configure(_ label: UILabel, style: UIFont.TextStyle, color: UIColor) {
    label.font = .preferredFont(forTextStyle: style); label.textColor = color
    label.adjustsFontForContentSizeCategory = true; label.numberOfLines = 0
  }
  private func label(_ text: String, style: UIFont.TextStyle, color: UIColor) -> UILabel {
    let label = UILabel(); configure(label, style: style, color: color); label.text = text; return label
  }
  private func presentation(_ category: String) -> (String, String) {
    switch category {
    case "startTrip": ("DRIVE DETECTED", "car.fill")
    case "endTrip": ("TRIP CHECK-IN", "flag.checkered")
    case "classifyTrip": ("TRIP REVIEW", "tag.fill")
    case "tripFare": ("DRIVE EARNINGS", "dollarsign.circle.fill")
    case "expense": ("EXPENSE REMINDER", "receipt.fill")
    case "gig.offer", "gig.offer.review": ("OFFER REVIEW", "bolt.fill")
    default: ("YOUR DRIVING ASSISTANT", "bell.fill")
    }
  }
}

private final class NotificationGradientView: UIView {
  override class var layerClass: AnyClass { CAGradientLayer.self }
  init(colors: [UIColor]) {
    super.init(frame: .zero)
    let gradient = layer as! CAGradientLayer
    gradient.colors = colors.map(\.cgColor); gradient.startPoint = .zero; gradient.endPoint = CGPoint(x: 1, y: 1)
  }
  required init?(coder: NSCoder) { fatalError("Programmatic notification content") }
}

private extension UIFont {
  func withTraits(_ traits: UIFontDescriptor.SymbolicTraits) -> UIFont {
    fontDescriptor.withSymbolicTraits(traits).map { UIFont(descriptor: $0, size: pointSize) } ?? self
  }
}
