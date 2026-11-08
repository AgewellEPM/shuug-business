import AppKit
import Foundation

struct Caption: Decodable { let text: String }
struct Chapter: Decodable { let id: String, title: String, bullets: [String], captions: [Caption] }
let chapters = try JSONDecoder().decode([Chapter].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
func color(_ hex: UInt32) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
func render(width: Int, height: Int, name: String, draw: () -> Void) throws {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  let context = NSGraphicsContext(bitmapImageRep: bitmap)!
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
  NSColor.clear.setFill(); NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
  draw(); NSGraphicsContext.restoreGraphicsState()
  try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
}
func label(_ text: String, x: CGFloat, top: CGFloat, width: CGFloat, height: CGFloat, canvasHeight: CGFloat = 1080,
           size: CGFloat, bold: Bool = false, tint: NSColor = color(0xFFFFFF)) {
  let style = NSMutableParagraphStyle(); style.lineSpacing = 12; style.lineBreakMode = .byWordWrapping
  let font = NSFont(name: bold ? "Arial-BoldMT" : "ArialMT", size: size) ?? NSFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
  (text as NSString).draw(with: NSRect(x: x, y: canvasHeight - top - height, width: width, height: height),
    options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font, .foregroundColor: tint, .paragraphStyle: style])
}
for (index, chapter) in chapters.enumerated() {
  try render(width: 1920, height: 1080, name: chapter.id + "-panel.png") {
    color(0x03060C).setFill(); NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1920, height: 1080)).fill()
    color(0x140D20).setFill(); NSBezierPath(roundedRect: NSRect(x: 1280, y: -80, width: 600, height: 1250), xRadius: 120, yRadius: 120).fill()
    color(0x9053B7).setStroke(); let phone = NSBezierPath(roundedRect: NSRect(x: 1338, y: 52, width: 464, height: 976), xRadius: 35, yRadius: 35); phone.lineWidth = 3; phone.stroke()
    color(0xF70CE8).setFill(); NSBezierPath(rect: NSRect(x: 100, y: 900, width: 84, height: 6)).fill()
    label("Gig Tax Pros", x: 100, top: 66, width: 800, height: 70, size: 48, bold: true)
    label("GETTING STARTED   /   \(String(format: "%02d", index + 1)) OF \(chapters.count)", x: 100, top: 140, width: 1060, height: 40, size: 24, bold: true, tint: color(0xE3A0FF))
    label(chapter.title, x: 100, top: 220, width: 1100, height: 220, size: 78, bold: true)
    for (line, bullet) in chapter.bullets.enumerated() {
      let top = CGFloat(452 + line * 80)
      color(0x42F5B0).setFill(); NSBezierPath(ovalIn: NSRect(x: 104, y: 1080 - top - 27, width: 14, height: 14)).fill()
      label(bullet, x: 148, top: top, width: 1050, height: 70, size: 40, tint: color(0xD5D1DF))
    }
    color(0x100D18).setFill(); NSBezierPath(roundedRect: NSRect(x: 80, y: 74, width: 1140, height: 270), xRadius: 22, yRadius: 22).fill()
    let note = chapter.id == "screenshots" ? "DoorDash published example · Practice only" : chapter.id == "review" ? "Practice screenshot · Review before saving" : "GIGTAX.PRO  •  Your records. Your next step."
    label(note, x: 100, top: 1024, width: 1100, height: 35, size: 22, tint: color(0xE3A0FF))
  }
  for (number, caption) in chapter.captions.enumerated() {
    try render(width: 1100, height: 240, name: "\(chapter.id)-caption-\(number).png") {
      label(caption.text, x: 0, top: 12, width: 1100, height: 220, canvasHeight: 240, size: 42)
    }
  }
}
print("Rendered \(chapters.count) original title panels and their captions.")
