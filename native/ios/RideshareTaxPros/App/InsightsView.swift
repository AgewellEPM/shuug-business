import Charts
import DriverCore
import SwiftUI

struct InsightsView: View {
  var sample: GigSampleShift? = nil
  @EnvironmentObject private var model: DriverModel
  @State private var period = 7
  @State private var editingGoals = false
  @State private var selectedDate: Date?
  private var records: [DriverRecord] { sample?.records ?? model.journal.visible.map(\.record) }
  private var goals: DriverGoals { sample?.goals ?? model.journal.goals ?? DriverGoals() }
  private var first: String {
    DriverRecord.day(Calendar.current.date(byAdding: .day, value: -(period-1), to: Date())!)
  }
  private var summary: DrivingInsights {
    DrivingInsights(records: records, goals: goals,
                    from: first, through: DriverRecord.day(Date()))
  }
  private var days: [DrivingDay] {
    let values = Dictionary(uniqueKeysWithValues: summary.days.map { ($0.date, $0) })
    return (0..<period).reversed().map { offset in
      let day = DriverRecord.day(Calendar.current.date(byAdding: .day, value: -offset, to: Date())!)
      return values[day] ?? DrivingDay(date: day)
    }
  }
  private var priced: [RideProfit] { summary.rides.filter { $0.estimatedNetCents != nil } }
  private var lowRides: [RideProfit] {
    priced.filter { ($0.estimatedNetCents ?? 0) < 0 || (goals.targetHourlyCents != nil && ($0.hourlyCents ?? .infinity) < Double(goals.targetHourlyCents!)) }
      .sorted { ($0.hourlyCents ?? .infinity) < ($1.hourlyCents ?? .infinity) }
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack {
          Text("Know what your driving earns.").font(.title2.bold())
          Spacer()
          if sample == nil { Button("Goals") { editingGoals = true }.accessibilityIdentifier("insights.goals") }
        }
        Picker("Period", selection: $period) {
          Text("7 days").tag(7); Text("30 days").tag(30); Text("90 days").tag(90)
        }.pickerStyle(.segmented)
        EarningsPulseCard(records: records, goals: goals, days: period)
        EarningsEfficiencyCard(summary: summary)
        MileageMixCard(summary: summary, goals: goals)
        goalsCard
        if summary.days.isEmpty {
          ContentUnavailableView("Your numbers, as you drive", systemImage: "chart.bar.xaxis",
            description: Text("Add fares to completed business trips and record income and expenses. Your charts will grow from those records."))
        }
        VStack(alignment: .leading, spacing: 12) {
          Text("Money in & money out").font(.headline)
          LabeledContent("Recorded income", value: Brand.usd(days.reduce(0) { $0 + $1.incomeCents }))
          LabeledContent("Business expenses", value: Brand.usd(days.reduce(0) { $0 + $1.businessExpenseCents }))
          LabeledContent("Recorded cash flow", value: Brand.usd(days.reduce(0) { $0 + $1.recordedCashFlowCents }))
          Chart(days) { day in
            BarMark(x: .value("Date", Brand.parseDay(day.date)), y: .value("Dollars", Double(day.incomeCents)/100))
              .foregroundStyle(by: .value("Type", "Income")).position(by: .value("Type", "Income"))
            BarMark(x: .value("Date", Brand.parseDay(day.date)), y: .value("Dollars", Double(day.businessExpenseCents)/100))
              .foregroundStyle(by: .value("Type", "Expenses")).position(by: .value("Type", "Expenses"))
          }.chartForegroundStyleScale(["Income": Brand.purple, "Expenses": Brand.pink])
            .chartXSelection(value: $selectedDate).frame(height: 210)
          if let selectedDate, let day = days.first(where: { $0.date == DriverRecord.day(selectedDate) }) {
            Text("\(day.date): \(Brand.usd(day.incomeCents)) income · \(Brand.usd(day.businessExpenseCents)) expenses")
              .font(.caption).accessibilityIdentifier("insights.selectedDay")
          }
          Text("Business expenses use the recorded business-use share, or 100% when blank. Personal and unclassified expenses are excluded. Cash flow follows entry dates; payouts can cover earlier rides.")
            .font(.caption).foregroundStyle(Brand.muted)
        }.insightPanel()
        VStack(alignment: .leading, spacing: 12) {
          Text("Fuel & charging").font(.headline)
          Text(Brand.usd(days.reduce(0) { $0 + $1.fuelCents })).font(.title.bold())
          Chart(days) { day in
            BarMark(x: .value("Date", Brand.parseDay(day.date)), y: .value("Dollars", Double(day.fuelCents)/100))
              .foregroundStyle(Brand.pink)
          }.frame(height: 150)
          Text("Recorded business fuel and charging purchases. A fill-up can cover several days, so this is spending—not fuel consumed by an individual ride.")
            .font(.caption).foregroundStyle(Brand.muted)
        }.insightPanel()
        VStack(alignment: .leading, spacing: 12) {
          Text("Estimated driving profit").font(.headline)
          Text(Brand.usd(priced.reduce(0) { $0 + ($1.estimatedNetCents ?? 0) })).font(.title.bold())
          Text("\(priced.count) of \(summary.rides.count) completed business drives have fares, fees and a vehicle-cost estimate.")
            .font(.subheadline)
          Chart(days) { day in
            BarMark(x: .value("Date", Brand.parseDay(day.date)), y: .value("Estimated net dollars", Double(day.estimatedRideNetCents)/100))
              .foregroundStyle(day.estimatedRideNetCents < 0 ? Color.orange : Brand.purple)
            RuleMark(y: .value("Break even", 0)).foregroundStyle(.secondary)
          }.frame(height: 180)
          Text("Fare + tips − platform fees − miles × your vehicle cost. Fuel, repairs and other vehicle costs belong in that per-mile estimate; recorded expenses are not subtracted again. Excludes income tax and costs outside your estimate. Bank payouts are not added to ride fares.")
            .font(.caption).foregroundStyle(Brand.muted)
        }.insightPanel()
        opportunities
        breakdown("Platforms", grouping: { $0.platform.capitalized })
        breakdown("Areas you drove", grouping: { $0.workArea })
        breakdown("Time of day", grouping: { String(format: "%02d:00–%02d:59", $0.startHour, $0.startHour) })
        if !lowRides.isEmpty {
          VStack(alignment: .leading, spacing: 12) {
            Text("Rides below your goal").font(.headline)
            ForEach(Array(lowRides.prefix(8))) { ride in
              Group {
                if sample == nil { NavigationLink { TripDetail(id: ride.id) } label: { rideLabel(ride) } }
                else { rideLabel(ride) }
              }
            }
          }.insightPanel()
        }
      }.padding(.horizontal, 16).padding(.vertical, 10)
    }.driverScreen().navigationTitle(sample == nil ? "Earnings" : "Sample earnings")
      .sheet(isPresented: $editingGoals) { NavigationStack { GoalsEditor() } }
  }
  private func rideLabel(_ ride: RideProfit) -> some View {
                VStack(alignment: .leading, spacing: 4) {
                  Text(ride.title)
                  Text("\(Brand.usd(ride.estimatedNetCents ?? 0)) estimated net · \(ride.hourlyCents.map { Brand.usd(Int($0.rounded())) + "/hr" } ?? "Time unavailable")")
                    .font(.caption).foregroundStyle(.orange)
                }
  }
  private var goalsCard: some View {
    let records = self.records
    let today = DriverRecord.day(Date())
    let week = Calendar.current.dateInterval(of: .weekOfYear, for: Date())!.start
    let weekly = DrivingInsights(records: records, goals: goals, from: DriverRecord.day(week), through: today)
    let daily = weekly.days.first { $0.date == today }
    return VStack(alignment: .leading, spacing: 12) {
      Text("Your net driving goals").font(.headline)
      if let target = goals.dailyNetCents, target > 0 {
        goalProgress("Today", net: daily?.estimatedRideNetCents ?? 0, target: target)
      }
      if let target = goals.weeklyNetCents, target > 0 {
        goalProgress("This calendar week", net: weekly.days.reduce(0) { $0 + $1.estimatedRideNetCents }, target: target)
      }
      if goals.dailyNetCents == nil && goals.weeklyNetCents == nil {
        Button("Set my goals & vehicle cost") { editingGoals = true }
      }
      Text("Progress uses completed business drives with all profit details. \(weekly.rides.count - weekly.rides.filter { $0.estimatedNetCents != nil }.count) drives this week still need details. Estimated profit can change after review.")
        .font(.caption).foregroundStyle(Brand.muted)
    }.insightPanel()
  }
  private func goalProgress(_ title: String, net: Int, target: Int) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      LabeledContent(title, value: "\(Brand.usd(net)) / \(Brand.usd(target))")
      ProgressView(value: min(1, max(0, Double(net)/Double(target)))).tint(Brand.pink)
      Text(net >= target ? "Recorded estimates have reached this goal." : "\(Brand.usd(target-net)) to go based on recorded estimates.")
        .font(.caption)
    }
  }
  private var opportunities: some View {
    let unpaid = summary.rides.filter { $0.role == .reposition }
    return VStack(alignment: .leading, spacing: 12) {
      Text("Where money may be slipping away").font(.headline)
      Label("\(String(format: "%.1f", unpaid.reduce(0) { $0 + $1.miles })) miles without a paid ride", systemImage: "car.side")
      Text("Mark travel to pickups and repositioning separately. Include that time and distance when comparing your working day; paid-trip hourly rates alone overstate it.")
        .font(.caption).foregroundStyle(Brand.muted)
      if goals.vehicleCostCentsPerMile == nil { Text("Set your vehicle cost per mile to estimate wear, fuel and other operating costs.") }
      if summary.missingFareCount > 0 { Text("Add fares to \(summary.missingFareCount) business drives to see their profitability.") }
      if summary.unreviewedTrips + summary.unreviewedExpenses > 0 {
        Text("Classify \(summary.unreviewedTrips) trips and \(summary.unreviewedExpenses) expenses before counting them in these totals.")
      }
      if priced.contains(where: { $0.needsMileageReview }) { Text("Some priced drives have GPS gaps. Review their mileage before relying on profit per mile.").foregroundStyle(.orange) }
      Text("Open a GPS trip to compare current route options. A shorter route can save cost, but traffic, tolls and pickup requirements can change the better choice.")
        .font(.caption).foregroundStyle(Brand.muted)
    }.insightPanel()
  }
  private func breakdown(_ title: String, grouping: (RideProfit) -> String) -> some View {
    let groups = Dictionary(grouping: priced.filter { $0.minutes >= 1 }, by: grouping)
    let totals: [InsightGroupRow] = groups.map { key, rides in
      let cents: Int = rides.reduce(0) { $0 + ($1.estimatedNetCents ?? 0) }
      let minutes: Double = rides.reduce(0) { $0 + $1.minutes }
      return InsightGroupRow(key: key, count: rides.count, rate: Double(cents) / (minutes / 60) / 100)
    }
    let values = Array(totals.sorted { $0.rate > $1.rate }.prefix(6))
    return VStack(alignment: .leading, spacing: 12) {
      Text(title).font(.headline)
      if values.isEmpty {
        Text("Add completed business drives with fare and cost details to compare.").font(.caption)
      } else {
        Chart(Array(values), id: \.key) { row in
          BarMark(x: .value("Estimated net dollars per driving hour", row.rate), y: .value(title, row.key))
            .foregroundStyle(row.rate < 0 ? Color.orange : Brand.purple)
        }.frame(height: CGFloat(values.count * 38 + 30))
        ForEach(Array(values), id: \.key) { row in
          Text("\(row.key): \(Brand.usd(Int((row.rate * 100).rounded())))/hr · \(row.count) drives").font(.caption)
        }
      }
      Text("Estimated net per recorded driving hour, weighted by time. Includes only priced drives; missing idle time and unlogged rides affect comparisons. This describes your records, not a prediction.")
        .font(.caption).foregroundStyle(Brand.muted)
    }.insightPanel()
  }
}

