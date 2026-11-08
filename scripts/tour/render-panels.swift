import AppKit
import Foundation

struct Caption: Decodable { let text: String }
struct Chapter: Decodable { let id: String, title: String, bullets: [String], captions: [Caption] }
let chapters = try JSONDecoder().decode([Chapter].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
func color(_ hex: UInt32, alpha: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
    blue: CGFloat(hex & 255) / 255, alpha: alpha)
}
func render(width: Int, height: Int, name: String, draw: () -> Void) throws {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)!
  NSColor.clear.setFill(); NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
  draw(); NSGraphicsContext.restoreGraphicsState()
  try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
}
func box(_ x: CGFloat, _ top: CGFloat, _ width: CGFloat, _ height: CGFloat,
         radius: CGFloat = 0, canvas: CGFloat = 1080) -> NSBezierPath {
  NSBezierPath(roundedRect: NSRect(x: x, y: canvas - top - height, width: width, height: height), xRadius: radius, yRadius: radius)
}
func label(_ text: String, x: CGFloat, top: CGFloat, width: CGFloat, height: CGFloat, canvas: CGFloat = 1080,
           size: CGFloat, bold: Bool = false, italic: Bool = false, tint: NSColor = color(0xFFFFFF), spacing: CGFloat = 6) {
  let style = NSMutableParagraphStyle(); style.lineSpacing = spacing; style.lineBreakMode = .byWordWrapping
  let face = italic ? "Arial-BoldItalicMT" : bold ? "Arial-BoldMT" : "ArialMT"
  let font = NSFont(name: face, size: size) ?? NSFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
  (text as NSString).draw(with: NSRect(x: x, y: canvas - top - height, width: width, height: height),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    attributes: [.font: font, .foregroundColor: tint, .paragraphStyle: style])
}
func glow(_ x: CGFloat, _ y: CGFloat, radius: CGFloat, tint: UInt32, opacity: CGFloat) {
  NSGradient(colorsAndLocations: (color(tint, alpha: opacity), 0), (color(tint, alpha: 0), 1))!
    .draw(fromCenter: NSPoint(x: x, y: y), radius: 0, toCenter: NSPoint(x: x, y: y), radius: radius, options: [])
}
func brand() {
  color(0xD633F7).setFill()
  let mark = NSBezierPath()
  for (index, point) in [NSPoint(x: 88, y: 958), NSPoint(x: 120, y: 1016), NSPoint(x: 152, y: 958),
                          NSPoint(x: 135, y: 958), NSPoint(x: 120, y: 988), NSPoint(x: 105, y: 958)].enumerated() {
    if index == 0 { mark.move(to: point) } else { mark.line(to: point) }
  }
  mark.close(); mark.fill()
  let slash = NSBezierPath(); slash.move(to: NSPoint(x: 120, y: 1016)); slash.line(to: NSPoint(x: 134, y: 992)); slash.line(to: NSPoint(x: 97, y: 973))
  NSColor.white.setStroke(); slash.lineWidth = 4; slash.stroke()
  label("Gig Tax Pros", x: 174, top: 66, width: 700, height: 70, size: 44, bold: true)
}
let titles = ["home": "Your next shift.\nMore in control.", "drives": "Every mile.\nIn its place.",
  "money": "Your money.\nThe full picture.", "screenshots": "One screenshot.\nA clearer decision.",
  "review": "See the details.\nKnow the tradeoff.", "earnings": "Know your costs.\nChoose your goals.",
  "go_home": "A better way\nto head home.", "position": "Make your next\nmove count.",
  "coach": "Your records.\nUseful context.", "ratings": "Keep track of\nyour reputation.",
  "account": "Your account.\nYour workspace.", "privacy": "Your data.\nYour choices.",
  "help": "A little guidance.\nA clear next step.", "finish": "Your next step\nstarts here."]
