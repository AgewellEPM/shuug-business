import XCTest
@testable import DriverCore

final class ReputationTests: XCTestCase {
  private func date(_ day: Int) -> Date { Date(timeIntervalSince1970: Double(day) * 86_400) }
  private func rating(_ score: Double = 4.8, platform: String = "app-a", scale: Double = 5, day: Int = 3) -> ReputationRating {
    .init(platformID: platform, platformName: platform == "app-a" ? "App A" : "App B", recordedAt: date(day), score: score, scale: scale)
  }
  private func review(_ sentiment: String, topic: String = "communication", platform: String = "app-a") -> ReputationReview {
    .init(platformID: platform, platformName: platform == "app-a" ? "App A" : "App B", recordedAt: date(3),
      text: "Manually entered feedback", sentiment: sentiment, topics: [topic])
  }

  func testWireModelsKeepIDsScaleDatesTombstonesAndExplicitAcknowledgement() throws {
    let value = rating()
    let feedback = review("mixed")
    let mutation = ReputationMutation(action: .addRating, rating: value)
    let data = try WireJSON.encoder().encode(mutation)
    XCTAssertEqual(try WireJSON.decoder().decode(ReputationMutation.self, from: data), mutation)
    XCTAssertTrue(String(decoding: data, as: UTF8.self).contains("addRating"))
    var object = try JSONSerialization.jsonObject(with: WireJSON.encoder().encode(value)) as! [String: Any]
    object.removeValue(forKey: "deleted")
    let old = try WireJSON.decoder().decode(ReputationRating.self, from: JSONSerialization.data(withJSONObject: object))
    XCTAssertFalse(old.deleted)
    let state = ReputationState(ratings: [value], reviews: [feedback], acknowledgedMutationId: mutation.mutationId)
    XCTAssertEqual(try WireJSON.decoder().decode(ReputationState.self, from: WireJSON.encoder().encode(state)), state)
    let get = Data(#"{"apiVersion":1,"ratings":[],"reviews":[]}"#.utf8)
    XCTAssertNil(try WireJSON.decoder().decode(ReputationState.self, from: get).acknowledgedMutationId)
  }

  func testImmutableAddsKeepArrayOrderAndRetriesCannotResurrectDeletes() throws {
    let earlier = rating(4.5, day: 1), later = rating(4.8, day: 2)
    let mutation = ReputationMutation(action: .addRating, rating: later)
    let first = try ReputationState(ratings: [earlier]).applying(mutation)
    XCTAssertEqual(first.ratings.map(\.id), [earlier.id, later.id])
    XCTAssertNil(first.acknowledgedMutationId, "Local changes cannot acknowledge a server mutation.")
    XCTAssertEqual(try first.applying(mutation), first)
    var changed = later; changed.score = 4.9
    XCTAssertThrowsError(try first.applying(.init(action: .addRating, rating: changed)))
    XCTAssertEqual(first.ratings.last?.score, 4.8)
    let deletion = ReputationMutation(action: .deleteRating, id: later.id)
    let deleted = try first.applying(deletion)
    XCTAssertTrue(deleted.ratings.last!.deleted)
    XCTAssertEqual(try deleted.applying(deletion), deleted)
    XCTAssertEqual(try deleted.applying(mutation), deleted)
    let feedback = review("negative")
    let withReview = try deleted.applying(.init(action: .addReview, review: feedback))
    let reviewDelete = ReputationMutation(action: .deleteReview, id: feedback.id)
    XCTAssertTrue(try withReview.applying(reviewDelete).reviews[0].deleted)
  }

  func testWireDatePrecisionDoesNotTurnAStableRetryIntoAConflict() throws {
    var value = rating(); value.recordedAt = date(3).addingTimeInterval(0.428)
    let remote = try WireJSON.decoder().decode(ReputationRating.self, from: WireJSON.encoder().encode(value))
    XCTAssertNoThrow(try ReputationState(ratings: [remote]).applying(.init(action: .addRating, rating: value)))
  }

  func testScoreDateScaleCountAndTextValidationRejectUnsendableRecords() throws {
    for score in [Double.nan, .infinity, -.infinity, -0.1, 5.1] {
      XCTAssertThrowsError(try rating(score).validated())
    }
    for scale in [Double.nan, .infinity, 0, 10] { XCTAssertThrowsError(try rating(scale: scale).validated()) }
    for interval in [Double.nan, .infinity, -.infinity] {
      var value = rating(); value.recordedAt = Date(timeIntervalSince1970: interval)
      XCTAssertThrowsError(try value.validated())
    }
    for count in [-1, 1_000_000_001] {
      var value = rating(); value.reviewCount = count; XCTAssertThrowsError(try value.validated())
    }
    var value = rating(); value.notes = String(repeating: "a", count: 501)
    XCTAssertThrowsError(try value.validated())
    value = rating(); value.platformID = " "; XCTAssertThrowsError(try value.validated())
    var feedback = review("unreviewed"); feedback.text = String(repeating: "a", count: 2_001)
    XCTAssertThrowsError(try feedback.validated())
    feedback = review("automatic-negative"); XCTAssertThrowsError(try feedback.validated())
    feedback = review("negative"); feedback.topics = ["communication", "communication"]
    XCTAssertThrowsError(try feedback.validated())
    feedback.topics = ["unsupported"]; XCTAssertThrowsError(try feedback.validated())
    XCTAssertThrowsError(try ReputationMutation(action: .addRating, rating: rating(), review: review("positive")).validated())
    XCTAssertThrowsError(try ReputationMutation(action: .deleteReview).validated())
  }

  func testTrendsCompareOnlyEarlierSnapshotsForTheSamePlatformAndScale() {
    let prior = rating(4.6, day: 1)
    let differentScale = rating(98, scale: 100, day: 2)
    let latest = rating(4.8, day: 3)
    let otherApp = rating(30, platform: "app-b", scale: 100, day: 4)
    let state = ReputationState(ratings: [otherApp, latest, differentScale, prior])
    let summary = ReputationGuide.summaries(state: state, platformID: "app-a")[0]
    XCTAssertEqual(summary.latestRating?.id, latest.id)
    XCTAssertEqual(summary.previousComparableRating?.id, prior.id)
    XCTAssertEqual(summary.change ?? 0, 0.2, accuracy: 0.00001)
    let filtered = ReputationGuide.answer(query: "my ratings", state: state, platformID: "app-a")
    XCTAssertTrue(filtered.contains("4.8/5")); XCTAssertTrue(filtered.contains("+0.2"))
    XCTAssertFalse(filtered.contains("App B")); XCTAssertFalse(filtered.contains("98/100"))
    XCTAssertNil(ReputationGuide.summaries(state: .init(ratings: [latest, differentScale]))[0].change)
    let sameDate = rating(4.2, day: 3)
    XCTAssertNil(ReputationGuide.summaries(state: .init(ratings: [latest, sameDate]))[0].change)
  }

  func testImprovementAndStrengthEvidenceComesOnlyFromExplicitSentimentAndTopicTags() {
    let positive = review("positive", topic: "communication")
    let negative = review("negative", topic: "accuracy")
    let mixed = review("mixed", topic: "handling")
    var unreviewed = review("unreviewed", topic: "timing")
    unreviewed.text = "Late, rude, and wrong items. Never infer criticism from this text."
    var deleted = review("negative", topic: "professionalism"); deleted.deleted = true
    let state = ReputationState(reviews: [positive, negative, mixed, unreviewed, deleted])
    let summary = ReputationGuide.summaries(state: state)[0]
    XCTAssertEqual(summary.strengths.flatMap(\.reviewIDs), [positive.id])
    XCTAssertEqual(Set(summary.improvements.flatMap(\.reviewIDs)), [negative.id, mixed.id])
    XCTAssertEqual(Set(summary.improvements.map(\.topic)), ["accuracy", "handling"])
    XCTAssertEqual(summary.unreviewedCount, 1)
    let answer = ReputationGuide.answer(query: "How can I improve my ratings?", state: state)
    XCTAssertTrue(answer.contains(negative.id.uuidString.lowercased()))
    XCTAssertTrue(answer.contains("Compare the job or shopping list"))
    XCTAssertFalse(answer.contains("Check timing commitments"))
    XCTAssertFalse(answer.contains("Keep messages and handoffs calm"))
    let unknown = ReputationGuide.answer(query: "my reviews", state: .init(reviews: [unreviewed]))
    XCTAssertTrue(unknown.contains("No user-tagged mixed or negative feedback"))
    XCTAssertFalse(unknown.contains("Next steps from your mixed or negative tags"))
  }

  func testQueryDetectionPreservesFinancialReviewAndAvoidsSubstringStarMatches() {
    for query in ["my reviews", "How are my ratings?", "customer feedback", "five stars", "my reputation", "app review"] {
      XCTAssertTrue(ReputationGuide.isQuery(query), query)
    }
    for query in ["review my taxes", "review expenses", "review my jobs and costs", "reviews of my receipts", "start a trip", "Starbucks expense"] {
      XCTAssertFalse(ReputationGuide.isQuery(query), query)
    }
  }

  func testManualHistoryLabelStatesScopeAndDoesNotInventProviderThresholdsOrGuaranteedChanges() {
    let answer = ReputationGuide.answer(query: "ratings", state: .init(ratings: [rating()]))
    XCTAssertTrue(answer.contains("all saved manual reputation history"))
    XCTAssertTrue(answer.contains("independent of the selected financial date range"))
    XCTAssertTrue(answer.contains("UTC"))
    XCTAssertTrue(answer.contains("do not reveal a provider's scoring calculation"))
    XCTAssertTrue(answer.contains("guarantee a higher rating"))
    XCTAssertTrue(ReputationGuide.answer(query: "ratings", state: .init()).contains("No manual rating snapshots"))
  }
}
