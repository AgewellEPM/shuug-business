import DriverCore
import PhotosUI
import SwiftUI
import VisionKit

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
  @State private var businessPurpose = ""
  @State private var businessUse = ""
  @State private var mealContext = ""
  @State private var vehicle = ""
  @State private var odometer = ""
  @State private var payment: ExpensePayment?
  @State private var place = ""
  @State private var detailsExpanded = false
  @State private var duplicateConfirmation = false
  @State private var photo: PhotosPickerItem?
  @State private var capture: CapturedReceipt?
  @State private var camera = false
  @State private var initialized = false
  @State private var reading = false
  @State private var suggestion: ReceiptSuggestion?
  @State private var validation: String?
  private enum Field: Hashable {
    case merchant, amount, notes, purpose, businessUse, mealContext, vehicle, odometer, place
  }
  @FocusState private var focusedField: Field?
  private var oldReceipt: UUID? { existing?.receiptId }
  var body: some View {
    Form {
      Section("Expense") {
        TextField("Merchant", text: $merchant).focused($focusedField, equals: .merchant)
        TextField("Amount · USD (12.34)", text: $amount).keyboardType(.decimalPad)
          .focused($focusedField, equals: .amount)
        DatePicker("Date", selection: $date, displayedComponents: .date)
        Picker("Category", selection: $category) {
          ForEach(ExpenseGroup.allCases) { group in
            Section(group.rawValue) {
              ForEach(ExpenseCategory.allCases.filter { $0.group == group }) {
                Text($0.label).tag($0)
              }
            }
          }
        }.pickerStyle(.navigationLink).accessibilityIdentifier("expense.category")
        Picker("Classification", selection: $classification) {
          ForEach(TripClassification.allCases) { Text($0.label).tag($0) }
        }.pickerStyle(.navigationLink).accessibilityIdentifier("expense.classification")
        TextField("Notes", text: $notes, axis: .vertical).focused($focusedField, equals: .notes)
      }.listRowBackground(Brand.surface)
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
            focusedField = nil
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
        }.listRowBackground(Brand.surface)
      }
      Section {
        DisclosureGroup("Business & vehicle details", isExpanded: $detailsExpanded) {
          TextField("Business purpose", text: $businessPurpose, axis: .vertical)
            .focused($focusedField, equals: .purpose)
            .accessibilityIdentifier("expense.purpose")
          TextField("Business use % (optional)", text: $businessUse).keyboardType(.numberPad)
            .focused($focusedField, equals: .businessUse)
          Picker("Paid using", selection: $payment) {
            Text("Not recorded").tag(Optional<ExpensePayment>.none)
            ForEach(ExpensePayment.allCases) { Text($0.label).tag(Optional($0)) }
          }
          TextField("Place / city (optional)", text: $place).focused($focusedField, equals: .place)
          if category.group == .vehicle {
            TextField("Vehicle (optional)", text: $vehicle).focused($focusedField, equals: .vehicle)
            TextField("Odometer miles (optional)", text: $odometer).keyboardType(.decimalPad)
              .focused($focusedField, equals: .odometer)
          }
          if category == .meals {
            TextField("Meal participants or travel context", text: $mealContext, axis: .vertical)
              .focused($focusedField, equals: .mealContext)
              .accessibilityIdentifier("expense.mealContext")
            Text(
              "Track personal food here too. For a business meal, record who attended and why, or the business-travel circumstances. Your preparer reviews eligibility."
            )
            .font(.footnote).foregroundStyle(Brand.muted)
          }
          Text(
            "Record a documented business-use share for mixed costs. Vehicle costs and mileage are tracked together for review; the app does not add them into a tax deduction."
          )
          .font(.footnote).foregroundStyle(Brand.muted)
        }
      }.listRowBackground(Brand.surface)
      if let validation { Section { Text(validation).foregroundStyle(.red) } }
    }.driverScreen().scrollDismissesKeyboard(.immediately).navigationTitle(
      existing == nil ? "Add expense" : "Edit expense"
    )
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) { Button("Save", action: save) }
      ToolbarItem(placement: .keyboard) {
        Button("Done") { focusedField = nil }.accessibilityIdentifier("expense.dismissKeyboard")
      }
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
    .confirmationDialog(
      "A similar expense already exists for this merchant, date and amount. Check that this is a separate payment.",
      isPresented: $duplicateConfirmation, titleVisibility: .visible
    ) {
      Button("Save another expense") { persist(allowDuplicate: true) }
      Button("Cancel", role: .cancel) {}
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
        date = Brand.parseDay(e.date)
        businessPurpose = e.businessPurpose ?? ""
        businessUse = e.businessUsePercent.map(String.init) ?? ""
        mealContext = e.mealContext ?? ""
        vehicle = e.vehicle ?? ""
        odometer = e.odometerMiles.map { String(format: "%.1f", $0) } ?? ""
        payment = e.paymentMethod
        place = e.place ?? ""
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
  private func save() { persist(allowDuplicate: false) }
  private func persist(allowDuplicate: Bool) {
    func optional(_ text: String) -> String? {
      let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
      return value.isEmpty ? nil : value
    }
    let name = merchant.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let cents = JournalExport.cents(amount), !name.isEmpty, name.count <= 160,
      notes.count <= 2000, businessPurpose.count <= 500, mealContext.count <= 500,
      vehicle.count <= 80, place.count <= 240
    else {
      validation =
        "Enter a merchant and dollars and cents (12.34). Keep notes under 2,000 characters, purpose and meal details under 500, vehicle under 80 and place under 240."
      return
    }
    let shareText = optional(businessUse)
    let odometerText = optional(odometer)
    let share = shareText.flatMap(Int.init)
    let reading = odometerText.flatMap(Double.init)
    guard shareText == nil || share.map({ (0...100).contains($0) }) == true else {
      validation =
        "Use a whole business-use percentage from 0 to 100, or leave it blank for review."
      return
    }
    guard
      odometerText == nil || reading.map({ $0.isFinite && (0...2_000_000).contains($0) }) == true
    else {
      validation = "Enter an odometer reading between 0 and 2,000,000 miles, or leave it blank."
      return
    }
    let receiptId = capture?.id ?? oldReceipt
    let expense = Expense(
      date: DriverRecord.day(date), merchant: name, category: category, amountCents: cents,
      classification: classification, notes: notes, receiptId: receiptId,
      businessPurpose: optional(businessPurpose),
      businessUsePercent: classification == .personal ? 0 : share,
      mealContext: optional(mealContext), vehicle: optional(vehicle), odometerMiles: reading,
      paymentMethod: payment, place: optional(place))
    if !allowDuplicate
      && ExpenseSummary.hasPossibleDuplicate(
        expense, records: model.journal.visible.map(\.record), excluding: existing?.id)
    {
      duplicateConfirmation = true
      return
    }
    if model.save(
      DriverRecord(
        id: existing?.id ?? UUID(), revision: existing?.revision ?? 0, payload: .expense(expense)),
      receipt: capture?.data, receiptId: capture?.id, mime: capture?.mime ?? "image/jpeg")
    {
      dismiss()
    }
  }
}
