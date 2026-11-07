import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else { fatalError("Provide the synthetic PNG path.") }
let size = NSSize(width: 900, height: 650)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 900, pixelsHigh: 650,
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor.black.setFill(); NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
for (index, line) in ["DoorDash", "Offer payout: $19.50", "Pickup: 2 mi", "Delivery: 4 mi", "Total time: 30 min", "SYNTHETIC TEST OFFER"].enumerated() {
  (line as NSString).draw(at: NSPoint(x: 40, y: 550 - index * 85), withAttributes: [
    .font: NSFont.systemFont(ofSize: 40, weight: .bold), .foregroundColor: NSColor.white])
}
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
