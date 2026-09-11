// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { blankExpense, type Expense, type ExpenseFields } from "./model";
import { archiveExpense, expenseDirectory, listExpenses, readExpense, saveExpense } from "./store";
import { executeExpenseAccountingCommand, expenseAccountingData } from "./accounting";
import { expenseOutstanding } from "./accounting-model";
import { accountBalance, trialBalance } from "../accounting/ledger";
import { executeAccountCommand, chartOfAccounts } from "../accounting/journal-store";
import { loadLedger } from "../accounting/ledger-load";
import { workspaceDatabase } from "../workspace/database";
import { computePnl } from "../accounting/pnl";
let directory: string;
const now = "2026-09-25", actor = "Fixture accountant";
const command = (action: string, input: unknown, requestId = randomUUID()) => executeExpenseAccountingCommand({ requestId, action, input }, actor, now);
const balance = (account: number, through = now) => accountBalance(trialBalance(expenseAccountingData().entries.filter(e => e.date <= through), chartOfAccounts().accounts), account);
const receipt = (fields: Partial<ExpenseFields> = {}) => saveExpense({ status: "recorded", fields: { ...blankExpense("2026-09-10"), merchant: "Fixture vendor", amountCents: 10000, paymentStatus: "unpaid", ...fields } }, actor).expense!;
const reviewed = (row: Expense, extra = {}) => ({ id: row.id, revision: row.revision, homeAmountCents: row.fields.amountCents!, conversionEvidence: "", allocations: [{ accountNumber: 6000, amountCents: row.fields.amountCents!, purpose: "operating" }], dueDate: "2026-10-10", settlement: null, evidence: "Reviewed original invoice and account allocation", reviewed: true, ...extra });
const payment = (amount = 5000, extra = {}) => ({ amountCents: amount, homeAmountCents: amount, date: "2026-09-12", feeCents: 0, accountNumber: 1000, fxAccountNumber: null, reference: randomUUID(), evidence: "Verified bank settlement", ...extra });
const settle = (row: Expense, amount = 5000, extra = {}) => command("expense.settle", { id: row.id, revision: row.revision, ...payment(amount, extra), reviewed: true });
const custom = (number: number, classification: string) => executeAccountCommand({ requestId: randomUUID(), action: "account.save", input: { number, name: `Fixture account ${number}`, classification, revision: 0, parentNumber: null, active: true, reviewed: true } }, actor);
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "shuug-expense-posting-")); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false"); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("keeps bill recognition separate from dated partial payments, posting fees exactly once", async () => {
  const row = receipt(); command("expense.post", reviewed(row));
  expect(balance(6000, "2026-09-10")).toBe(10000); expect(balance(2000, "2026-09-10")).toBe(10000); expect(balance(1000)).toBe(0);
  settle(readExpense(row.id), 4000, { feeCents: 75 });
  expect(balance(2000)).toBe(6000); expect(balance(1000)).toBe(-4075); expect(balance(6400)).toBe(75);
  expect(balance(2000, "2026-09-11")).toBe(10000); expect(expenseOutstanding(readExpense(row.id).accounting!).amountCents).toBe(6000);
  settle(readExpense(row.id), 6000, { date: "2026-09-14" }); expect(balance(2000)).toBe(0); expect(readExpense(row.id).fields.paymentStatus).toBe("paid");
  const ledger = await loadLedger(); expect(ledger.entries.filter(e => e.id.startsWith("expense-journal:"))).toHaveLength(3); expect(ledger.trialBalance.balanced).toBe(true);
});
it("creates and posts a bill atomically for API/MCP callers without requiring a preexisting receipt", () => {
  const input = { fields: { ...blankExpense("2026-09-10"), merchant: "Backend vendor", amountCents: 5000, paymentStatus: "unpaid" }, dueDate: "2026-09-30", homeAmountCents: 5000, conversionEvidence: "", allocations: [{ accountNumber: 6000, amountCents: 5000, purpose: "operating" }], settlement: null, evidence: "Reviewed backend bill", reviewed: true }, requestId = randomUUID();
  const result = command("expense.create", input, requestId); expect(command("expense.create", input, requestId)).toEqual(result); expect(listExpenses()).toHaveLength(1); expect(expenseAccountingData().entries).toHaveLength(1);
  expect(() => command("expense.create", { ...input, fields: { ...input.fields, merchant: "Bad allocation" }, homeAmountCents: 4000 })).toThrow("exact USD total"); expect(listExpenses()).toHaveLength(1);
});
it("does not treat archived documents or ordinary edits as deletion or rewriting of posted accounting", () => {
  let row = receipt(); command("expense.post", reviewed(row)); row = readExpense(row.id); const entries = expenseAccountingData().entries;
  expect(() => saveExpense({ id: row.id, revision: row.revision, fields: { ...row.fields, amountCents: 9000 }, status: "recorded" })).toThrow("Posted financial details");
  row = saveExpense({ id: row.id, revision: row.revision, fields: { ...row.fields, notes: "Filed receipt", channel: "online" }, status: "recorded" }, actor).expense!;
  row = archiveExpense(row.id, row.revision); expect(expenseAccountingData().entries).toEqual(entries); expect(balance(2000)).toBe(10000);
  settle(row, 10000); expect(expenseOutstanding(readExpense(row.id).accounting!).amountCents).toBe(0); expect(readExpense(row.id).status).toBe("archived");
});
it("atomically posts a paid receipt and its actual settlement, rejecting missing paid-date evidence", () => {
  const row = receipt({ paymentStatus: "paid" }); expect(() => command("expense.post", reviewed(row))).toThrow("marked paid"); expect(expenseAccountingData().entries).toHaveLength(0);
  command("expense.post", reviewed(row, { settlement: payment(10000) })); expect(expenseAccountingData().entries).toHaveLength(2); expect(balance(2000)).toBe(0);
  expect(balance(6000)).toBe(10000); expect(balance(1000)).toBe(-10000);
});
it("rolls back recognition if a simultaneous settlement fails validation", () => {
  const row = receipt(); expect(() => command("expense.post", reviewed(row, { settlement: payment(11000) }))).toThrow("exceeds");
  expect(readExpense(row.id).accounting).toBeUndefined(); expect(expenseAccountingData().entries).toHaveLength(0);
  const marker = workspaceDatabase(db => db.prepare("SELECT id FROM documents WHERE kind='account-use'").all()); expect(marker).toHaveLength(0);
});
it("captures vendor credits in the opposite direction and tracks their actual refund receipts", () => {
  const row = receipt({ kind: "refund" }); command("expense.post", reviewed(row)); expect(balance(2000)).toBe(-10000); expect(balance(6000)).toBe(-10000);
  settle(readExpense(row.id), 10000, { feeCents: 100 }); expect(balance(1000)).toBe(9900); expect(balance(6400)).toBe(100); expect(balance(2000)).toBe(0);
});
it("allocates an invoice across operating costs, fixed assets and reviewed recoverable tax", () => {
  custom(1500, "fixed_asset"); custom(1501, "current_asset"); const row = receipt();
  command("expense.post", reviewed(row, { allocations: [{ accountNumber: 6000, amountCents: 2000, purpose: "operating" }, { accountNumber: 1500, amountCents: 7000, purpose: "asset" }, { accountNumber: 1501, amountCents: 1000, purpose: "tax" }] }));
  expect(balance(6000)).toBe(2000); expect(balance(1500)).toBe(7000); expect(balance(1501)).toBe(1000); expect(balance(2000)).toBe(10000);
  const account = chartOfAccounts().accounts.find(a => a.number === 1500)!;
  const input = { number: account.number, revision: account.revision, name: account.name, classification: "expense", parentNumber: null, active: true, reviewed: true };
  expect(() => executeAccountCommand({ requestId: randomUUID(), action: "account.save", input }, actor)).toThrow("journal history");
});
it("uses posted USD allocations in the operational summary without losing archived costs or treating COGS as overhead", () => {
  const row = receipt({ currency: "EUR" }); command("expense.post", reviewed(row, { homeAmountCents: 12000, conversionEvidence: "Reviewed USD invoice value", allocations: [{ accountNumber: 6000, amountCents: 2000, purpose: "operating" }, { accountNumber: 1300, amountCents: 7000, purpose: "inventory" }, { accountNumber: 5000, amountCents: 3000, purpose: "cost_of_sales" }] }));
  archiveExpense(row.id, readExpense(row.id).revision); const pnl = computePnl([], [], listExpenses());
  expect(pnl.totalOperatingExpensesCents).toBe(2000); expect(pnl.cogsCents).toBe(3000); expect(pnl.netIncomeCents).toBe(-5000);
});
it("rejects inappropriate or inactive allocations without account usage markers or entries", () => {
  const row = receipt(); expect(() => command("expense.post", reviewed(row, { allocations: [{ accountNumber: 1000, amountCents: 10000, purpose: "operating" }] }))).toThrow("purpose");
  expect(() => command("expense.post", reviewed(row, { allocations: [{ accountNumber: 6000, amountCents: 9000, purpose: "operating" }] }))).toThrow("equal"); expect(expenseAccountingData().entries).toHaveLength(0);
});
it("preserves the original bill and payment while appending a dated allocation and amount correction", () => {
  let row = receipt(); command("expense.post", reviewed(row)); settle(readExpense(row.id), 4000); row = readExpense(row.id); const originals = expenseAccountingData().entries;
  const v = { id: row.id, revision: row.revision, fields: { ...row.fields, amountCents: 9000 }, homeAmountCents: 9000, allocations: [{ accountNumber: 6300, amountCents: 9000, purpose: "operating" }], dueDate: "2026-10-12", conversionEvidence: "", date: "2026-09-15", evidence: "Reviewed corrected supplier amount and subscription category", reviewed: true };
  command("expense.correct", v); expect(expenseAccountingData().entries.slice(0, 2)).toEqual(originals); expect(balance(6000, "2026-09-14")).toBe(10000); expect(balance(6300, "2026-09-14")).toBe(0);
  expect(balance(6000)).toBe(0); expect(balance(6300)).toBe(9000); expect(balance(2000)).toBe(5000);
  row = readExpense(row.id); expect(row.accounting!.settlements).toHaveLength(1); expect(expenseOutstanding(row.accounting!).amountCents).toBe(5000);
  expect(() => command("expense.correct", { ...v, revision: row.revision, fields: { ...row.fields, amountCents: 3000 }, homeAmountCents: 3000, allocations: [{ accountNumber: 6300, amountCents: 3000, purpose: "operating" }] })).toThrow("below amounts already settled");
});
it("preserves original fees on a returned settlement, reopens the bill, and accepts a replacement", () => {
  let row = receipt(); command("expense.post", reviewed(row)); settle(readExpense(row.id), 10000, { feeCents: 100 }); row = readExpense(row.id); const original = expenseAccountingData().entries;
  command("expense.settlement.reverse", { id: row.id, revision: row.revision, settlementId: row.accounting!.settlements[0].id, date: "2026-09-16", homeAmountCents: 10000, feeRefundCents: 25, additionalFeeCents: 40, fxAccountNumber: null, reference: "RETURNED-1", evidence: "Bank confirmed returned payment and partial fee refund", reviewed: true });
  expect(expenseAccountingData().entries.slice(0, 2)).toEqual(original); expect(balance(2000)).toBe(10000); expect(balance(1000)).toBe(-115); expect(balance(6400)).toBe(115); expect(balance(2000, "2026-09-14")).toBe(0);
  row = readExpense(row.id); settle(row, 10000, { date: "2026-09-17" }); expect(balance(2000)).toBe(0); expect(balance(1000)).toBe(-10115);
});
it("posts foreign bills using reviewed carrying value, proportional partial settlements and realized exchange differences", () => {
  custom(7100, "other_income"); custom(7101, "other_expense"); const row = receipt({ currency: "EUR", amountCents: 300 });
  const input = reviewed(row, { homeAmountCents: 100, allocations: [{ accountNumber: 6000, amountCents: 100, purpose: "operating" }] });
  expect(() => command("expense.post", input)).toThrow("conversion evidence"); command("expense.post", { ...input, conversionEvidence: "Synthetic reviewed exchange rate" });
  settle(readExpense(row.id), 100, { homeAmountCents: 40, fxAccountNumber: 7101 });
  settle(readExpense(row.id), 100, { homeAmountCents: 30, fxAccountNumber: 7100 });
  settle(readExpense(row.id), 100, { homeAmountCents: 33 });
  expect(readExpense(row.id).accounting!.settlements.map(p => p.carryingAmountCents)).toEqual([33, 34, 33]);
  expect(balance(2000)).toBe(0); expect(balance(7101)).toBe(7); expect(balance(7100)).toBe(4); expect(balance(1000)).toBe(-103);
});
it("requires matching currency balances when correcting a fully settled foreign bill", () => {
  const row = receipt({ currency: "EUR", amountCents: 100 }); command("expense.post", reviewed(row, { homeAmountCents: 110, conversionEvidence: "Reviewed rate", allocations: [{ accountNumber: 6000, amountCents: 110, purpose: "operating" }] }));
  settle(readExpense(row.id), 100, { homeAmountCents: 110 }); const paid = readExpense(row.id);
  expect(() => command("expense.correct", { id: row.id, revision: paid.revision, fields: paid.fields, homeAmountCents: 120, conversionEvidence: "Another reviewed value", allocations: [{ accountNumber: 6000, amountCents: 120, purpose: "operating" }], dueDate: "2026-10-10", date: "2026-09-13", evidence: "Would create residual USD payable", reviewed: true })).toThrow("both settle");
});
it("posts card charges and bank-to-card payments as distinct events without buying the expense twice", () => {
  custom(2300, "credit_card"); const row = receipt({ paymentStatus: "paid" }); command("expense.post", reviewed(row, { settlement: payment(10000, { accountNumber: 2300 }) }));
  const transfer = receipt({ merchant: "Card account", date: "2026-09-14", treatment: "transfer", paymentStatus: "paid" }); command("expense.transfer", { id: transfer.id, revision: transfer.revision, fromAccount: 1000, toAccount: 2300, evidence: "Verified card statement payment", reviewed: true });
  expect(balance(6000)).toBe(10000); expect(balance(2300)).toBe(0); expect(balance(2000)).toBe(0); expect(balance(1000)).toBe(-10000);
});
it("voids an unpaid posting with a dated reversal, preserving the original and rejecting paid voids", () => {
  const row = receipt(); command("expense.post", reviewed(row)); let current = readExpense(row.id); const original = expenseAccountingData().entries[0];
  command("expense.void", { id: row.id, revision: current.revision, date: "2026-09-15", evidence: "Duplicate unpaid invoice reviewed", reviewed: true });
  expect(expenseAccountingData().entries[0]).toEqual(original); expect(balance(2000)).toBe(0); expect(balance(2000, "2026-09-14")).toBe(10000);
  const another = receipt({ merchant: "Another vendor" }); command("expense.post", reviewed(another)); settle(readExpense(another.id), 100); current = readExpense(another.id);
  expect(() => command("expense.void", { id: current.id, revision: current.revision, date: "2026-09-16", evidence: "Paid invoice", reviewed: true })).toThrow("settled bill");
});
it("retries posting exactly and rejects stale, duplicate, future and out-of-order settlements", () => {
  const row = receipt(), input = reviewed(row), requestId = randomUUID(); command("expense.post", input, requestId); const entries = expenseAccountingData().entries;
  command("expense.post", input, requestId); expect(expenseAccountingData().entries).toEqual(entries);
  expect(() => command("expense.post", { ...input, evidence: "Changed evidence" }, requestId)).toThrow("another expense action");
  expect(() => settle(row)).toThrow("changed"); settle(readExpense(row.id), 5000, { reference: "BANK-1" });
  expect(() => settle(readExpense(row.id), 1, { reference: "BANK-1" })).toThrow("already recorded");
  expect(() => settle(readExpense(row.id), 1, { date: "2026-09-11" })).toThrow("preceding"); expect(() => settle(readExpense(row.id), 1, { date: "2026-09-26" })).toThrow("today");
  expect(() => settle(readExpense(row.id), 6000)).toThrow("exceeds"); expect(balance(2000)).toBe(5000);
});
it("imports original JSON once without changing it or inventing paid-date entries", () => {
  const id = randomUUID(), file = path.join(expenseDirectory(), id + ".json"), raw = JSON.stringify({ id, revision: 1, createdAt: "2026-09-10T12:00:00.000Z", updatedAt: "2026-09-10T12:00:00.000Z", status: "recorded", fields: { ...blankExpense("2026-09-10"), merchant: "Legacy", amountCents: 500 }, receipt: null, history: [] });
  writeFileSync(file, raw); expect(listExpenses()).toHaveLength(1); expect(expenseAccountingData().entries).toHaveLength(0); expect(expenseAccountingData().issues[0]).toContain("need review");
  const row = readExpense(id); saveExpense({ id, revision: row.revision, fields: { ...row.fields, notes: "Imported and indexed" }, status: "recorded" });
  expect(readFileSync(file, "utf8")).toBe(raw); expect(readExpense(id).fields.notes).toBe("Imported and indexed");
});
it("fails closed on corrupt legacy receipts without installing an empty replacement", () => {
  const id = randomUUID(), file = path.join(expenseDirectory(), id + ".json"); writeFileSync(file, "{ broken");
  expect(() => listExpenses()).toThrow("cannot be imported"); expect(readFileSync(file, "utf8")).toBe("{ broken");
  expect(workspaceDatabase(db => db.prepare("SELECT id FROM documents WHERE id='state:expenses'").get())).toBeUndefined();
});
