// @vitest-environment node
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ACCOUNT_CLASSES, accountType } from "./account-model";
import { chartOfAccounts, executeAccountCommand, executeJournalCommand, listManualEntries } from "./journal-store";
import { accountBalance, trialBalance, ledgerBalanceSheet, ledgerIncomeStatement } from "./ledger";
let dir: string;
const save = (input: Record<string, unknown>) => ({ requestId: randomUUID(), action: "account.save", input: { number: 7000, revision: 0, name: "Custom expense", classification: "expense", parentNumber: null, active: true, reviewed: true, ...input } });
const run = (input: Record<string, unknown>) => executeAccountCommand(save(input), "Accountant");
function posting(number = 7000) { return executeJournalCommand({ requestId: randomUUID(), action: "journal.post", input: { date: "2026-09-11", memo: "Custom account fixture", reviewed: true, lines: [{ accountNumber: number, debitCents: 1900, creditCents: 0 }, { accountNumber: 1000, debitCents: 0, creditCents: 1900 }] } }, "Bookkeeper"); }
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shuug-accounts-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("represents all fifteen classifications and their financial-statement type", () => {
  expect(ACCOUNT_CLASSES).toHaveLength(15);
  for (const [i, c] of ACCOUNT_CLASSES.entries()) {
    run({ number: 8000 + i, name: `Fixture ${c.label}`, classification: c.id });
    const account = chartOfAccounts().accounts.find(a => a.number === 8000 + i)!;
    expect(account.type).toBe(c.type); expect(accountType(c.id)).toBe(c.type);
    expect(account.statement).toBe(["asset", "liability", "equity"].includes(c.type) ? "balance-sheet" : "profit-and-loss");
  }
});
it("creates once, prevents stale edits and retains before/after audit values", () => {
  const command = save({}); const first = executeAccountCommand(command, "Accountant");
  expect(executeAccountCommand(command, "Accountant")).toEqual(first);
  expect(() => executeAccountCommand(command, "Another accountant")).toThrow(/author/);
  run({ revision: 1, name: "Renamed expense" });
  expect(() => run({ revision: 1, name: "Stale edit" })).toThrow(/revision/);
  const chart = chartOfAccounts(); expect(chart.audit).toHaveLength(2);
  expect(chart.audit[1]).toMatchObject({ actor: "Accountant", before: { name: "Custom expense", revision: 1 }, after: { name: "Renamed expense", revision: 2 } });
  chart.accounts.find(a => a.number === 7000)!.name = "Not a stored edit";
  expect(chartOfAccounts().accounts.find(a => a.number === 7000)?.name).toBe("Renamed expense");
});
it("supports five levels and rejects cycles, mismatched parents and over-deep moved branches", () => {
  for (let level = 0; level < 5; level++) run({ number: 7000 + level, name: `Level ${level + 1}`, parentNumber: level ? 6999 + level : null });
  expect(() => run({ number: 7005, name: "Sixth level", parentNumber: 7004 })).toThrow(/five levels/);
  expect(() => run({ number: 7000, revision: 1, name: "Cycle", parentNumber: 7003 })).toThrow(/ancestor/);
  expect(() => run({ number: 7100, name: "Wrong class", parentNumber: 1000 })).toThrow(/classification/);
  expect(() => run({ number: 7100, name: "Missing parent", parentNumber: 99999 })).toThrow(/existing/);
  run({ number: 7100, name: "Another root" });
  expect(() => run({ number: 7000, revision: 1, name: "Moved too deep", parentNumber: 7100 })).toThrow(/five levels/);
  expect(chartOfAccounts().accounts.find(a => a.number === 7000)?.parentNumber).toBeNull();
});
it("keeps custom postings in trial balance and statements, including renamed accounts", () => {
  run({}); posting(); run({ revision: 1, name: "Reviewed job expense" });
  const chart = chartOfAccounts().accounts, entries = listManualEntries(), tb = trialBalance(entries, chart);
  expect(tb.balanced).toBe(true); expect(tb.rows.find(r => r.accountNumber === 7000)).toMatchObject({ name: "Reviewed job expense", debitCents: 1900 });
  expect(accountBalance(tb, 7000)).toBe(1900); expect(ledgerIncomeStatement(tb).expenseCents).toBe(1900); expect(ledgerBalanceSheet(tb).balanced).toBe(true);
  expect(() => trialBalance(entries)).toThrow(/cannot omit/);
  expect(() => run({ revision: 2, classification: "income" })).toThrow(/history/);
});
it("inactivates custom accounts without losing history and allows corrective reversals", () => {
  run({}); const original = posting(); run({ revision: 1, active: false });
  expect(() => posting()).toThrow(/Unknown account/); expect(listManualEntries()).toHaveLength(1);
  executeJournalCommand({ requestId: randomUUID(), action: "journal.reverse", input: { id: original.id, revision: 1, date: "2026-09-11", reason: "Correct historical account", reviewed: true } }, "Accountant");
  expect(trialBalance(listManualEntries(), chartOfAccounts().accounts)).toMatchObject({ balanced: true, totalDebitCents: 0 });
});
it("protects system mappings, active descendants, unique sibling names and reviewed edits", () => {
  expect(() => run({ number: 1000, revision: 1, name: "Checking", classification: "bank", active: false })).toThrow(/System/);
  expect(() => run({ number: 1000, revision: 1, classification: "expense" })).toThrow(/System/);
  run({}); run({ number: 7001, name: "Child", parentNumber: 7000 });
  expect(() => run({ revision: 1, active: false })).toThrow(/active parent/);
  expect(() => run({ number: 7002, name: "custom EXPENSE" })).toThrow(/already uses/);
  expect(() => run({ number: 7002, reviewed: false })).toThrow();
  expect(chartOfAccounts().audit).toHaveLength(2);
});
