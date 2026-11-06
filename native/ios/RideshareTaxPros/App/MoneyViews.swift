import DriverCore
import SwiftUI

struct ReceiptPresentation: Identifiable { var id: UUID }
struct MoneyView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var kind = "expense"
  @State private var adding = false
  var body: some View {
    List {
      NavigationLink { BankReviewView() } label: {
        Label("Banks & statement imports", systemImage: "building.columns")
      }.listRowBackground(Brand.surface)
      Picker("Records", selection: $kind) {
        Text("Expenses").tag("expense")
        Text("Income").tag("income")
      }.pickerStyle(.segmented)
      if kind == "expense" {
        NavigationLink {
          ExpenseReviewView()
        } label: {
          Label("Spending & review", systemImage: "chart.bar.xaxis")
        }.listRowBackground(Brand.surface)
      }
      if model.journal.visible.filter({ $0.record.kind == kind }).isEmpty {
        ContentUnavailableView(
          kind == "expense" ? "Keep your costs together" : "Record your driving income",
          systemImage: kind == "expense" ? "receipt" : "dollarsign.circle",
          description: Text(
            kind == "expense"
              ? "Add an expense and attach a scanned receipt or photo. Works offline."
              : "Enter amounts from platform records or review transactions in Banks & statement imports."
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
            if case .expense(let expense) = entry.record.payload {
              Text(expense.category.label).font(.caption).foregroundStyle(Brand.link)
              if !expense.reviewNotes.isEmpty {
                Label("Details to review", systemImage: "list.bullet.clipboard").font(.caption)
                  .foregroundStyle(.orange)
              }
            }
            if entry.record.receiptId != nil {
              Label("Receipt attached", systemImage: "paperclip").font(.caption)
            }
            RecordStatus(entry: entry)
            if let bank = entry.record.bankReference {
              LabeledContent("Bank source", value: bank.accountLabel)
              Text("Linked transaction: \(bank.transactionId)").font(.caption).textSelection(.enabled)
            }
          }.padding(.vertical, 4)
        }.listRowBackground(Brand.surface)
      }
    }.driverScreen().navigationTitle("Income & expenses").toolbar {
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
              LabeledContent("Category", value: expense.category.label)
              LabeledContent("Classification", value: expense.classification.label)
              if let purpose = expense.businessPurpose {
                LabeledContent("Business purpose", value: purpose)
              }
              if let share = expense.businessUsePercent {
                LabeledContent("Recorded business use", value: "\(share)%")
              }
              if let context = expense.mealContext {
                LabeledContent("Meal / travel context", value: context)
              }
              if let vehicle = expense.vehicle { LabeledContent("Vehicle", value: vehicle) }
              if let odometer = expense.odometerMiles {
                LabeledContent("Odometer", value: "\(odometer.formatted()) mi")
              }
              if let payment = expense.paymentMethod {
                LabeledContent("Paid using", value: payment.label)
              }
              if let place = expense.place { LabeledContent("Place", value: place) }
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
          if case .expense(let expense) = entry.record.payload, !expense.reviewNotes.isEmpty {
            Section("Details to review") {
              ForEach(expense.reviewNotes, id: \.self) { Text($0) }
              Text(
                "These are recordkeeping prompts; missing a receipt does not determine deductibility."
              ).font(.footnote).foregroundStyle(Brand.muted)
            }.listRowBackground(Brand.surface)
          }
          Section {
            Button("Edit record") { editing = true }
            Button("Delete record", role: .destructive) { deleting = true }
          }
        }
      } else {
        ContentUnavailableView("Record unavailable", systemImage: "receipt")
      }
    }.driverScreen().navigationTitle("Your record").navigationBarTitleDisplayMode(.inline)
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
struct IncomeEditor: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  var existing: DriverRecord?
  var bankTransaction: BankTransaction?
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
      }.listRowBackground(Brand.surface)
      Section {
        Text(
          "Enter an observed amount from your records. Gross earnings, tips and platform payouts can differ; use the description to identify what this entry represents."
        ).font(.footnote)
      }
      if let validation { Section { Text(validation).foregroundStyle(.red) } }
    }.driverScreen().navigationTitle(existing == nil ? "Add income" : "Edit income")
      .scrollDismissesKeyboard(
        .interactively
      )
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button("Save", action: save) }
      }
      .onAppear {
        if let existing, case .income(let i) = existing.payload {
          date = Brand.parseDay(i.date)
          platform = i.platform
          description = i.description
          amount = String(format: "%.2f", Double(i.amountCents) / 100)
          notes = i.notes
        } else if let bankTransaction {
          date = Brand.parseDay(bankTransaction.date); platform = "other"
          description = bankTransaction.merchant
          amount = String(format: "%.2f", Double(abs(bankTransaction.amountCents))/100)
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
    var income = Income(date: DriverRecord.day(date), platform: platform, description: title, amountCents: cents, notes: notes)
    income.bankReference = bankTransaction?.reference ?? existing?.bankReference
    if model.save(DriverRecord(id: existing?.id ?? UUID(), revision: existing?.revision ?? 0, payload: .income(income)))
    {
      dismiss()
    }
  }
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
    }.driverScreen().navigationTitle("Private receipt").navigationBarTitleDisplayMode(.inline)
      .toolbar {
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
