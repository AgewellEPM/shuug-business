import Foundation

public enum ReputationError: LocalizedError {
  case platform, date, score, scale, reviewCount, notes, text, sentiment, topics, mutation, conflict, capacity
  public var errorDescription: String? {
    switch self {
    case .platform: "Use an app ID and name between 1 and 80 characters."
    case .date: "Choose a valid date for this manual record."
    case .score: "Enter a finite score from zero through the selected scale."
    case .scale: "Choose a rating scale of 5 or 100."
    case .reviewCount: "Review count must be between zero and 1,000,000,000, or left blank."
    case .notes: "Keep rating notes within 500 characters."
    case .text: "Enter review text between 1 and 2,000 characters."
    case .sentiment: "Choose positive, mixed, negative, or unreviewed feedback."
    case .topics: "Choose supported feedback topics without duplicates."
    case .mutation: "This reputation change has an invalid action or record."
    case .conflict: "A different reputation record already uses this ID. Existing history was kept."
    case .capacity: "This app can keep up to 500 rating records and 500 review records in one account."
    }
  }
}

/// A manual snapshot from the user's records, not a live provider integration.
public struct ReputationRating: Codable, Equatable, Identifiable, Sendable {
  public var id: UUID
  public var platformID: String
  public var platformName: String
  public var recordedAt: Date
  public var score: Double
  public var scale: Double
  public var reviewCount: Int?
  public var notes: String
  public var deleted: Bool
  public init(id: UUID = UUID(), platformID: String, platformName: String, recordedAt: Date = Date(),
              score: Double, scale: Double = 5, reviewCount: Int? = nil, notes: String = "", deleted: Bool = false) {
    self.id = id; self.platformID = platformID; self.platformName = platformName; self.recordedAt = recordedAt
    self.score = score; self.scale = scale; self.reviewCount = reviewCount; self.notes = notes; self.deleted = deleted
  }
  public func validated() throws -> Self {
    var result = self
    result.platformID = platformID.trimmingCharacters(in: .whitespacesAndNewlines)
    result.platformName = platformName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (1...80).contains(result.platformID.count), (1...80).contains(result.platformName.count) else { throw ReputationError.platform }
    guard recordedAt.timeIntervalSince1970.isFinite else { throw ReputationError.date }
    guard scale == 5 || scale == 100 else { throw ReputationError.scale }
    guard score.isFinite, score >= 0, score <= scale else { throw ReputationError.score }
    guard reviewCount.map({ (0...1_000_000_000).contains($0) }) ?? true else { throw ReputationError.reviewCount }
    guard notes.count <= 500 else { throw ReputationError.notes }
    return result
  }
  private enum CodingKeys: String, CodingKey { case id, platformID, platformName, recordedAt, score, scale, reviewCount, notes, deleted }
  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(UUID.self, forKey: .id)
    platformID = try values.decode(String.self, forKey: .platformID)
    platformName = try values.decode(String.self, forKey: .platformName)
    recordedAt = try values.decode(Date.self, forKey: .recordedAt)
    score = try values.decode(Double.self, forKey: .score); scale = try values.decode(Double.self, forKey: .scale)
    reviewCount = try values.decodeIfPresent(Int.self, forKey: .reviewCount)
    notes = try values.decodeIfPresent(String.self, forKey: .notes) ?? ""
    deleted = try values.decodeIfPresent(Bool.self, forKey: .deleted) ?? false
  }
}

