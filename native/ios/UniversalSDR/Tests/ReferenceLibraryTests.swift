import PDFKit
import UIKit
import XCTest
@testable import UniversalSDR

final class ReferenceLibraryTests: XCTestCase {
    @MainActor
    func testWorkspaceSourcesPersistAndInvalidPDFLeavesPreviousDocumentInPlace() throws {
        let name = UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer {
            defaults.removePersistentDomain(forName: name)
            try? FileManager.default.removeItem(at: root)
        }
        let copies = root.appendingPathComponent("Copies")
        let workspace = try XCTUnwrap(WorkspaceAddress("https://sdr.example.test"))
        let demo = try XCTUnwrap(URL(string: "https://demo.example.test/preview#start"))
        let original = root.appendingPathComponent("Example.pdf")
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 72, height: 72))
        try renderer.writePDF(to: original) { $0.beginPage() }

        let library = ReferenceLibrary(defaults: defaults, directory: copies)
        library.selectWorkspace(workspace.salesURL)
        library.saveLink(demo, for: .demo)
        try library.importPDF(original)
        guard case .pdf(let id, let documentName) = library.sources[.docs] else {
            return XCTFail("Expected a saved PDF")
        }
        let stored = library.pdfURL(id)
        XCTAssertEqual(documentName, "Example.pdf")
        XCTAssertEqual(PDFDocument(url: stored)?.pageCount, 1)

        let corrupt = root.appendingPathComponent("Corrupt.pdf")
        try Data("not a PDF".utf8).write(to: corrupt)
        XCTAssertThrowsError(try library.importPDF(corrupt))

        let restored = ReferenceLibrary(defaults: defaults, directory: copies)
        restored.selectWorkspace(URL(string: "https://other.example.test/sales"))
        XCTAssertTrue(restored.sources.isEmpty)
        restored.selectWorkspace(workspace.salesURL)
        XCTAssertEqual(restored.sources[.demo], .link(demo))
        XCTAssertEqual(restored.sources[.docs], .pdf(id: id, name: documentName))
        restored.clear(.docs)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stored.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
    }
}
