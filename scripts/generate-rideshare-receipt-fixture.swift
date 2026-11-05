import AppKit

guard CommandLine.arguments.count == 2 else { fatalError("Provide the temporary fixture PNG path.") }
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1500, pixelsHigh: 900, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor.white.setFill(); NSRect(x: 0, y: 0, width: 1500, height: 900).fill()
for (index, text) in ["RTP FIXTURE FUEL", "2026-11-05", "UNLEADED", "TOTAL $17.35"].enumerated() {
    NSAttributedString(string: text, attributes: [.font: NSFont.monospacedSystemFont(ofSize: 95, weight: .bold), .foregroundColor: NSColor.black]).draw(in: NSRect(x: 80, y: 700 - index * 160, width: 1340, height: 145))
}
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: output, options: .atomic)
print("Generated the synthetic receipt fixture.")
