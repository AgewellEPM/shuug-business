import DriverCore
import SwiftUI

struct ReserveAndHistoryView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var tax = ""
  @State private var vehicle = ""
  @FocusState private var editing: Bool
  private var history: DrivingInsights {
    let start = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
    return DrivingInsights(records: model.journal.visible.map(\.record), goals: model.journal.goals ?? DriverGoals(), from: DriverRecord.day(start), through: DriverRecord.day(Date()))
  }
  private var validRides: [RideProfit] { history.rides.filter { $0.estimatedNetCents != nil && $0.minutes >= 1 } }
  private func hourly(_ rows: [RideProfit]) -> Int? {
    let minutes = rows.reduce(0.0) { $0 + $1.minutes }
    guard minutes > 0 else { return nil }
    return Int((Double(rows.reduce(0) { $0 + ($1.estimatedNetCents ?? 0) }) * 60 / minutes).rounded())
  }
  var body: some View {
    Section("Shift planner & two-hour estimate") {
      let groups = Dictionary(grouping: validRides, by: \.startHour)
      ForEach(groups.keys.sorted(), id: \.self) { hour in
        let rows = groups[hour] ?? []
        if let rate = hourly(rows) { Text("\(String(format: "%02d:00", hour)): \(Brand.usd(rate))/active hour · \(rows.count) drives") }
      }
      if let rate = hourly(validRides), validRides.count >= 3 {
        Text("Two active hours at your recorded average: \(Brand.usd(rate * 2)) estimated net").font(.headline)
        Text("Based on \(validRides.count) completed drives in the last 90 days. It assumes two continuously booked hours; it does not predict demand, idle time, traffic or future earnings.").font(.footnote)
      } else { Text("Record at least three priced business drives to see a two-hour illustration. More observations improve context, not certainty.").font(.footnote) }
    }
    Section("Neighborhood opportunities") {
      let groups = Dictionary(grouping: validRides.filter { $0.workArea != "Unspecified" }, by: \.workArea)
      if groups.isEmpty { Text("Add a work area to completed drives to compare your recorded neighborhoods.") }
      ForEach(groups.keys.sorted(), id: \.self) { area in
        let rows = groups[area] ?? []
        if let rate = hourly(rows) { Text("\(area) · \(Brand.usd(rate))/active hour · \(rows.count) drives") }
      }
      Text("Your named areas are not live demand. A map of actual opportunities requires consented location and sufficient data.").font(.footnote).foregroundStyle(Brand.muted)
    }
    Section("Vehicle health and tax reserves") {
      Text("Set your own percentages of recorded gross income to plan money to set aside. These are planning amounts only; no money moves and this is not a tax estimate or deduction determination.").font(.footnote)
      TextField("Tax reserve percent", text: $tax).keyboardType(.decimalPad).focused($editing)
      TextField("Vehicle health percent", text: $vehicle).keyboardType(.decimalPad).focused($editing)
      Button("Save reserve targets") {
        guard let t = Double(tax), let v = Double(vehicle), t.isFinite, v.isFinite, (0...100).contains(t), (0...100).contains(v), t + v <= 100 else {
          model.message = "Enter percentages from 0 to 100, with a combined total no greater than 100%."; return
        }
        _ = model.commit { $0.reserveSettings = ReserveSettings(taxPercent: t, vehiclePercent: v) }; editing = false
      }
      if let settings = model.journal.reserveSettings {
        let gross = history.days.reduce(0) { $0 + $1.incomeCents }
        Text("Last 90 days of recorded income: \(Brand.usd(gross))")
        Text("Tax planning: \(Brand.usd(Int((Double(gross) * settings.taxPercent / 100).rounded()))) · vehicle health: \(Brand.usd(Int((Double(gross) * settings.vehiclePercent / 100).rounded())))")
        Text("Payout entries may include transfers or duplicated earnings. Review them before using reserve targets.").font(.footnote).foregroundStyle(Brand.muted)
      }
    }.onAppear { if let saved = model.journal.reserveSettings { tax = String(saved.taxPercent); vehicle = String(saved.vehiclePercent) } }
  }
}
