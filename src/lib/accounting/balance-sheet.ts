/**
 * Balance Sheet (QBD Ch.3) from available data: Accounts Receivable (unpaid
 * orders), Inventory Asset (on-hand × cost), Accounts Payable (unpaid bills),
 * Sales Tax Payable, and Retained Earnings (net income). Owner's Equity is the
 * balancing figure so Assets = Liabilities + Equity always ties out — honestly
 * flagged, since actual cash + contributed capital need a connected bank. Pure.
 */
export interface BalanceSheetInput {
  accountsReceivableCents: number;
  inventoryValueCents: number;
  cashCents: number;
  accountsPayableCents: number;
  salesTaxPayableCents: number;
  retainedEarningsCents: number;
}

export interface BalanceSheet {
  assets: { cashCents: number; accountsReceivableCents: number; inventoryCents: number; totalCents: number };
  liabilities: { accountsPayableCents: number; salesTaxPayableCents: number; totalCents: number };
  equity: { ownersEquityCents: number; retainedEarningsCents: number; totalCents: number };
  balanced: boolean;
  note: string;
}

export function computeBalanceSheet(i: BalanceSheetInput): BalanceSheet {
  const assetsTotal = i.cashCents + i.accountsReceivableCents + i.inventoryValueCents;
  const liabilitiesTotal = i.accountsPayableCents + i.salesTaxPayableCents;
  // Owner's equity plugs the accounting equation: A = L + E.
  const ownersEquityCents = assetsTotal - liabilitiesTotal - i.retainedEarningsCents;
  const equityTotal = ownersEquityCents + i.retainedEarningsCents;

  return {
    assets: { cashCents: i.cashCents, accountsReceivableCents: i.accountsReceivableCents, inventoryCents: i.inventoryValueCents, totalCents: assetsTotal },
    liabilities: { accountsPayableCents: i.accountsPayableCents, salesTaxPayableCents: i.salesTaxPayableCents, totalCents: liabilitiesTotal },
    equity: { ownersEquityCents, retainedEarningsCents: i.retainedEarningsCents, totalCents: equityTotal },
    balanced: assetsTotal === liabilitiesTotal + equityTotal,
    note: "Owner's equity is derived so the sheet balances. Connect a bank account for actual cash and contributed capital.",
  };
}
