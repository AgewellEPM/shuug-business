import Foundation
import XCTest
@testable import DriverCore

final class GuestTransferTests: XCTestCase {
  func testCopyPreservesExistingAccountAndCanRetryAfterAnInterruptedSignIn() throws {
    let receiptID = UUID()
    let expense = DriverRecord(payload: .expense(Expense(date: "2026-11-05", merchant: "Guest fuel", category: .fuel, amountCents: 1735, receiptId: receiptID)))
    let existing = DriverRecord(payload: .income(Income(date: "2026-11-05", platform: "uber", description: "Account payout", amountCents: 2000)))
    let savedPrompt = ExpensePrompt(placeId: "account", merchant: "Account station", address: "City", category: .fuel)
    let offlinePrompt = ExpensePrompt(placeId: "guest", merchant: "Guest station", address: "City", category: .fuel)
    var source = Journal(); source.upsert(expense); source.receipts = [LocalReceipt(id: receiptID)]
    source.placePrompts = [offlinePrompt]; source.pickupWaits = [PickupWait(name: "Fixture", minutes: 12)]
    var oldBank = BankTransaction(id: "file:same", provider: "statement", accountLabel: "Account", date: "2026-11-05", merchant: "Updated", amountCents: 2000)
    oldBank.reviewedRecordId = existing.id
    var staleBank = oldBank; staleBank.amountCents = 1000; staleBank.reviewedRecordId = nil
    source.bankTransactions = [staleBank]
    var destination = Journal(); destination.upsert(existing); destination.placePrompts = [savedPrompt]
    destination.bankTransactions = [oldBank]

    let plan = try GuestTransferPlan.prepare(source: source, destination: destination)
    XCTAssertEqual(plan.newRecordIDs, [expense.id]); XCTAssertEqual(plan.requiredReceiptIDs, [receiptID])
    XCTAssertEqual(plan.journal.entries.count, 2); XCTAssertEqual(plan.journal.receipts.map(\.id), [receiptID])
    XCTAssertEqual(plan.journal.placePrompts?.map(\.id), [savedPrompt.id, offlinePrompt.id])
    XCTAssertEqual(plan.journal.bankTransactions?.first?.amountCents, 2000)
    XCTAssertEqual(plan.journal.bankTransactions?.first?.reviewedRecordId, existing.id)
    XCTAssertEqual(source.visible.count, 1, "The offline source remains recoverable.")

    let mutation = plan.journal.entries.first { $0.id == expense.id }?.pendingMutationId
    let retried = try GuestTransferPlan.prepare(source: source, destination: plan.journal)
    XCTAssertTrue(retried.newRecordIDs.isEmpty); XCTAssertTrue(retried.requiredReceiptIDs.isEmpty)
    XCTAssertEqual(retried.journal.entries.count, 2); XCTAssertEqual(retried.journal.receipts.count, 1)
    XCTAssertEqual(retried.journal.pickupWaits?.count, 1)
    XCTAssertEqual(retried.journal.entries.first { $0.id == expense.id }?.pendingMutationId, mutation)
  }

