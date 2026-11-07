import Foundation

public struct ReputationEvidence: Identifiable, Equatable, Sendable {
  public let id: String
  public let topic: String
  public let title: String
  public let detail: String
  public let kind: String
  public let reviewIDs: [UUID]
}

public struct ReputationPlatformSummary: Identifiable, Sendable {
  public let platformID: String
  public let platformName: String
  public let latestRating: ReputationRating?
  public let previousComparableRating: ReputationRating?
  public let ratingCount: Int
  /// Saved review-text records, distinct from a manually entered provider review count.
  public let reviewCount: Int
  public let unreviewedCount: Int
  public let strengths: [ReputationEvidence]
  public let improvements: [ReputationEvidence]
  public var id: String { platformID }
  public var change: Double? {
    guard let latestRating, let previousComparableRating else { return nil }
    return latestRating.score - previousComparableRating.score
  }
}

/// Local guidance uses only manual snapshots and the user's explicit feedback tags.
public enum ReputationGuide {
  public static func isQuery(_ text: String) -> Bool {
    let value = normalized(text)
    let words = Set(value.split(separator: " ").map(String.init))
    if !words.isDisjoint(with: ["rating", "ratings", "rated", "star", "stars", "reputation", "feedback"]) { return true }
    return ["customer score", "customer scores", "customer review", "customer reviews", "my review",
      "my reviews", "personal review", "personal reviews", "app review", "app reviews"].contains {
        (" " + value + " ").contains(" " + $0 + " ")
      }
  }

  public static func summaries(state: ReputationState, platformID: String? = nil) -> [ReputationPlatformSummary] {
    let ratings = state.ratings.filter { !$0.deleted }.compactMap { try? $0.validated() }
    let reviews = state.reviews.filter { !$0.deleted }.compactMap { try? $0.validated() }
    let selected = platformID?.trimmingCharacters(in: .whitespacesAndNewlines)
    let ids = Set(ratings.map(\.platformID) + reviews.map(\.platformID)).filter { selected == nil || $0 == selected }
    return ids.map { id in
      // Equal timestamps do not establish a chronological trend. Insertion order
      // chooses the display snapshot; the comparison requires an earlier date.
      let history = ratings.enumerated().filter { $0.element.platformID == id }.sorted {
        $0.element.recordedAt == $1.element.recordedAt ? $0.offset > $1.offset : $0.element.recordedAt > $1.element.recordedAt
      }.map(\.element)
      let feedback = reviews.filter { $0.platformID == id }
      let latest = history.first
      let previous = latest.flatMap { newest in
        history.first { $0.id != newest.id && $0.scale == newest.scale && $0.recordedAt < newest.recordedAt }
      }
      let name = latest?.platformName ?? feedback.max(by: { $0.recordedAt < $1.recordedAt })?.platformName ?? id
      return ReputationPlatformSummary(platformID: id, platformName: name, latestRating: latest,
        previousComparableRating: previous, ratingCount: history.count, reviewCount: feedback.count,
        unreviewedCount: feedback.filter { $0.sentiment == "unreviewed" }.count,
        strengths: evidence(feedback.filter { $0.sentiment == "positive" }, platformID: id, kind: "strength"),
        improvements: evidence(feedback.filter { ["mixed", "negative"].contains($0.sentiment) }, platformID: id, kind: "improvement"))
    }.sorted {
      $0.platformName.lowercased() == $1.platformName.lowercased()
        ? $0.platformID < $1.platformID : $0.platformName.lowercased() < $1.platformName.lowercased()
    }
  }

