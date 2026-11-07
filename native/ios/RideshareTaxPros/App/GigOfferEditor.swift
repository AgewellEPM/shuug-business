import DriverCore
import SwiftUI

struct GigOfferEditor: View {
  let offer: UniversalGigOffer
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  @State private var platform = GigPlatform.doorDash
  @State private var payout = ""
  @State private var guarantee = ""
  @State private var miles = ""
  @State private var minutes = ""
  @State private var fees = ""
  @State private var pickup = ""
  @State private var dropoff = ""
  @State private var wait = ""
  @State private var reposition = ""
  @State private var checked = false
  @State private var error: String?
  @FocusState private var focused: Bool
  var body: some View {
    Form {
      Section("Offer visible in your gig app · USD") {
        Picker("Platform", selection: $platform) { ForEach(GigPlatform.allCases) { Text($0.rawValue).tag($0) } }.disabled(offer.source != .manual)
        TextField("Quoted payout", text: $payout).keyboardType(.decimalPad)
        TextField("Guaranteed part of payout", text: $guarantee).keyboardType(.decimalPad)
        Text("Include tips in the quote only when the platform includes them. Leave guaranteed pay blank if uncertain; the lower estimate will reflect that.").font(.caption)
        TextField("Additional costs (0 only if known)", text: $fees).keyboardType(.decimalPad)
      }.focused($focused)
      Section("Complete working estimates") {
        TextField("All working miles", text: $miles).keyboardType(.decimalPad)
        TextField("All working minutes", text: $minutes).keyboardType(.decimalPad)
        Text("Include pickup, waiting, delivery and necessary repositioning in the totals. Enter your estimate after reviewing the entire job.").font(.caption)
        TextField("Pickup wait (minutes)", text: $wait).keyboardType(.decimalPad)
        TextField("Necessary repositioning miles (0 if none)", text: $reposition).keyboardType(.decimalPad)
      }.focused($focused)
      Section("Locations") {
        TextField("Pickup place or address", text: $pickup)
        TextField("Drop-off place or address", text: $dropoff)
        Text("Confirm the matching map results when comparing the route home.").font(.caption)
      }.focused($focused)
      Section {
        Toggle("I checked this offer in its original app", isOn: $checked)
        Text("This records your review, not a provider availability confirmation. A known expiration is kept.").font(.caption)
      }
      if let error { Text(error).foregroundStyle(.orange) }
    }.driverScreen().navigationTitle("Review offer fields")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
        ToolbarItem(placement: .keyboard) { Button("Done") { focused = false } }
      }.onAppear {
        platform = offer.platform
        payout = amount(offer.payoutCents); guarantee = amount(offer.guaranteedPayoutCents); fees = amount(offer.additionalCostsCents)
        miles = offer.uncertainty.totalMiles.flatMap { $0.lower == $0.upper ? String($0.lower) : nil } ?? ""
        minutes = offer.durationCoverage == .allWorkingTime ? offer.estimatedMinutes.map(String.init(describing:)) ?? "" : ""
        wait = offer.waitMinutes.map(String.init(describing:)) ?? ""
        reposition = offer.repositionMiles.map(String.init(describing:)) ?? ""
        pickup = offer.pickupLocation?.label ?? ""; dropoff = offer.dropoffLocation?.label ?? ""
      }
  }
  private func amount(_ value: Int?) -> String { value.map { String(format: "%.2f", Double($0) / 100) } ?? "" }
  private func save() {
    func cash(_ text: String) -> Int? { StatementImport.signedCents(text.trimmingCharacters(in: .whitespacesAndNewlines)) }
    func number(_ text: String, max: Double) -> Double? { Double(text).flatMap { $0.isFinite && (0...max).contains($0) ? $0 : nil } }
    for text in [payout, guarantee, fees] where !text.isEmpty {
      guard let value = cash(text), (0...100_000_000).contains(value) else { error = "Check the dollar amounts."; return }
    }
    for (text, maxValue) in [(miles, 10000.0), (minutes, 2880.0), (wait, 240.0), (reposition, 10000.0)] where !text.isEmpty {
      guard number(text, max: maxValue) != nil else { error = "Use valid, nonnegative distance and time estimates."; return }
    }
    guard guarantee.isEmpty || (cash(guarantee) ?? Int.max) <= (cash(payout) ?? -1) else { error = "Guaranteed pay cannot exceed the quote."; return }
    var next = offer
    next.platform = platform; next.currency = "USD"; next.payoutCents = cash(payout)
    next.guaranteedPayoutCents = cash(guarantee); next.additionalCostsCents = cash(fees)
    next.uncertainty.totalMiles = number(miles, max: 10000).map { GigNumericBounds($0, $0) }
    next.estimatedMinutes = number(minutes, max: 2880)
    next.durationCoverage = next.estimatedMinutes == nil ? .unknown : .allWorkingTime
    next.uncertainty.workingMinutes = nil
    next.waitMinutes = number(wait, max: 240); next.repositionMiles = number(reposition, max: 10000)
    next.pickupLocation = pickup.isEmpty ? nil : GigOfferLocation(label: pickup)
    next.dropoffLocation = dropoff.isEmpty ? nil : GigOfferLocation(label: dropoff)
    next.driverConfirmedFields = checked
    if checked && next.availabilityStatus != .withdrawn {
      if next.expiresAt.map({ $0 > Date() }) ?? true { next.lastObservedAt = Date(); next.availabilityStatus = .observed }
    }
    next.refreshMissingFields()
    if model.saveOffer(next) { dismiss() }
  }
}
