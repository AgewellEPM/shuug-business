import DriverCore
import SwiftUI

struct ExpenseReviewView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var period = ExpensePeriod.month
  private var summary: ExpenseSummary {
    ExpenseSummary(records: model.journal.visible.map(\.record), period: period)
  }
  var body: some View {
    List {
      Section {
        Picker("Period", selection: $period) {
          ForEach(ExpensePeriod.allCases) { Text($0.rawValue).tag($0) }
        }
        LabeledContent("Recorded spending", value: Brand.usd(summary.totalCents)).font(.headline)
        Text(
          "Includes personal and unreviewed costs. This total is spending, not a calculated tax deduction."
        )
        .font(.footnote).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      Section("Where the money goes") {
        if summary.categoryTotals.isEmpty { Text("Add an expense to see your category totals.") }
        ForEach(summary.categoryTotals, id: \.category) { total in
          LabeledContent(total.category.label, value: Brand.usd(total.cents))
        }
      }.listRowBackground(Brand.surface)
      Section("Details to review · \(summary.needsReview.count)") {
        if summary.needsReview.isEmpty { Text("No missing-detail prompts for these records.") }
        ForEach(summary.needsReview) { record in
          NavigationLink {
            MoneyDetail(id: record.id)
          } label: {
            VStack(alignment: .leading, spacing: 6) {
              Text(record.title).font(.headline)
              if case .expense(let expense) = record.payload {
                Text("\(expense.date) · \(Brand.usd(expense.amountCents))").font(.caption)
                Text(expense.reviewNotes.joined(separator: " · ")).font(.caption).foregroundStyle(
                  Brand.muted)
              }
            }
          }
        }
      }.listRowBackground(Brand.surface)
      Section("Make your records useful") {
        Text(
          "Keep receipts and record the business purpose while it is fresh. For repairs, note the vehicle and odometer. For meals, record the participants or business-travel context."
        )
        Text(
          "Track rider snacks as amenities and your own food as meals. Use the payment field to identify costs already deducted from a platform payout. Review similar-payment warnings before saving a duplicate."
        )
        Text(
          "Your tax preparer reviews meal eligibility, shared-use costs and the appropriate vehicle-expense method. This app keeps the evidence and does not combine mileage and vehicle costs into a deduction."
        )
        Link(
          "IRS travel, meal & vehicle recordkeeping",
          destination: URL(string: "https://www.irs.gov/publications/p463")!)
      }.font(.footnote).listRowBackground(Brand.surface)
    }.driverScreen().navigationTitle("Spending & review")
      .navigationBarTitleDisplayMode(.inline)
  }
}
