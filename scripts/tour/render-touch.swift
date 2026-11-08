import AppKit
import Foundation
let out = URL(fileURLWithPath:CommandLine.arguments[1])
let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:120,pixelsHigh:120,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap)
NSColor.clear.setFill();NSBezierPath(rect:NSRect(x:0,y:0,width:120,height:120)).fill()
NSColor(srgbRed:0.97,green:0.05,blue:0.91,alpha:0.95).setStroke()
let ring=NSBezierPath(ovalIn:NSRect(x:20,y:20,width:80,height:80));ring.lineWidth=7;ring.stroke()
NSColor.white.withAlphaComponent(0.95).setFill();NSBezierPath(ovalIn:NSRect(x:53,y:53,width:14,height:14)).fill()
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using:.png,properties:[:])!.write(to:out)
