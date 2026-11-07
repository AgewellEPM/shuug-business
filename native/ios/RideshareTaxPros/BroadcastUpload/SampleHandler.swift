import CoreImage
import CoreMedia
import DriverCore
import ImageIO
import ReplayKit

final class SampleHandler: RPBroadcastSampleHandler {
  private let queue = DispatchQueue(label: "com.ridesharetaxpros.driver.offer-ocr", qos: .utility)
  private let gate = NSLock()
  private var busy = false, accepting = false
  private var lastFrame = 0.0
  private var seen: [String: Date] = [:]
  private let context = CIContext(options: [.cacheIntermediates: false])

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    guard OfferCaptureStore.session() != nil else {
      finishBroadcastWithError(NSError(domain: "GigTaxPros", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Enable offer reading in Gig Tax Pros before starting screen sharing."]))
      return
    }
    gate.lock(); accepting = true; gate.unlock()
    OfferCaptureStore.status("running", "Screen sharing started. Reading visible offer text on this device.")
  }
  override func broadcastPaused() {
    gate.lock(); accepting = false; gate.unlock()
    OfferCaptureStore.status("paused", "Screen sharing is paused. Offers are not being read.")
  }
  override func broadcastResumed() {
    gate.lock(); accepting = true; gate.unlock()
    OfferCaptureStore.status("running", "Screen sharing resumed.")
  }
  override func broadcastFinished() {
    gate.lock(); accepting = false; gate.unlock()
    OfferCaptureStore.status("stopped", "Screen sharing stopped. Start it again with the system picker when needed.")
  }
  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard sampleBufferType == .video, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let tick = ProcessInfo.processInfo.systemUptime
    gate.lock()
    guard accepting, !busy, tick - lastFrame >= 1 else { gate.unlock(); return }
    busy = true; lastFrame = tick; gate.unlock()
    let orientation = (CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString,
      attachmentModeOut: nil) as? NSNumber)?.int32Value ?? 1
    queue.async { [self] in
      defer { gate.lock(); busy = false; gate.unlock() }
      autoreleasepool {
        guard let session = OfferCaptureStore.session() else {
          OfferCaptureStore.status("stopped", "Offer reading is off or this shift’s permission expired.")
          finishBroadcastWithError(NSError(domain: "GigTaxPros", code: 2,
            userInfo: [NSLocalizedDescriptionKey: "Offer reading was stopped or expired."]))
          return
        }
        do {
          let input = CIImage(cvPixelBuffer: pixels).oriented(forExifOrientation: orientation)
          let scale = min(1, 1280 / max(input.extent.width, input.extent.height))
          let small = input.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
          guard let image = context.createCGImage(small, from: small.extent) else { return }
          let text = try OfferOCR.text(in: image)
          OfferCaptureStore.status("running", "Reading shared screen. Screen images and unrelated text are not saved.")
          guard let offer = OfferTextReader.read(text, platform: session.platform, source: .screenShare),
            OfferCaptureStore.session()?.id == session.id else { return }
          seen = seen.filter { Date().timeIntervalSince($0.value) < 120 }
          guard seen[offer.fingerprint] == nil else { return }
          try OfferCaptureStore.save(offer, session: session)
          seen[offer.fingerprint] = Date()
          OfferCaptureStore.notify(offer, session: session)
        } catch { OfferCaptureStore.status("attention", "Visible text could not be read. Use a shared screenshot or enter the offer.") }
      }
    }
  }
}
