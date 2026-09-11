// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { applyReceivableCommand, receivableData, receivableJournals } from "./ar-store";
import { settleInvoice } from "./collections";
import { trialBalance, accountBalance } from "../accounting/ledger";
let dir: string;
const invoice = { id: "invoice-A", company: "Fixture customer", customerId: "customer-A", issuedOn: "2026-07-01", dueDateISO: "2026-07-31", totalCents: 10000 };
const today = "2026-09-30";
const receipt = (input = {}) => ({ requestId: randomUUID(), action: "payment.record", input: { invoiceId: invoice.id, receivedAtISO: "2026-08-01", amountCents: 10000, method: "check", feeCents: 100, reference: "Receipt-A", evidence: "Verified bank receipt", reviewed: true, ...input } });
const returned = (paymentId: string, input = {}) => ({ requestId: randomUUID(), action: "payment.return", input: { paymentId, date: "2026-09-02", reference: "Return-A", reason: "Check returned unpaid", evidence: "Verified bank return", bankFeeCents: 250, customerFeeCents: 550, customerFeeTaxCents: 50, customerFeeEvidence: "Reviewed customer agreement and tax calculation", reviewed: true, ...input } });
const run = (command: unknown, invoices: (typeof invoice & { void?: boolean })[] = [invoice]) => applyReceivableCommand(command, "Bookkeeper", invoices, today);
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shuug-receivables-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("retains receipt date, processing fee and evidence with exact retry protection and durable postings", () => {
  const c = receipt(), result = run(c); expect(run(c)).toEqual(result);
  expect(() => applyReceivableCommand(c, "Someone else", [invoice], today)).toThrow(/author/);
  const data = receivableData(); expect(data.payments).toHaveLength(1); expect(data.audit).toHaveLength(1);
  expect(data.payments[0]).toMatchObject({ receivedAtISO: "2026-08-01", reference: "Receipt-A", actor: "Bookkeeper", amountCents: 10000 });
  const journals = receivableJournals(); expect(journals.entries).toHaveLength(2); expect(journals.entries.every(e => e.date === "2026-08-01")).toBe(true);
  expect(accountBalance(trialBalance(journals.entries), 1000)).toBe(9900); expect(accountBalance(trialBalance(journals.entries), 6400)).toBe(100);
  data.payments[0].amountCents = 1; expect(receivableData().payments[0].amountCents).toBe(10000);
  const script = `import { receivableJournals } from './src/lib/payments/ar-store'; process.stdout.write(JSON.stringify(receivableJournals()));`;
  expect(JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: process.env, cwd: process.cwd(), encoding: "utf8" }))).toEqual(journals);
});
it("records a returned check in its own month, retains the original and charges reviewed bank/customer fees", () => {
  const p = run(receipt()), original = receivableJournals().entries, command = returned(p.id);
  const result = run(command); expect(run(command)).toEqual(result); expect(() => run(returned(p.id, { reference: "Other return" }))).toThrow(/already/);
  const { payments } = receivableData(), journals = receivableJournals().entries;
  expect(journals.slice(0, 2)).toEqual(original); expect(journals.slice(2).every(e => e.date === "2026-09-02")).toBe(true);
  expect(journals).toHaveLength(5); expect(payments[0].returned).toMatchObject({ actor: "Bookkeeper", reason: "Check returned unpaid", customerFeeTaxCents: 50 });
  expect(settleInvoice(invoice, payments, undefined, "2026-07-31").paidCents).toBe(0);
  expect(settleInvoice(invoice, payments, undefined, "2026-08-31")).toMatchObject({ paidCents: 10000, balanceCents: 0, feeCents: 100, customerFeeCents: 0 });
  expect(settleInvoice(invoice, payments, undefined, today)).toMatchObject({ paidCents: 0, balanceCents: 10550, feeCents: 100, returnFeeCents: 250 });
  const tb = trialBalance(journals); expect(tb.balanced).toBe(true); expect(accountBalance(tb, 1000)).toBe(-350); expect(accountBalance(tb, 6400)).toBe(350); expect(accountBalance(tb, 4000)).toBe(500); expect(accountBalance(tb, 2200)).toBe(50);
  run(receipt({ receivedAtISO: "2026-09-03", amountCents: 10550, reference: "Replacement check", feeCents: 0 }));
  expect(settleInvoice(invoice, receivableData().payments, undefined, today).balanceCents).toBe(0);
});
it("limits partial receipts against the current and historical balance without racing duplicate allocations", () => {
  run(receipt({ amountCents: 6000 }));
  expect(() => run(receipt({ amountCents: 5000, reference: "Excess" }))).toThrow(/exceeds/);
  expect(() => run(receipt({ amountCents: 4000, reference: "receipt-a" }))).toThrow(/reference/);
  run(receipt({ amountCents: 4000, reference: "Receipt-B", receivedAtISO: "2026-08-03" }));
  const p = receivableData().payments[0]; run(returned(p.id, { customerFeeCents: 0, customerFeeTaxCents: 0 }));
  expect(() => run(receipt({ amountCents: 6000, reference: "Backdated", receivedAtISO: "2026-08-04" }))).toThrow(/exceeds/);
});
it.each([{ receivedAtISO: "2026-02-30" }, { receivedAtISO: "2026-06-30" }, { receivedAtISO: "2026-10-01" }, { amountCents: 1.2 }, { amountCents: -1 }, { amountCents: 100000000000 }, { feeCents: 10001 }, { reference: " " }, { evidence: "" }, { reviewed: false }, { invoiceId: "missing" }, { extra: true }])("rejects invalid receipt %j without writes", fields => {
  expect(() => run(receipt(fields))).toThrow(); expect(receivableData().payments).toEqual([]); expect(receivableJournals().entries).toEqual([]);
});
it("refuses cancelled invoices and invalid or undocumented returned amounts", () => {
  expect(() => run(receipt(), [{ ...invoice, void: true }])).toThrow(/cancelled/);
  const p = run(receipt());
  for (const fields of [{ date: "2026-07-31" }, { date: "2026-10-01" }, { customerFeeEvidence: "" }, { reviewed: false }, { customerFeeTaxCents: 551 }, { paymentId: "missing" }]) expect(() => run(returned(p.id, fields))).toThrow();
  expect(receivableJournals().entries).toHaveLength(2); expect(receivableData().payments[0].returned).toBeUndefined();
});
it("records real follow-up history with revisions and retry-safe reminder counts", () => {
  const update = { requestId: randomUUID(), action: "collection.update", input: { invoiceId: invoice.id, revision: 0, promisedDate: "2026-10-05", escalatedTo: "Owner", note: "Customer confirmed next week" } };
  run(update); expect(() => run({ ...update, requestId: randomUUID() })).toThrow(/revision/);
  const reminder = { requestId: randomUUID(), action: "reminder.record", input: { invoiceId: invoice.id, date: "2026-09-29", note: "Called customer; left message" } };
  run(reminder); run(reminder);
  expect(receivableData().collections[invoice.id]).toMatchObject({ revision: 2, reminders: 1, promisedDate: "2026-10-05" });
  expect(receivableData().audit).toHaveLength(2); expect(receivableJournals().entries).toEqual([]);
});
it("imports legacy receipts once, preserves the original file and flags an undated refund until reviewed", () => {
  const legacy = { id: "legacy", invoiceId: invoice.id, amountCents: 10000, feeCents: 100, receivedAtISO: "2026-08-01", method: "check", refunded: true };
  const old = JSON.stringify({ payments: [legacy], collections: {} }); writeFileSync(path.join(dir, "ar.json"), old);
  expect(receivableJournals().issues).toHaveLength(1); expect(receivableData().payments[0].imported).toBe(true);
  run(returned("legacy")); expect(receivableJournals().issues).toEqual([]); expect(receivableJournals().entries).toHaveLength(5);
  expect(readFileSync(path.join(dir, "ar.json"), "utf8")).toBe(old);
});
it.each(["invalid json", JSON.stringify({ payments: [], collections: null }), JSON.stringify({ payments: [{ id: "bad" }], collections: {} })])("fails closed on damaged legacy records", old => {
  writeFileSync(path.join(dir, "ar.json"), old); expect(() => run(receipt())).toThrow(/has not been replaced/); expect(readFileSync(path.join(dir, "ar.json"), "utf8")).toBe(old);
});
it("isolates receivables across private workspace directories", () => {
  run(receipt()); const other = mkdtempSync(path.join(tmpdir(), "shuug-ar-other-"));
  try { vi.stubEnv("DEALDESK_DATA_DIR", other); expect(receivableData().payments).toEqual([]); vi.stubEnv("DEALDESK_DATA_DIR", dir); expect(receivableData().payments).toHaveLength(1); } finally { rmSync(other, { recursive: true, force: true }); }
});
