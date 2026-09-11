/**
 * Chart of Accounts (QBD Ch.3) — a standard small-business chart, the backbone
 * every financial statement rolls up to. Pure catalog; the P&L and Balance Sheet
 * map their lines onto these accounts so numbers tie out to real account types.
 */
export type AccountType = "asset" | "liability" | "equity" | "income" | "cogs" | "expense";

export interface Account {
  number: number;
  name: string;
  type: AccountType;
  /** which financial statement it appears on. */
  statement: "balance-sheet" | "profit-and-loss";
}

export const STANDARD_COA: Account[] = [
  { number: 1000, name: "Business Checking", type: "asset", statement: "balance-sheet" },
  { number: 1005, name: "Restaurant Cash Drawer", type: "asset", statement: "balance-sheet" },
  { number: 1010, name: "Payment Processor Clearing", type: "asset", statement: "balance-sheet" },
  { number: 1200, name: "Accounts Receivable", type: "asset", statement: "balance-sheet" },
  { number: 1300, name: "Inventory Asset", type: "asset", statement: "balance-sheet" },
  { number: 1320, name: "Restaurant Food in Preparation", type: "asset", statement: "balance-sheet" },
  { number: 2000, name: "Accounts Payable", type: "liability", statement: "balance-sheet" },
  { number: 2100, name: "Customer Deposits", type: "liability", statement: "balance-sheet" },
  { number: 2150, name: "Customer Refunds Payable", type: "liability", statement: "balance-sheet" },
  { number: 2200, name: "Sales Tax Payable", type: "liability", statement: "balance-sheet" },
  { number: 2400, name: "Tips Payable", type: "liability", statement: "balance-sheet" },
  { number: 3000, name: "Owner's Equity", type: "equity", statement: "balance-sheet" },
  { number: 3900, name: "Retained Earnings", type: "equity", statement: "balance-sheet" },
  { number: 4000, name: "Sales Income", type: "income", statement: "profit-and-loss" },
  { number: 4050, name: "Sales Returns and Allowances", type: "income", statement: "profit-and-loss" },
  { number: 5000, name: "Cost of Goods Sold", type: "cogs", statement: "profit-and-loss" },
  { number: 6000, name: "Operating Expenses", type: "expense", statement: "profit-and-loss" },
  { number: 6100, name: "Shipping & Freight", type: "expense", statement: "profit-and-loss" },
  { number: 6200, name: "Marketing & Advertising", type: "expense", statement: "profit-and-loss" },
  { number: 6300, name: "Software & Subscriptions", type: "expense", statement: "profit-and-loss" },
  { number: 6400, name: "Payment Processing Fees", type: "expense", statement: "profit-and-loss" },
  { number: 6900, name: "Other Expenses", type: "expense", statement: "profit-and-loss" },
  { number: 6910, name: "Food Waste", type: "expense", statement: "profit-and-loss" },
  { number: 6920, name: "Cash Over and Short", type: "expense", statement: "profit-and-loss" },
  { number: 6930, name: "Inventory Count Variance", type: "expense", statement: "profit-and-loss" },
];

export function accountsByType(type: AccountType): Account[] {
  return STANDARD_COA.filter((a) => a.type === type);
}
