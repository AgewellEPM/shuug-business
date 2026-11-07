import Foundation

public enum ReputationPersistenceError: LocalizedError {
  case capacity, invalidState, missingAcknowledgement, conflictingIdentity
  public var errorDescription: String? {
    switch self {
    case .capacity: "There are more than 50 personal rating or review changes waiting to share. Sync them before adding or copying more. Your saved journals were kept."
    case .invalidState: "The personal ratings response is incomplete or unsupported. Your saved entries were kept."
    case .missingAcknowledgement: "The workspace did not acknowledge this exact ratings change. It remains saved for retry."
    case .conflictingIdentity: "A rating or review identifier has different saved contents. Both journals were kept; review the entries before copying."
    }
  }
}

private func checkedReputation(_ state: ReputationState) throws -> ReputationState {
  guard state.apiVersion == 1, state.ratings.count <= 500, state.reviews.count <= 500,
    Set(state.ratings.map(\.id)).count == state.ratings.count,
    Set(state.reviews.map(\.id)).count == state.reviews.count else { throw ReputationPersistenceError.invalidState }
  for rating in state.ratings { _ = try rating.validated() }
  for review in state.reviews { _ = try review.validated() }
  return state
}

private func sameReputationPayload<T: Encodable>(_ left: T, _ right: T) -> Bool {
  guard let first = try? WireJSON.encoder().encode(left), let second = try? WireJSON.encoder().encode(right) else { return false }
  return first == second
}

extension Journal {
  /// Persist the immutable operation before dispatch. FIFO retains add-before-delete.
  public mutating func enqueueReputation(_ input: ReputationMutation) throws {
    let mutation = try input.validated()
    var pending = reputationOutbox ?? []
    if let existing = pending.first(where: { $0.mutationId == mutation.mutationId }) {
      guard sameReputationPayload(existing, mutation) else { throw ReputationPersistenceError.conflictingIdentity }
      return
    }
    guard pending.count < 50 else { throw ReputationPersistenceError.capacity }
    let next = try checkedReputation(reputationState ?? .init()).applying(mutation)
    pending.append(mutation)
    reputationState = next; reputationOutbox = pending
  }

  /// A full remote state is authoritative only after pending local edits overlay it.
  /// A response never acknowledges an operation by its date or visible entity ID.
  public mutating func mergeReputation(_ remote: ReputationState, acknowledging mutationID: UUID? = nil) throws {
    var merged = try checkedReputation(remote)
    var pending = reputationOutbox ?? []
    guard pending.count <= 50 else { throw ReputationPersistenceError.capacity }
    if let mutationID {
      guard remote.acknowledgedMutationId == mutationID else { throw ReputationPersistenceError.missingAcknowledgement }
      pending.removeAll { $0.mutationId == mutationID }
    }
    for operation in pending { merged = try merged.applying(operation.validated()) }
    merged.acknowledgedMutationId = nil
    reputationState = merged; reputationOutbox = pending
  }

  /// Explicit guest copy, separate from financial records and chat opt-ins.
  public mutating func copyGuestReputation(from source: Journal) throws {
    let incoming = try checkedReputation(source.reputationState ?? .init())
    var target = try checkedReputation(reputationState ?? .init())
    let priorRatingIDs = Set(target.ratings.map(\.id)), priorReviewIDs = Set(target.reviews.map(\.id))
    for rating in incoming.ratings {
      if let index = target.ratings.firstIndex(where: { $0.id == rating.id }) {
        var existing = target.ratings[index], candidate = rating
        existing.deleted = false; candidate.deleted = false
        guard sameReputationPayload(existing, candidate) else { throw ReputationPersistenceError.conflictingIdentity }
        target.ratings[index].deleted = target.ratings[index].deleted || rating.deleted
      } else { target.ratings.append(rating) }
    }
    for review in incoming.reviews {
      if let index = target.reviews.firstIndex(where: { $0.id == review.id }) {
        var existing = target.reviews[index], candidate = review
        existing.deleted = false; candidate.deleted = false
        guard sameReputationPayload(existing, candidate) else { throw ReputationPersistenceError.conflictingIdentity }
        target.reviews[index].deleted = target.reviews[index].deleted || review.deleted
      } else { target.reviews.append(review) }
    }
    _ = try checkedReputation(target)
    var pending = reputationOutbox ?? []
    guard pending.count <= 50 else { throw ReputationPersistenceError.capacity }
    let additions = source.reputationOutbox ?? []
    func append(_ input: ReputationMutation) throws {
      let mutation = try input.validated()
      if let prior = pending.first(where: { $0.mutationId == mutation.mutationId }) {
        guard sameReputationPayload(prior, mutation) else { throw ReputationPersistenceError.conflictingIdentity }
      } else { pending.append(mutation) }
      guard pending.count <= 50 else { throw ReputationPersistenceError.capacity }
    }
    // Legacy state-only guest entries still need a stable account upload. The
    // destination remembers generated operations, so retrying a copy reuses them.
    for rating in incoming.ratings where !priorRatingIDs.contains(rating.id)
      && !additions.contains(where: { $0.action == .addRating && $0.rating?.id == rating.id }) {
      var value = rating; value.deleted = false
      try append(.init(action: .addRating, rating: value))
      if rating.deleted && !additions.contains(where: { $0.action == .deleteRating && $0.id == rating.id }) {
        try append(.init(action: .deleteRating, id: rating.id))
      }
    }
    for review in incoming.reviews where !priorReviewIDs.contains(review.id)
      && !additions.contains(where: { $0.action == .addReview && $0.review?.id == review.id }) {
      var value = review; value.deleted = false
      try append(.init(action: .addReview, review: value))
      if review.deleted && !additions.contains(where: { $0.action == .deleteReview && $0.id == review.id }) {
        try append(.init(action: .deleteReview, id: review.id))
      }
    }
    for operation in additions {
      // A copied guest add cannot resurrect an account tombstone.
      if operation.action == .addRating, let id = operation.rating?.id,
        reputationState?.ratings.contains(where: { $0.id == id && $0.deleted }) == true { continue }
      if operation.action == .addReview, let id = operation.review?.id,
        reputationState?.reviews.contains(where: { $0.id == id && $0.deleted }) == true { continue }
      try append(operation)
    }
    // A state-only guest deletion also needs dispatch when the destination
    // already knows the entry. Queue it after any copied add operation.
    for rating in incoming.ratings where rating.deleted
      && reputationState?.ratings.contains(where: { $0.id == rating.id && $0.deleted }) != true
      && !pending.contains(where: { $0.action == .deleteRating && $0.id == rating.id }) {
      try append(.init(action: .deleteRating, id: rating.id))
    }
    for review in incoming.reviews where review.deleted
      && reputationState?.reviews.contains(where: { $0.id == review.id && $0.deleted }) != true
      && !pending.contains(where: { $0.action == .deleteReview && $0.id == review.id }) {
      try append(.init(action: .deleteReview, id: review.id))
    }
    target.acknowledgedMutationId = nil
    reputationState = target; reputationOutbox = pending
  }
}
