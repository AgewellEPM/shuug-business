import { z } from "zod";
import { accountBalance, ledgerBalanceSheet, ledgerIncomeStatement, trialBalance, type JournalEntry } from "./ledger";
import type { Account } from "./coa";
import { loadLedger } from "./ledger-load";
import { chartOfAccounts } from "./journal-store";

export const reportPeriod = z.object({ from: z.iso.date().optional(), through: z.iso.date().optional() }).strict()
  .refine(p => !p.from || !p.through || p.from <= p.through, "The start date must be on or before the end date.");
export type ReportPeriod = z.infer<typeof reportPeriod>;

/** P&L uses period activity; the balance sheet retains all preceding balances. */
export function financialReports(entries: JournalEntry[], accounts: Account[], raw: ReportPeriod = {}) {
  const period = reportPeriod.parse(raw);
  const through = entries.filter(e => !period.through || e.date <= period.through);
  const activity = through.filter(e => (!period.from || e.date >= period.from) && !e.source.startsWith("year-close:"));
  const balance = trialBalance(through, accounts), movement = trialBalance(activity, accounts);
  const pnl = ledgerIncomeStatement(movement), sheet = ledgerBalanceSheet(balance);
  const expenseRows = movement.rows.filter(a => a.type === "expense");
  return {
    source: "shuug-ledger" as const, basis: "ledger" as const, period,
    entryCount: activity.length, trialBalance: balance, incomeStatement: pnl,
    pnl: { ...pnl, grossMarginFraction: pnl.incomeCents ? pnl.grossProfitCents / pnl.incomeCents : 0,
      netMarginFraction: pnl.incomeCents ? pnl.netIncomeCents / pnl.incomeCents : 0,
      totalOperatingExpensesCents: pnl.expenseCents,
      operatingExpensesByCategory: expenseRows.map(a => ({ label: a.name, cents: a.debitCents - a.creditCents })), insights: [] as string[] },
    balanceSheet: { ...sheet,
      assets: { totalCents: sheet.assetsCents, cashCents: accountBalance(balance, 1000), accountsReceivableCents: accountBalance(balance, 1200), inventoryCents: accountBalance(balance, 1300) },
      liabilities: { totalCents: sheet.liabilitiesCents, accountsPayableCents: accountBalance(balance, 2000), salesTaxPayableCents: accountBalance(balance, 2200) },
      equity: { totalCents: sheet.equityCents, ownersEquityCents: accountBalance(balance, 3000), retainedEarningsCents: accountBalance(balance, 3900), unclosedIncomeCents: sheet.netIncomeCents },
      note: "Balances come from recorded journal entries. Unclosed earnings are shown separately from posted equity." },
    activity: movement.rows,
  };
}

export async function loadFinancialReports(period: ReportPeriod = {}) {
  const ledger = await loadLedger();
  return { ...financialReports(ledger.entries, chartOfAccounts().accounts, period), issues: ledger.issues };
}

/** Protect spreadsheets from formula execution in account names. */
export function financialReportCsv(report: ReturnType<typeof financialReports>) {
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const rows: (string | number)[][] = [["Report", "Shuug trial balance"], ["Through", report.period.through ?? "All recorded dates"],
    ["Account", "Name", "Debit USD", "Credit USD"],
    ...report.trialBalance.rows.map(a => [a.accountNumber, a.name, (a.debitCents / 100).toFixed(2), (a.creditCents / 100).toFixed(2)]),
    ["Total", "", (report.trialBalance.totalDebitCents / 100).toFixed(2), (report.trialBalance.totalCreditCents / 100).toFixed(2)]];
  return rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