public struct ReputationReview: Codable, Equatable, Identifiable, Sendable {
  public static let sentiments = ["positive", "mixed", "negative", "unreviewed"]
  public static let topics = ["communication", "timing", "accuracy", "handling", "professionalism", "other"]
  public var id: UUID
  public var platformID: String
  public var platformName: String
  public var recordedAt: Date
  public var text: String
  public var sentiment: String
  public var topics: [String]
  public var deleted: Bool
  public init(id: UUID = UUID(), platformID: String, platformName: String, recordedAt: Date = Date(),
              text: String, sentiment: String = "unreviewed", topics: [String] = [], deleted: Bool = false) {
    self.id = id; self.platformID = platformID; self.platformName = platformName; self.recordedAt = recordedAt
    self.text = text; self.sentiment = sentiment; self.topics = topics; self.deleted = deleted
  }
  public func validated() throws -> Self {
    var result = self
    result.platformID = platformID.trimmingCharacters(in: .whitespacesAndNewlines)
    result.platformName = platformName.trimmingCharacters(in: .whitespacesAndNewlines)
    result.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (1...80).contains(result.platformID.count), (1...80).contains(result.platformName.count) else { throw ReputationError.platform }
    guard recordedAt.timeIntervalSince1970.isFinite else { throw ReputationError.date }
    guard (1...2_000).contains(result.text.count) else { throw ReputationError.text }
    guard Self.sentiments.contains(sentiment) else { throw ReputationError.sentiment }
    guard Set(topics).count == topics.count, topics.allSatisfy(Self.topics.contains) else { throw ReputationError.topics }
    return result
  }
  private enum CodingKeys: String, CodingKey { case id, platformID, platformName, recordedAt, text, sentiment, topics, deleted }
  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(UUID.self, forKey: .id)
    platformID = try values.decode(String.self, forKey: .platformID)
    platformName = try values.decode(String.self, forKey: .platformName)
    recordedAt = try values.decode(Date.self, forKey: .recordedAt)
    text = try values.decode(String.self, forKey: .text)
    sentiment = try values.decodeIfPresent(String.self, forKey: .sentiment) ?? "unreviewed"
    topics = try values.decodeIfPresent([String].self, forKey: .topics) ?? []
    deleted = try values.decodeIfPresent(Bool.self, forKey: .deleted) ?? false
  }
}

public enum ReputationAction: String, Codable, CaseIterable, Sendable {
  case addRating, addReview, deleteRating, deleteReview
}

public struct ReputationMutation: Codable, Equatable, Sendable {
  public var mutationId: UUID
  public var action: ReputationAction
  public var rating: ReputationRating?
  public var review: ReputationReview?
  public var id: UUID?
  public init(mutationId: UUID = UUID(), action: ReputationAction, rating: ReputationRating? = nil,
              review: ReputationReview? = nil, id: UUID? = nil) {
    self.mutationId = mutationId; self.action = action; self.rating = rating; self.review = review; self.id = id
  }
  public func validated() throws -> Self {
    var result = self
    switch action {
    case .addRating:
      guard let rating, !rating.deleted, review == nil, id == nil else { throw ReputationError.mutation }
      result.rating = try rating.validated()
    case .addReview:
      guard let review, !review.deleted, rating == nil, id == nil else { throw ReputationError.mutation }
      result.review = try review.validated()
    case .deleteRating, .deleteReview:
      guard id != nil, rating == nil, review == nil else { throw ReputationError.mutation }
    }
    return result
  }
}

public struct ReputationState: Codable, Equatable, Sendable {
  public var apiVersion: Int
  public var ratings: [ReputationRating]
  public var reviews: [ReputationReview]
  public var acknowledgedMutationId: UUID?
  public init(apiVersion: Int = 1, ratings: [ReputationRating] = [], reviews: [ReputationReview] = [],
              acknowledgedMutationId: UUID? = nil) {
    self.apiVersion = apiVersion; self.ratings = ratings; self.reviews = reviews
    self.acknowledgedMutationId = acknowledgedMutationId
  }

  /// Apply local records without treating a local operation as a server acknowledgement.
  public func applying(_ mutation: ReputationMutation) throws -> Self {
    let change = try mutation.validated()
    var result = self
    switch change.action {
    case .addRating:
      let value = change.rating!
      if var existing = ratings.first(where: { $0.id == value.id }) {
        existing.deleted = false
        guard try WireJSON.encoder().encode(existing) == WireJSON.encoder().encode(value) else { throw ReputationError.conflict }
      } else {
        guard ratings.count < 500 else { throw ReputationError.capacity }
        result.ratings.append(value)
      }
    case .addReview:
      let value = change.review!
      if var existing = reviews.first(where: { $0.id == value.id }) {
        existing.deleted = false
        guard try WireJSON.encoder().encode(existing) == WireJSON.encoder().encode(value) else { throw ReputationError.conflict }
      } else {
        guard reviews.count < 500 else { throw ReputationError.capacity }
        result.reviews.append(value)
      }
    case .deleteRating:
      if let index = result.ratings.firstIndex(where: { $0.id == change.id }) { result.ratings[index].deleted = true }
    case .deleteReview:
      if let index = result.reviews.firstIndex(where: { $0.id == change.id }) { result.reviews[index].deleted = true }
    }
    return result
  }
}
