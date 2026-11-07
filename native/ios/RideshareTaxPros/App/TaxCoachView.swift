import DriverCore
import SwiftUI

struct TaxCoachView: View {
  @EnvironmentObject private var model: DriverModel
  @State private var draft = ""
  @State private var period = 30
  @State private var intake = false
  @State private var connection = false
  @FocusState private var composing: Bool
  private var through: String { DriverRecord.day(Date()) }
  private var from: String {
    let day = period == 0 ? Calendar.current.dateInterval(of: .year, for: Date())!.start
      : Calendar.current.date(byAdding: .day, value: -(period - 1), to: Date())!
    return DriverRecord.day(day)
  }
  private var messages: [CoachMessage] { model.journal.coachMessages ?? [] }
  var body: some View {
    ScrollViewReader { scroll in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 14) {
          VStack(alignment: .leading, spacing: 8) {
            Label("Your records. Your next step.", systemImage: "bubble.left.and.text.bubble.right.fill")
              .font(.headline).foregroundStyle(Brand.route)
            Text(model.coachStatus).font(.caption).foregroundStyle(Brand.muted)
              .accessibilityIdentifier("coach.status")
            HStack {
              if model.coachSyncing { ProgressView().tint(Brand.route) }
              if model.connection == nil { Button("Connect my client account") { connection = true } }
              Button("Tax details") { intake = true }.accessibilityIdentifier("coach.intake")
              NavigationLink("Goals & costs") { GoalsEditor() }
            }.font(.caption.weight(.semibold))
            Picker("Analyze records from", selection: $period) {
              Text("7 days").tag(7); Text("30 days").tag(30); Text("90 days").tag(90); Text("This year").tag(0)
            }.pickerStyle(.segmented).accessibilityIdentifier("coach.period")
            Text("Financial records: \(from) through \(through)").font(.caption2).foregroundStyle(Brand.muted)
            NavigationLink("Your ratings & reviews") { ReputationView() }.font(.caption.weight(.semibold))
          }.gigCard(accent: Brand.route)
          if messages.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
              Text("Where am I losing money?").font(.title3.bold()).foregroundStyle(Brand.caution)
              Text("Ask about your jobs, platforms, costs, tax-prep records or milestones. Answers identify their source and what is still missing.")
                .font(.subheadline).foregroundStyle(Brand.muted)
              prompts
            }.gigCard()
          }
          if !(model.journal.coachMilestones ?? []).isEmpty {
            DisclosureGroup("Your next milestones") {
              ForEach(model.journal.coachMilestones ?? []) { milestone in
                VStack(alignment: .leading, spacing: 4) {
                  Label(milestone.title, systemImage: milestone.status == "done" ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(milestone.status == "done" ? Brand.positive : Brand.caution)
                  Text(milestone.detail).font(.caption).foregroundStyle(Brand.muted)
                }.padding(.vertical, 5)
              }
            }.font(.subheadline).gigCard(accent: Brand.caution)
          }
          ForEach(messages) { message in CoachMessageBubble(message: message) }
          if !messages.isEmpty { prompts }
          Text("Recorded profit is not taxable income or tax owed. Confirm tax details and review documents with your firm. No return or payment is filed by chatting.")
            .font(.caption2).foregroundStyle(Brand.muted)
          Color.clear.frame(height: 1).id("coach.bottom")
        }.padding(.horizontal, 16).padding(.vertical, 8)
      }.scrollDismissesKeyboard(.interactively)
        .onChange(of: messages.last?.id) { _, _ in withAnimation { scroll.scrollTo("coach.bottom", anchor: .bottom) } }
    }.driverScreen().navigationTitle("Tax & Goals").navigationBarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .bottom) { composer }
      .sheet(isPresented: $intake) { NavigationStack { CoachIntakeEditor(from: from, through: through) } }
      .sheet(isPresented: $connection) { NavigationStack {
        ConnectionView().toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { connection = false } } }
      } }
      .task(id: model.journalScope) {
        while !Task.isCancelled {
          await model.syncCoach(from: from, through: through)
          do { try await Task.sleep(for: .seconds(20)) } catch { break }
        }
      }
      .onChange(of: period) { _, _ in Task { await model.syncCoach(from: from, through: through) } }
  }
  private var prompts: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(["Which jobs lose money?", "What pays me best?", "What are my expenses?", "What do I need for taxes?", "How do I reach my goal?", "How can I improve my ratings?"], id: \.self) { text in
          Button(text) { ask(text) }.font(.caption.weight(.semibold)).padding(10)
            .background(Brand.route.opacity(0.1), in: Capsule()).foregroundStyle(Brand.route)
        }
      }
    }
  }
  private var composer: some View {
    VStack(alignment: .leading, spacing: 5) {
      if draft.count > 2000 { Text("Keep this question under 2,000 characters.").font(.caption).foregroundStyle(Brand.caution) }
      HStack(alignment: .bottom, spacing: 10) {
        TextField("Ask about jobs, taxes or goals…", text: $draft, axis: .vertical)
          .lineLimit(1...5).focused($composing).padding(12)
          .background(Brand.surface, in: RoundedRectangle(cornerRadius: 15))
          .accessibilityIdentifier("coach.question")
        Button { ask(draft) } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 35)).foregroundStyle(Brand.route) }
          .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draft.count > 2000 || !model.storageHealthy)
          .accessibilityLabel("Send question").accessibilityIdentifier("coach.send")
      }
      Text(model.connection == nil ? "Phone-only · Choose whether to copy this chat when connecting" : "Sending shares this conversation and your chosen cost/goal assumptions with your firm’s workspace.")
        .font(.system(size: 10)).foregroundStyle(Brand.muted)
    }.padding(.horizontal, 16).padding(.vertical, 8).background(Brand.background)
  }
  private func ask(_ text: String) {
    draft = ""; composing = false
    let firstDay = from, lastDay = through
    Task {
      let saved = await model.askCoach(text, from: firstDay, through: lastDay)
      if !saved && draft.isEmpty { draft = text }
    }
  }
}

