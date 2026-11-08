import CoreGraphics
import Foundation
import ImageIO
import Vision

enum OfferOCR {
  static func text(in image: CGImage, accurate: Bool = false) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = accurate ? .accurate : .fast
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image).perform([request])
    return (request.results ?? []).sorted {
      abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.015
        ? $0.boundingBox.midY > $1.boundingBox.midY : $0.boundingBox.minX < $1.boundingBox.minX
    }.compactMap { $0.topCandidates(1).first?.string }.prefix(160).joined(separator: "\n")
  }
  static func image(from data: Data) throws -> CGImage {
    guard data.count <= 20 * 1024 * 1024, let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 1600
      ] as CFDictionary) else { throw CocoaError(.fileReadCorruptFile) }
    return image
  }
}
