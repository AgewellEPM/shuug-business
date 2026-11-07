import Foundation
import XCTest
@testable import DriverCore

final class ReputationOutboxTests: XCTestCase {
  private func rating(_ score: Double = 4.5, id: UUID = UUID()) -> ReputationRating {
    .init(id: id, platformID: "lyft-driver", platformName: "Lyft Driver", score: score)
  }
  func testRemoteMergeRetainsEveryUnacknowledgedLocalOperationAndStableOrder() throws {
    let first = rating(), second = rating(4.7)
    let addFirst = ReputationMutation(action: .addRating, rating: first)
    let addSecond = ReputationMutation(action: .addRating, rating: second)
    var journal = Journal()
    try journal.enqueueReputation(addFirst); try journal.enqueueReputation(addSecond)
    try journal.mergeReputation(.init(ratings: [first]))
    XCTAssertEqual(journal.reputationOutbox, [addFirst, addSecond], "Visible record IDs are not acknowledgments.")
    XCTAssertEqual(journal.reputationState?.ratings, [first, second])
    try journal.mergeReputation(.init(ratings: [first], acknowledgedMutationId: addFirst.mutationId), acknowledging: addFirst.mutationId)
    XCTAssertEqual(journal.reputationOutbox, [addSecond])
    XCTAssertEqual(journal.reputationState?.ratings, [first, second])
  }
  func testAddThenDeleteWhileUploadIsInFlightKeepsTombstoneAndFIFO() throws {
    let value = rating()
    let add = ReputationMutation(action: .addRating, rating: value)
    let delete = ReputationMutation(action: .deleteRating, id: value.id)
    var journal = Journal()
    try journal.enqueueReputation(add); try journal.enqueueReputation(delete)
    try journal.mergeReputation(.init(ratings: [value], acknowledgedMutationId: add.mutationId), acknowledging: add.mutationId)
    XCTAssertEqual(journal.reputationOutbox, [delete])
    XCTAssertEqual(journal.reputationState?.ratings.first?.deleted, true)
    var tombstone = value; tombstone.deleted = true
    try journal.mergeReputation(.init(ratings: [tombstone], acknowledgedMutationId: delete.mutationId), acknowledging: delete.mutationId)
    XCTAssertEqual(journal.reputationOutbox, [])
    XCTAssertEqual(journal.reputationState?.ratings.first?.deleted, true)
    try journal.mergeReputation(.init(ratings: [tombstone]))
    XCTAssertEqual(journal.reputationState?.ratings.first?.deleted, true)
  }
  func testWrongOrMissingMutationAckFailsWithoutChangingSavedState() throws {
    let value = rating(), add = ReputationMutation(action: .addRating, rating: rating())
    var journal = Journal(); try journal.enqueueReputation(add)
    let before = try WireJSON.encoder().encode(journal)
    for response in [ReputationState(ratings: [value]), ReputationState(ratings: [value], acknowledgedMutationId: UUID())] {
      XCTAssertThrowsError(try journal.mergeReputation(response, acknowledging: add.mutationId))
      XCTAssertEqual(try WireJSON.encoder().encode(journal), before)
    }
  }
  func testOutboxLimitNeverSilentlyDropsLocalEntriesOrNewerPendingOperations() throws {
    var journal = Journal()
    for _ in 0..<50 { try journal.enqueueReputation(.init(action: .addRating, rating: rating())) }
    let before = try WireJSON.encoder().encode(journal)
    XCTAssertThrowsError(try journal.enqueueReputation(.init(action: .addRating, rating: rating())))
    XCTAssertEqual(try WireJSON.encoder().encode(journal), before)
    XCTAssertEqual(journal.reputationState?.ratings.count, 50)
    XCTAssertEqual(journal.reputationOutbox?.count, 50)
  }
  func testFullStateDoesNotTruncateHundredsOfEntriesAndTombstones() throws {
    var values = (0..<500).map { _ in rating() }; values[0].deleted = true
    var journal = Journal()
    try journal.mergeReputation(.init(ratings: values))
    XCTAssertEqual(journal.reputationState?.ratings, values)
    XCTAssertEqual(journal.reputationState?.ratings.count, 500)
    XCTAssertThrowsError(try journal.mergeReputation(.init(ratings: values + [rating()])))
    XCTAssertEqual(journal.reputationState?.ratings.count, 500)
  }
}
