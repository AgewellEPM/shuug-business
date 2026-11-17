import AppKit
import Foundation

// Render the app's existing Android vector mark, with native text for Play assets.
// No screenshots, third-party logos, or product UI are synthesized here.
guard CommandLine.arguments.count == 2 else {
    fatalError("Usage: swift render-brand-assets.swift OUTPUT_DIRECTORY")
}
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func color(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}

func mark(x: CGFloat, y: CGFloat, size: CGFloat) {
    NSGraphicsContext.saveGraphicsState()
    let transform = NSAffineTransform()
    transform.translateX(by: x, yBy: y)
    transform.concat()
    let scale = NSAffineTransform()
    scale.scale(by: size / 64)
    scale.concat()
    let a = NSBezierPath()
    a.move(to: NSPoint(x: 10, y: 49)); a.line(to: NSPoint(x: 32, y: 10))
    a.line(to: NSPoint(x: 54, y: 49)); a.line(to: NSPoint(x: 42, y: 49))
    a.line(to: NSPoint(x: 32, y: 29)); a.line(to: NSPoint(x: 22, y: 49)); a.close()
    color(0xd633f7).setFill(); a.fill()
    let stripe = NSBezierPath()
    stripe.move(to: NSPoint(x: 32, y: 10)); stripe.line(to: NSPoint(x: 41, y: 26))
    stripe.line(to: NSPoint(x: 16, y: 38)); stripe.lineWidth = 3
    NSColor.white.setStroke(); stripe.stroke()
    NSGraphicsContext.restoreGraphicsState()
}

func text(_ value: String, x: CGFloat, y: CGFloat, size: CGFloat,
          weight: NSFont.Weight = .regular, ink: NSColor = .white) {
    (value as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [
        .font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: ink
    ])
}

func render(_ name: String, width: Int, height: Int, draw: () -> Void) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width,
        pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(cgContext: NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext,
                                    flipped: true)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
    let flip = NSAffineTransform()
    flip.translateX(by: 0, yBy: CGFloat(height))
    flip.scaleX(by: 1, yBy: -1); flip.concat()
    color(0x080811).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
    draw()
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
}

try render("app-icon.png", width: 512, height: 512) {
    mark(x: 0, y: 0, size: 512)
}
try render("feature-graphic.png", width: 1024, height: 500) {
    color(0x1c102c).setFill()
    NSBezierPath(roundedRect: NSRect(x: 52, y: 138, width: 200, height: 200),
                 xRadius: 44, yRadius: 44).fill()
    mark(x: 60, y: 146, size: 184)
    text("Gig Tax Pros", x: 302, y: 145, size: 62, weight: .bold)
    text("Mileage. Expenses.", x: 306, y: 239, size: 34, ink: color(0xd4ccdf))
    text("Offer comparisons.", x: 306, y: 287, size: 34, ink: color(0xd4ccdf))
}
