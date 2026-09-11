/** Legacy navigation/API index, retained for existing clients. Route availability
 * is not QuickBooks feature parity. The complete manual acceptance catalog is
 * manual.ts; partial implementations and extensions must not count as ready. */
export type QbStatus = "live" | "partial" | "planned";
export type QbGroup = "Company" | "Sales & A/R" | "Purchases & A/P" | "Banking" | "Payroll & Team" | "Inventory" | "Reports" | "Sales Tax";

export interface QbFeature {
  id: string;
  chapter: number;      // QBD manual chapter
  group: QbGroup;
  label: string;        // our name
  qbTerm: string;       // the QuickBooks name it mirrors
  status: QbStatus;
  route: string | null; // where it lives in our app (null = no UI yet)
  apiPath: string | null; // our API surface to pull it (null = not exposed yet)
}

export const QB_FEATURES: QbFeature[] = [
  // Ch 1 — Company / setup / home
  { id: "company-home", chapter: 1, group: "Company", label: "Customizable home (cockpit)", qbTerm: "Home Page / Company Snapshot", status: "live", route: "/", apiPath: "/api/v1/cockpit" },
  { id: "company-setup", chapter: 1, group: "Company", label: "Guided setup from your website", qbTerm: "Create Company File / Setup", status: "partial", route: "/setup", apiPath: null },
  { id: "preferences", chapter: 1, group: "Company", label: "Preferences & feature toggles", qbTerm: "Preferences", status: "partial", route: "/features", apiPath: "/api/v1/features" },
  // Ch 2 — Lists
  { id: "list-customers", chapter: 2, group: "Sales & A/R", label: "Customers & jobs", qbTerm: "Customer Center", status: "partial", route: "/customers", apiPath: "/api/v1/customers" },
  { id: "list-items", chapter: 2, group: "Inventory", label: "Products / items", qbTerm: "Item List", status: "partial", route: "/products", apiPath: "/api/v1/products" },
  { id: "list-vendors", chapter: 2, group: "Purchases & A/P", label: "Vendors", qbTerm: "Vendor Center", status: "partial", route: "/invoices", apiPath: "/api/v1/vendors" },
  { id: "chart-of-accounts", chapter: 3, group: "Company", label: "Chart of accounts", qbTerm: "Chart of Accounts", status: "partial", route: "/ledger/accounts", apiPath: "/api/v1/accounts" },
  // Ch 3 — Financial statements
  { id: "pnl", chapter: 3, group: "Reports", label: "Profit & Loss", qbTerm: "Profit & Loss", status: "partial", route: "/books", apiPath: "/api/v1/financials/pnl" },
  { id: "balance-sheet", chapter: 3, group: "Reports", label: "Balance sheet", qbTerm: "Balance Sheet", status: "partial", route: "/books", apiPath: "/api/v1/financials/balance-sheet" },
  { id: "snapshot", chapter: 3, group: "Reports", label: "Business snapshot & insights", qbTerm: "Company Snapshot / Insights", status: "live", route: "/analytics", apiPath: "/api/v1/analytics" },
  { id: "cashflow", chapter: 3, group: "Reports", label: "Cash flow forecast + A/R aging", qbTerm: "Cash Flow / A/R Aging", status: "live", route: "/cashflow", apiPath: "/api/v1/cashflow" },
  // Ch 4 — Items
  { id: "item-reports", chapter: 4, group: "Reports", label: "Product / sales reports", qbTerm: "Item Reports", status: "partial", route: "/analytics", apiPath: "/api/v1/analytics" },
  { id: "costs-volume", chapter: 4, group: "Reports", label: "Costs & volume (cost-lowering)", qbTerm: "Item Cost / Margin", status: "live", route: "/costs", apiPath: "/api/v1/financials/costs" },
  // Ch 5-6 — Customers & sales
  { id: "invoices", chapter: 5, group: "Sales & A/R", label: "Invoices / orders", qbTerm: "Create Invoices", status: "partial", route: "/orders", apiPath: "/api/v1/orders" },
  { id: "income-tracker", chapter: 5, group: "Sales & A/R", label: "Income tracker (A/R aging)", qbTerm: "Income Tracker", status: "partial", route: "/finance", apiPath: "/api/v1/orders" },
  { id: "pipeline", chapter: 5, group: "Sales & A/R", label: "Sales pipeline / CRM", qbTerm: "Lead Center (CRM)", status: "live", route: "/pipeline", apiPath: "/api/v1/pipeline" },
  { id: "collections", chapter: 6, group: "Sales & A/R", label: "Invoicing, payments & collections", qbTerm: "Receive Payments / A/R", status: "partial", route: "/collections", apiPath: "/api/v1/collections" },
  { id: "sales-receipts", chapter: 6, group: "Sales & A/R", label: "Sales receipts", qbTerm: "Sales Receipts", status: "partial", route: "/customers", apiPath: null },
  { id: "credit-memos", chapter: 6, group: "Sales & A/R", label: "Credit memos", qbTerm: "Credit Memos", status: "planned", route: null, apiPath: null },
  { id: "customer-statements", chapter: 6, group: "Sales & A/R", label: "Customer statements (portal)", qbTerm: "Statements", status: "partial", route: "/customers", apiPath: null },
  // Ch 8 — Time savers
  { id: "calendar", chapter: 8, group: "Company", label: "Calendar", qbTerm: "QuickBooks Calendar", status: "partial", route: "/calendar", apiPath: null },
  { id: "documents", chapter: 18, group: "Company", label: "Documents & legal vault", qbTerm: "Attached Documents / e-sign", status: "live", route: "/documents", apiPath: "/api/v1/documents" },
  { id: "automation-rules", chapter: 8, group: "Company", label: "Automation rules (when/then)", qbTerm: "Reminders / Memorized", status: "live", route: "/automation", apiPath: "/api/v1/automation" },
  { id: "developer-modules", chapter: 18, group: "Company", label: "Developer modules SDK (build your own)", qbTerm: "n/a — beyond QuickBooks", status: "live", route: "/developer", apiPath: "/api/v1" },
  { id: "general-ledger", chapter: 2, group: "Company", label: "General ledger (double-entry) + journal + trial balance", qbTerm: "Chart of Accounts / Make Journal Entries", status: "partial", route: "/ledger", apiPath: "/api/v1/ledger" },
  { id: "integrations-hub", chapter: 18, group: "Company", label: "Integrations hub (Amazon, Shopify, GoDaddy, Slack, Zapier…)", qbTerm: "Apps / Connect to Apps", status: "live", route: "/integrations", apiPath: null },
  { id: "time-clock", chapter: 20, group: "Payroll & Team", label: "Time clock, timesheets & job hours → payroll", qbTerm: "QuickBooks Time (TSheets)", status: "live", route: "/timeclock", apiPath: "/api/v1/timeclock" },
  { id: "restaurant", chapter: 18, group: "Company", label: "Restaurant: reservations (AI host) + kitchen ticket board", qbTerm: "n/a — vertical add-on", status: "live", route: "/restaurant", apiPath: "/api/v1/restaurant" },
  { id: "ai-handlers", chapter: 18, group: "Company", label: "AI Handlers — describe a job, Shuug builds the worker", qbTerm: "n/a — beyond QuickBooks", status: "live", route: "/handlers", apiPath: "/api/v1/handlers" },
  { id: "assessments", chapter: 18, group: "Company", label: "Assessments & inspections (per-industry, scored)", qbTerm: "n/a — beyond QuickBooks", status: "live", route: "/assessments", apiPath: "/api/v1/assessments" },
  { id: "childcare", chapter: 18, group: "Company", label: "Childcare & classes — attendance, staff ratios, enrollment", qbTerm: "n/a — vertical add-on", status: "live", route: "/childcare", apiPath: "/api/v1/childcare" },
  { id: "state-layer", chapter: 18, group: "Company", label: "Business state layer — normalized primitives + capability surface", qbTerm: "n/a — the substrate", status: "live", route: "/platform", apiPath: "/api/v1/capabilities" },
  { id: "workspace-blueprint", chapter: 18, group: "Company", label: "My workspace — how the platform molded to your business", qbTerm: "n/a — the universal-platform view", status: "live", route: "/blueprint", apiPath: null },
  { id: "work-order-engine", chapter: 18, group: "Company", label: "Work orders — guarded state transitions, audit trail, idempotent", qbTerm: "n/a — the business engine", status: "live", route: "/workorders", apiPath: "/api/v1/workorders" },
  { id: "memorized-txns", chapter: 8, group: "Sales & A/R", label: "Recurring / reorder", qbTerm: "Memorized Transactions", status: "partial", route: "/orders", apiPath: null },
  // Ch 9 — Sales tax
  { id: "sales-tax", chapter: 9, group: "Sales Tax", label: "Sales tax", qbTerm: "Sales Tax", status: "partial", route: "/books", apiPath: "/api/v1/sales-tax" },
  // Ch 10 — Vendors & expenses
  { id: "expenses", chapter: 10, group: "Purchases & A/P", label: "Expenses & receipts", qbTerm: "Enter Bills / Write Checks", status: "live", route: "/expenses", apiPath: "/api/v1/expenses" },
  { id: "ap", chapter: 10, group: "Purchases & A/P", label: "Bills / accounts payable", qbTerm: "Accounts Payable", status: "partial", route: "/invoices", apiPath: "/api/v1/expenses" },
  // Ch 11 — Banking
  { id: "reconcile", chapter: 11, group: "Banking", label: "Bank reconciliation", qbTerm: "Reconcile", status: "planned", route: null, apiPath: null },
  { id: "bank-feeds", chapter: 11, group: "Banking", label: "Bank feeds", qbTerm: "Bank Feeds", status: "planned", route: null, apiPath: null },
  // Ch 13-15 — Payroll & time
  { id: "payroll", chapter: 13, group: "Payroll & Team", label: "Payroll (ADP)", qbTerm: "Payroll", status: "partial", route: "/team", apiPath: null },
  { id: "performance", chapter: 13, group: "Payroll & Team", label: "Performance & ROI scorecards", qbTerm: "Employee value / cost analysis", status: "live", route: "/performance", apiPath: "/api/v1/performance" },
  { id: "benchmark", chapter: 13, group: "Payroll & Team", label: "Automation audit (human vs AI)", qbTerm: "Workforce automation analysis", status: "live", route: "/benchmark", apiPath: "/api/v1/benchmark" },
  { id: "time-tracking", chapter: 14, group: "Payroll & Team", label: "Tasks / time", qbTerm: "Time Tracking", status: "partial", route: "/tasks", apiPath: "/api/v1/performance" },
  { id: "worktrack", chapter: 14, group: "Payroll & Team", label: "Work & goal tracking", qbTerm: "Productivity Reports", status: "live", route: "/worktrack", apiPath: "/api/v1/worktrack" },
  // Ch 16 — Security & multi-user
  { id: "roles", chapter: 16, group: "Company", label: "Roles & access", qbTerm: "Users / Security", status: "partial", route: "/admin", apiPath: null },
  { id: "audit", chapter: 16, group: "Company", label: "Audit log", qbTerm: "Audit Trail", status: "partial", route: null, apiPath: null },
  // Ch 17 — Reports
  { id: "reports", chapter: 17, group: "Reports", label: "Reports", qbTerm: "Report Center", status: "partial", route: "/analytics", apiPath: "/api/v1/analytics" },
  { id: "accounting-recon", chapter: 14, group: "Reports", label: "Accounting reconciliation", qbTerm: "Map to QBO / expose mismatches", status: "partial", route: "/reconcile", apiPath: "/api/v1/reconcile" },
  // Ch 18-19 — Utilities / year end
  { id: "backup", chapter: 18, group: "Company", label: "Durable data (backup)", qbTerm: "Backup / Restore", status: "partial", route: null, apiPath: null },
  { id: "year-end", chapter: 19, group: "Company", label: "Year-end close", qbTerm: "Year-End Procedures", status: "planned", route: null, apiPath: null },
  // Ch 20 — Inventory
  { id: "inventory", chapter: 20, group: "Inventory", label: "Inventory & shipping", qbTerm: "Inventory", status: "partial", route: "/operations", apiPath: "/api/v1/inventory" },
];

export const QB_GROUPS: QbGroup[] = ["Company", "Sales & A/R", "Purchases & A/P", "Banking", "Payroll & Team", "Inventory", "Reports", "Sales Tax"];

export function coverage() {
  const total = QB_FEATURES.length;
  const live = QB_FEATURES.filter((f) => f.status === "live").length;
  const partial = QB_FEATURES.filter((f) => f.status === "partial").length;
  const planned = QB_FEATURES.filter((f) => f.status === "planned").length;
  return { total, live, partial, planned, liveOrPartial: live + partial, pctReady: Math.round((live / total) * 100), manualParity: false };
}

export function featuresByGroup(group: QbGroup): QbFeature[] {
  return QB_FEATURES.filter((f) => f.group === group);
}
