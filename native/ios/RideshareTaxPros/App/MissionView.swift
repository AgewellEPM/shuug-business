import DriverCore
import SwiftUI

struct MissionView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var goal = "100"
  @State private var deadline = Date().addingTimeInterval(4 * 3600)
  @State private var destination = "Home"
  @State private var customDestination = ""
  @State private var pickup = ""
  @State private var recordedWait = ""
  @State private var payout = ""
  @State private var fees = ""
  @State private var miles = ""
  @State private var minutes = ""
  @State private var wait = ""
  @State private var homeMinutes = ""
  @State private var direction = "Unknown"
  @State private var offerLabel = ""
  @FocusState private var editing: Bool

  private var insights: DrivingInsights {
    DrivingInsights(records: model.journal.visible.map(\.record), goals: model.journal.goals ?? DriverGoals(), from: "0000-01-01", through: "9999-12-31")
  }
  private var estimate: OfferEstimate? {
    guard let payout = dollars(payout), let fees = dollars(fees), let miles = Double(miles), let minutes = Double(minutes),
      let wait = Double(wait) else { return nil }
    return OfferEstimate(payoutCents: payout, feesCents: fees, miles: miles, minutes: minutes, waitMinutes: wait,
      homeMinutes: homeMinutes.isEmpty ? nil : Double(homeMinutes), vehicleCostCentsPerMile: model.journal.goals?.vehicleCostCentsPerMile,
      hourlyTargetCents: model.journal.goals?.targetHourlyCents, deadline: model.journal.mission?.deadline)
  }
  var body: some View {
    List {
      Section {
        Text("Make more. Waste fewer miles. Get home on your schedule.").font(.headline)
        Text("Plan using your own numbers. Enter offers and route estimates while parked; no live offers or traffic are connected.").font(.footnote).foregroundStyle(Brand.muted)
      }
      if let mission = model.journal.mission {
        let progress = mission.progress(records: model.journal.visible.map(\.record), goals: model.journal.goals ?? DriverGoals())
        Section("Your mission") {
          Text("Earn \(Brand.usd(mission.targetCents)) and finish by \(mission.deadline.formatted(date: .abbreviated, time: .shortened))").font(.headline)
          Text("Finish near: \(mission.destination)")
          ProgressView(value: Double(max(0, progress.netCents)), total: Double(max(1, mission.targetCents))).tint(Brand.pink)
          Text("\(Brand.usd(progress.netCents)) estimated net · \(Brand.usd(max(0, mission.targetCents - progress.netCents))) remaining")
          Text("\(String(format: "%.1f", progress.unpaidMiles)) unpaid miles during this mission")
          if progress.missingCount > 0 { Text("\(progress.missingCount) completed drives need fare, fees or vehicle cost before they count.").foregroundStyle(.orange) }
          if Date() > mission.deadline { Text("Deadline passed. Update or end this mission.").foregroundStyle(.orange) }
          Button("End mission", role: .destructive) { _ = model.commit { $0.mission = nil } }
        }
      }
      Section(model.journal.mission == nil ? "Create today's mission" : "Replace mission") {
        HStack { ForEach([50, 100, 150, 200], id: \.self) { amount in Button("$\(amount)") { goal = String(amount) }.buttonStyle(.bordered) } }
        TextField("Net earnings goal ($)", text: $goal).keyboardType(.decimalPad).focused($editing)
        DatePicker("Finish by", selection: $deadline, displayedComponents: [.date, .hourAndMinute])
        Picker("End near", selection: $destination) { Text("Home").tag("Home"); Text("Work").tag("Work"); Text("Custom").tag("Custom") }
        if destination == "Custom" { TextField("Custom destination label", text: $customDestination).focused($editing); Text("Use the offer calculator below to enter your own travel time toward your chosen destination.").font(.footnote) }
        Button("Save mission") {
          let custom = customDestination.trimmingCharacters(in: .whitespacesAndNewlines)
          guard let cents = dollars(goal), cents > 0, deadline > Date(), destination != "Custom" || (!custom.isEmpty && custom.count <= 100) else { model.message = "Enter a positive goal, future deadline and a custom destination label if needed."; return }
          let name = destination == "Custom" ? custom : destination
          _ = model.commit { $0.mission = ShiftMission(deadline: deadline, targetCents: cents, destination: name); $0.missionOffers = [] }
          editing = false
        }.disabled(!model.storageHealthy).accessibilityIdentifier("mission.save")
        Text("Changing a mission starts a new progress window. It does not delete your drives.").font(.footnote).foregroundStyle(Brand.muted)
      }
      Section("Evaluate an offer") {
        Text("Enter the complete job, including pickup miles and your best estimate of unpaid repositioning. These are estimates, not a guarantee.").font(.footnote)
        TextField("Offer label or platform (optional)", text: $offerLabel).focused($editing)
        field("Offered payout ($)", $payout).accessibilityIdentifier("mission.payout"); field("Fees ($; enter 0 if none)", $fees).accessibilityIdentifier("mission.fees")
        field("Total job and unpaid miles", $miles).accessibilityIdentifier("mission.miles"); field("Job and pickup minutes", $minutes).accessibilityIdentifier("mission.minutes")
        field("Pickup wait minutes", $wait).accessibilityIdentifier("mission.wait"); field("Minutes from drop-off to destination", $homeMinutes).accessibilityIdentifier("mission.homeMinutes")
        Picker("Direction after drop-off", selection: $direction) { Text("Unknown").tag("Unknown"); Text("Toward destination").tag("Toward"); Text("Away from destination").tag("Away") }
        if let result = estimate {
          Text("Estimated net \(Brand.usd(result.netCents)) · \(Brand.usd(Int(result.hourlyCents.rounded())))/active hour").font(.headline).accessibilityIdentifier("mission.result")
          Text("Minimum payout for your hourly goal: \(Brand.usd(result.minimumCents))")
          Text("Hourly rate and minimum use the entered pickup, job and wait time. They exclude the drive to your destination. Include any additional unpaid miles above.").font(.footnote).foregroundStyle(Brand.muted)
          Text(result.meetsGoal ? "Meets your entered hourly goal" : "Below your entered hourly goal").foregroundStyle(result.meetsGoal ? .green : .orange)
          if let remaining = result.deadlineMinutesRemaining { Text(remaining >= 0 ? "Estimated \(Int(remaining)) minutes of deadline buffer" : "Estimated \(Int(abs(remaining))) minutes past your deadline").foregroundStyle(remaining >= 0 ? .green : .orange) }
          else { Text("Enter travel time to your destination to check the deadline.").font(.footnote) }
          Text(direction == "Unknown" ? "Direction not assessed." : "Direction is your assessment: \(direction == "Toward" ? "toward" : "away from") your destination.").font(.footnote)
          Button("Add to offer comparison") {
            guard let amount = dollars(payout), let charge = dollars(fees), let distance = Double(miles), let duration = Double(minutes), let delay = Double(wait), homeMinutes.isEmpty || Double(homeMinutes) != nil else { model.message = "Check the entered offer details."; return }
            let item = MissionOffer(label: offerLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Offer" : String(offerLabel.prefix(100)), direction: direction, payoutCents: amount, feesCents: charge, miles: distance, minutes: duration, waitMinutes: delay, homeMinutes: homeMinutes.isEmpty ? nil : Double(homeMinutes))
            _ = model.commit { journal in var offers = journal.missionOffers ?? []; offers.append(item); journal.missionOffers = Array(offers.suffix(20)) }
            editing = false
          }
        } else {
          Text("Enter payout, known fees, miles, minutes and wait. Set your own hourly target and vehicle cost in Insights → Set goals.").font(.footnote).foregroundStyle(Brand.muted)
        }
      }
      if let offers = model.journal.missionOffers, !offers.isEmpty {
        Section("Compare your entered offers") {
          ForEach(offers) { offer in
            if let result = offer.estimate(goals: model.journal.goals ?? DriverGoals(), deadline: model.journal.mission?.deadline) {
              VStack(alignment: .leading) {
                Text("\(offer.label) · \(Brand.usd(result.netCents)) net · \(Brand.usd(Int(result.hourlyCents.rounded())))/active hour")
                Text("\(offer.direction) · \(result.meetsGoal ? "meets goal" : "below goal") · \(result.deadlineMinutesRemaining.map { $0 >= 0 ? "estimated within deadline" : "estimated after deadline" } ?? "deadline unknown")").font(.footnote)
                Button("Remove offer", role: .destructive) { _ = model.commit { $0.missionOffers?.removeAll { $0.id == offer.id } } }
              }
            }
          }
          Text("Compare direction, your minimum and the deadline buffer. Availability and actual driving conditions can change; no offers are fetched automatically.").font(.footnote).foregroundStyle(Brand.muted)
        }
      }
      Section("Pickup wait history") {
        TextField("Restaurant or pickup location", text: $pickup).focused($editing)
        field("Observed wait (minutes)", $recordedWait)
        Button("Save observed wait") {
          let name = pickup.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !name.isEmpty, name.count <= 120, let minutes = Double(recordedWait), minutes.isFinite, (0...240).contains(minutes) else { model.message = "Enter a pickup name and wait from 0 to 240 minutes."; return }
          _ = model.commit { journal in var rows = journal.pickupWaits ?? []; rows.append(PickupWait(name: name, minutes: minutes)); journal.pickupWaits = Array(rows.suffix(500)) }
          recordedWait = ""; editing = false
        }
        if let average = PickupWait.average(pickup, in: model.journal.pickupWaits ?? []) {
          Text("Your average: \(String(format: "%.1f", average.minutes)) min across \(average.count) recorded waits")
          Button("Use this average in offer") { wait = String(format: "%.1f", average.minutes) }
        }
        Text("Your observations stay on this phone. Small samples may not predict your next pickup.").font(.footnote).foregroundStyle(Brand.muted)
      }
      Section("Dead Mile Killer") {
        let rides = insights.rides.filter { $0.role == .reposition }
        let unpaid = rides.reduce(0.0) { $0 + $1.miles }
        Text("\(String(format: "%.1f", unpaid)) recorded unpaid business miles")
        if let rate = model.journal.goals?.vehicleCostCentsPerMile, rate.isFinite, (0...10_000).contains(rate) { Text("Estimated vehicle cost: \(Brand.usd(Int((unpaid * rate).rounded())))") }
        Text("Classify pickup-area and return trips as driving without a paid ride. Consider offers that end nearer your next destination; review safety and actual routes first.").font(.footnote).foregroundStyle(Brand.muted)
      }
      Section("Platform comparisons") {
        let groups = Dictionary(grouping: insights.rides.filter { $0.hourlyCents != nil && $0.platform != "Unspecified" }, by: \.platform)
        if groups.isEmpty { Text("Add your platform and complete fares, fees and vehicle cost on business drives to compare.") }
        ForEach(groups.keys.sorted(), id: \.self) { key in
          let rows = groups[key] ?? []; let minutes = rows.reduce(0.0) { $0 + $1.minutes }; let net = rows.reduce(0) { $0 + ($1.estimatedNetCents ?? 0) }
          if minutes > 0 { Text("\(key): \(Brand.usd(Int((Double(net) * 60 / minutes).rounded())))/hour · \(rows.count) drives") }
        }
        Text("Only your recorded completed drives are compared. Idle time, demand and platform availability may differ.").font(.footnote).foregroundStyle(Brand.muted)
      }
      ReserveAndHistoryView()
    }.driverScreen().navigationTitle("Shift Mission")
      .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { editing = false }.accessibilityIdentifier("mission.dismissKeyboard") } }
  }
  private func field(_ title: String, _ value: Binding<String>) -> some View { TextField(title, text: value).keyboardType(.decimalPad).focused($editing) }
  private func dollars(_ value: String) -> Int? {
    guard let number = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")), number >= 0, number <= 1_000_000 else { return nil }
    let cents = number * 100; var rounded = Decimal(); var original = cents; NSDecimalRound(&rounded, &original, 0, .plain)
    guard rounded == cents else { return nil }; return NSDecimalNumber(decimal: cents).intValue
  }
}
