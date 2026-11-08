// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addManualEntry, executeAccountCommand } from "./journal-store";
import { randomUUID } from "node:crypto";
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
it("includes custom bank, receivable and payable balances in API summaries without counting children twice", async () => {
  const save = (number:number,name:string,classification:string,parentNumber:number,revision=0,active=true) => executeAccountCommand({requestId:randomUUID(),action:"account.save",input:{number,name,classification,parentNumber,revision,active,reviewed:true}},"Synthetic accountant");
  save(1020,"Second bank","bank",1000);save(1021,"Savings subaccount","bank",1020);
  save(1210,"Custom receivable","receivable",1200);save(2010,"Custom payable","payable",2000);
  addManualEntry({date:"2026-10-01",memo:"Opening capital in both bank accounts",lines:[{accountNumber:1020,debitCents:2000,creditCents:0},{accountNumber:1021,debitCents:8000,creditCents:0},{accountNumber:3000,debitCents:0,creditCents:10000}]});
  addManualEntry({date:"2026-10-02",memo:"Customer invoice",lines:[{accountNumber:1210,debitCents:5000,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:5000}]});
  addManualEntry({date:"2026-10-03",memo:"Vendor bill",lines:[{accountNumber:6000,debitCents:3000,creditCents:0},{accountNumber:2010,debitCents:0,creditCents:3000}]});
  save(1021,"Savings subaccount","bank",1020,1,false);
  for(const report of [await loadFinancialReports(),await businessHandlers()["financials/balance-sheet"].load()] as Awaited<ReturnType<typeof loadFinancialReports>>[]){
    expect(report.balanceSheet.assets.cashCents).toBe(10000);
    expect(report.balanceSheet.assets.accountsReceivableCents).toBe(5000);
    expect(report.balanceSheet.liabilities.accountsPayableCents).toBe(3000);
    expect(report.balanceSheet.assetsCents).toBe(15000);expect(report.balanceSheet.balanced).toBe(true);
    expect(report.trialBalance.rows.find(r=>r.accountNumber===1021)?.debitCents).toBe(8000);
  }
});
