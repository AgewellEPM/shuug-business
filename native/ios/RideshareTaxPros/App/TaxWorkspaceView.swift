import SwiftUI
import UniformTypeIdentifiers
import ImageIO

struct TaxWorkspaceView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var summary: TaxWorkspaceSummary?
  @State private var loading = false
  @State private var busy = false
  @State private var year = 0
  @State private var error: String?
  @State private var notice: String?
  @State private var picking = false
  @State private var importRequest: ClientDocumentRequest?
  @State private var importScope = ""
  @State private var pending: PendingTaxUpload?
  @State private var preview: TaxDocumentPreviewData?
  @State private var operation: Task<Void, Never>?
  private var scope: String {
    guard let connection = model.connection else { return "guest" }
    return connection.origin.absoluteString + "|" + connection.session.account.id.uuidString + "|" + connection.session.token
  }
  private var years: [Int] { Array(Set((summary?.engagements.compactMap(\.year) ?? []) + (summary?.quarterly.compactMap(\.year) ?? []))).sorted(by: >) }
  private var engagements: [ClientTaxEngagement] { summary?.engagements.filter { year == 0 || $0.year == nil || $0.year == year } ?? [] }
  private var quarterly: [ClientQuarterlyReview] { summary?.quarterly.filter { year == 0 || $0.year == nil || $0.year == year } ?? [] }

  var body: some View {
    Form {
      Section {
        Text("Your tax team’s shared progress, document requests and received files use the same client account as your app records.")
        Text("Receiving a file is separate from staff review. These updates do not calculate taxes or prove a return was filed.")
          .font(.footnote).foregroundStyle(.secondary)
      }.listRowBackground(Brand.surface)
      if model.connection == nil {
        Section { Text("Connect your invited client account in Your account to see your tax work.") }
      } else {
        if loading { ProgressView("Loading your tax workspace…") }
        if let error { Section { Text(error).foregroundStyle(.orange) } }
        if let notice { Section { Text(notice).foregroundStyle(Brand.link) } }
        if busy { ProgressView("Working with your private document…") }
        if !years.isEmpty {
          Picker("Tax year", selection: $year) {
            Text("All shared years").tag(0)
            ForEach(years, id: \.self) { Text(String($0)).tag($0) }
          }
        }
        if summary != nil {
          if engagements.isEmpty { Section("Your tax work") { Text("No engagement updates are shared for this selection yet.") } }
          ForEach(Array(engagements.enumerated()), id: \.offset) { _, engagement in
            engagementSection(engagement)
          }
          if !quarterly.isEmpty {
            Section("Quarterly reviews") {
              ForEach(Array(quarterly.enumerated()), id: \.offset) { _, review in
                VStack(alignment: .leading, spacing: 8) {
                  Text(review.name).font(.headline)
                  Text("\(review.quarter)\(review.year.map { " · \($0)" } ?? "") · \(review.status)")
                  if !review.reviewOn.isEmpty { Text("Staff review: \(review.reviewOn)").font(.caption) }
                  if !review.message.isEmpty { Text(review.message).font(.footnote) }
                }.padding(.vertical, 6)
              }
              Text("Staff review dates are not tax payment or filing deadlines. Confirm those dates with your preparer.")
                .font(.footnote).foregroundStyle(.secondary)
            }.listRowBackground(Brand.surface)
          }
        }
        if let connection = model.connection {
          Section { Link("Open the full client portal", destination: connection.taxDocumentsURL) }
        }
      }
    }.driverScreen().navigationTitle("My tax workspace")
      .toolbar { ToolbarItem(placement: .primaryAction) { Button("Refresh") { startReload() }.disabled(loading || busy || model.connection == nil) } }
      .task(id: scope) {
        operation?.cancel(); summary = nil; pending = nil; preview = nil; importRequest = nil
        notice = nil; error = nil; year = 0; busy = false
        await reload(scope)
      }
      .onDisappear { operation?.cancel(); pending = nil; preview = nil }
      .fileImporter(isPresented: $picking, allowedContentTypes: [.pdf, .jpeg, .png]) { result in
        let request = importRequest, expected = importScope
        operation = Task {
          do {
            let url = try result.get()
            guard let request, expected == scope, !Task.isCancelled else { return }
            let file = try await Task.detached(priority: .userInitiated) { try TaxUploadFile.read(url) }.value
            guard expected == scope, !Task.isCancelled else { return }
            pending = PendingTaxUpload(request: request, file: file, scope: expected)
          } catch { if expected == scope, !Task.isCancelled { self.error = error.localizedDescription } }
        }
      }
      .alert("Send this document to your tax team?", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
        Button("Upload to this request") {
          guard let upload = pending else { return }
          pending = nil
          operation = Task { await submit(upload) }
        }
        Button("Cancel", role: .cancel) { pending = nil }
      } message: {
        if let pending { Text("\(pending.file.name)\nRequest: \(pending.request.name)\nYour original stays in its current location.") }
      }
      .sheet(item: $preview) { TaxDocumentPreview(file: $0) }
  }
  @ViewBuilder private func engagementSection(_ engagement: ClientTaxEngagement) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 8) {
        Text(engagement.name).font(.headline)
        Text("\(engagement.year.map { "Tax year \($0) · " } ?? "")\(engagement.stage)")
        if !engagement.message.isEmpty { Text(engagement.message).font(.footnote) }
      }
      ForEach(engagement.documents) { request in documentRequest(request) }
      if engagement.documents.isEmpty { Text("No document requests are shared for this engagement.").font(.footnote) }
      ForEach(Array(engagement.records.enumerated()), id: \.offset) { _, records in
        VStack(alignment: .leading, spacing: 5) {
          Text(records.name).font(.headline)
          if !records.platform.isEmpty { Text(records.platform).font(.caption) }
          LabeledContent("Income records", value: records.income)
          LabeledContent("Mileage records", value: records.mileage)
          LabeledContent("Expense records", value: records.expenses)
          if !records.message.isEmpty { Text(records.message).font(.footnote) }
        }.font(.subheadline).padding(.vertical, 6)
      }
    }.listRowBackground(Brand.surface)
  }
  @ViewBuilder private func documentRequest(_ request: ClientDocumentRequest) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(request.name).font(.headline)
      Text("Request: \(request.status)").font(.subheadline)
      if !request.requestedBy.isEmpty { Text("Requested by your firm: \(request.requestedBy)").font(.caption) }
      if !request.message.isEmpty { Text(request.message).font(.footnote) }
      if request.uploadAvailable {
        Button("Choose PDF or image to upload") { importRequest = request; importScope = scope; error = nil; picking = true }
          .disabled(busy || loading).accessibilityIdentifier("tax.upload.\(request.id.uuidString.lowercased())")
      }
      Text("PDF, JPEG or PNG · Up to 10 MB each. Confirm the file and request before sending.")
        .font(.caption).foregroundStyle(.secondary)
      ForEach(request.submissions) { document in
        VStack(alignment: .leading, spacing: 5) {
          Text(document.name).font(.subheadline).bold()
          Text("\(document.statusLabel) · \(document.createdAt.formatted(date: .abbreviated, time: .shortened))")
            .font(.caption)
          if let reviewed = document.reviewedAt { Text("Review update: \(reviewed.formatted())").font(.caption) }
          Button("Preview / save a copy") {
            let expected = scope
            operation = Task { await open(document, expected: expected) }
          }.disabled(busy || loading)
        }.padding(.vertical, 5)
      }
      if request.submissions.isEmpty { Text("No files received for this request yet.").font(.caption) }
    }.padding(.vertical, 8)
  }
  private func startReload() {
    let expected = scope
    operation = Task { await reload(expected) }
  }
  private func reload(_ expected: String) async {
    guard let connection = model.connection, expected == scope else { return }
    loading = true
    defer { if expected == scope { loading = false } }
    do {
      let reply = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).taxWorkspace()
      guard expected == scope, !Task.isCancelled else { return }
      summary = reply; error = nil
      if reply == nil { notice = "Your tax workspace is not available. Contact your firm." }
    } catch { if expected == scope, !Task.isCancelled { self.error = error.localizedDescription } }
  }
  private func submit(_ upload: PendingTaxUpload) async {
    guard let connection = model.connection, upload.scope == scope else { return }
    busy = true
    defer { if upload.scope == scope { busy = false } }
    do {
      let saved = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).uploadTaxDocument(upload.file, requestID: upload.request.id)
      guard upload.scope == scope, !Task.isCancelled else { return }
      notice = "\(saved.name) was received by your firm. Staff review is a separate step."
      await reload(upload.scope)
    } catch { if upload.scope == scope, !Task.isCancelled { self.error = "Document not confirmed received. Keep the original and retry. \(error.localizedDescription)" } }
  }
  private func open(_ document: ClientTaxDocument, expected: String) async {
    guard let connection = model.connection, expected == scope else { return }
    busy = true
    defer { if expected == scope { busy = false } }
    do {
      let bytes = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).taxDocument(document)
      guard expected == scope, !Task.isCancelled else { return }
      preview = TaxDocumentPreviewData(document: document, bytes: bytes)
    } catch { if expected == scope, !Task.isCancelled { self.error = error.localizedDescription } }
  }
}

