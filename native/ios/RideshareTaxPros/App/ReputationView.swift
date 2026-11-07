import CryptoKit
import DriverCore
import SwiftUI

struct ReputationView: View {
  @EnvironmentObject private var model: DriverModel
  let initialPlatformID: String?
  @State private var selectedPlatform = "all"
  @State private var form: ReputationFormKind?
  @State private var deleting = false
  @State private var deletion: ReputationDeletion?
  init(platformID: String? = nil) { initialPlatformID = platformID }
  private var state: ReputationState { model.journal.reputationState ?? .init() }
  private var platformID: String? { selectedPlatform == "all" ? nil : selectedPlatform }
  private var ratings: [ReputationRating] {
    state.ratings.enumerated().filter { !$0.element.deleted && (platformID == nil || $0.element.platformID == platformID) }
      .sorted { $0.element.recordedAt == $1.element.recordedAt ? $0.offset > $1.offset : $0.element.recordedAt > $1.element.recordedAt }.map(\.element)
  }
  private var reviews: [ReputationReview] {
    state.reviews.enumerated().filter { !$0.element.deleted && (platformID == nil || $0.element.platformID == platformID) }
      .sorted { $0.element.recordedAt == $1.element.recordedAt ? $0.offset > $1.offset : $0.element.recordedAt > $1.element.recordedAt }.map(\.element)
  }
  var body: some View {
    List {
      Section {
        Label("Your ratings & feedback", systemImage: "star.bubble.fill")
          .font(.title2.bold()).foregroundStyle(Brand.caution)
        Text("Save the scores and customer feedback you see in your work apps. Each entry is a personal record; apps do not send ratings here automatically.")
          .font(.footnote).foregroundStyle(Brand.muted)
        Text(model.connection == nil ? "Saved on this iPhone · Connect to share with your tax team" : model.reputationStatus)
          .font(.caption).foregroundStyle(Brand.route).accessibilityIdentifier("reputation.status")
        if model.connection != nil {
          Button { Task { await model.syncReputation() } } label: {
            if model.reputationSyncing { ProgressView("Sharing your entries…") }
            else { Label("Sync my personal entries", systemImage: "arrow.triangle.2.circlepath") }
          }.disabled(model.reputationSyncing).accessibilityIdentifier("reputation.sync")
        }
        HStack {
          Button { form = .rating } label: { Label("Add rating", systemImage: "star") }
            .accessibilityIdentifier("reputation.addRating")
          Button { form = .review } label: { Label("Add review", systemImage: "text.bubble") }
            .accessibilityIdentifier("reputation.addReview")
        }.buttonStyle(BrandActionStyle(primary: false)).disabled(!model.storageHealthy)
      }.listRowBackground(Brand.surface)
      Section {
        Picker("Platform", selection: $selectedPlatform) {
          Text("All platforms").tag("all")
          ForEach(reputationPlatforms(state)) { option in Text(option.name).tag(option.id) }
        }.accessibilityIdentifier("reputation.platformFilter")
        Text("Trends compare your snapshots for the same platform and rating scale. Review count and feedback tags are entered by you.")
          .font(.caption).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      let summaries = ReputationGuide.summaries(state: state, platformID: platformID)
      if !summaries.isEmpty {
        Section("Your recorded trends") {
          ForEach(summaries) { summary in
            VStack(alignment: .leading, spacing: 8) {
              Text(summary.platformName).font(.headline)
              if let latest = summary.latestRating {
                Label(reputationScore(latest), systemImage: latest.scale == 5 ? "star.fill" : "percent")
                  .font(.title3.bold()).foregroundStyle(Brand.caution)
                Text("Snapshot · \(latest.recordedAt.formatted(date: .abbreviated, time: .omitted))").font(.caption).foregroundStyle(Brand.muted)
                if let change = summary.change, let previous = summary.previousComparableRating {
                  Text("\(change > 0 ? "+" : "")\(reputationNumber(change)) \(latest.scale == 5 ? "stars" : "percentage points") since \(previous.recordedAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.subheadline).foregroundStyle(change > 0 ? Brand.positive : change < 0 ? Brand.danger : Brand.route)
                } else {
                  Text("Add another snapshot on this scale to compare changes.").font(.caption).foregroundStyle(Brand.muted)
                }
              }
              Text("\(summary.ratingCount) rating snapshots · \(summary.reviewCount) saved reviews").font(.caption)
              ForEach(summary.strengths) { evidence in
                Label(evidence.title, systemImage: "checkmark.circle").font(.caption).foregroundStyle(Brand.positive)
              }
              ForEach(summary.improvements) { evidence in
                VStack(alignment: .leading, spacing: 3) {
                  Label(evidence.title, systemImage: "lightbulb").font(.subheadline.bold()).foregroundStyle(Brand.caution)
                  Text(evidence.detail).font(.caption)
                  Text("Based on \(evidence.reviewIDs.count) of your tagged reviews.").font(.caption2).foregroundStyle(Brand.muted)
                }
              }
            }.padding(.vertical, 5)
          }.listRowBackground(Brand.surface)
        }
      }
      Section {
        DisclosureGroup("How can I improve?") {
          Text(ReputationGuide.answer(query: "How can I improve my ratings and reviews?", state: state, platformID: platformID))
            .font(.footnote).textSelection(.enabled).accessibilityIdentifier("reputation.guidance")
          Text("Guidance uses your saved feedback and manual tags. It is not a provider policy, eligibility verdict or promise that your score will change.")
            .font(.caption).foregroundStyle(Brand.muted)
        }.accessibilityIdentifier("reputation.guide")
      }.listRowBackground(Brand.surface)
      Section("Rating history") {
        if ratings.isEmpty { Text("No rating snapshots for this selection yet.").font(.footnote).foregroundStyle(Brand.muted) }
        ForEach(ratings) { rating in
          VStack(alignment: .leading, spacing: 7) {
            HStack {
              Text(rating.platformName).font(.headline); Spacer()
              Text(reputationScore(rating)).font(.headline).foregroundStyle(Brand.caution)
            }
            Text(rating.recordedAt.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(Brand.muted)
            if let count = rating.reviewCount { Text("Review count entered: \(count)").font(.caption) }
            if !rating.notes.isEmpty { Text(rating.notes).font(.footnote).privacySensitive() }
            Button("Delete snapshot", role: .destructive) {
              deletion = .init(id: rating.id, review: false, scope: model.journalScope); deleting = true
            }.font(.caption).accessibilityIdentifier("reputation.deleteRating.\(rating.id)")
          }.padding(.vertical, 4)
        }.listRowBackground(Brand.surface)
      }
      Section("Review history") {
        if reviews.isEmpty { Text("No saved reviews for this selection yet.").font(.footnote).foregroundStyle(Brand.muted) }
        ForEach(reviews) { review in
          VStack(alignment: .leading, spacing: 7) {
            HStack { Text(review.platformName).font(.headline); Spacer(); Text(review.sentiment.capitalized).font(.caption).foregroundStyle(review.sentiment == "positive" ? Brand.positive : Brand.caution) }
            Text(review.recordedAt.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(Brand.muted)
            Text(review.text).font(.footnote).privacySensitive().textSelection(.enabled)
            if !review.topics.isEmpty { Text("Your tags: " + review.topics.map { $0.capitalized }.joined(separator: ", ")).font(.caption).foregroundStyle(Brand.route) }
            Button("Delete review", role: .destructive) {
              deletion = .init(id: review.id, review: true, scope: model.journalScope); deleting = true
            }.font(.caption).accessibilityIdentifier("reputation.deleteReview.\(review.id)")
          }.padding(.vertical, 4)
        }.listRowBackground(Brand.surface)
      }
    }.driverScreen().navigationTitle("My ratings & reviews").navigationBarTitleDisplayMode(.inline)
      .task(id: model.journalScope) {
        form = nil; deleting = false; deletion = nil
        selectedPlatform = initialPlatformID ?? "all"
        await model.syncReputation()
      }
      .sheet(item: $form) { kind in
        NavigationStack { ReputationEntryEditor(kind: kind, initialPlatformID: platformID) }
      }
      .brandedDialog("Delete this saved entry?", isPresented: $deleting,
        message: "This removes your personal copy from this history and, when connected, from this client account. It does not remove a review or rating in any gig app.",
        icon: "trash", accent: Brand.danger) {
        [BrandedDialogAction("Delete entry", role: .destructive) {
          guard let deletion, deletion.scope == model.journalScope else { return }
          if deletion.review { _ = model.deleteReputationReview(deletion.id) }
          else { _ = model.deleteReputationRating(deletion.id) }
        }]
      }
  }
}

private enum ReputationFormKind: String, Identifiable { case rating, review; var id: String { rawValue } }
private struct ReputationDeletion { let id: UUID; let review: Bool; let scope: String }
private struct ReputationPlatformOption: Identifiable { let id: String; let name: String }

private func reputationPlatforms(_ state: ReputationState) -> [ReputationPlatformOption] {
  var result = GigAppCatalog.apps.map { ReputationPlatformOption(id: $0.id, name: $0.name) }
  var ids = Set(result.map(\.id))
  for rating in state.ratings where !rating.deleted && ids.insert(rating.platformID).inserted {
    result.append(.init(id: rating.platformID, name: rating.platformName))
  }
  for review in state.reviews where !review.deleted && ids.insert(review.platformID).inserted {
    result.append(.init(id: review.platformID, name: review.platformName))
  }
  return result
}

private func reputationNumber(_ value: Double) -> String {
  value.formatted(.number.precision(.fractionLength(0...2)))
}
private func reputationScore(_ rating: ReputationRating) -> String {
  "\(reputationNumber(rating.score)) / \(Int(rating.scale))"
}

private struct ReputationEntryEditor: View {
  let kind: ReputationFormKind
  let initialPlatformID: String?
  @EnvironmentObject private var model: DriverModel
  @Environment(\.dismiss) private var dismiss
  @State private var platform = GigAppCatalog.apps.first!.id
  @State private var customName = ""
  @State private var recordedAt = Date()
  @State private var score = ""
  @State private var scale = 5.0
  @State private var reviewCount = ""
  @State private var notes = ""
  @State private var text = ""
  @State private var sentiment = "unreviewed"
  @State private var topics = Set<String>()
  @State private var error: String?
  @State private var loadedScope = ""
  @FocusState private var editing: Bool
  private let customID = "__new_custom_platform__"
  private var options: [ReputationPlatformOption] { reputationPlatforms(model.journal.reputationState ?? .init()) }
  var body: some View {
    Form {
      Section("Where you saw it") {
        Picker("Platform", selection: $platform) {
          ForEach(options) { option in Text(option.name).tag(option.id) }
          Text("Another app or client").tag(customID)
        }.accessibilityIdentifier("reputation.platform")
        if platform == customID {
          TextField("App or client name", text: $customName).focused($editing)
            .accessibilityIdentifier("reputation.customPlatform")
        }
        DatePicker("Recorded on", selection: $recordedAt, in: ...Date(), displayedComponents: [.date])
          .accessibilityIdentifier("reputation.date")
        Text("Enter only information you choose to keep. Leave customer names, addresses and other private identifiers out of review text.")
          .font(.caption).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
      if kind == .rating {
        Section("Rating snapshot") {
          Picker("Rating scale", selection: $scale) {
            Text("Stars / 5").tag(5.0); Text("Percent / 100").tag(100.0)
          }.pickerStyle(.segmented).accessibilityIdentifier("reputation.scale")
          TextField(scale == 5 ? "Score · 0 to 5" : "Score · 0 to 100", text: $score)
            .keyboardType(.decimalPad).focused($editing).accessibilityIdentifier("reputation.score")
          TextField("Review count · optional", text: $reviewCount).keyboardType(.numberPad).focused($editing)
            .accessibilityIdentifier("reputation.reviewCount")
          TextField("Notes · optional", text: $notes, axis: .vertical).lineLimit(2...4).focused($editing)
            .accessibilityIdentifier("reputation.notes")
          Text("Keep the scale shown by that app. Each save adds a dated snapshot; changing the scale does not convert a previous score.")
            .font(.caption).foregroundStyle(Brand.muted)
        }.listRowBackground(Brand.surface)
      } else {
        Section("Review you received") {
          TextEditor(text: $text).frame(minHeight: 110).focused($editing).accessibilityIdentifier("reputation.text")
          Picker("Your tone label", selection: $sentiment) {
            ForEach(ReputationReview.sentiments, id: \.self) { value in Text(value.capitalized).tag(value) }
          }.accessibilityIdentifier("reputation.sentiment")
        }.listRowBackground(Brand.surface)
        Section("Your feedback tags") {
          ForEach(ReputationReview.topics, id: \.self) { topic in
            Toggle(topic.capitalized, isOn: Binding(get: { topics.contains(topic) }, set: {
              if $0 { topics.insert(topic) } else { topics.remove(topic) }
            })).accessibilityIdentifier("reputation.topic.\(topic)")
          }
          Text("Choose tags yourself. Improvement guidance uses these labels and the saved reviews behind them; no automatic sentiment score is assigned.")
            .font(.caption).foregroundStyle(Brand.muted)
        }.listRowBackground(Brand.surface)
      }
      if let error { Text(error).font(.footnote).foregroundStyle(Brand.danger).listRowBackground(Brand.surface) }
      Section {
        Button(kind == .rating ? "Save rating snapshot" : "Save review") { save() }
          .disabled(!model.storageHealthy)
          .accessibilityIdentifier(kind == .rating ? "reputation.saveRating" : "reputation.saveReview")
        Text(model.connection == nil ? "Saved privately on this iPhone. You can choose whether to copy it when connecting an account."
          : "Saved on this iPhone first, then shared with this client account and your tax team when available.")
          .font(.caption).foregroundStyle(Brand.muted)
      }.listRowBackground(Brand.surface)
    }.driverScreen().navigationTitle(kind == .rating ? "Add rating" : "Add review")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .keyboard) { Button("Done") { editing = false }.accessibilityIdentifier("reputation.dismissKeyboard") }
      }
      .onAppear { loadedScope = model.journalScope; platform = initialPlatformID ?? GigAppCatalog.apps.first!.id }
      .scrollDismissesKeyboard(.interactively)
  }
  private func save() {
    guard loadedScope == model.journalScope else { error = "Your account changed. Reopen this form before saving."; return }
    let name: String, id: String
    if platform == customID {
      name = customName.trimmingCharacters(in: .whitespacesAndNewlines)
      let normalized = name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        .split(whereSeparator: \.isWhitespace).joined(separator: " ")
      let digest = SHA256.hash(data: Data(normalized.utf8)).map { String(format: "%02x", $0) }.joined()
      id = "custom-" + String(digest.prefix(24))
    } else {
      guard let option = options.first(where: { $0.id == platform }) else { error = "Choose the app or client for this entry."; return }
      name = option.name; id = option.id
    }
    do {
      let saved: Bool
      if kind == .rating {
        guard let value = Double(score.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")) else {
          throw ReputationError.score
        }
        let countText = reviewCount.trimmingCharacters(in: .whitespacesAndNewlines)
        let count = countText.isEmpty ? nil : Int(countText)
        if !countText.isEmpty && count == nil { throw ReputationError.reviewCount }
        let rating = try ReputationRating(platformID: id, platformName: name, recordedAt: recordedAt,
          score: value, scale: scale, reviewCount: count, notes: notes).validated()
        saved = model.saveReputationRating(rating)
      } else {
        let review = try ReputationReview(platformID: id, platformName: name, recordedAt: recordedAt,
          text: text, sentiment: sentiment, topics: ReputationReview.topics.filter { topics.contains($0) }).validated()
        saved = model.saveReputationReview(review)
      }
      if saved { dismiss() } else { error = model.message ?? "This entry could not be saved on your iPhone." }
    } catch { self.error = error.localizedDescription }
  }
}
