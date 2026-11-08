import CoreGraphics
import CryptoKit
import DriverCore
import Foundation

/// Run the app's real OCR/parser against the publisher's unaltered source image.
/// Cropping here selects its new-design screen; it does not generate a new asset.
@main struct DoorDashReferenceProof {
  static func main() throws {
    guard CommandLine.arguments.count == 3 else { fatalError("Provide the original PNG and evidence JSON paths.") }
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let original = try OfferOCR.image(from: data)
    guard original.width == 600, original.height == 586,
      let screen = original.cropping(to: CGRect(x: 343, y: 29, width: 229, height: 491)) else {
      fatalError("The published reference has changed; inspect it before changing the viewport.")
    }
    let text = try OfferOCR.text(in: screen, accurate: true)
    let parsed: ParsedOfferCapture
    do { parsed = try ParsedOfferCapture.read(text, platform: .doorDash, source: .sharedScreenshot) }
    catch {
      print("Published reference OCR could not be normalized: \(text)")
      exit(1)
    }
    let offer = parsed.normalized
    guard offer.payoutCents == 750, offer.displayedTotalMiles == 1.6, offer.estimatedMinutes == nil else {
      throw NSError(domain: "DoorDashReferenceProof", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Published reference did not produce $7.50, 1.6 miles and unknown duration. OCR: \(text)"])
    }
    let result: [String: Any] = ["ok": true, "verifiedAt": ISO8601DateFormatter().string(from: Date()),
      "scope": "macOS Apple Vision and shared iPhone offer parser reading DoorDash's published example",
      "pageURL": "https://help.doordash.com/en-us/dashers/article/redesigned-accept-modal",
      "originalSHA256": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
      "payoutCents": offer.payoutCents!, "displayedMiles": offer.displayedTotalMiles!,
      "durationLeftUnknown": offer.estimatedMinutes == nil,
      "physicalIPhoneVerified": false, "liveOfferVerified": false]
    let encoded = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    try encoded.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
    print(String(data: encoded, encoding: .utf8)!)
  }
}
