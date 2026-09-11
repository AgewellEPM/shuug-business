/**
 * Assemble the live general ledger: auto-post real business activity (orders,
 * expenses) + captured receipt/return and restaurant journals + manual entries, then derive the Trial
 * Balance, P&L and Balance Sheet straight from the ledger so everything ties out.
 */
import { restaurantJournalEntries } from "../restaurant/business";
import { getDealStore } from "../data/store";
import { loadAnalytics } from "../analytics/load";
import { receivableJournals } from "../payments/ar-store";
import { expenseAccountingData } from "../expenses/accounting";
import { deriveEntries, type PostingInputs } from "./posting";
import { listManualEntries, chartOfAccounts } from "./journal-store";
import { trialBalance, ledgerIncomeStatement, ledgerBalanceSheet, type JournalEntry, type TrialBalance, type LedgerIncomeStatement, type LedgerBalanceSheet } from "./ledger";

export interface LedgerOverview {
  issues: string[];
  entries: JournalEntry[];
  autoCount: number;
  manualCount: number;
  trialBalance: TrialBalance;
  incomeStatement: LedgerIncomeStatement;
  balanceSheet: LedgerBalanceSheet;
}

export async function buildPostingInputs(): Promise<PostingInputs> {
  const store = await getDealStore();
  const { orders, skus } = await loadAnalytics(store);
  const costBySku = new Map(skus.map((s) => [s.id, s.costPerCaseCents]));


  const orderPostings = orders.map((o) => ({
    id: o.id, date: o.createdAt, subtotalCents: o.subtotalCents, freightCents: o.freightCents, totalCents: o.totalCents,
    costCents: o.lines.reduce((m, l) => m + (l.costAtOrderCents ?? (costBySku.get(l.skuId) ?? 0) * l.cases), 0),
  }));

  return { orders: orderPostings, payments: [], expenses: [] };
}

export async function loadLedger(): Promise<LedgerOverview> {
  const inputs = await buildPostingInputs();
  const receipts = receivableJournals(), expenses = expenseAccountingData();
  const auto = [...deriveEntries(inputs), ...receipts.entries, ...expenses.entries, ...restaurantJournalEntries()];
  const manual = listManualEntries();
  const entries = [...auto, ...manual].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const tb = trialBalance(entries, chartOfAccounts().accounts);
  return {
    issues: [...receipts.issues, ...expenses.issues], entries,
    autoCount: auto.length,
    manualCount: manual.length,
    trialBalance: tb,
    incomeStatement: ledgerIncomeStatement(tb),
    balanceSheet: ledgerBalanceSheet(tb),
  };
}
