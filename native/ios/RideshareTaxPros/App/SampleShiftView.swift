import DriverCore
import SwiftUI

struct SampleShiftView: View {
  var initialTab = 0
  @Environment(\.dismiss) private var dismiss
  @State private var tab = 0
  @State private var sample: GigSampleShift?
  @State private var error: String?
  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        HStack(spacing: 8) {
          Image(systemName: "sparkles").foregroundStyle(Brand.pink)
          Text("SAMPLE DATA · Your records are separate").font(.system(size: 11, weight: .bold))
          Spacer()
        }.padding(12).background(Brand.purple.opacity(0.15)).accessibilityIdentifier("sample.banner")
        Picker("Explore sample", selection: $tab) { Text("Earnings").tag(0); Text("Offers").tag(1) }
          .pickerStyle(.segmented).padding(.horizontal, 16).padding(.vertical, 10).accessibilityIdentifier("sample.tabs")
        if let sample {
          if tab == 0 { InsightsView(sample: sample) }
          else {
            ScrollView {
              VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                  Label("Home · West Hartford", systemImage: "house.fill").font(.title3.bold())
                  Text("Paused scenario · 5:00 PM → arrive by 6:00 PM").font(.caption).foregroundStyle(Brand.muted)
                  Text("$20/hr cash target · $0.50/mi cost · 15% planning reserve").font(.caption).foregroundStyle(Brand.link)
                  Text("Five observed examples, ranked through the same calculations used by your offer reader. Roads and travel times below are simulated.").font(.caption).foregroundStyle(Brand.muted)
                }.gigCard(highlight: true)
                ForEach(sample.recommendations) { row in
                  NavigationLink { GigOfferDetailView(recommendation: row, profile: sample.profile) } label: { UnifiedOfferCard(row: row) }.buttonStyle(.plain)
                }
              }.padding(16).accessibilityIdentifier("sample.ranked")
            }
          }
        } else if let error { Text(error).padding() }
        else { ProgressView("Preparing sample shift…") }
      }.driverScreen().navigationTitle("Explore a sample shift").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.accessibilityIdentifier("sample.close") } }
        .onAppear {
          guard sample == nil else { return }
          tab = initialTab
          do { sample = try GigSampleShift.make() }
          catch { self.error = "The sample shift could not load. Your journal is unaffected." }
        }
    }.preferredColorScheme(.dark)
  }
}
