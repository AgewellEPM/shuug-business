import DriverCore
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let message = UILabel()
  private let readButton = UIButton(type: .system)
  private let saveButton = UIButton(type: .system)
  private let platform = UISegmentedControl(items: GigPlatform.allCases.map(\.rawValue))
  private var parsed: ParsedOfferCapture?
  private var parsedSessionId: UUID?
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.07, alpha: 1)
    let title = UILabel(); title.text = "Gig Tax Pros · Read an offer"; title.textColor = .white
    title.font = .preferredFont(forTextStyle: .headline)
    message.numberOfLines = 0; message.textColor = .white
    message.text = "Choose the platform and read the shared screenshot or text on this iPhone. No image or full transcript is saved."
    platform.selectedSegmentIndex = OfferCaptureStore.session().flatMap { GigPlatform.allCases.firstIndex(of: $0.platform) } ?? 0
    readButton.setTitle("Read shared offer", for: .normal)
    readButton.addTarget(self, action: #selector(readInput), for: .touchUpInside)
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
      message.text = "Enable offer reading for this shift in Gig Tax Pros once, then share the offer again."
      readButton.isEnabled = false
    }
  }
  @objc private func readInput() {
    guard let session = OfferCaptureStore.session(), let items = extensionContext?.inputItems as? [NSExtensionItem],
      let provider = items.flatMap({ $0.attachments ?? [] }).first(where: {
        $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) || $0.hasItemConformingToTypeIdentifier(UTType.text.identifier)
      }) else {
      message.text = "Share one screenshot or the visible text of an offer."; return
    }
    let selected = GigPlatform.allCases[max(0, platform.selectedSegmentIndex)]
    readButton.isEnabled = false; saveButton.isEnabled = false; parsed = nil; parsedSessionId = nil
    message.text = "Reading the chosen offer on this phone…"
    if !provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { [weak self] value, error in
        do {
          let text = (value as? String) ?? (value as? Data).flatMap { String(data: $0, encoding: .utf8) }
          guard error == nil, let text, text.utf8.count <= 20_000 else { throw GigDispatchError.invalidInput }
          let result = try ParsedOfferCapture.read(text, platform: selected, source: .sharedText)
          Task { @MainActor in self?.show(result, session: session) }
        } catch { Task { @MainActor in self?.message.text = "No readable offer fields found. Share the offer's visible text or a screenshot."; self?.readButton.isEnabled = true } }
      }
      return
    }
    provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, error in
      do {
        guard error == nil, let url, (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 20 * 1024 * 1024 else {
          throw CocoaError(.fileReadCorruptFile)
        }
        let bytes = try Data(contentsOf: url)
        let result = try autoreleasepool {
          try ParsedOfferCapture.read(OfferOCR.text(in: OfferOCR.image(from: bytes), accurate: true), platform: selected, source: .sharedScreenshot)
        }
        Task { @MainActor in
          self?.show(result, session: session)
        }
      } catch { Task { @MainActor in self?.message.text = "This image could not be read. Choose a clear offer screenshot."; self?.readButton.isEnabled = true } }
    }
  }
  private func show(_ result: ParsedOfferCapture, session: OfferReaderSession) {
    readButton.isEnabled = true
    guard OfferCaptureStore.session()?.id == session.id else { message.text = "The reading session expired. Enable it again in Gig Tax Pros."; return }
    parsed = result; parsedSessionId = session.id; saveButton.isEnabled = true
    let offer = result.normalized
    let payout = offer.payoutCents.map { (Double($0) / 100).formatted(.currency(code: "USD")) } ?? "Payout unknown"
    message.text = "\(payout) · \(offer.missingFields.count) fields need review. Keep the offer to see missing data and compare costs in Gig Tax Pros. Verify current availability in its original app."
  }
  @objc private func saveOffer() {
    guard let parsed, var session = OfferCaptureStore.session(), session.id == parsedSessionId else {
      message.text = "The reading session changed. Read the offer again for the current account."
      saveButton.isEnabled = false
      return
    }
    let offer = parsed.observation
    do {
      session.platform = offer.platform
      try OfferCaptureStore.activate(session)
      try OfferCaptureStore.save(offer, session: session, normalized: parsed.normalized)
      OfferCaptureStore.notify(offer, session: session)
      extensionContext?.completeRequest(returningItems: nil)
    } catch { message.text = error.localizedDescription }
  }
  @objc private func cancelShare() {
    extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
  }
}
