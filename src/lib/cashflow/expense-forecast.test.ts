// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { loadCashFlowAsync } from "./load";
import { blankExpense } from "../expenses/model";
import { archiveExpense, readExpense } from "../expenses/store";
import { executeExpenseAccountingCommand } from "../expenses/accounting";
vi.mock("../data/workspace", () => ({ loadWorkspace: async () => ({ deals: [], orders: [] }) }));
vi.mock("../team/store", () => ({ listTeam: () => [] }));
let directory: string;
const command = (action: string, input: unknown) => executeExpenseAccountingCommand({ requestId: randomUUID(), action, input }, "Fixture accountant", "2026-09-20");
beforeEach(() => { directory = mkdtempSync(`${tmpdir()}/shuug-expense-forecast-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("OPENING_CASH_CENTS", "0"); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { force: true, recursive: true }); });
it("forecasts only remaining bill balances and vendor credits in USD, even when the receipt is archived", async () => {
  const fields = { ...blankExpense("2026-09-10"), merchant: "Forecast vendor", amountCents: 10000, paymentStatus: "unpaid" }, valuation = { dueDate: "2026-10-10", homeAmountCents: 10000, conversionEvidence: "", allocations: [{ accountNumber: 6000, amountCents: 10000, purpose: "operating" }], settlement: null, evidence: "Reviewed payable", reviewed: true };
  const { id } = command("expense.create", { fields, ...valuation });
  command("expense.settle", { id, revision: readExpense(id).revision, amountCents: 4000, homeAmountCents: 4000, date: "2026-09-12", feeCents: 0, accountNumber: 1000, fxAccountNumber: null, reference: "FORECAST-PAYMENT", evidence: "Verified bank payment", reviewed: true });
  archiveExpense(id, readExpense(id).revision);
  command("expense.create", { ...valuation, fields: { ...fields, merchant: "Euro refund", currency: "EUR", kind: "refund", amountCents: 1000 }, homeAmountCents: 1200, conversionEvidence: "Reviewed exchange rate", allocations: [{ accountNumber: 6000, amountCents: 1200, purpose: "operating" }] });
  const report = await loadCashFlowAsync(Date.parse("2026-09-20T00:00:00Z"));
  expect(report.totalExpectedOutCents).toBe(6000); expect(report.totalExpectedInCents).toBe(1200); expect(report.weeks[2].netCents).toBe(-4800);
});