for (index, chapter) in chapters.enumerated() {
  try render(width: 1920, height: 1080, name: chapter.id + "-panel.png") {
    NSGradient(starting: color(0x120B20), ending: color(0x03060C))!.draw(in: box(0, 0, 1920, 1080), angle: -20)
    glow(1680, 670, radius: 750, tint: 0xA627F6, opacity: 0.32)
    glow(1280, 120, radius: 550, tint: 0xF70CE8, opacity: 0.12)
    glow(180, 0, radius: 620, tint: 0x5426A5, opacity: 0.17)
    for offset in [CGFloat(0), 58, 116] {
      let route = NSBezierPath(); route.move(to: NSPoint(x: 1120 + offset, y: -120))
      route.line(to: NSPoint(x: 1820 + offset, y: 1200))
      color(0xC061FF, alpha: 0.10).setStroke(); route.lineWidth = 1; route.stroke()
    }
    brand()
    label("THE APP TOUR  /  \(String(format: "%02d", index + 1))", x: 88, top: 183, width: 1000, height: 42, size: 23, bold: true, tint: color(0xE3A0FF))
    label(titles[chapter.id] ?? chapter.title, x: 82, top: 242, width: 1135, height: 215,
      size: 84, bold: true, italic: true, spacing: 0)
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow(); shadow.shadowColor = color(0x000000, alpha: 0.8); shadow.shadowBlurRadius = 44
    shadow.shadowOffset = NSSize(width: 0, height: -18); shadow.set()
    color(0x07090F).setFill(); box(1338, 52, 464, 976, radius: 69).fill()
    NSGraphicsContext.restoreGraphicsState()
    color(0xC881F8, alpha: 0.55).setStroke(); let bezel = box(1338, 52, 464, 976, radius: 69); bezel.lineWidth = 2; bezel.stroke()
    NSGradient(starting: color(0x23132F, alpha: 0.94), ending: color(0x0A0C14, alpha: 0.95))!
      .draw(in: box(88, 790, 1110, 211, radius: 24), angle: -12)
    color(0xF70CE8).setFill(); box(88, 820, 4, 150, radius: 2).fill()
    label("FOLLOW ALONG", x: 118, top: 812, width: 1000, height: 30, size: 18, bold: true, tint: color(0xE3A0FF))
    let note = chapter.id == "screenshots" ? "DOORDASH PUBLISHED EXAMPLE  ·  PRACTICE ONLY" : chapter.id == "review" ? "PRACTICE SCREENSHOT  ·  REVIEW BEFORE SAVING" : "GIGTAX.PRO  /  YOUR RECORDS. YOUR NEXT STEP."
    label(note, x: 88, top: 1031, width: 1130, height: 30, size: 18, tint: color(0xB9ACC8))
    for segment in 0..<chapters.count {
      color(segment == index ? 0xF70CE8 : segment < index ? 0xA627F6 : 0x44344F).setFill()
      box(88 + CGFloat(segment) * 86, 745, 70, 4, radius: 2).fill()
    }
  }
  for (number, bullet) in chapter.bullets.enumerated() {
    try render(width: 1110, height: 72, name: "\(chapter.id)-bullet-\(number).png") {
      color(0xFFFFFF, alpha: 0.045).setFill(); box(0, 0, 1110, 72, radius: 18, canvas: 72).fill()
      color(0xA627F6, alpha: 0.28).setFill(); box(13, 12, 48, 48, radius: 14, canvas: 72).fill()
      label(String(format: "%02d", number + 1), x: 22, top: 25, width: 44, height: 28, canvas: 72, size: 20, bold: true, tint: color(0xF0B6FF))
      label(bullet, x: 84, top: 18, width: 990, height: 50, canvas: 72, size: 33)
    }
  }
  for (number, caption) in chapter.captions.enumerated() {
    try render(width: 1050, height: 150, name: "\(chapter.id)-caption-\(number).png") {
      label(caption.text, x: 0, top: 0, width: 1050, height: 150, canvas: 150, size: 37, spacing: 7)
    }
  }
}
try render(width: 440, height: 952, name: "phone-mask.png") {
  NSColor.black.setFill(); box(0, 0, 440, 952, canvas: 952).fill()
  NSColor.white.setFill(); box(0, 0, 440, 952, radius: 56, canvas: 952).fill()
}
print("Rendered \(chapters.count) brand panels, animated bullet layers, captions and phone mask.")