private struct CoachMessageBubble: View {
  let message: CoachMessage
  @EnvironmentObject private var model: DriverModel
  private var user: Bool { message.role == "user" }
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(user ? "You" : message.role == "staff" ? "Your firm" : "Shuug Guide")
          .font(.caption.bold()).foregroundStyle(user ? Brand.link : Brand.route)
        Spacer()
        Text(message.createdAt.formatted(date: .omitted, time: .shortened)).font(.caption2).foregroundStyle(Brand.muted)
      }
      Text(message.text).font(.subheadline).textSelection(.enabled)
        .accessibilityIdentifier("coach.message")
      if !user {
        Text(message.engine == "local-record-rules" ? "Phone record analysis · Not shared yet"
          : message.engine == "phone-record-rules" ? "Phone record analysis · Question shared" : "Record-based guidance")
          .font(.caption2).foregroundStyle(Brand.muted)
      } else if model.journal.coachOutbox?.contains(where: { $0.id == message.id }) == true {
        Text("Saved on this iPhone · Sharing pending").font(.caption2).foregroundStyle(Brand.caution)
      }
      ForEach(message.sources ?? []) { source in
        if let url = URL(string: source.url), url.scheme == "https",
          url.host == "irs.gov" || url.host?.hasSuffix(".irs.gov") == true {
          Link(source.title, destination: url).font(.caption).foregroundStyle(Brand.route)
        }
      }
      ForEach(Array((message.recordIds ?? []).prefix(3)), id: \.self) { id in
        if let entry = model.journal.visible.first(where: { $0.id == id }), case .trip = entry.record.payload {
          NavigationLink("Open recorded job") { TripDetail(id: id) }.font(.caption).foregroundStyle(Brand.route)
        }
      }
    }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
      .background(user ? Brand.purple.opacity(0.15) : Brand.surface, in: RoundedRectangle(cornerRadius: 18))
      .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder((user ? Brand.purple : Brand.route).opacity(0.35), lineWidth: 1) }
  }
}

private struct CoachIntakeEditor: View {
  let from: String, through: String
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  @State private var year = ""
  @State private var jurisdiction = ""
  @State private var businessType = "unsure"
  @State private var error: String?
  @State private var saving = false
  var body: some View {
    Form {
      Section("Tax-prep details you confirm") {
        TextField("Tax year", text: $year).keyboardType(.numberPad).accessibilityIdentifier("coach.taxYear")
        TextField("Federal / state / local jurisdiction", text: $jurisdiction).accessibilityIdentifier("coach.jurisdiction")
        Picker("Business arrangement", selection: $businessType) {
          Text("Not sure yet").tag("unsure"); Text("Sole proprietor / contractor").tag("sole-proprietor")
          Text("Single-member LLC").tag("single-member-llc"); Text("Partnership").tag("partnership"); Text("Corporation").tag("corporation")
        }
        Text("These are your confirmed answers for preparation and review. Chat does not silently fill or change them.").font(.footnote)
      }.listRowBackground(Brand.surface)
      Section {
        Text("Upload requested tax documents through your client account. Keep passwords, verification codes, full Social Security numbers and bank credentials out of chat.").font(.footnote).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      if let error { Text(error).foregroundStyle(Brand.danger) }
    }.driverScreen().navigationTitle("Tax details")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button("Confirm & save") { save() }.disabled(saving).accessibilityIdentifier("coach.saveIntake") }
      }.onAppear {
        let intake = model.journal.coachIntake
        year = intake?.taxYear.map(String.init) ?? ""; jurisdiction = intake?.jurisdiction ?? ""; businessType = intake?.businessType ?? "unsure"
      }
  }
  private func save() {
    let trimmedYear = year.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmedYear.isEmpty || Int(trimmedYear).map({ (1900...9999).contains($0) }) == true else { error = "Enter a valid tax year."; return }
    let place = jurisdiction.trimmingCharacters(in: .whitespacesAndNewlines)
    guard place.isEmpty || ((2...80).contains(place.count)
      && place.range(of: "^[\\p{L} .,'-]+$", options: .regularExpression) != nil) else {
      error = "Use a state or country name, without account or taxpayer numbers."; return
    }
    let intake = CoachIntake(taxYear: Int(trimmedYear), jurisdiction: place.isEmpty ? nil : place, businessType: businessType)
    saving = true
    Task {
      let saved = await model.saveCoachIntake(intake, from: from, through: through)
      saving = false
      if saved { dismiss() } else { error = "Your details could not be saved. Try again before leaving this form." }
    }
  }
}
