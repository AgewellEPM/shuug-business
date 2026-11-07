import DriverCore
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let message = UILabel()
  private let readButton = UIButton(type: .system)
  private let saveButton = UIButton(type: .system)
  private let platform = UISegmentedControl(items: GigPlatform.allCases.map(\.rawValue))
  private var parsed: ObservedOffer?
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.07, alpha: 1)
    let title = UILabel(); title.text = "Gig Tax Pros · Read an offer"; title.textColor = .white
    title.font = .preferredFont(forTextStyle: .headline)
    message.numberOfLines = 0; message.textColor = .white
    message.text = "Choose the platform and read the screenshot on this iPhone. No image or full transcript is saved."
    platform.selectedSegmentIndex = OfferCaptureStore.session().flatMap { GigPlatform.allCases.firstIndex(of: $0.platform) } ?? 0
    readButton.setTitle("Read screenshot", for: .normal)
    readButton.addTarget(self, action: #selector(readImage), for: .touchUpInside)
    saveButton.setTitle("Keep offer & show comparison alert", for: .normal); saveButton.isEnabled = false
    saveButton.addTarget(self, action: #selector(saveOffer), for: .touchUpInside)
    let cancel = UIButton(type: .system); cancel.setTitle("Cancel", for: .normal)
    cancel.addTarget(self, action: #selector(cancelShare), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [title, message, platform, readButton, saveButton, cancel])
    stack.axis = .vertical; stack.spacing = 22; stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24)])
    if OfferCaptureStore.session() == nil {
      message.text = "Enable offer reading for this shift in Gig Tax Pros once, then share the screenshot again."
      readButton.isEnabled = false
    }
  }
  @objc private func readImage() {
    guard let session = OfferCaptureStore.session(), let items = extensionContext?.inputItems as? [NSExtensionItem],
      let provider = items.flatMap({ $0.attachments ?? [] }).first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) else {
      message.text = "Share one image of an offer."; return
    }
    let selected = GigPlatform.allCases[max(0, platform.selectedSegmentIndex)]
    readButton.isEnabled = false; saveButton.isEnabled = false; parsed = nil
    message.text = "Reading the chosen image on this phone…"
    provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, error in
      do {
        guard error == nil, let url, (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 20 * 1024 * 1024 else {
          throw CocoaError(.fileReadCorruptFile)
        }
        let bytes = try Data(contentsOf: url)
        let offer = try autoreleasepool {
          OfferTextReader.read(try OfferOCR.text(in: OfferOCR.image(from: bytes)), platform: selected, source: .sharedScreenshot)
        }
        Task { @MainActor in
          guard let self else { return }; self.readButton.isEnabled = true
          guard OfferCaptureStore.session()?.id == session.id, let offer else {
            self.message.text = "No unambiguous offer details were found, or this reading session expired. Enter the offer in Shift Mission."; return
          }
          self.parsed = offer; self.saveButton.isEnabled = true
          let payout = offer.payoutCents.map { (Double($0) / 100).formatted(.currency(code: "USD")) } ?? "Unknown payout"
          self.message.text = "\(payout) · \(offer.displayedMiles.map { "\($0) mi shown" } ?? "Miles unknown") · \(offer.displayedMinutes.map { "\($0) min shown" } ?? "Time unknown"). Check that these cover the entire job. A screenshot may show an expired offer."
        }
      } catch { Task { @MainActor in self?.message.text = "This image could not be read. Choose a clear offer screenshot."; self?.readButton.isEnabled = true } }
    }
  }
  @objc private func saveOffer() {
    guard let offer = parsed, var session = OfferCaptureStore.session() else { return }
    do {
      session.platform = offer.platform
      try OfferCaptureStore.activate(session)
      try OfferCaptureStore.save(offer, session: session)
      OfferCaptureStore.notify(offer, session: session)
      extensionContext?.completeRequest(returningItems: nil)
    } catch { message.text = error.localizedDescription }
  }
  @objc private func cancelShare() {
    extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
  }
}