private struct PendingTaxUpload { var request: ClientDocumentRequest; var file: TaxUploadFile; var scope: String }
private struct TaxDocumentPreviewData: Identifiable { let id = UUID(); var document: ClientTaxDocument; var bytes: Data }
private struct TaxExportDocument: FileDocument {
  static let readableContentTypes: [UTType] = [.pdf, .jpeg, .png]
  var bytes: Data
  init(bytes: Data) { self.bytes = bytes }
  init(configuration: ReadConfiguration) throws {
    guard let bytes = configuration.file.regularFileContents, bytes.count <= TaxUploadFile.maximumBytes else { throw CocoaError(.fileReadTooLarge) }
    self.bytes = bytes
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: bytes) }
}
private struct TaxDocumentPreview: View {
  var file: TaxDocumentPreviewData
  @Environment(\.dismiss) private var dismiss
  @State private var exporting = false
  @State private var exportError: String?
  private var image: UIImage? {
    guard let source = CGImageSourceCreateWithData(file.bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
      let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 1800, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary)
    else { return nil }
    return UIImage(cgImage: thumbnail)
  }
  var body: some View {
    NavigationStack {
      VStack {
        if file.document.mime == "application/pdf" { PDFReceiptView(data: file.bytes) }
        else if let image { ScrollView { Image(uiImage: image).resizable().scaledToFit().padding() } }
        else { Text("This image could not be previewed. You can save an unchanged copy to inspect separately.").padding() }
        Text("Previewed in memory. A copy is saved only if you choose Save a copy.")
          .font(.caption).foregroundStyle(.secondary).padding()
        if let exportError { Text(exportError).foregroundStyle(.orange).font(.footnote) }
      }.navigationTitle(file.document.name).navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
          ToolbarItem(placement: .confirmationAction) { Button("Save a copy") { exporting = true } }
        }
        .fileExporter(isPresented: $exporting, document: TaxExportDocument(bytes: file.bytes), contentType: UTType(mimeType: file.document.mime) ?? .data, defaultFilename: file.document.name) { result in
          if case .failure(let error) = result { exportError = error.localizedDescription }
        }
    }.preferredColorScheme(.dark)
  }
}
