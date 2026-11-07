import AppKit
import CryptoKit
import DriverCore
import Foundation

@main struct OfferOCRProof {
  static func main() throws {
    guard CommandLine.arguments.count == 2 else { fatalError("Provide an evidence JSON path.") }
    let size = NSSize(width: 900, height: 650)
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
      bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
      bytesPerRow: 0, bitsPerPixel: 0), let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else {
      fatalError("Cannot create the synthetic offer fixture.")
    }
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = graphics
    NSColor.black.setFill(); NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
    let lines = ["DoorDash", "Offer payout $19.50", "Pickup 2 mi", "Delivery 4 mi", "Total time 30 min", "Accept"]
    for (index, line) in lines.enumerated() {
      (line as NSString).draw(at: NSPoint(x: 40, y: 550 - index * 85), withAttributes: [
        .font: NSFont.systemFont(ofSize: 42, weight: .bold), .foregroundColor: NSColor.white])
    }
    NSGraphicsContext.restoreGraphicsState()
    guard let image = bitmap.cgImage, let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Cannot encode the fixture.") }
    let started = ProcessInfo.processInfo.systemUptime
    let text = try OfferOCR.text(in: image)
    guard let offer = OfferTextReader.read(text, platform: .doorDash, source: .sharedScreenshot),
      offer.payoutCents == 1950, offer.displayedMiles == 6, offer.displayedMinutes == 30 else {
      throw NSError(domain: "GigOfferOCRProof", code: 1, userInfo: [NSLocalizedDescriptionKey: "Shared Vision OCR did not recover the synthetic offer fields: \(text)"])
    }
    let session = OfferReaderSession(scope: "synthetic-fixture", platform: .doorDash, feesCents: 0,
      waitMinutes: 5, goals: DriverGoals(targetHourlyCents: 2000, vehicleCostCentsPerMile: 50))
    guard let estimate = offer.estimate(session: session), estimate.netCents == 1650 else { fatalError("Profit calculation differs from fixture inputs.") }
    let output = URL(fileURLWithPath: CommandLine.arguments[1])
    try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
    let result: [String: Any] = ["ok": true, "scope": "macOS Apple Vision using the shared iPhone OCR source and a synthetic image",
      "physicalIPhoneVerified": false, "crossAppCaptureVerified": false, "liveGigOfferVerified": false,
      "payoutCents": offer.payoutCents!, "totalMiles": offer.displayedMiles!, "minutes": offer.displayedMinutes!,
      "estimatedNetCents": estimate.netCents, "elapsedMilliseconds": (ProcessInfo.processInfo.systemUptime - started) * 1000,
      "fixtureSHA256": SHA256.hash(data: png).map { String(format: "%02x", $0) }.joined(),
      "verifiedAt": ISO8601DateFormatter().string(from: Date())]
    let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: output, options: .atomic)
    print(String(data: data, encoding: .utf8)!)
  }
}
