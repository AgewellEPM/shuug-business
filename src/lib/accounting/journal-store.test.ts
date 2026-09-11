// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { executeJournalCommand, manualJournalData, removeManualEntry } from "./journal-store";
import { trialBalance } from "./ledger";
let dir: string;
const lines = [{ accountNumber: 1000, debitCents: 2500, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 2500 }];
const post = (input = {}) => ({ requestId: randomUUID(), action: "journal.post", input: { date: "2026-09-10", memo: "Reviewed opening cash sale", lines, reviewed: true, ...input } });
const reverse = (id: string, input = {}) => ({ requestId: randomUUID(), action: "journal.reverse", input: { id, revision: 1, date: "2026-09-11", reason: "Correct duplicate source entry", reviewed: true, ...input } });
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shuug-journal-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("records reviewed entries exactly once with author identity and audit, across process restarts", () => {
  const command = post(), result = executeJournalCommand(command, "Owner A");
  expect(executeJournalCommand(command, "Owner A")).toEqual(result);
  expect(() => executeJournalCommand(command, "Owner B")).toThrow(/author/);
  expect(() => executeJournalCommand({ ...command, input: { ...command.input, memo: "Another posting" } }, "Owner A")).toThrow(/different/);
  const data = manualJournalData();
  expect(data.entries).toHaveLength(1); expect(data.audit).toHaveLength(1);
  expect(data.entries[0]).toMatchObject({ id: result.id, lines, manual: { actor: "Owner A", revision: 1, reversesId: null, reversedById: null, imported: false } });
  data.entries[0].memo = "Mutating returned data";
  const script = `import { manualJournalData, executeJournalCommand } from './src/lib/accounting/journal-store'; executeJournalCommand(${JSON.stringify(command)}, 'Owner A'); process.stdout.write(JSON.stringify(manualJournalData()));`;
  const reopened = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), env: process.env, encoding: "utf8" }));
  expect(reopened.entries).toHaveLength(1); expect(reopened.entries[0].memo).toBe(command.input.memo); expect(reopened.audit).toEqual(data.audit);
});
it("preserves original amounts and links one reversal, which can itself be reversed", () => {
  const original = executeJournalCommand(post(), "Bookkeeper"), command = reverse(original.id);
  const reversed = executeJournalCommand(command, "Owner");
  expect(executeJournalCommand(command, "Owner")).toEqual(reversed);
  expect(() => executeJournalCommand(reverse(original.id), "Owner")).toThrow(/already has/);
  expect(() => removeManualEntry(original.id)).toThrow(/cannot be removed/);
  let data = manualJournalData();
  expect(data.entries[0].lines).toEqual(lines); expect(data.entries[0].manual?.reversedById).toBe(reversed.id);
  expect(data.entries[1].manual).toMatchObject({ reversesId: original.id, reason: command.input.reason, actor: "Owner" });
  expect(trialBalance(data.entries)).toMatchObject({ balanced: true, totalDebitCents: 0, totalCreditCents: 0 });
  executeJournalCommand(reverse(reversed.id), "Owner"); data = manualJournalData();
  expect(data.audit.map(a => a.action)).toEqual(["journal.post", "journal.reverse", "journal.reverse"]);
  expect(trialBalance(data.entries)).toMatchObject({ balanced: true, totalDebitCents: 2500 });
});
it.each([
  { date: "2026-02-30" }, { date: "2026-13-01" }, { memo: " " }, { reviewed: false },
  { lines: [lines[0], { ...lines[1], creditCents: 2400 }] },
  { lines: [{ ...lines[0], debitCents: -2500 }, lines[1]] },
  { lines: [{ ...lines[0], debitCents: 25.25 }, lines[1]] },
  { lines: [{ ...lines[0], accountNumber: 99999 }, lines[1]] },
  { lines: [{ ...lines[0], debitCents: Number.MAX_SAFE_INTEGER + 1 }, lines[1]] },
  { lines: [{ ...lines[0], creditCents: 1 }, lines[1]] }, { attacker: true },
])("rejects invalid journal input without leaving entries or receipts: %j", input => {
  expect(() => executeJournalCommand(post(input), "Owner")).toThrow(); expect(manualJournalData()).toEqual({ entries: [], audit: [] });
});
it("rejects stale revision, nonexistent source and reversal before original date", () => {
  const original = executeJournalCommand(post(), "Owner");
  for (const input of [{ revision: 2 }, { date: "2026-09-09" }, { reason: "" }, { reviewed: false }, { id: "auto:order" }]) expect(() => executeJournalCommand(reverse(original.id, input), "Owner")).toThrow();
  expect(manualJournalData().entries).toHaveLength(1);
});
it("imports valid legacy history once and keeps its original file unchanged", () => {
  const old = JSON.stringify([{ id: "manual:legacy", source: "manual", date: "2026-09-01", memo: "Historical posting", lines }]);
  writeFileSync(path.join(dir, "journal.json"), old);
  expect(manualJournalData().entries[0]).toMatchObject({ id: "manual:legacy", manual: { imported: true, actor: "Legacy import; original author unavailable" } });
  executeJournalCommand(post(), "Owner"); expect(manualJournalData().entries).toHaveLength(2);
  expect(readFileSync(path.join(dir, "journal.json"), "utf8")).toBe(old);
});
it.each(["not json", "{}", JSON.stringify([{ id: "manual:bad", source: "manual", date: "2026-02-31", memo: "Bad", lines }])])("fails closed on damaged legacy books: %s", old => {
  writeFileSync(path.join(dir, "journal.json"), old);
  expect(() => executeJournalCommand(post(), "Owner")).toThrow(/has not been replaced/);
  expect(readFileSync(path.join(dir, "journal.json"), "utf8")).toBe(old);
});
it("isolates journals by private workspace directory without process-global leakage", () => {
  const result = executeJournalCommand(post(), "Owner");
  const other = mkdtempSync(path.join(tmpdir(), "shuug-journal-other-"));
  try { vi.stubEnv("DEALDESK_DATA_DIR", other); expect(manualJournalData().entries).toEqual([]); vi.stubEnv("DEALDESK_DATA_DIR", dir); expect(manualJournalData().entries[0].id).toBe(result.id); }
  finally { rmSync(other, { recursive: true, force: true }); }
});