  func testCopyRejectsMissingReceiptsAndDuplicateBankLinksWithoutChangingEitherJournal() throws {
    let missing = UUID()
    var source = Journal()
    source.upsert(DriverRecord(payload: .expense(Expense(date: "2026-11-05", merchant: "Fuel", category: .fuel, amountCents: 1000, receiptId: missing))))
    XCTAssertThrowsError(try GuestTransferPlan.prepare(source: source, destination: Journal()))
    XCTAssertEqual(source.visible.count, 1)
    var guestExpense = Expense(date: "2026-11-05", merchant: "Fuel", category: .fuel, amountCents: 1000)
    guestExpense.bankReference = BankReference(transactionId: "file:duplicate", provider: "statement", accountLabel: "Checking")
    var accountExpense = guestExpense; accountExpense.merchant = "Already on account"
    source = Journal(); source.upsert(DriverRecord(payload: .expense(guestExpense)))
    var destination = Journal(); destination.upsert(DriverRecord(payload: .expense(accountExpense)))
    XCTAssertThrowsError(try GuestTransferPlan.prepare(source: source, destination: destination))
    XCTAssertEqual(destination.visible.count, 1); XCTAssertEqual(source.visible.count, 1)
  }
  func testCopyKeepsConflictingReceiptBytesAndRestoresMissingDestinationReceipt() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceDisk = try JournalDiskStore(directory: root.appendingPathComponent("guest"))
    let targetDisk = try JournalDiskStore(directory: root.appendingPathComponent("account"))
    let receipt = UUID(), guestBytes = Data("guest receipt".utf8), targetBytes = Data("account receipt".utf8)
    try sourceDisk.saveReceipt(guestBytes, id: receipt); try targetDisk.saveReceipt(targetBytes, id: receipt)
    var source = Journal(); source.receipts = [LocalReceipt(id: receipt)]
    source.upsert(DriverRecord(payload: .expense(Expense(date: "2026-11-05", merchant: "Fuel", category: .fuel, amountCents: 1000, receiptId: receipt))))
    let plan = try GuestTransferPlan.prepare(source: source, destination: Journal())
    XCTAssertThrowsError(try plan.copyFiles(source: sourceDisk, destination: targetDisk))
    XCTAssertEqual(try sourceDisk.receipt(receipt), guestBytes); XCTAssertEqual(try targetDisk.receipt(receipt), targetBytes)
    try FileManager.default.removeItem(at: targetDisk.receiptURL(receipt))
    try plan.copyFiles(source: sourceDisk, destination: targetDisk)
    XCTAssertEqual(try targetDisk.receipt(receipt), guestBytes)
    XCTAssertNoThrow(try plan.copyFiles(source: sourceDisk, destination: targetDisk))
  }

  private func pending(_ text: String, id: UUID = UUID()) -> CoachPendingMessage {
    CoachPendingMessage(id: id, text: text, from: "2026-11-01", through: "2026-11-05",
      preferences: .init(dailyNetCents: 5_000), localReplyId: UUID())
  }

  func testCoachHistoryNeverTransfersWithoutExplicitOptIn() throws {
    var source = Journal()
    source.coachMessages = [.init(role: "user", text: "Private guest question")]
    source.coachOutbox = [pending("Private guest question")]
    source.coachIntake = .init(taxYear: 2025, jurisdiction: "Guest jurisdiction", businessType: "Guest status")
    source.coachIntakeMutationId = UUID()
    source.coachMilestones = [.init(id: "guest", title: "Guest milestone", detail: "Private")]
    source.coachEngine = .init(mode: "guest-engine")
    let untouched = try WireJSON.encoder().encode(source)
    let empty = try GuestTransferPlan.prepare(source: source, destination: Journal()).journal
    XCTAssertNil(empty.coachMessages); XCTAssertNil(empty.coachOutbox)
    XCTAssertNil(empty.coachIntake); XCTAssertNil(empty.coachIntakeMutationId)
    XCTAssertNil(empty.coachMilestones); XCTAssertNil(empty.coachEngine)
    var destination = Journal()
    destination.coachMessages = [.init(role: "user", text: "Existing account question")]
    destination.coachOutbox = [pending("Existing account question")]
    destination.coachIntake = .init(taxYear: 2026)
    let original = try WireJSON.encoder().encode(destination)
    let plan = try GuestTransferPlan.prepare(source: source, destination: destination)
    XCTAssertEqual(try WireJSON.encoder().encode(plan.journal), original)
    XCTAssertEqual(try WireJSON.encoder().encode(source), untouched)
  }

  func testExplicitCoachCopyKeepsDestinationOrderValuesAndStablePendingIDs() throws {
    let sharedID = UUID(), priorUserID = UUID()
    let accountMessage = CoachMessage(id: sharedID, role: "user", text: "Account value")
    let guestDuplicate = CoachMessage(id: sharedID, role: "user", text: "Guest value")
    let priorUser = CoachMessage(id: priorUserID, role: "user", text: "Existing user message without acknowledgement evidence")
    let guestMessage = CoachMessage(role: "assistant", text: "Guest answer")
    let accountPending = pending("Account pending snapshot", id: sharedID)
    let guestPending = pending("Guest question", id: priorUserID)
    var destination = Journal()
    destination.coachMessages = [accountMessage, priorUser]
    destination.coachOutbox = [accountPending]
    destination.coachIntake = .init(taxYear: 2026, jurisdiction: "Account jurisdiction")
    destination.coachIntakeMutationId = UUID()
    destination.coachMilestones = [.init(id: "account", title: "Account preparation", detail: "Keep this")]
    destination.coachEngine = .init(mode: "account-engine")
    var source = Journal()
    source.coachMessages = [guestDuplicate, guestMessage, guestMessage]
    source.coachOutbox = [pending("Guest duplicate snapshot", id: sharedID), guestPending, guestPending]
    source.coachIntake = .init(taxYear: 2025, jurisdiction: "Guest jurisdiction")
    source.coachIntakeMutationId = UUID()
    source.coachMilestones = [.init(id: "guest", title: "Guest milestone", detail: "Do not copy")]
    source.coachEngine = .init(mode: "guest-engine")
    let sourceBytes = try WireJSON.encoder().encode(source)

    let first = try GuestTransferPlan.prepare(source: source, destination: destination, includeCoach: true)
    XCTAssertEqual(first.journal.coachMessages, [accountMessage, priorUser, guestMessage])
    XCTAssertEqual(first.journal.coachOutbox, [accountPending, guestPending])
    XCTAssertEqual(first.journal.coachIntake, destination.coachIntake)
    XCTAssertEqual(first.journal.coachIntakeMutationId, destination.coachIntakeMutationId)
    XCTAssertEqual(first.journal.coachMilestones, destination.coachMilestones)
    XCTAssertEqual(first.journal.coachEngine, destination.coachEngine)
    XCTAssertEqual(try WireJSON.encoder().encode(source), sourceBytes)
    let retry = try GuestTransferPlan.prepare(source: source, destination: first.journal, includeCoach: true)
    XCTAssertEqual(try WireJSON.encoder().encode(retry.journal), try WireJSON.encoder().encode(first.journal))
  }

  func testOptedInGuestIntakeGetsOneFreshRetryableMutationAndNoGuestMilestones() throws {
    var source = Journal()
    source.coachIntake = .init(taxYear: 2026, jurisdiction: "US / New York", businessType: "Independent contractor")
    source.coachIntakeMutationId = UUID()
    source.coachMilestones = [.init(id: "guest", title: "Guest progress", detail: "Another scope", status: "done")]
    source.coachEngine = .init(mode: "guest-engine")
    let first = try GuestTransferPlan.prepare(source: source, destination: Journal(), includeCoach: true).journal
    XCTAssertEqual(first.coachIntake, source.coachIntake)
    XCTAssertNotNil(first.coachIntakeMutationId)
    XCTAssertNotEqual(first.coachIntakeMutationId, source.coachIntakeMutationId)
    XCTAssertNil(first.coachMilestones); XCTAssertNil(first.coachEngine)
    let retry = try GuestTransferPlan.prepare(source: source, destination: first, includeCoach: true).journal
    XCTAssertEqual(retry.coachIntakeMutationId, first.coachIntakeMutationId)
  }

  func testCoachCopyRejectsOutboxOverflowWithoutChangingEitherJournal() throws {
    var destination = Journal(); destination.coachOutbox = (0..<50).map { pending("Account question \($0)") }
    var source = Journal(); source.coachOutbox = [pending("One more guest question")]
    let destinationBytes = try WireJSON.encoder().encode(destination)
    let sourceBytes = try WireJSON.encoder().encode(source)
    XCTAssertThrowsError(try GuestTransferPlan.prepare(source: source, destination: destination, includeCoach: true)) { error in
      guard case GuestTransferError.coachOutboxCapacity = error else { return XCTFail("Unexpected error: \(error)") }
      XCTAssertTrue(error.localizedDescription.contains("50 coach questions"))
    }
    XCTAssertEqual(try WireJSON.encoder().encode(destination), destinationBytes)
    XCTAssertEqual(try WireJSON.encoder().encode(source), sourceBytes)
    source.coachOutbox = [destination.coachOutbox![0]]
    let duplicate = try GuestTransferPlan.prepare(source: source, destination: destination, includeCoach: true)
    XCTAssertEqual(duplicate.journal.coachOutbox?.count, 50)
    destination.coachOutbox = Array(destination.coachOutbox!.prefix(49))
    source.coachOutbox = [pending("Fiftieth question")]
    XCTAssertEqual(try GuestTransferPlan.prepare(source: source, destination: destination, includeCoach: true).journal.coachOutbox?.count, 50)
  }

  func testChatOnlyOptInLeavesFinancialRecordsFilesAndOperatingSettingsSeparate() throws {
    let missingReceipt = UUID()
    var source = Journal()
    source.upsert(DriverRecord(payload: .expense(Expense(date: "2026-11-05", merchant: "Private guest expense",
      category: .fuel, amountCents: 5_000, receiptId: missingReceipt))))
    source.goals = DriverGoals(dailyNetCents: 50_000)
    source.assistance = AssistanceSettings()
    source.mission = ShiftMission(deadline: Date(timeIntervalSince1970: 1_793_700_000), targetCents: 10_000, destination: "Guest home")
    source.reserveSettings = ReserveSettings(taxPercent: 20, vehiclePercent: 10)
    source.missionOffers = [MissionOffer(label: "Guest offer", direction: "Home", payoutCents: 2_000,
      feesCents: 100, miles: 10, minutes: 30, waitMinutes: 5, homeMinutes: 20)]
    source.bankTransactions = [BankTransaction(id: "guest", provider: "statement", accountLabel: "Guest bank",
      date: "2026-11-05", merchant: "Private payment", amountCents: 5_000)]
    source.placePrompts = [ExpensePrompt(placeId: "guest", merchant: "Guest stop", address: "Guest address", category: .fuel)]
    source.pickupWaits = [PickupWait(name: "Guest wait", minutes: 10)]
    source.coachMessages = [.init(role: "user", text: "Share this question only")]
    source.coachOutbox = [pending("Share this question only")]
    source.coachIntake = .init(taxYear: 2026)
    var destination = Journal()
    destination.upsert(DriverRecord(payload: .income(Income(date: "2026-11-05", platform: "uber",
      description: "Existing account income", amountCents: 2_000))))
    let unchangedRecords = destination.entries.map(\.record)
    let result = try GuestTransferPlan.prepare(source: source, destination: destination,
      includeRecords: false, includeCoach: true)
    XCTAssertEqual(result.journal.entries.map(\.record), unchangedRecords)
    XCTAssertTrue(result.newRecordIDs.isEmpty); XCTAssertTrue(result.requiredReceiptIDs.isEmpty)
    XCTAssertTrue(result.journal.receipts.isEmpty)
    XCTAssertNil(result.journal.goals); XCTAssertNil(result.journal.assistance)
    XCTAssertNil(result.journal.mission); XCTAssertNil(result.journal.reserveSettings)
    XCTAssertNil(result.journal.missionOffers); XCTAssertNil(result.journal.bankTransactions)
    XCTAssertNil(result.journal.placePrompts); XCTAssertNil(result.journal.pickupWaits)
    XCTAssertEqual(result.journal.coachMessages, source.coachMessages)
    XCTAssertEqual(result.journal.coachOutbox, source.coachOutbox)
    XCTAssertEqual(result.journal.coachIntake, source.coachIntake)
    let neither = try GuestTransferPlan.prepare(source: source, destination: destination, includeRecords: false)
    XCTAssertEqual(try WireJSON.encoder().encode(neither.journal), try WireJSON.encoder().encode(destination))
  }
}
