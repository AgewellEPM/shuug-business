import CryptoKit
import DriverCore
import Foundation

/// An independently versioned encrypted payload containing the actual native
/// Journal Codable representation. Route files and receipt bytes are separate.
struct SecureTaxJournalSnapshot: Codable {
  struct Binding: Codable, Equatable {
    var workspaceId: String
    var accountId: String
    var clientId: String
    var objectId: String
  }
  var version: Int
  var type: String
  var binding: Binding
  var capturedAt: Date
  var journal: Journal

  static let maximumPayloadBytes = SecureTaxEnvelope.maximumCiphertextBytes - 16
  private static let journalFields: Set<String> = ["version", "cursor", "entries", "receipts", "activeTripId", "tracker",
    "lastSyncAt", "goals", "bankTransactions", "placePrompts", "assistance", "bankCursor", "bankUpdatedAt", "mission",
    "pickupWaits", "reserveSettings", "missionOffers", "driverAlerts", "observedOffers", "gigOffers", "gigDecisions",
    "gigCommitments", "gigOfferLogs", "coachMessages", "coachOutbox", "coachIntake", "coachIntakeMutationId",
    "coachMilestones", "coachEngine", "universalGigSettings", "reputationState", "reputationOutbox"]
  static func encoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return encoder
  }
  static func journalSHA256(_ journal: Journal) throws -> String {
    SecureTaxEnvelope.encode(Data(SHA256.hash(data: try encoder().encode(journal))))
  }
  static func validateObjectID(_ value: String) throws {
    guard let id = UUID(uuidString: value), id.uuidString.lowercased() == value else {
      throw SecureTaxSetupError.message("A snapshot must use its opaque random UUID.")
    }
  }
  static func binding(scope: SecureTaxKeyScope, objectId: String) throws -> Binding {
    try validateObjectID(objectId)
    return Binding(workspaceId: scope.workspaceId, accountId: scope.identity.accountId,
      clientId: scope.identity.clientId, objectId: objectId)
  }
  static func capture(_ journal: Journal, scope: SecureTaxKeyScope, objectId: String,
    now: Date = Date()) throws -> Self {
    guard journal.version == 1, now.timeIntervalSince1970.isFinite else {
      throw SecureTaxSetupError.message("This journal uses an unsupported snapshot format.")
    }
    let value = try Self(version: 1, type: "driver-journal", binding: binding(scope: scope, objectId: objectId),
      capturedAt: now, journal: journal)
    _ = try value.encoded()
    return value
  }
  func encoded() throws -> Data {
    let bytes = try Self.encoder().encode(self)
    guard bytes.count <= Self.maximumPayloadBytes else {
      throw SecureTaxSetupError.message("This journal exceeds the snapshot size limit. Keep the local journal and split its encrypted archive before uploading.")
    }
    return bytes
  }
  static func decode(_ data: Data, expectedBinding: Binding) throws -> Self {
    guard data.count <= maximumPayloadBytes,
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      Set(object.keys) == ["version", "type", "binding", "capturedAt", "journal"],
      let bound = object["binding"] as? [String: Any], Set(bound.keys) == ["workspaceId", "accountId", "clientId", "objectId"],
      let journalObject = object["journal"] as? [String: Any], Set(journalObject.keys).isSubset(of: journalFields) else {
      throw SecureTaxSetupError.message("This protected journal snapshot has an unsupported format. Its original bytes were kept.")
    }
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .millisecondsSince1970
    let value = try decoder.decode(Self.self, from: data)
    guard value.version == 1, value.type == "driver-journal", value.journal.version == 1,
      value.binding == expectedBinding, value.capturedAt.timeIntervalSince1970.isFinite else {
      throw SecureTaxSetupError.message("This snapshot does not belong to the selected account, object and journal version.")
    }
    try validateObjectID(value.binding.objectId)
    guard Set(value.journal.entries.map(\.id)).count == value.journal.entries.count,
      Set(value.journal.receipts.map(\.id)).count == value.journal.receipts.count else {
      throw SecureTaxSetupError.message("This snapshot has duplicate record or receipt IDs and needs review.")
    }
    return value
  }
  func seal<SK: HPKEDiffieHellmanPrivateKey>(revision: Int,
    trustedRecipients: SecureTaxEnvelope.TrustedRecipients, privateKey: SK) throws -> SecureTaxEnvelope
    where SK.PublicKey == P256.KeyAgreement.PublicKey {
    let context = SecureTaxEnvelope.Context(workspaceId: binding.workspaceId, accountId: binding.accountId,
      objectId: binding.objectId, revision: revision, domain: .driverState)
    return try SecureTaxEnvelope.seal(encoded(), context: context, recipients: trustedRecipients,
      authorRole: .client, authorPrivateKey: privateKey)
  }
  static func open<SK: HPKEDiffieHellmanPrivateKey>(_ envelope: SecureTaxEnvelope, scope: SecureTaxKeyScope,
    objectId: String, revision: Int, trustedRecipients: SecureTaxEnvelope.TrustedRecipients,
    role: SecureTaxEnvelope.Role = .client, privateKey: SK) throws -> Self where SK.PublicKey == P256.KeyAgreement.PublicKey {
    let expected = SecureTaxEnvelope.Context(workspaceId: scope.workspaceId, accountId: scope.identity.accountId,
      objectId: objectId, revision: revision, domain: .driverState)
    let bytes = try envelope.open(expectedContext: expected, trustedRecipients: trustedRecipients, role: role, privateKey: privateKey)
    return try decode(bytes, expectedBinding: binding(scope: scope, objectId: objectId))
  }
}

/// A previewed candidate and a guard against changing the local journal between
/// review and a future explicit import. This type has no apply/restore operation.
struct SecureTaxJournalImportPreparation {
  let snapshot: SecureTaxJournalSnapshot
  let localJournalSHA256: String
  let missingReceiptIDs: [UUID]
  let reviewNotes: [String]

  init(snapshot: SecureTaxJournalSnapshot, currentJournal: Journal, availableReceiptIDs: Set<UUID>) throws {
    self.snapshot = snapshot
    localJournalSHA256 = try SecureTaxJournalSnapshot.journalSHA256(currentJournal)
    missingReceiptIDs = snapshot.journal.receipts.map(\.id).filter { !availableReceiptIDs.contains($0) }
    var notes = ["This candidate does not replace or merge the current journal.",
      "Historical route files and receipt contents are separate encrypted objects; this snapshot contains receipt metadata only.",
      "Device permissions, capture sessions and notifications are not restored or replayed."]
    if snapshot.journal.activeTripId != nil || snapshot.journal.tracker != nil {
      notes.append("The source has an active/interrupted drive. Review it without starting or resuming a drive on this device.")
    }
    if snapshot.journal.assistance != nil || !(snapshot.journal.driverAlerts ?? []).isEmpty {
      notes.append("Assistance preferences and alert history require review; importing history must not trigger old device actions.")
    }
    if !missingReceiptIDs.isEmpty { notes.append("Some referenced receipt files are unavailable locally. Preserve their source and recover them separately.") }
    reviewNotes = notes
  }
  func stillMatches(_ currentJournal: Journal) throws -> Bool {
    try SecureTaxJournalSnapshot.journalSHA256(currentJournal) == localJournalSHA256
  }
}
