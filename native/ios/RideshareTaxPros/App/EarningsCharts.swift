import Charts
import DriverCore
import SwiftUI

struct EarningsPulseCard: View {
  let records: [DriverRecord], goals: DriverGoals
  var days = 7
  var compact = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var metric = EarningsChartMetric.profit
  @State private var selectedDate: Date?
  @State private var appeared = false
  private var summary: DrivingInsights {
    DrivingInsights(records: records, goals: goals,
      from: DriverRecord.day(Calendar.current.date(byAdding: .day, value: -(days - 1), to: Date())!), through: DriverRecord.day(Date()))
  }
  private var points: [DrivingDay] {
    let values = Dictionary(uniqueKeysWithValues: summary.days.map { ($0.date, $0) })
    return (0..<days).reversed().map { offset in
      let day = DriverRecord.day(Calendar.current.date(byAdding: .day, value: -offset, to: Date())!)
      return values[day] ?? DrivingDay(date: day)
    }
  }
  private var selected: DrivingDay? {
    selectedDate.flatMap { date in points.first { $0.date == DriverRecord.day(date) } }
  }
  private var total: Double { points.reduce(0) { $0 + metric.value($1) } }
  private var valueTint: Color { metric == .profit && (selected.map(metric.value) ?? total) < 0 ? Brand.danger : metric.tint }
  private var chartTint: Color { metric == .profit && total < 0 ? Brand.danger : metric.tint }
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text(selected == nil ? "Your last \(days) days" : selected!.date).font(.caption).foregroundStyle(Brand.muted)
          Text(metric.formatted(selected.map(metric.value) ?? total))
            .font(.system(size: compact ? 24 : 31, weight: .bold, design: .rounded)).monospacedDigit()
            .foregroundStyle(valueTint)
            .contentTransition(.numericText())
        }
        Spacer()
        if compact { Text("Est. driving net").font(.caption).foregroundStyle(Brand.muted) }
        else {
          Picker("Chart metric", selection: $metric) {
            ForEach(EarningsChartMetric.allCases) { Text($0.rawValue).tag($0) }
          }.pickerStyle(.menu).tint(metric.tint).accessibilityIdentifier("earnings.metric")
        }
      }
      if summary.rides.isEmpty {
        VStack(alignment: .leading, spacing: 5) {
          Label("Your graph starts with your first drive", systemImage: "chart.xyaxis.line").font(.subheadline.weight(.medium))
          Text("Completed drives, fares and your vehicle cost power these numbers.").font(.caption).foregroundStyle(Brand.muted)
        }.frame(maxWidth: .infinity, minHeight: compact ? 72 : 120, alignment: .leading)
      } else {
        Chart(points) { point in
          AreaMark(x: .value("Day", Brand.parseDay(point.date)), yStart: .value("Zero", 0), yEnd: .value(metric.rawValue, metric.value(point)))
            .interpolationMethod(.monotone)
            .foregroundStyle(LinearGradient(colors: [chartTint.opacity(0.5), chartTint.opacity(0.03)], startPoint: .top, endPoint: .bottom))
          LineMark(x: .value("Day", Brand.parseDay(point.date)), y: .value(metric.rawValue, metric.value(point)))
            .interpolationMethod(.monotone).lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round)).foregroundStyle(chartTint)
          if let selected, selected.id == point.id {
            RuleMark(x: .value("Selected day", Brand.parseDay(point.date)))
              .foregroundStyle(metric.tint.opacity(0.7)).lineStyle(StrokeStyle(dash: [3, 3]))
            PointMark(x: .value("Selected day", Brand.parseDay(point.date)), y: .value(metric.rawValue, metric.value(point)))
              .foregroundStyle(valueTint).symbolSize(45)
          }
        }
        .chartXAxis { AxisMarks(values: .stride(by: .day, count: max(1, days / 7))) { _ in AxisValueLabel(format: .dateTime.weekday(.abbreviated)); AxisGridLine().foregroundStyle(.white.opacity(0.04)) } }
        .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { _ in AxisGridLine().foregroundStyle(.white.opacity(0.07)); AxisValueLabel() } }
        .chartXSelection(value: $selectedDate)
        .frame(height: compact ? 100 : 195)
        .mask { GeometryReader { proxy in Rectangle().frame(width: proxy.size.width * (appeared || reduceMotion ? 1 : 0)) } }
        .accessibilityLabel("\(metric.rawValue) over \(days) days. Touch a day to inspect its recorded value.")
        .accessibilityIdentifier("earnings.trend")
      }
      if !compact {
        Text(metric == .profit ? "Priced business drives after fees and your per-mile cost. Includes recorded unpaid driving; excludes tax and unrecorded idle time." : "Completed business drives only. Missing trips and idle time affect this picture.")
          .font(.caption2).foregroundStyle(Brand.muted)
      }
    }.gigCard(accent: chartTint)
      .onAppear { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.65)) { appeared = true } }
      .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: metric)
  }
}

