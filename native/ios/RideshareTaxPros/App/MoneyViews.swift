import DriverCore
import PhotosUI
import SwiftUI
import VisionKit

struct ReceiptPresentation: Identifiable { var id: UUID }
struct MoneyView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var kind = "expense"
  @State private var adding = false
  var body: some View {
    List {
      Picker("Records", selection: $kind) {
        Text("Expenses").tag("expense")
        Text("Income").tag("income")
      }.pickerStyle(.segmented)
      if model.journal.visible.filter({ $0.record.kind == kind }).isEmpty {
        ContentUnavailableView(
          kind == "expense" ? "Keep your costs together" : "Record your driving income",
          systemImage: kind == "expense" ? "receipt" : "dollarsign.circle",
          description: Text(
            kind == "expense"
              ? "Add an expense and attach a scanned receipt or photo. Works offline."
              : "Enter amounts from your platform or payment records. This app does not connect to your bank."
          ))
      }
      ForEach(model.journal.visible.filter { $0.record.kind == kind }) { entry in
        NavigationLink {
          MoneyDetail(id: entry.id)
        } label: {
          VStack(alignment: .leading, spacing: 5) {
            HStack {
              Text(entry.record.title).font(.headline)
              Spacer()
              Text(amount(entry.record)).font(.headline)
            }
            Text(entry.record.dateLabel).font(.caption).foregroundStyle(.secondary)
            if entry.record.receiptId != nil {
              Label("Receipt attached", systemImage: "paperclip").font(.caption)
            }
            RecordStatus(entry: entry)
          }.padding(.vertical, 4)
        }
      }
    }.navigationTitle("Income & expenses").toolbar {
      Button {
        adding = true
      } label: {
        Label(kind == "expense" ? "Add expense" : "Add income", systemImage: "plus")
      }.disabled(!model.storageHealthy)
    }
    .sheet(isPresented: $adding) {
      NavigationStack { if kind == "expense" { ExpenseEditor() } else { IncomeEditor() } }
    }
  }
  private func amount(_ r: DriverRecord) -> String {
    switch r.payload {
    case .expense(let e): Brand.usd(e.amountCents)
    case .income(let i): Brand.usd(i.amountCents)
    default: ""
    }
  }
}
struct MoneyDetail: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  let id: UUID
  @State private var editing = false
  @State private var deleting = false
  @State private var receipt: ReceiptPresentation?
  private var entry: LocalEntry? { model.journal.entries.first { $0.id == id } }
  var body: some View {
    Group {
      if let entry {
        List {
          Section(entry.record.title) {
            switch entry.record.payload {
            case .expense(let expense):
              Text(Brand.usd(expense.amountCents)).font(.largeTitle.bold())
              LabeledContent("Date", value: expense.date)
              LabeledContent("Category", value: expense.category.rawValue.capitalized)
              LabeledContent("Classification", value: expense.classification.label)
              Text(expense.notes)
              if let id = expense.receiptId {
                Button {
                  receipt = ReceiptPresentation(id: id)
                } label: {
                  Label("View private receipt", systemImage: "doc.viewfinder")
                }
              }
            case .income(let income):
              Text(Brand.usd(income.amountCents)).font(.largeTitle.bold())
              LabeledContent("Date", value: income.date)
              LabeledContent("Platform", value: income.platform.capitalized)
              Text(income.notes)
            default: EmptyView()
            }
            RecordStatus(entry: entry)
          }
          if entry.conflict != nil { ConflictActions(entry: entry) }
          Section {
            Button("Edit record") { editing = true }
            Button("Delete record", role: .destructive) { deleting = true }
          }
        }
      } else {
        ContentUnavailableView("Record unavailable", systemImage: "receipt")
      }
    }.navigationTitle("Your record").navigationBarTitleDisplayMode(.inline)
      .sheet(isPresented: $editing) {
        if let entry {
          NavigationStack {
            if entry.record.kind == "expense" {
              ExpenseEditor(existing: entry.record)
            } else {
              IncomeEditor(existing: entry.record)
            }
          }
        }
      }
      .sheet(item: $receipt) { item in NavigationStack { ReceiptPreview(id: item.id) } }
      .confirmationDialog(
        "Delete this record from your journal and sync that deletion to your firm?",
        isPresented: $deleting, titleVisibility: .visible
      ) {
        Button("Delete record", role: .destructive) {
          model.remove(id)
          dismiss()
        }
      }
  }
}
struct ExpenseEditor: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  var existing: DriverRecord?
  @State private var date = Date()
  @State private var merchant = ""
  @State private var amount = ""
  @State private var category = ExpenseCategory.other
  @State private var classification = TripClassification.unclassified
  @State private var notes = ""
  @State private var photo: PhotosPickerItem?
  @State private var capture: CapturedReceipt?
  @State private var camera = false
  @State private var initialized = false
  @State private var reading = false
  @State private var suggestion: ReceiptSuggestion?
  @State private var validation: String?
  private var oldReceipt: UUID? { existing?.receiptId }
  var body: some View {
    Form {
      Section("Expense") {
        TextField("Merchant", text: $merchant)
        TextField("Amount · USD (12.34)", text: $amount).keyboardType(.decimalPad)
        DatePicker("Date", selection: $date, displayedComponents: .date)
        Picker("Category", selection: $category) {
          ForEach(ExpenseCategory.allCases) { Text($0.rawValue.capitalized).tag($0) }
        }
        Picker("Classification", selection: $classification) {
          ForEach(TripClassification.allCases) { Text($0.label).tag($0) }
        }
        TextField("Notes", text: $notes, axis: .vertical)
      }
      Section("Receipt") {
        if VNDocumentCameraViewController.isSupported {
          Button {
            camera = true
          } label: {
            Label("Scan receipt", systemImage: "doc.viewfinder")
          }
        }
        PhotosPicker(selection: $photo, matching: .images) {
          Label("Choose receipt photo", systemImage: "photo")
        }
        if let capture {
          Label(
            capture.mime == "application/pdf"
              ? "Multi-page PDF attached" : "Receipt photo attached",
            systemImage: "checkmark.circle")
          if capture.mime == "image/jpeg", let image = UIImage(data: capture.data) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180)
              .accessibilityLabel("Attached receipt preview")
          }
          Button("Remove new attachment") {
            self.capture = nil
            suggestion = nil
          }
          Button {
            Task { await recognize(capture) }
          } label: {
            Label("Read receipt on this iPhone", systemImage: "text.viewfinder")
          }.disabled(reading)
          if reading { ProgressView("Reading receipt…") }
        } else if oldReceipt != nil {
          Label("Existing receipt kept", systemImage: "paperclip")
        }
        Text(
          "Receipt reading stays on this iPhone. Review suggested details before saving. A multi-page scan reads suggestions from the first page."
        ).font(.footnote).foregroundStyle(.secondary)
      }
      if let suggestion {
        Section("Suggestions · Check against your receipt") {
          if !suggestion.merchant.isEmpty {
            Button("Use merchant: \(suggestion.merchant)") {
              merchant = String(suggestion.merchant.prefix(160))
            }
          }
          if let value = suggestion.amount { Button("Use amount: $\(value)") { amount = value } }
          DisclosureGroup("Recognized text") {
            Text(suggestion.text).font(.caption).textSelection(.enabled)
          }
        }
      }
      if let validation { Section { Text(validation).foregroundStyle(.red) } }
    }.scrollDismissesKeyboard(.interactively).navigationTitle(
      existing == nil ? "Add expense" : "Edit expense"
    )
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) { Button("Save", action: save) }
    }
    .sheet(isPresented: $camera) {
      ReceiptCamera { result in
        switch result {
        case .success(let value):
          capture = value
          suggestion = nil
        case .failure(let error): validation = error.localizedDescription
        }
      }
    }
    .onChange(of: photo) { _, item in
      Task {
        do {
          if let data = try await item?.loadTransferable(type: Data.self) {
            capture = try CapturedReceipt.photo(data)
            suggestion = nil
          }
        } catch { validation = error.localizedDescription }
      }
    }
    .onAppear {
      guard !initialized else { return }
      initialized = true
      if let existing, case .expense(let e) = existing.payload {
        merchant = e.merchant
        amount = String(format: "%.2f", Double(e.amountCents) / 100)
        notes = e.notes
        category = e.category
        classification = e.classification
        date = parseDay(e.date)
      }
    }
  }
  private func recognize(_ receipt: CapturedReceipt) async {
    reading = true
    defer { reading = false }
    do { suggestion = try await ReceiptReader.read(receipt.recognitionImage) } catch {
      validation = error.localizedDescription
    }
  }
  private func save() {
    let name = merchant.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let cents = JournalExport.cents(amount), !name.isEmpty, name.count <= 160,
      notes.count <= 2000
    else {
      validation = "Enter a merchant, dollars and cents (12.34), and notes under 2,000 characters."
      return
    }
    let receiptId = capture?.id ?? oldReceipt
    let expense = Expense(
      date: DriverRecord.day(date), merchant: name, category: category, amountCents: cents,
      classification: classification, notes: notes, receiptId: receiptId)
    if model.save(
      DriverRecord(
        id: existing?.id ?? UUID(), revision: existing?.revision ?? 0, payload: .expense(expense)),
      receipt: capture?.data, receiptId: capture?.id, mime: capture?.mime ?? "image/jpeg")
    {
      dismiss()
    }
  }
}
struct IncomeEditor: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  var existing: DriverRecord?
  @State private var date = Date()
  @State private var platform = "uber"
  @State private var description = ""
  @State private var amount = ""
  @State private var notes = ""
  @State private var validation: String?
  var body: some View {
    Form {
      Section("Income") {
        TextField("Description", text: $description)
        TextField("Amount · USD (12.34)", text: $amount).keyboardType(.decimalPad)
        DatePicker("Date", selection: $date, displayedComponents: .date)
        Picker("Platform", selection: $platform) {
          Text("Uber / Uber Eats").tag("uber")
          Text("Lyft").tag("lyft")
          Text("Other gig work").tag("other")
        }
        TextField("Notes", text: $notes, axis: .vertical)
      }
      Section {
        Text(
          "Enter an observed amount from your records. Gross earnings, tips and platform payouts can differ; use the description to identify what this entry represents."
        ).font(.footnote)
      }
      if let validation { Section { Text(validation).foregroundStyle(.red) } }
    }.navigationTitle(existing == nil ? "Add income" : "Edit income").scrollDismissesKeyboard(
      .interactively
    )
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) { Button("Save", action: save) }
    }
    .onAppear {
      if let existing, case .income(let i) = existing.payload {
        date = parseDay(i.date)
        platform = i.platform
        description = i.description
        amount = String(format: "%.2f", Double(i.amountCents) / 100)
        notes = i.notes
      }
    }
  }
  private func save() {
    let title = description.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let cents = JournalExport.cents(amount), !title.isEmpty, title.count <= 160,
      notes.count <= 2000
    else {
      validation =
        "Enter a description, dollars and cents (12.34), and notes under 2,000 characters."
      return
    }
    if model.save(
      DriverRecord(
        id: existing?.id ?? UUID(), revision: existing?.revision ?? 0,
        payload: .income(
          Income(
            date: DriverRecord.day(date), platform: platform, description: title,
            amountCents: cents, notes: notes))))
    {
      dismiss()
    }
  }
}
private func parseDay(_ text: String) -> Date {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.dateFormat = "yyyy-MM-dd"
  return f.date(from: text) ?? Date()
}
struct ReceiptPreview: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  let id: UUID
  @State private var data: Data?
  @State private var error: String?
  var body: some View {
    Group {
      if let data, let image = UIImage(data: data) {
        ScrollView([.vertical, .horizontal]) {
          Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: 1000).accessibilityLabel(
            "Your expense receipt")
        }
      } else if let data {
        PDFReceiptView(data: data)
      } else if let error {
        ContentUnavailableView("Receipt unavailable", systemImage: "doc", description: Text(error))
      } else {
        ProgressView("Opening receipt…")
      }
    }.navigationTitle("Private receipt").navigationBarTitleDisplayMode(.inline).toolbar {
      Button("Done") { dismiss() }
    }
    .task {
      do {
        let url = try await model.receiptURL(id)
        data = try Data(contentsOf: url)
      } catch { self.error = error.localizedDescription }
    }
  }
}
