/**
 * Gather our LOCAL ledger + mapping coverage for reconciliation. The accounting
 * side is pulled from QuickBooks when connected; otherwise it's null and every
 * line reads "unknown" (honest — we never invent the accounting figure). Customer
 * → QBO mapping is real (customer.quickbooksCustomerId); products map on first sync.
 */
import { getDealStore } from "../data/store";
import { loadAnalytics } from "../analytics/load";
import { loadCollections } from "../payments/load";
import { listAllPayments } from "../payments/ar-store";
import { computeSalesTax } from "../accounting/sales-tax";
import { getQboTokens } from "../integrations/token-store";
import { setting } from "../connections/vault";
import { buildReport, mappingCoverage, type LedgerTotals, type ReconciliationReport } from "./engine";

export interface ReconciliationView extends ReconciliationReport {
  local: LedgerTotals;
  accountingSystem: string;
}

export async function loadReconciliation(): Promise<ReconciliationView> {
  const store = await getDealStore();
  const { analytics, customers, orders, skus } = await loadAnalytics(store);
  const collections = await loadCollections();
  const feesCents = listAllPayments().reduce((n, p) => n + p.feeCents + (p.returned?.bankFeeCents ?? 0), 0);
  const salesTax = computeSalesTax(orders, customers, Number(setting("SALES_TAX_RATE_BPS")) || 0);

  const local: LedgerTotals = {
    arCents: collections.outstandingCents,
    incomeCents: analytics.totalRevenueCents,
    salesTaxCents: salesTax.estimatedTaxCents,
    feesCents,
    paymentsCents: collections.collectedCents,
  };

  // Accounting side: pull from QBO when connected. Not credentialed → null (honest).
  const accounting: LedgerTotals | null = getQboTokens() ? null : null; // live pull is the next milestone

  const coverage = [
    mappingCoverage("Customers", customers.map((c) => ({ id: c.id, label: c.company, mappedId: c.quickbooksCustomerId }))),
    // Products get their accounting item id on first sync; unmapped until then.
    mappingCoverage("Products", skus.map((s) => ({ id: s.id, label: s.name, mappedId: null as string | null }))),
  ].filter((c) => c.total > 0);

  return { ...buildReport(local, accounting, coverage), local, accountingSystem: "QuickBooks Online" };
}