private struct InsightGroupRow { let key: String; let count: Int; let rate: Double }

struct GoalsEditor: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  @State private var daily = ""
  @State private var weekly = ""
  @State private var hourly = ""
  @State private var cost = ""
  @State private var error: String?
  @FocusState private var editing: Bool
  var body: some View {
    Form {
      Section("Estimated net goals · USD") {
        TextField("Daily net goal", text: $daily).accessibilityIdentifier("goals.daily")
        TextField("Weekly net goal", text: $weekly).accessibilityIdentifier("goals.weekly")
        TextField("Net per driving hour", text: $hourly).accessibilityIdentifier("goals.hourly")
      }.keyboardType(.decimalPad).focused($editing).listRowBackground(Brand.surface)
      Section("Your vehicle operating estimate") {
        TextField("Cost per mile · USD", text: $cost).keyboardType(.decimalPad).focused($editing)
          .accessibilityIdentifier("goals.cost")
        Text("Include fuel/charging, maintenance, tires, repairs, depreciation and allocated fixed vehicle costs. Enter your own estimate; this is not the tax mileage rate. For example, 0.50 means fifty cents per mile.")
          .font(.footnote)
        Text("Changing this estimate recalculates all ride estimates. Goals and cost assumptions are stored on this phone; historical fares remain unchanged.").font(.footnote)
      }.listRowBackground(Brand.surface)
      if let error { Text(error).foregroundStyle(.orange) }
    }.driverScreen().navigationTitle("Driving goals")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .keyboard) { Button("Done") { editing = false }.accessibilityIdentifier("entry.dismissKeyboard") }
        ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
      }.onAppear {
        let goals = model.journal.goals ?? DriverGoals()
        daily = goals.dailyNetCents.map { String(format: "%.2f", Double($0)/100) } ?? ""
        weekly = goals.weeklyNetCents.map { String(format: "%.2f", Double($0)/100) } ?? ""
        hourly = goals.targetHourlyCents.map { String(format: "%.2f", Double($0)/100) } ?? ""
        cost = goals.vehicleCostCentsPerMile.map { String(format: "%.2f", $0/100) } ?? ""
      }
  }
  private func save() {
    let values = [daily, weekly, hourly, cost].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    guard values.allSatisfy({ $0.isEmpty || StatementImport.signedCents($0).map { $0 >= 0 } == true }),
      values[3].isEmpty || (StatementImport.signedCents(values[3]) ?? Int.max) <= 10_000 else {
      error = "Use positive dollars and cents, or leave a field blank. Vehicle cost must be at most $100 per mile."; return
    }
    let goals = DriverGoals(dailyNetCents: StatementImport.signedCents(values[0]), weeklyNetCents: StatementImport.signedCents(values[1]),
                            targetHourlyCents: StatementImport.signedCents(values[2]), vehicleCostCentsPerMile: StatementImport.signedCents(values[3]).map(Double.init))
    if model.commit({ $0.goals = goals }) {
      if var session = OfferCaptureStore.session(), session.scope == model.journalScope {
        session.goals = goals
        do { try OfferCaptureStore.activate(session) }
        catch { OfferCaptureStore.deactivate(); model.message = "Goals saved. Enable offer reading again to use the updated costs." }
      }
      dismiss()
    }
  }
}

extension View {
  func insightPanel() -> some View {
    gigCard()
  }
}
