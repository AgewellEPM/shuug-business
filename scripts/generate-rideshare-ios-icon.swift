import AppKit

// Matches public/rideshare-tax-pros/favicon.svg. iOS supplies the outer icon mask.
guard CommandLine.arguments.count == 2 else { fatalError("Provide the destination PNG path.") }
let destination = URL(fileURLWithPath: CommandLine.arguments[1])
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Could not create the app icon.") }
let canvas = context.cgContext
canvas.setFillColor(NSColor(srgbRed: 8/255, green: 8/255, blue: 17/255, alpha: 1).cgColor)
canvas.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
canvas.translateBy(x: 0, y: 1024)
canvas.scaleBy(x: 16, y: -16)
canvas.move(to: CGPoint(x: 10, y: 49))
for point in [CGPoint(x: 32, y: 10), CGPoint(x: 54, y: 49), CGPoint(x: 42, y: 49), CGPoint(x: 32, y: 29), CGPoint(x: 22, y: 49)] { canvas.addLine(to: point) }
canvas.closePath()
canvas.setFillColor(NSColor(srgbRed: 214/255, green: 51/255, blue: 247/255, alpha: 1).cgColor)
canvas.fillPath()
canvas.move(to: CGPoint(x: 32, y: 10))
canvas.addLine(to: CGPoint(x: 41, y: 26))
canvas.addLine(to: CGPoint(x: 16, y: 38))
canvas.setLineWidth(3)
canvas.setStrokeColor(NSColor.white.cgColor)
canvas.strokePath()
guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("Could not encode the app icon.") }
try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
try data.write(to: destination, options: .atomic)
print("Generated the Rideshare Tax Pros website mark as the driver app icon.")
