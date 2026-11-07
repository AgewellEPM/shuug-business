import DriverCore
import SwiftUI

struct ShiftDashboardCard: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @EnvironmentObject private var model: DriverModel
  @EnvironmentObject private var location: LocationTracker
  private var summary: DrivingInsights {
    let day = DriverRecord.day(Date())
    return DrivingInsights(records: model.journal.visible.map(\.record), goals: model.journal.goals ?? DriverGoals(), from: day, through: day)
  }
  var body: some View {
    let rides = summary.rides
    let priced = rides.filter { $0.estimatedNetCents != nil }
    let dailyNet = priced.reduce(0) { $0 + ($1.estimatedNetCents ?? 0) }
    let mission = model.journal.mission
    let progress = mission?.progress(records: model.journal.visible.map(\.record), goals: model.journal.goals ?? DriverGoals())
    let net = progress?.netCents ?? dailyNet
    let target = mission?.targetCents ?? model.journal.goals?.dailyNetCents
    let minutes = priced.reduce(0.0) { $0 + $1.minutes }
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(mission == nil ? "Today’s driving" : "Your shift mission").font(.headline)
        Spacer()
        Label(location.recording ? "Recording" : "Saved records", systemImage: location.recording ? "circle.fill" : "checkmark.circle")
          .font(.system(size: 10, weight: .semibold)).foregroundStyle(location.recording ? Brand.route : Brand.link)
          .padding(.horizontal, 9).padding(.vertical, 5).background((location.recording ? Brand.route : Brand.purple).opacity(0.13), in: Capsule())
      }
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 4) {
          Text(Brand.usd(net)).font(.system(size: 39, weight: .bold, design: .rounded)).tracking(-1.2)
            .lineLimit(1).minimumScaleFactor(0.6)
            .foregroundStyle(net < 0 ? Brand.danger : Brand.income)
            .contentTransition(.numericText()).animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: net)
          Text("Estimated net").font(.caption).foregroundStyle(Brand.muted)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 6) {
          Text(target.map(Brand.usd) ?? "Set a goal").font(.system(.title3, design: .rounded).bold()).foregroundStyle(Brand.link)
          Text("Net earnings target").font(.caption).foregroundStyle(Brand.muted)
        }
      }
      if let target, target > 0 {
        let fraction = min(1, max(0, Double(net) / Double(target)))
        GeometryReader { proxy in
          ZStack(alignment: .leading) {
            Capsule().fill(.white.opacity(0.12))
            Capsule().fill(LinearGradient(colors: net >= target ? [Brand.income, Brand.income.opacity(0.75)] : [Brand.purple, Brand.pink],
              startPoint: .leading, endPoint: .trailing)).frame(width: max(0, proxy.size.width * fraction))
          }
        }.frame(height: 13).animation(reduceMotion ? nil : .easeOut(duration: 0.55), value: fraction)
        HStack {
          Text("\(Int(fraction * 100))% of goal")
          Spacer(); Text("\(Brand.usd(max(0, target - net))) to go")
        }.font(.caption).foregroundStyle(net >= target ? Brand.income : Brand.muted)
      }
      Divider().overlay(Brand.border.opacity(0.3))
      HStack(spacing: 10) {
        DashboardMetric(title: "Per recorded hour", value: minutes > 0 ? Brand.usd(Int(Double(dailyNet) * 60 / minutes)) : "—", icon: "dollarsign.circle", tint: minutes > 0 ? (dailyNet < 0 ? Brand.danger : Brand.income) : Brand.link)
        DashboardMetric(title: "Recorded work time", value: "\(Int(rides.reduce(0) { $0 + $1.minutes }) / 60)h \(Int(rides.reduce(0) { $0 + $1.minutes }) % 60)m", icon: "clock", tint: Brand.link)
        DashboardMetric(title: "Business miles", value: String(format: "%.1f mi", rides.reduce(0) { $0 + $1.miles }), icon: "road.lanes", tint: Brand.route)
      }
      if priced.count < rides.count || priced.isEmpty {
        Text("Add fares, known fees and vehicle cost to complete your profit picture.").font(.caption).foregroundStyle(Brand.muted)
      } else {
        Text("Recorded driving only; unrecorded idle time and tax are excluded.").font(.caption2).foregroundStyle(Brand.muted)
      }
    }.gigCard(highlight: true, accent: net < 0 ? Brand.danger : Brand.income)
  }
}

struct GoHomeDashboardCard: View {
  let destination: String?
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: "house.fill").font(.system(size: 30)).foregroundStyle(Brand.route)
        VStack(alignment: .leading, spacing: 5) {
          Text("Get Paid Going Home").font(.system(size: 18, weight: .bold))
          Text(destination.map { "Finish near \($0). Earn on the way." } ?? "Set your destination. Earn on the way.")
            .font(.system(size: 12)).foregroundStyle(Brand.muted)
        }
        Spacer(minLength: 0); Image(systemName: "chevron.right").foregroundStyle(Brand.route)
      }.padding(16).padding(.bottom, 12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.panel)
        .background(Brand.purple.opacity(0.2))
        .overlay(alignment: .bottom) { HomeRoadArtwork().frame(height: 28).allowsHitTesting(false) }
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay { RoundedRectangle(cornerRadius: 22).strokeBorder(Brand.route.opacity(0.65), lineWidth: 1) }
    }.buttonStyle(.plain).foregroundStyle(.white)
  }
}

struct PlatformReadersRow: View {
  // Retain Home's existing call signature. Launching an app does not establish
  // an offer-reader connection or authorize access to that provider's account.
  let scope: String
  var body: some View { GigAppLauncherRow() }
}
