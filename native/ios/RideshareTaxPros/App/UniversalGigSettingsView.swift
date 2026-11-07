import DriverCore
import SwiftUI

struct UniversalGigSettingsView: View {
  let workType: UniversalGigWorkType
  @EnvironmentObject private var model: DriverModel
  @State private var workLabel = ""
  @State private var appLink = ""
  @State private var loadedScope = ""
  @State private var notice: String?
  @State private var error: String?
  @State private var logging = false
  @FocusState private var editing: Bool
  private var tint: Color { workType == .shopping ? Brand.income : Brand.route }
  var body: some View {
    Form {
      Section {
        Label(workType.title, systemImage: workType == .shopping ? "basket.fill" : "shippingbox.fill")
          .font(.headline).foregroundStyle(tint)
        Text(workType == .shopping
          ? "Track completed in-store work from its actual start and end time, earnings and fees. Enter 0 miles when no driving was part of that job."
          : "Track delivery work for any app or client. Use a custom label and record the actual job, paid time, earnings, fees and mileage.")
          .font(.subheadline).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      Section("Your work profile") {
        TextField("Work or app name", text: $workLabel).focused($editing)
          .accessibilityIdentifier("universal.label")
        TextField("HTTPS app or website link · optional", text: $appLink).keyboardType(.URL)
          .textInputAutocapitalization(.never).autocorrectionDisabled().focused($editing)
          .accessibilityIdentifier("universal.appURL")
        if let url = try? UniversalGigProfile.validatedAppURL(appLink) {
          Link("Open work app or website", destination: url).tint(tint)
        }
        Text("Your settings stay with this account on this iPhone. An app link opens only when you tap it; it does not connect an account or read offers.")
          .font(.caption).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      Section("Cost & earnings goals") {
        NavigationLink("Set shared vehicle cost & net goals") { GoalsEditor() }
        Text("These are the same goals used by Earnings and Tax & Goals. A shopping job with exactly 0 recorded miles has 0 vehicle cost; other job expenses still need their own records and review.")
          .font(.caption).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      Section {
        Button {
          guard save() else { return }
          editing = false; logging = true
        } label: {
          Label("Log completed job", systemImage: "plus.circle.fill").foregroundStyle(tint)
        }.disabled(!model.storageHealthy).accessibilityIdentifier("universal.logJob")
        Text("Use actual completed work and payout details. A job record can sync with your firm after you connect. This does not accept a gig, start GPS recording, determine a deduction or file a return.")
          .font(.caption).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      if let notice { Text(notice).font(.footnote).foregroundStyle(Brand.income).listRowBackground(Brand.surface) }
      if let error { Text(error).font(.footnote).foregroundStyle(Brand.danger).listRowBackground(Brand.surface) }
    }.driverScreen().navigationTitle(workType == .shopping ? "In-store Shopper" : "Universal Delivery")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") { _ = save() }.disabled(!model.storageHealthy)
            .accessibilityIdentifier("universal.save")
        }
        ToolbarItem(placement: .keyboard) { Button("Done") { editing = false } }
      }
      .task(id: model.journalScope) {
        let profile = (model.journal.universalGigSettings ?? .init()).profile(for: workType)
        workLabel = profile.workLabel; appLink = profile.appURL ?? ""; loadedScope = model.journalScope
        error = nil; notice = nil; logging = false
      }
      .sheet(isPresented: $logging) { NavigationStack { TripEditor(workType: workType) } }
  }
  @discardableResult private func save() -> Bool {
    guard model.journalScope == loadedScope else {
      error = "Your account changed. Reopen this work profile before saving."; return false
    }
    do {
      let profile = try UniversalGigProfile(workLabel: workLabel, appURL: appLink).validated()
      guard model.commit({ journal in
        var settings = journal.universalGigSettings ?? .init()
        settings.setProfile(profile, for: workType); journal.universalGigSettings = settings
      }) else { error = "Your profile could not be saved on this iPhone. Try again."; return false }
      workLabel = profile.workLabel; appLink = profile.appURL ?? ""
      notice = "Work profile saved on this iPhone."; error = nil
      return true
    } catch { self.error = error.localizedDescription; return false }
  }
}