private enum EarningsChartMetric: String, CaseIterable, Identifiable {
  case profit = "Net earnings", miles = "Miles", hours = "Driving hours"
  var id: String { rawValue }
  var tint: Color {
    switch self { case .profit: Brand.income; case .miles: Brand.route; case .hours: Brand.link }
  }
  func value(_ day: DrivingDay) -> Double {
    switch self { case .profit: Double(day.estimatedRideNetCents) / 100; case .miles: day.miles; case .hours: day.minutes / 60 }
  }
  func formatted(_ value: Double) -> String {
    switch self {
    case .profit: Brand.usd(Int((value * 100).rounded()))
    case .miles: String(format: "%.1f mi", value)
    case .hours: String(format: "%.1f hr", value)
    }
  }
}

struct MileageMixCard: View {
  let summary: DrivingInsights, goals: DriverGoals
  private var unpaid: Double { summary.rides.filter { $0.role == .reposition }.reduce(0) { $0 + $1.miles } }
  private var paid: Double { summary.rides.filter { [.ride, .delivery].contains($0.role) }.reduce(0) { $0 + $1.miles } }
  private var other: Double { summary.rides.filter { $0.role == .other }.reduce(0) { $0 + $1.miles } }
  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      Text("Make every mile count").font(.headline)
      HStack(spacing: 22) {
        if paid + unpaid + other > 0 {
          Chart {
            SectorMark(angle: .value("Paid miles", paid), innerRadius: .ratio(0.76), angularInset: 3).foregroundStyle(Brand.route).cornerRadius(4)
            SectorMark(angle: .value("Unpaid miles", unpaid), innerRadius: .ratio(0.76), angularInset: 3).foregroundStyle(Brand.expense).cornerRadius(4)
            SectorMark(angle: .value("Other miles", other), innerRadius: .ratio(0.76), angularInset: 3).foregroundStyle(.gray).cornerRadius(4)
          }.frame(width: 115, height: 115)
            .overlay { VStack(spacing: 2) { Text(String(format: "%.0f%%", unpaid / (paid + unpaid + other) * 100)).font(.title2.bold()).foregroundStyle(unpaid > 0 ? Brand.expense : Brand.route); Text("unpaid").font(.caption2).foregroundStyle(Brand.muted) } }
            .accessibilityLabel(String(format: "%.1f paid miles, %.1f unpaid miles, %.1f other miles", paid, unpaid, other))
        }
        VStack(alignment: .leading, spacing: 12) {
          Label(String(format: "%.1f paid miles", paid), systemImage: "circle.fill").foregroundStyle(Brand.route)
          Label(String(format: "%.1f unpaid miles", unpaid), systemImage: "circle.fill").foregroundStyle(Brand.expense)
          if other > 0 { Label(String(format: "%.1f other miles", other), systemImage: "circle.fill").foregroundStyle(.gray) }
          if let rate = goals.vehicleCostCentsPerMile, rate.isFinite, rate >= 0 {
            Text("\(Brand.usd(Int((unpaid * rate).rounded()))) unpaid driving cost").font(.caption.bold()).foregroundStyle(Brand.expense)
          }
        }.font(.caption)
      }
      Text("Mark trips to pickups and between jobs as unpaid driving to see their operating cost. This cost is already included in driving net.")
        .font(.caption2).foregroundStyle(Brand.muted)
    }.gigCard(accent: Brand.route)
  }
}

struct EarningsEfficiencyCard: View {
  let summary: DrivingInsights
  var body: some View {
    let priced = summary.rides.filter { $0.estimatedNetCents != nil }
    let net = priced.reduce(0) { $0 + ($1.estimatedNetCents ?? 0) }
    let minutes = priced.reduce(0) { $0 + $1.minutes }, miles = priced.reduce(0) { $0 + $1.miles }
    HStack(spacing: 12) {
      DashboardMetric(title: "Per recorded hour", value: minutes > 0 ? Brand.usd(Int((Double(net) * 60 / minutes).rounded())) : "—", icon: "clock", tint: minutes > 0 ? (net < 0 ? Brand.danger : Brand.income) : Brand.link)
      DashboardMetric(title: "Net per priced mile", value: miles > 0 ? Brand.usd(Int((Double(net) / miles).rounded())) : "—", icon: "road.lanes", tint: miles > 0 ? (net < 0 ? Brand.danger : Brand.income) : Brand.link)
      DashboardMetric(title: "Drives priced", value: "\(priced.count)/\(summary.rides.count)", icon: "checkmark.seal", tint: Brand.route)
    }.gigCard()
  }
}