  public static func answer(query: String, state: ReputationState, platformID: String? = nil) -> String {
    let all = summaries(state: state)
    var selectedID = platformID
    if selectedID == nil {
      let question = " " + normalized(query) + " "
      let matches = all.filter {
        question.contains(" " + normalized($0.platformName) + " ") || question.contains(" " + normalized($0.platformID) + " ")
      }
      if matches.count == 1 { selectedID = matches[0].platformID }
    }
    let selected = selectedID == nil ? all : all.filter { $0.platformID == selectedID }
    var lines = ["Based on all saved manual reputation history, independent of the selected financial date range."]
    guard !selected.isEmpty else {
      lines.append("No manual rating snapshots or review records are saved for this selection. Add a dated rating from the app and any feedback you want to track. Choose sentiment and topics yourself to ground improvement steps.")
      return lines.joined(separator: "\n\n")
    }
    for summary in selected.prefix(10) {
      var section = [summary.platformName + ":"]
      if let latest = summary.latestRating {
        var rating = "Latest manual snapshot: \(number(latest.score))/\(number(latest.scale)) on \(day(latest.recordedAt)) UTC."
        if let count = latest.reviewCount { rating += " Entered provider review count: \(count)." }
        section.append(rating)
        if let previous = summary.previousComparableRating, let change = summary.change {
          let direction = change > 0 ? "+" : ""
          section.append("Same-app, same-scale change: \(direction)\(number(change)) from \(number(previous.score))/\(number(previous.scale)) on \(day(previous.recordedAt)) UTC. These are two recorded snapshots, not a forecast.")
        } else {
          section.append("A trend needs another earlier snapshot from this app on the same scale. Different apps or scales are not combined.")
        }
      } else {
        section.append("No rating snapshot saved for this app.")
      }
      section.append("Saved history: \(summary.ratingCount) rating snapshots and \(summary.reviewCount) review records.")
      if !summary.strengths.isEmpty {
        section.append("Strengths from your positive tags:\n" + summary.strengths.map(evidenceLine).joined(separator: "\n"))
      }
      if !summary.improvements.isEmpty {
        section.append("Next steps from your mixed or negative tags:\n" + summary.improvements.map(evidenceLine).joined(separator: "\n"))
      } else {
        section.append("No user-tagged mixed or negative feedback supports an improvement finding for this app.")
      }
      if summary.unreviewedCount > 0 {
        section.append("\(summary.unreviewedCount) reviews are unreviewed. Choose sentiment and topics before using them to identify strengths or concerns.")
      }
      lines.append(section.joined(separator: "\n"))
    }
    if selected.count > 10 { lines.append("Showing 10 of \(selected.count) apps. Select an app to inspect its full summary.") }
    lines.append("These records do not reveal a provider's scoring calculation, establish account thresholds, prove why a score changed, or guarantee a higher rating.")
    return lines.joined(separator: "\n\n")
  }

  private static func evidence(_ reviews: [ReputationReview], platformID: String, kind: String) -> [ReputationEvidence] {
    var grouped: [String: [UUID]] = [:]
    for review in reviews {
      for topic in review.topics.isEmpty ? ["other"] : review.topics {
        grouped[topic, default: []].append(review.id)
      }
    }
    return grouped.map { topic, ids in
      let title = topic == "other" ? "Feedback to review" : topic.capitalized
      let detail = kind == "strength"
        ? "You marked \(ids.count) saved reviews positive for \(topic). Keep the practices described in those records."
        : improvement(topic)
      return ReputationEvidence(id: "\(platformID):\(kind):\(topic)", topic: topic, title: title,
        detail: detail, kind: kind, reviewIDs: ids)
    }.sorted {
      $0.reviewIDs.count == $1.reviewIDs.count ? $0.topic < $1.topic : $0.reviewIDs.count > $1.reviewIDs.count
    }
  }

  private static func improvement(_ topic: String) -> String {
    switch topic {
    case "communication": "Confirm instructions and send a clear update when plans change."
    case "timing": "Check timing commitments before accepting and communicate delays early; avoid rushing."
    case "accuracy": "Compare the job or shopping list with completed items before handoff and clarify uncertain substitutions."
    case "handling": "Follow handling instructions and protect items during preparation and handoff."
    case "professionalism": "Keep messages and handoffs calm, respectful, and concise."
    default: "Re-read this tagged feedback, choose one specific change, and check it after the next jobs. Add a more specific topic when appropriate."
    }
  }
  private static func evidenceLine(_ evidence: ReputationEvidence) -> String {
    let ids = evidence.reviewIDs.prefix(3).map { $0.uuidString.lowercased() }.joined(separator: ", ")
    let more = evidence.reviewIDs.count > 3 ? " (+\(evidence.reviewIDs.count - 3) more)" : ""
    return "• \(evidence.title): \(evidence.detail) Evidence review IDs: \(ids)\(more)."
  }
  private static func normalized(_ text: String) -> String {
    text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
  }
  private static func day(_ date: Date) -> String {
    DriverRecord.day(date, timeZone: TimeZone(secondsFromGMT: 0)!)
  }
  private static func number(_ value: Double) -> String {
    let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.numberStyle = .decimal; formatter.minimumFractionDigits = 0; formatter.maximumFractionDigits = 3
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }
}
