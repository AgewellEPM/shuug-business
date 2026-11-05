import AppKit

guard CommandLine.arguments.count == 2 else { fatalError("Provide the destination PNG path.") }
let destination = URL(fileURLWithPath: CommandLine.arguments[1])
let size = NSSize(width: 1024, height: 1024)
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Could not create the app icon.") }
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
NSGradient(starting: NSColor(srgbRed: 20/255, green: 12/255, blue: 36/255, alpha: 1), ending: NSColor(srgbRed: 148/255, green: 37/255, blue: 232/255, alpha: 1))!.draw(in: NSRect(origin: .zero, size: size), angle: 45)
let road = NSBezierPath(); road.move(to: NSPoint(x: 210, y: 90)); road.curve(to: NSPoint(x: 740, y: 390), controlPoint1: NSPoint(x: 250, y: 290), controlPoint2: NSPoint(x: 770, y: 125)); road.lineWidth = 28; road.lineCapStyle = .round
NSColor.white.withAlphaComponent(0.9).setStroke(); road.stroke()
let accent = NSBezierPath(); accent.move(to: NSPoint(x: 290, y: 82)); accent.curve(to: NSPoint(x: 815, y: 390), controlPoint1: NSPoint(x: 340, y: 230), controlPoint2: NSPoint(x: 830, y: 210)); accent.lineWidth = 13; NSColor(srgbRed: 245/255, green: 30/255, blue: 234/255, alpha: 1).setStroke(); accent.stroke()
let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 285, weight: .black), .foregroundColor: NSColor.white, .paragraphStyle: paragraph, .kern: -10]
NSAttributedString(string: "RTP", attributes: attributes).draw(in: NSRect(x: 40, y: 390, width: 944, height: 360))
NSAttributedString(string: "DRIVER", attributes: [.font: NSFont.systemFont(ofSize: 60, weight: .semibold), .foregroundColor: NSColor.white, .paragraphStyle: paragraph, .kern: 16]).draw(in: NSRect(x: 40, y: 750, width: 944, height: 100))
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("Could not encode the app icon.") }
try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
try data.write(to: destination, options: .atomic)
print("Generated the Rideshare Tax Pros driver icon.")
