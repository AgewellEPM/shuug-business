import DriverCore
import MapKit
import SwiftUI

struct StartDriveView: View {
  @EnvironmentObject private var location: LocationTracker
  @Environment(\.dismiss) private var dismiss
  @State private var classification = TripClassification.unclassified
  @State private var purpose = ""
  var body: some View {
    Form {
      Section("This drive") {
        Picker("Classification", selection: $classification) {
          ForEach(TripClassification.allCases) { Text($0.label).tag($0) }
        }
        TextField("Purpose (optional)", text: $purpose)
      }.listRowBackground(Brand.surface)
      Section {
        Text(
          "iPhone shows its location indicator while recording. End the drive to save it. Optional automatic assistance is controlled separately in Account. Review missing sections if the app stops or the signal is lost."
        ).font(.footnote)
      }
    }.driverScreen().navigationTitle("Start a drive").toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Start") {
          location.start(classification: classification, purpose: String(purpose.prefix(240)))
          dismiss()
        }
      }
    }
  }
}
struct TripsView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var manual = false
  var body: some View {
    List {
      if model.journal.visible.filter({ $0.record.kind == "trip" }).isEmpty {
        ContentUnavailableView(
          "Your drives belong here", systemImage: "car",
          description: Text(
            "Start a drive from Today, or add a trip from your own mileage records."))
      }
      ForEach(model.journal.visible.filter { $0.record.kind == "trip" }) { entry in
        NavigationLink {
          TripDetail(id: entry.id)
        } label: {
          VStack(alignment: .leading, spacing: 5) {
            Text(entry.record.title).font(.headline)
            if case .trip(let trip) = entry.record.payload {
              Text(
                "\(entry.record.dateLabel) · \(Brand.miles(trip.distanceMeters)) mi · \(trip.classification.label)"
              ).font(.subheadline)
              if trip.hasGaps {
                Label("Review location gaps", systemImage: "exclamationmark.triangle").font(
                  .caption
                ).foregroundStyle(.orange)
              }
              if trip.endedAt == nil {
                Text("In progress").font(.caption.bold()).foregroundStyle(Brand.purple)
              }
            }
            RecordStatus(entry: entry)
          }.padding(.vertical, 4)
        }
      }
    }.driverScreen().navigationTitle("Trips").toolbar {
      Button {
        manual = true
      } label: {
        Label("Add manual trip", systemImage: "plus")
      }.disabled(!model.storageHealthy)
    }
    .sheet(isPresented: $manual) { NavigationStack { TripEditor() } }
  }
}
struct TripDetail: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  let id: UUID
  @State private var editing = false
  @State private var deleting = false
  @State private var points: [LocationFix] = []
  @State private var routeWarning: String?
  private var entry: LocalEntry? { model.journal.entries.first { $0.id == id } }
  private var segments: [[CLLocationCoordinate2D]] {
    var result: [[CLLocationCoordinate2D]] = []
    for point in points {
      if result.isEmpty || point.startsSegment == true { result.append([]) }
      result[result.count - 1].append(
        CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude))
    }
    return result
  }
  var body: some View {
    Group {
      if let entry, case .trip(let trip) = entry.record.payload {
        List {
          Section {
            Text(Brand.miles(trip.distanceMeters) + " mi").font(.largeTitle.bold())
            Text(trip.classification.label)
            RecordStatus(entry: entry)
          }
          Section("Drive details") {
            LabeledContent("Journal date", value: trip.recordedDate)
            LabeledContent(
              "Started",
              value: trip.startedAt.formatted(
                Date.FormatStyle(
                  date: .abbreviated, time: .shortened, timeZone: trip.recordedTimeZone)))
            if let ended = trip.endedAt {
              LabeledContent(
                "Ended",
                value: ended.formatted(
                  Date.FormatStyle(
                    date: .abbreviated, time: .shortened, timeZone: trip.recordedTimeZone)))
            } else {
              Text("Drive in progress")
            }
            Text("Times use \(trip.recordedTimeZone.identifier).").font(.caption).foregroundStyle(
              .secondary)
            LabeledContent(
              "Source", value: trip.source == "gps" ? "Recorded GPS" : "Manual entry / correction")
            Text(trip.purpose)
            if !trip.notes.isEmpty { Text(trip.notes) }
          }
          if trip.hasGaps {
            Section {
              Label(
                "Review this trip. Missing or imprecise GPS sections were not filled with estimated miles.",
                systemImage: "exclamationmark.triangle"
              ).foregroundStyle(.orange)
            }
          }
          if let profit = RideProfit(record: entry.record, goals: model.journal.goals ?? DriverGoals()) {
            Section("Ride profitability") { RideProfitDetails(profit: profit) }
          }
          if let routeWarning {
            Section("Route needs review") {
              Label(routeWarning, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
            }
          }
          if !points.isEmpty {
            Section("Route preview · Kept on your phone") {
              Map {
                ForEach(Array(segments.enumerated()), id: \.offset) { _, coordinates in
                  MapPolyline(coordinates: coordinates).stroke(Brand.purple, lineWidth: 4)
                }
              }.frame(height: 240).clipShape(RoundedRectangle(cornerRadius: 12))
              Text(
                "Route points are not uploaded to the firm. Gaps are shown as separate sections."
              ).font(.caption).foregroundStyle(.secondary)
              if routeWarning == nil {
                RouteOptionsView(points: points, distanceMeters: trip.distanceMeters,
                  costCentsPerMile: model.journal.goals?.vehicleCostCentsPerMile)
              }
            }
          }
          if entry.conflict != nil { ConflictActions(entry: entry) }
          if trip.endedAt != nil {
            Section {
              Button("Edit trip") { editing = true }
              Button("Delete trip", role: .destructive) { deleting = true }
            }
          }
        }
      } else {
        ContentUnavailableView("Trip unavailable", systemImage: "car")
      }
    }.driverScreen().navigationTitle("Trip").navigationBarTitleDisplayMode(.inline)
      .task {
        do {
          let result = try model.disk.readRoute(id)
          points = result.points
          routeWarning = result.hasDamagedRecords ? "Some saved route points could not be read. The route is broken at missing sections; review the recorded mileage." : nil
        } catch {
          points = []
          routeWarning = "The saved route could not be opened. Your mileage record is still available for review."
        }
      }
      .sheet(isPresented: $editing) {
        if let entry { NavigationStack { TripEditor(existing: entry.record) } }
      }
      .brandedDialog("Delete this trip?", isPresented: $deleting,
        message: "This deletes the trip from your journal and syncs that deletion to your firm.",
        icon: "trash.fill", accent: Brand.danger) {
        [BrandedDialogAction("Delete trip", role: .destructive) {
          model.remove(id)
          dismiss()
        }]
      }
  }
}
struct TripEditor: View {
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  var existing: DriverRecord?
  var workType: UniversalGigWorkType?
  @State private var started = Date()
  @State private var ended = Date()
  @State private var miles = ""
  @State private var purpose = ""
  @State private var notes = ""
  @State private var classification = TripClassification.unclassified
  @State private var validation: String?
  @State private var fare = ""
  @State private var fees = ""
  @State private var platform = ""
  @State private var workArea = ""
  @State private var role = RideRole.other
  @FocusState private var typing: Bool
  private var tripTimeZone: TimeZone {
    if let existing, case .trip(let trip) = existing.payload { return trip.recordedTimeZone }
    return .current
  }
  var body: some View {
    Form {
      Section(workType == nil ? "Trip" : "Completed job") {
        DatePicker("Start", selection: $started).environment(\.timeZone, tripTimeZone)
        DatePicker("End", selection: $ended).environment(\.timeZone, tripTimeZone)
        TextField("Miles", text: $miles).keyboardType(.decimalPad).focused($typing)
        Picker("Classification", selection: $classification) {
          ForEach(TripClassification.allCases) { Text($0.label).tag($0) }
        }.pickerStyle(.navigationLink).accessibilityIdentifier("trip.classification")
        TextField("Purpose", text: $purpose).focused($typing)
        TextField("Notes", text: $notes, axis: .vertical).focused($typing)
        if workType == .shopping {
          Text("Use the actual job start and end times. Enter 0 driving miles for in-store work without driving. This entry does not start GPS tracking.")
            .font(.footnote).foregroundStyle(Brand.muted)
        }
      }.listRowBackground(Brand.surface)
      Section("Ride earnings · optional") {
        Picker("Drive type", selection: $role) {
          ForEach(RideRole.allCases) { Text($0.label).tag($0) }
        }.pickerStyle(.navigationLink).accessibilityIdentifier("trip.role")
        TextField("Fare + tips before fees · USD", text: $fare).keyboardType(.decimalPad).focused($typing)
          .accessibilityIdentifier("trip.fare")
        TextField("Platform fees · USD (0 if none)", text: $fees).keyboardType(.decimalPad).focused($typing)
          .accessibilityIdentifier("trip.fees")
        TextField("Platform (Uber, Lyft…)", text: $platform).focused($typing)
          .accessibilityIdentifier("trip.platform")
        TextField("Work area / neighborhood", text: $workArea).focused($typing)
          .accessibilityIdentifier("trip.area")
        Text("Use the actual ride breakdown. If you enter take-home pay after fees, enter 0 for fees so they are not subtracted twice. A bank payout is not an individual ride fare. Leave unknown values blank.").font(.footnote)
        Text("To analyze pickup and unpaid travel, save those legs as Driving without a paid ride. Automatically detected drives may contain multiple rides; split or correct them using your platform records.").font(.footnote)
      }.listRowBackground(Brand.surface)
      Section {
        Text("Times use \(tripTimeZone.identifier).")
        Text(
          "Enter observed mileage from your own records. A changed GPS distance is recorded as a manual correction for review."
        ).font(.footnote)
      }
      if let validation { Section { Text(validation).foregroundStyle(.red) } }
    }.driverScreen().navigationTitle(existing == nil ? (workType == .shopping ? "Log shopping job" : workType == .delivery ? "Log delivery job" : "Manual trip") : "Edit trip").toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) { Button("Save", action: save) }
      ToolbarItem(placement: .keyboard) { Button("Done") { typing = false }.accessibilityIdentifier("entry.dismissKeyboard") }
    }.onAppear {
      if let existing, case .trip(let t) = existing.payload {
        started = t.startedAt
        ended = t.endedAt ?? Date()
        miles = String(format: "%.3f", t.distanceMeters / 1609.344)
        purpose = t.purpose
        notes = t.notes
        classification = t.classification
        fare = t.earningsCents.map { String(format: "%.2f", Double($0)/100) } ?? ""
        fees = t.platformFeesCents.map { String(format: "%.2f", Double($0)/100) } ?? ""
        platform = t.platform ?? ""; workArea = t.workArea ?? ""; role = t.rideRole ?? .other
      } else if let workType {
        let profile = (model.journal.universalGigSettings ?? .init()).profile(for: workType)
        classification = .business
        platform = profile.workLabel
        purpose = profile.workLabel + (workType == .shopping ? " shopping job" : " delivery job")
        role = workType == .shopping ? .shopping : .delivery
        if workType == .shopping { miles = "0" }
      }
    }
  }
  private func save() {
    guard let distance = Double(miles), distance.isFinite, distance >= 0, distance <= 6213,
      ended >= started, purpose.count <= 240, notes.count <= 2000
    else {
      validation =
        "Use valid miles, an end after the start, a purpose under 240 characters and notes under 2,000 characters."
      return
    }
    var trip = Trip(
      startedAt: started, endedAt: ended, distanceMeters: distance * 1609.344,
      classification: classification, purpose: purpose, notes: notes, source: "manual",
      timeZone: tripTimeZone)
    guard [fare, fees].allSatisfy({ $0.isEmpty || StatementImport.signedCents($0).map { $0 >= 0 } == true }),
      platform.count <= 80, workArea.count <= 120 else {
      validation = "Use positive dollars and cents for fares/fees, or leave them blank. Keep platform under 80 and area under 120 characters."; return
    }
    trip.earningsCents = role == .reposition ? 0 : StatementImport.signedCents(fare)
    trip.platformFeesCents = role == .reposition ? 0 : StatementImport.signedCents(fees)
    trip.rideRole = role; trip.platform = platform; trip.workArea = workArea
    if let existing, case .trip(let previous) = existing.payload {
      trip.sampleCount = previous.sampleCount
      trip.hasGaps = previous.hasGaps
      trip.automaticallyDetected = previous.automaticallyDetected
      if abs(trip.distanceMeters - previous.distanceMeters) < 1 { trip.source = previous.source }
    }
    if model.save(
      DriverRecord(
        id: existing?.id ?? UUID(), revision: existing?.revision ?? 0, payload: .trip(trip)))
    {
      dismiss()
    }
  }
}
struct ConflictActions: View {
  @EnvironmentObject private var model: DriverModel
  let entry: LocalEntry
  var body: some View {
    Section("Choose the version to keep") {
      Text("This record changed on another device. Your phone copy has not overwritten it.")
      if let remote = entry.conflict {
        Text("Workspace: \(remote.record.title) · Updated \(remote.updatedAt.formatted())")
        if remote.record.deleted { Text("Deleted in the workspace").foregroundStyle(.orange) }
        switch remote.record.payload {
        case .trip(let trip):
          Text("\(Brand.miles(trip.distanceMeters)) mi · \(trip.classification.label)")
          Text(trip.notes)
        case .expense(let expense):
          Text(
            "\(Brand.usd(expense.amountCents)) · \(expense.category.rawValue) · \(expense.classification.label)"
          )
          Text(expense.notes)
        case .income(let income):
          Text("\(Brand.usd(income.amountCents)) · \(income.platform)")
          Text(income.notes)
        }
      }
      Button("Keep phone version") { resolve(true) }
      Button("Use workspace version") { resolve(false) }
    }.disabled(model.journal.activeTripId == entry.id)
  }
  private func resolve(_ phone: Bool) {
    if model.commit({ $0.resolve(entry.id, keepPhone: phone) }) { Task { await model.sync() } }
  }
}
