import CryptoKit
import DriverCore
import SwiftUI
import UniformTypeIdentifiers

struct BankImportView: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  @State private var picking = false
  @State private var fileText = ""
  @State private var filename = ""
  @State private var account = ""
  @State private var error: String?
  @State private var rows: [[String]] = []
  @State private var dateColumn = 0
  @State private var merchantColumn = 1
  @State private var amountColumn = 2
  @State private var debitColumn = -1
  @State private var creditColumn = -1
  @State private var referenceColumn = -1
  @State private var dateFormat = StatementDateFormat.iso
  @State private var spendingPositive = false
  @State private var usdConfirmed = false
  @State private var preview: StatementPreview?
  @FocusState private var typing: Bool
  private var ofx: Bool { fileText.range(of: "<OFX", options: .caseInsensitive) != nil }
  var body: some View {
    Form {
      Section("Statement from any bank") {
        Text("Export CSV, OFX or QFX from your bank, then choose the file here. Unsupported direct bank connections can still use this import. This journal currently records USD only.").font(.footnote)
        TextField("Account label (e.g. Checking 1234)", text: $account).focused($typing).accessibilityIdentifier("bank.accountLabel")
        Text("Use the same account label for future imports. No full account number or bank password is needed.").font(.caption)
        Button(filename.isEmpty ? "Choose statement file" : "Choose another file") { picking = true }
        if !filename.isEmpty { Text(filename).font(.caption) }
      }.listRowBackground(Brand.surface)
      if !rows.isEmpty && !ofx {
        Section("Match your CSV columns") {
          Toggle("This export is in USD", isOn: $usdConfirmed)
          column("Date", selection: $dateColumn, optional: false)
          column("Merchant / description", selection: $merchantColumn, optional: false)
          column("Signed amount", selection: $amountColumn)
          if amountColumn == -1 {
            column("Money out / debit", selection: $debitColumn)
            column("Money in / credit", selection: $creditColumn)
          } else {
            Toggle("Positive amounts are money spent", isOn: $spendingPositive)
          }
          column("Transaction ID (if available)", selection: $referenceColumn)
          Picker("Date format", selection: $dateFormat) {
            ForEach(StatementDateFormat.allCases) { Text($0.rawValue).tag($0) }
          }
          Text("Amounts must be USD, with a dot for cents. Comma and tab separated exports are supported. Check the preview: Spending is money out, Received is money in.").font(.footnote)
        }.listRowBackground(Brand.surface)
      }
      if !fileText.isEmpty {
        Button("Preview transactions") { makePreview() }.accessibilityIdentifier("bank.preview")
      }
      if let error { Text(error).foregroundStyle(.orange) }
      if let preview {
        Section("Review before import") {
          Text("\(preview.transactions.count) readable transactions · \(preview.issues.count) rows need attention")
          ForEach(Array(preview.transactions.prefix(12))) { row in
            VStack(alignment: .leading) {
              Text(row.merchant)
              Text("\(row.date) · \(row.amountCents > 0 ? "Spending" : "Received") \(Brand.usd(abs(row.amountCents))) · \(row.currency)").font(.caption)
            }
          }
          ForEach(Array(preview.issues.prefix(10).enumerated()), id: \.offset) { _, issue in Text(issue).font(.caption).foregroundStyle(.orange) }
          if preview.transactions.count > 12 { Text("First 12 shown. All imported rows are available in Bank review.").font(.caption) }
          Text("Nothing is posted as a business expense automatically. Review classifications and matches in the inbox. Without stable transaction IDs, overlapping exports may need manual duplicate review.").font(.footnote)
          Button("Import \(preview.transactions.count) transactions") { save(preview) }
            .disabled(preview.transactions.isEmpty || preview.transactions.contains { $0.currency != "USD" })
            .accessibilityIdentifier("bank.import")
        }.listRowBackground(Brand.surface)
      }
    }.driverScreen().navigationTitle("Import bank statement")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        ToolbarItem(placement: .keyboard) { Button("Done") { typing = false }.accessibilityIdentifier("entry.dismissKeyboard") }
      }
      .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText, .data]) { result in
        do {
          let url = try result.get(), access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
          guard size <= 5 * 1024 * 1024 else { throw StatementError.invalid("Choose an export under 5 MB.") }
          fileText = try StatementImport.text(Data(contentsOf: url)); filename = url.lastPathComponent
          preview = nil; error = nil
          if !ofx { rows = try StatementImport.csv(fileText); guessColumns() } else { rows = [] }
        } catch { self.error = error.localizedDescription; fileText = ""; rows = []; preview = nil }
      }
      .onChange(of: account) { _, _ in preview = nil }
      .onChange(of: dateColumn) { _, _ in preview = nil }.onChange(of: merchantColumn) { _, _ in preview = nil }
      .onChange(of: amountColumn) { _, _ in preview = nil }.onChange(of: debitColumn) { _, _ in preview = nil }
      .onChange(of: creditColumn) { _, _ in preview = nil }.onChange(of: referenceColumn) { _, _ in preview = nil }
      .onChange(of: dateFormat) { _, _ in preview = nil }.onChange(of: spendingPositive) { _, _ in preview = nil }
  }
  private func column(_ label: String, selection: Binding<Int>, optional: Bool = true) -> some View {
    Picker(label, selection: selection) {
      if optional { Text("None / separate debit & credit").tag(-1) }
      ForEach(Array((rows.first ?? []).enumerated()), id: \.offset) { index, name in Text("\(index+1). \(name)").tag(index) }
    }
  }
  private func guessColumns() {
    let headers = (rows.first ?? []).map { $0.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) }
    func column(_ words: [String], fallback: Int) -> Int { headers.firstIndex { name in words.contains { name.contains($0) } } ?? fallback }
    dateColumn = column(["date"], fallback: 0)
    merchantColumn = column(["description", "merchant", "memo", "payee"], fallback: min(1, headers.count-1))
    amountColumn = column(["amount"], fallback: -1)
    debitColumn = column(["debit", "withdrawal", "money out"], fallback: -1)
    creditColumn = column(["credit", "deposit", "money in"], fallback: -1)
    referenceColumn = column(["transaction id", "reference", "fitid"], fallback: -1)
  }
  private func makePreview() {
    error = nil
    let label = account.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !label.isEmpty, label.count <= 100 else { error = "Enter an account label under 100 characters."; return }
    do {
      if ofx { preview = try StatementImport.ofx(fileText, account: label) }
      else {
        guard usdConfirmed else { error = "Confirm this CSV's amounts are in USD. Other currencies cannot be converted here."; return }
        guard amountColumn >= 0 || debitColumn >= 0 || creditColumn >= 0 else { error = "Choose an amount column, or debit and/or credit columns."; return }
        let columns = StatementColumns(date: dateColumn, merchant: merchantColumn, amount: amountColumn >= 0 ? amountColumn : nil,
          debit: debitColumn >= 0 ? debitColumn : nil, credit: creditColumn >= 0 ? creditColumn : nil,
          reference: referenceColumn >= 0 ? referenceColumn : nil, positiveMeansSpending: spendingPositive, dateFormat: dateFormat)
        preview = StatementImport.preview(rows: rows, columns: columns, account: label,
          fileIdentity: SHA256.hash(data: Data(fileText.utf8)).map { String(format: "%02x", $0) }.joined())
      }
      if preview?.transactions.contains(where: { $0.currency != "USD" }) == true { error = "This statement is not explicitly USD. No currency conversion is available; choose a USD export." }
    } catch { self.error = error.localizedDescription }
  }
  private func save(_ preview: StatementPreview) {
    let merged = BankInbox.merging(preview.transactions, into: model.journal.bankTransactions ?? [])
    guard merged.count <= 50_000 else { error = "This phone inbox has reached 50,000 transactions."; return }
    if model.commit({ $0.bankTransactions = merged }) { dismiss() }
  }
}
