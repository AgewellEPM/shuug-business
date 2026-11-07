// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addManualEntry } from "./journal-store";
import { loadFinancialReports, financialReportCsv } from "./reports";
import { businessHandlers } from "../backend/resources";
let directory: string;
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "shuug-reports-")); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false"); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("includes manual adjustments in the main reports and both existing API resources", async () => {
  addManualEntry({ date: "2026-10-31", memo: "Customer paid cash", lines: [{ accountNumber: 1000, debitCents: 2500, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 2500 }] });
  const report = await loadFinancialReports();
  expect(report.pnl.netIncomeCents).toBe(2500); expect(report.balanceSheet.assetsCents).toBe(2500);
  for (const resource of ["financials/pnl", "financials/balance-sheet"]) expect(await businessHandlers()[resource].load()).toMatchObject({ pnl: { netIncomeCents: 2500 }, balanceSheet: { assetsCents: 2500 } });
});
it("carries opening balances into the balance sheet without inflating period profit", async () => {
  addManualEntry({ date: "2025-12-31", memo: "Opening capital", lines: [{ accountNumber: 1000, debitCents: 50000, creditCents: 0 }, { accountNumber: 3000, debitCents: 0, creditCents: 50000 }] });
  addManualEntry({ date: "2026-01-10", memo: "Office expense", lines: [{ accountNumber: 6000, debitCents: 2500, creditCents: 0 }, { accountNumber: 1000, debitCents: 0, creditCents: 2500 }] });
  const report = await loadFinancialReports({ from: "2026-01-01", through: "2026-01-31" });
  expect(report.pnl.netIncomeCents).toBe(-2500); expect(report.balanceSheet.assetsCents).toBe(47500);
  expect(report.balanceSheet.equity.ownersEquityCents).toBe(50000); expect(report.balanceSheet.balanced).toBe(true);
  expect(financialReportCsv(report)).toContain('"475.00"');
  await expect(loadFinancialReports({ from: "2026-02-01", through: "2026-01-31" })).rejects.toThrow();
});
