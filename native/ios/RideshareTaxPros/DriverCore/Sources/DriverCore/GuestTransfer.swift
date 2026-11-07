import Foundation

public enum GuestTransferError: LocalizedError {
  case duplicateBankTransaction, missingReceipt, incompatibleReceipt, conflictingReceipt
  case coachOutboxCapacity
  public var errorDescription: String? {
    switch self {
    case .duplicateBankTransaction:
      return "A bank transaction is already linked to a different record in this account. Review the matching records before copying."
    case .missingReceipt:
      return "An offline record refers to a receipt that is missing from this phone. Keep the offline journal and contact the firm before copying."
    case .incompatibleReceipt:
      return "A receipt identifier is already used for a different format in this account. Keep the offline journal and contact the firm before copying."
    case .conflictingReceipt:
      return "A receipt with this identifier has different contents in this account. Both copies were kept; contact the firm before copying."
    case .coachOutboxCapacity:
      return "These journals have more than 50 coach questions waiting to share. Sync saved questions before copying coach history again. Both journals were kept unchanged."
    }
  }
}

/// Prepare a retryable copy. The source journal and already existing account
/// records stay intact; the caller copies required private files before saving.
public struct GuestTransferPlan {
  public let journal: Journal
  public let newRecordIDs: [UUID]
  public let requiredReceiptIDs: [UUID]

  public func copyFiles(source: JournalDiskStore, destination: JournalDiskStore) throws {
    for id in requiredReceiptIDs {
      guard FileManager.default.fileExists(atPath: source.receiptURL(id).path) else { throw GuestTransferError.missingReceipt }
      let bytes = try source.receipt(id)
      if FileManager.default.fileExists(atPath: destination.receiptURL(id).path) {
        guard try destination.receipt(id) == bytes else { throw GuestTransferError.conflictingReceipt }
      } else { try destination.saveReceipt(bytes, id: id) }
    }
    for id in newRecordIDs { try destination.copyRoute(id, from: source) }
  }

  public static func prepare(source: Journal, destination: Journal, includeRecords: Bool = true,
                             includeCoach: Bool = false) throws -> Self {
    var result = destination
    let existingIDs = Set(destination.entries.map(\.id))
    let additions = includeRecords ? source.entries.filter { !$0.record.deleted && !existingIDs.contains($0.id) } : []
    var bankOwners: [String: UUID] = [:]
    for entry in destination.entries where !entry.record.deleted {
      if let bank = entry.record.bankReference { bankOwners[bank.transactionId] = entry.id }
    }
    for var entry in additions {
      if let bank = entry.record.bankReference {
        if let owner = bankOwners[bank.transactionId], owner != entry.id { throw GuestTransferError.duplicateBankTransaction }
        bankOwners[bank.transactionId] = entry.id
      }
      entry.record.revision = 0; entry.pendingMutationId = UUID(); entry.conflict = nil
      result.entries.append(entry)
    }
    let requiredReceiptIDs = Array(Set(additions.compactMap { $0.record.receiptId })).sorted { $0.uuidString < $1.uuidString }
    for id in requiredReceiptIDs {
      let original = source.receipts.first { $0.id == id }
      let existing = result.receipts.first { $0.id == id }
      guard original != nil || existing != nil else { throw GuestTransferError.missingReceipt }
      if let original, let existing, original.mime != existing.mime { throw GuestTransferError.incompatibleReceipt }
      if existing == nil, let original { result.receipts.append(LocalReceipt(id: id, mime: original.mime)) }
    }
    if includeRecords {
      result.goals = result.goals ?? source.goals
      result.assistance = result.assistance ?? source.assistance
      result.mission = result.mission ?? source.mission
      result.reserveSettings = result.reserveSettings ?? source.reserveSettings
      result.missionOffers = result.missionOffers ?? source.missionOffers

      let accountBankIDs = Set((result.bankTransactions ?? []).map(\.id))
      let newBankRows = (source.bankTransactions ?? []).filter { !accountBankIDs.contains($0.id) }
      if !newBankRows.isEmpty { result.bankTransactions = (result.bankTransactions ?? []) + newBankRows }
      let promptIDs = Set((result.placePrompts ?? []).map(\.id))
      let newPrompts = (source.placePrompts ?? []).filter { !promptIDs.contains($0.id) }
      if !newPrompts.isEmpty { result.placePrompts = Array(((result.placePrompts ?? []) + newPrompts).prefix(100)) }
      let waitIDs = Set((result.pickupWaits ?? []).map(\.id))
      let newWaits = (source.pickupWaits ?? []).filter { !waitIDs.contains($0.id) }
      if !newWaits.isEmpty { result.pickupWaits = Array(((result.pickupWaits ?? []) + newWaits).prefix(500)) }
    }
    if includeCoach {
      var messages = destination.coachMessages ?? []
      var messageIDs = Set(messages.map(\.id))
      for message in source.coachMessages ?? [] where messageIDs.insert(message.id).inserted {
        messages.append(message)
      }
      var outbox = destination.coachOutbox ?? []
      var pendingIDs = Set(outbox.map(\.id))
      for pending in source.coachOutbox ?? [] where pendingIDs.insert(pending.id).inserted {
        // Historical user messages also exist before sync. Their presence cannot
        // establish acknowledgement; preserve pending IDs for an idempotent retry.
        outbox.append(pending)
      }
      guard outbox.count <= 50 else { throw GuestTransferError.coachOutboxCapacity }
      if !messages.isEmpty { result.coachMessages = messages }
      if !outbox.isEmpty { result.coachOutbox = outbox }
      if result.coachIntake == nil, let intake = source.coachIntake {
        result.coachIntake = intake
        result.coachIntakeMutationId = UUID()
      }
      // Milestones and engine receipts describe another record/account scope.
      // Keep the destination values until its own analysis or sync recomputes them.
    }
    return Self(journal: result, newRecordIDs: additions.map(\.id), requiredReceiptIDs: requiredReceiptIDs)
  }
}
