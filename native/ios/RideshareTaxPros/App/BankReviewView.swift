import DriverCore
import SwiftUI

struct BankReviewView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var importing = false
  @State private var all = false
  @State private var limit = 100
  private var transactions: [BankTransaction] {
    (model.journal.bankTransactions ?? []).filter { all || $0.readyForReview || $0.needsUpdateReview == true }
  }
  var body: some View {
    List {
      Section {
        NavigationLink { BankConnectionView() } label: { Label("Connect a bank", systemImage: "link") }
        Button { importing = true } label: { Label("Import a bank statement", systemImage: "square.and.arrow.down") }
        Text("Import from any bank that exports CSV, OFX or QFX. Direct linking depends on your firm's provider and the institution's availability. Check the source amount, business purpose and duplicates before posting.")
          .font(.footnote).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      Toggle("Show reviewed, pending & ignored", isOn: $all)
      if transactions.isEmpty {
        ContentUnavailableView("No transactions to review", systemImage: "building.columns",
          description: Text("Import a statement or connect an available bank. Nothing is labeled as business automatically."))
      }
      ForEach(Array(transactions.prefix(limit))) { row in
        NavigationLink { BankTransactionView(id: row.id) } label: {
          VStack(alignment: .leading, spacing: 5) {
            HStack { Text(row.merchant).font(.headline); Spacer(); Text(row.displayAmount) }
            Text("\(row.date) · \(row.accountLabel) · \(row.amountCents > 0 ? "Spending" : "Received")").font(.caption)
            if row.needsUpdateReview == true { Text("Bank details changed—review saved record").foregroundStyle(.orange).font(.caption) }
            else if row.pending { Text("Pending—wait for posting").font(.caption) }
            else if row.removed { Text("Removed by bank").font(.caption) }
            else if row.reviewedRecordId != nil { Text("Linked to journal").font(.caption) }
            else if row.ignored == true { Text("Ignored / personal").font(.caption) }
            else if let category = row.suggestedCategory { Text("Suggested: \(category.label)").font(.caption).foregroundStyle(Brand.link) }
          }
        }.listRowBackground(Brand.surface)
      }
      if transactions.count > limit { Button("Show more transactions") { limit += 100 } }
    }.driverScreen().navigationTitle("Bank review")
      .sheet(isPresented: $importing) { NavigationStack { BankImportView() } }
  }
}

struct BankTransactionView: View {
  @EnvironmentObject private var model: DriverModel
  let id: String
  @State private var adding = false
  @State private var match: DriverRecord?
  private var row: BankTransaction? { model.journal.bankTransactions?.first { $0.id == id } }
  private func matches(_ row: BankTransaction) -> [DriverRecord] {
    model.journal.visible.map(\.record).filter { record in
      guard record.bankReference == nil, abs(Brand.parseDay(record.dateLabel).timeIntervalSince(Brand.parseDay(row.date))) <= 3*86400 else { return false }
      switch record.payload {
      case .expense(let e): return row.amountCents > 0 && e.amountCents == row.amountCents && e.currency == row.currency
      case .income(let i): return row.amountCents < 0 && i.amountCents == -row.amountCents && i.currency == row.currency
      case .trip: return false
      }
    }
  }
  var body: some View {
    List {
      if let row {
        Section(row.merchant) {
          LabeledContent(row.amountCents > 0 ? "Money out" : "Money in", value: row.displayAmount)
          LabeledContent("Date", value: row.date); LabeledContent("Account", value: row.accountLabel)
          LabeledContent("Currency", value: row.currency)
          if let category = row.suggestedCategory { LabeledContent("Suggested category", value: category.label) }
          if row.pending { Text("This is pending. Its amount or merchant can change; wait for the posted transaction.") }
          if row.removed { Text("Your bank removed this transaction. Review any linked journal record; the app has not deleted it.") }
          if row.isTestData == true { Text("Sandbox test transaction. This cannot be posted to your real journal.").foregroundStyle(.orange) }
        }.listRowBackground(Brand.surface)
        if let recordId = row.reviewedRecordId {
          Section("Linked journal record") {
            NavigationLink("Open saved record") { MoneyDetail(id: recordId) }
            if row.needsUpdateReview == true {
              Text("Compare these updated bank details with your saved entry. Corrections are never silently posted.")
              Button("I reviewed this bank update") { update { $0.needsUpdateReview = false } }
            }
          }
        } else if row.readyForReview && row.currency == "USD" && row.isTestData != true {
          Section("Review & save") {
            if row.amountCents < 0 {
              Text("Money received can be earnings, a refund or a transfer. Only record a business receipt here when appropriate; ignore transfers between your own accounts.").font(.footnote)
            }
            Button(row.amountCents > 0 ? "Create expense from this transaction" : "Record business income / receipt") { adding = true }
            Button("Ignore / personal / transfer") { update { $0.ignored = true } }
          }
          let candidates = matches(row)
          if !candidates.isEmpty {
            Section("Possible existing records · confirm a match") {
              Text("Same amount within three days. Matching keeps its receipt and prevents another entry.").font(.caption)
              ForEach(candidates) { record in Button("Match: \(record.title) · \(record.dateLabel)") { match = record } }
            }
          }
        } else if row.ignored == true {
          Button("Return to review") { update { $0.ignored = false } }
        }
      }
    }.driverScreen().navigationTitle("Bank transaction")
      .sheet(isPresented: $adding) {
        if let row { NavigationStack {
          if row.amountCents > 0 { ExpenseEditor(bankTransaction: row) } else { IncomeEditor(bankTransaction: row) }
        } }
      }
      .brandedDialog("Link this bank transaction?",
        isPresented: Binding(get: { match != nil }, set: { if !$0 { match = nil } }),
        message: "Confirm that this transaction belongs to the existing record. Its saved receipt is kept and another entry is not created.",
        icon: "link", accent: Brand.route) {
        guard let existing = match, let row else { return [] }
        return [BrandedDialogAction("Confirm match") {
          var record = existing
          switch record.payload {
          case .expense(var e): e.bankReference = row.reference; record.payload = .expense(e)
          case .income(var i): i.bankReference = row.reference; record.payload = .income(i)
          case .trip: break
          }
          _ = model.save(record)
        }]
      }
  }
  private func update(_ change: (inout BankTransaction) -> Void) {
    _ = model.commit { journal in
      if let index = journal.bankTransactions?.firstIndex(where: { $0.id == id }) { change(&journal.bankTransactions![index]) }
    }
  }
}

extension BankTransaction {
  var displayAmount: String {
    if currency.count == 3 { return (Double(abs(amountCents))/100).formatted(.currency(code: currency)) }
    return String(format: "%.2f", Double(abs(amountCents))/100) + " (currency unknown)"
  }
}
