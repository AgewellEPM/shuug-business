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
}
