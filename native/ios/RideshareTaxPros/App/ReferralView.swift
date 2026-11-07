import SwiftUI

struct ReferralView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var summary: ReferralSummary?
  @State private var code = ""
  @State private var busy = false
  @State private var error: String?
  @State private var redeeming: ReferralReward?
  var body: some View {
    List {
      Section {
        Text("Your network. Your rewards.").font(.title2.bold())
        Text("Earn $20 for each qualifying tax-prep referral—choose cash or tax-prep credit—plus 100 points. Every 500 points unlocks an extra $20 tax-prep credit.")
        Text("Rewards qualify after staff confirms you use our tax-prep services and your friend's first paid tax preparation is complete. Points never expire.")
          .font(.footnote).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      if model.connection == nil {
        Text("Connect your invited client account in Account to get your referral code and keep rewards together across phones.")
      } else if let summary {
        Section("Your referral code") {
          Text(summary.code).font(.title2.monospaced().bold()).textSelection(.enabled)
          ShareLink(item: "I use Gig Tax Pros. Tell them I referred you with code \(summary.code). \(summary.shareUrl)") {
            Label("Share my referral", systemImage: "square.and.arrow.up")
          }
        }.listRowBackground(Brand.surface)
        Section("Points & progress") {
          Text("\(summary.points) points").font(.largeTitle.bold())
          ProgressView(value: Double(summary.points % summary.program.milestonePoints), total: Double(summary.program.milestonePoints)).tint(Brand.pink)
          Text("\(summary.nextMilestone-summary.points) points to your next \(Brand.usd(summary.program.milestoneCreditCents)) credit")
          Text("\(summary.claims.filter { $0.status == "qualified" }.count) qualified · \(summary.claims.filter { $0.status == "pending" }.count) awaiting review")
            .font(.caption).foregroundStyle(Brand.muted)
          Text("Points track lifetime milestones. Your earned rewards remain in reward history.").font(.caption)
        }.listRowBackground(Brand.surface)
        if summary.referredBy == nil {
          Section("Someone referred you?") {
            TextField("Their referral code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
            Button("Submit referral code") { Task { await perform(["action": "claim", "code": code]) } }.disabled(busy || code.isEmpty)
          }
        } else { Text("Your submitted referral: \(summary.referredBy!.status)").font(.footnote) }
        Section("Reward history") {
          if summary.rewards.isEmpty { Text("Your first qualified referral unlocks your first reward.") }
          ForEach(summary.rewards) { reward in
            VStack(alignment: .leading, spacing: 8) {
              Text("\(Brand.usd(reward.amountCents)) · \(reward.kind == "milestone" ? "Points milestone" : "Referral reward")").font(.headline)
              Text(reward.status.capitalized + (reward.method.map { " · " + ($0 == "cash" ? "Cash" : "Tax-prep credit") } ?? ""))
                .font(.caption).foregroundStyle(Brand.link)
              if reward.status == "available" { Button("Choose my reward") { redeeming = reward }.disabled(busy) }
              if let date = reward.fulfilledAt { Text("Fulfilled \(date.formatted(date: .abbreviated, time: .omitted))").font(.caption) }
            }
          }
        }
        Section("Program details") { Text(summary.program.terms).font(.footnote) }
      }
      if busy { ProgressView("Updating rewards…") }
      if let error { Text(error).foregroundStyle(.orange) }
    }.driverScreen().navigationTitle("Driver Rewards")
      .task { await refresh() }
      .refreshable { await refresh() }
      .confirmationDialog("Choose how to receive this $20 reward", isPresented: Binding(get: { redeeming != nil }, set: { if !$0 { redeeming = nil } })) {
        if let reward = redeeming {
          Button("Request tax-prep credit") { Task { await perform(["action": "redeem", "rewardId": reward.id, "method": "credit"]) }; redeeming = nil }
          if reward.kind == "referral" { Button("Request cash reward") { Task { await perform(["action": "redeem", "rewardId": reward.id, "method": "cash"]) }; redeeming = nil } }
        }
      } message: { Text("The firm confirms fulfillment. Each reward can be redeemed once.") }
  }
  @MainActor private func refresh() async { await perform(nil) }
  @MainActor private func perform(_ action: [String: String]?) async {
    guard let connection = model.connection, !busy else { return }
    let scope = model.journalScope
    busy = true; error = nil; defer { busy = false }
    do {
      let reply = try await WorkspaceClient(origin: connection.origin, token: connection.session.token).referrals(action)
      guard scope == model.journalScope else { return }
      summary = reply
    } catch { self.error = error.localizedDescription }
  }
}
