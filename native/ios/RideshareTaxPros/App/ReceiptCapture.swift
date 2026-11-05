import PDFKit
import SwiftUI
import Vision
import VisionKit

struct CapturedReceipt {
  var id = UUID()
  var data: Data
  var mime: String
  var recognitionImage: Data
  static func photo(_ data: Data) throws -> Self {
    guard let original = UIImage(data: data) else {
      throw WorkspaceError.message("Choose a supported receipt image.")
    }
    let image = resize(original)
    guard let jpeg = image.jpegData(compressionQuality: 0.76), jpeg.count <= 5 * 1024 * 1024 else {
      throw WorkspaceError.message("This receipt is too large. Use a closer, single-page scan.")
    }
    return Self(data: jpeg, mime: "image/jpeg", recognitionImage: jpeg)
  }
  static func resize(_ image: UIImage) -> UIImage {
    let scale = min(1, 1800 / max(image.size.width, image.size.height))
    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
  }
}
struct ReceiptCamera: UIViewControllerRepresentable {
  var completed: (Result<CapturedReceipt, Error>) -> Void
  @Environment(\.dismiss) private var dismiss
  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
    let c = VNDocumentCameraViewController()
    c.delegate = context.coordinator
    return c
  }
  func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context)
  {}
  final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
    let parent: ReceiptCamera
    init(_ parent: ReceiptCamera) { self.parent = parent }
    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
      parent.dismiss()
    }
    func documentCameraViewController(
      _ controller: VNDocumentCameraViewController, didFailWithError error: Error
    ) {
      parent.completed(.failure(error))
      parent.dismiss()
    }
    func documentCameraViewController(
      _ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan
    ) {
      defer { parent.dismiss() }
      do {
        guard scan.pageCount > 0, scan.pageCount <= 12 else {
          throw WorkspaceError.message("Scan between 1 and 12 receipt pages.")
        }
        let first = try CapturedReceipt.photo(
          scan.imageOfPage(at: 0).jpegData(compressionQuality: 0.9) ?? Data())
        if scan.pageCount == 1 {
          parent.completed(.success(first))
          return
        }
        let pdf = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792)).pdfData
        { context in
          for i in 0..<scan.pageCount {
            let image = CapturedReceipt.resize(scan.imageOfPage(at: i))
            let size = image.size
            let scale = min(576 / size.width, 756 / size.height)
            context.beginPage()
            image.draw(
              in: CGRect(x: 18, y: 18, width: size.width * scale, height: size.height * scale))
          }
        }
        guard pdf.count <= 5 * 1024 * 1024 else {
          throw WorkspaceError.message("This scan exceeds 5 MB. Scan fewer pages per receipt.")
        }
        parent.completed(
          .success(
            CapturedReceipt(
              data: pdf, mime: "application/pdf", recognitionImage: first.recognitionImage)))
      } catch { parent.completed(.failure(error)) }
    }
  }
}
struct ReceiptSuggestion: Sendable { var text: String, merchant: String, amount: String? }
enum ReceiptReader {
  static func read(_ data: Data) async throws -> ReceiptSuggestion {
    try await Task.detached(priority: .userInitiated) {
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      try VNImageRequestHandler(data: data).perform([request])
      let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
      let candidates = lines.enumerated().filter {
        $0.element.uppercased().contains("TOTAL") && !$0.element.uppercased().contains("SUBTOTAL")
      }
      var amount: String?
      for (index, _) in candidates {
        let text = lines[index...min(index + 2, lines.count - 1)].joined(separator: " ")
        if let range = text.range(of: #"\d{1,6}\.\d{2}\b"#, options: .regularExpression) {
          amount = String(text[range])
        }
      }
      return ReceiptSuggestion(
        text: lines.joined(separator: "\n"), merchant: lines.first ?? "", amount: amount)
    }.value
  }
}
struct PDFReceiptView: UIViewRepresentable {
  let data: Data
  func makeUIView(context: Context) -> PDFView {
    let view = PDFView()
    view.autoScales = true
    view.document = PDFDocument(data: data)
    return view
  }
  func updateUIView(_ view: PDFView, context: Context) {}
}
