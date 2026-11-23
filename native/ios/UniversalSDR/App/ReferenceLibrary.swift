import PDFKit
import SwiftUI

enum ReferenceKind: String, CaseIterable {
    case demo, docs

    var title: String { self == .demo ? "Demo" : "Docs" }
}

enum ReferenceSource: Codable, Equatable {
    case link(URL)
    case pdf(id: UUID, name: String)
}

@MainActor
final class ReferenceLibrary: ObservableObject {
    @Published private(set) var sources: [ReferenceKind: ReferenceSource] = [:]

    private let defaults: UserDefaults
    private let directory: URL
    private var workspace: URL?

    init(defaults: UserDefaults = .standard, directory: URL? = nil) {
        self.defaults = defaults
        self.directory = directory ?? URL.applicationSupportDirectory.appending(path: "WorkspacePDFs", directoryHint: .isDirectory)
    }

    func selectWorkspace(_ workspace: URL?) {
        self.workspace = workspace
        sources = Dictionary(uniqueKeysWithValues: ReferenceKind.allCases.compactMap { kind in
            guard let source = storedSource(for: kind) else { return nil }
            return (kind, source)
        })
    }

    func saveLink(_ url: URL, for kind: ReferenceKind) {
        save(.link(url), for: kind)
    }

    func importPDF(_ file: URL) throws {
        guard workspace != nil else { return }
        let hasAccess = file.startAccessingSecurityScopedResource()
        defer { if hasAccess { file.stopAccessingSecurityScopedResource() } }

        let id = UUID()
        let destination = pdfURL(id)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        do {
            try FileManager.default.copyItem(at: file, to: destination)
            guard let pdf = PDFDocument(url: destination), !pdf.isLocked, pdf.pageCount > 0 else {
                throw CocoaError(.fileReadCorruptFile)
            }
            save(.pdf(id: id, name: file.lastPathComponent), for: .docs)
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    func pdfURL(_ id: UUID) -> URL {
        directory.appending(path: id.uuidString + ".pdf", directoryHint: .notDirectory)
    }

    func clear(_ kind: ReferenceKind) {
        save(nil, for: kind)
    }

    private func key(for kind: ReferenceKind) -> String? {
        workspace.map { "sdr.reference.\(kind.rawValue).\($0.absoluteString)" }
    }

    private func storedSource(for kind: ReferenceKind) -> ReferenceSource? {
        guard let key = key(for: kind), let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(ReferenceSource.self, from: data)
    }

    private func save(_ source: ReferenceSource?, for kind: ReferenceKind) {
        guard let key = key(for: kind) else { return }
        let previous = storedSource(for: kind)
        if let source {
            guard let data = try? JSONEncoder().encode(source) else { return }
            defaults.set(data, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
        sources[kind] = source
        if previous != source, case .pdf(let id, _) = previous {
            try? FileManager.default.removeItem(at: pdfURL(id))
        }
    }
}
