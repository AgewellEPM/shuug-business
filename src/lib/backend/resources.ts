import { expenseAccountingData } from "../expenses/accounting";
import { manualJournalData } from "../accounting/journal-store";
import { QBD_REQUIREMENTS, QBD_MANUAL_URL, manualCoverage } from "../quickbooks/manual";
import { inspectionWorkspace } from "../auto-repair/inspections";
import { repairWorkspace } from "../auto-repair/service";
import { vehicleRegistry } from "../vehicles/service";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";
import { loadCockpitData } from "@/lib/cockpit/data";
import { listExpenses } from "@/lib/expenses/store";
import { getInventory } from "@/lib/ops/store";
import { readFeatures } from "@/lib/features/store";
import { velocityBySku } from "@/lib/ops/velocity";
import { computePnl } from "@/lib/accounting/pnl";
import { computeBalanceSheet } from "@/lib/accounting/balance-sheet";
import { computeSalesTax } from "@/lib/accounting/sales-tax";
import { volumePlan } from "@/lib/costs/volume";
import { chartOfAccounts } from "@/lib/accounting/journal-store";
import { loadScorecards } from "@/lib/performance/load";
import { assessRole } from "@/lib/benchmark/engine";
import { BENCHMARKS } from "@/lib/benchmark/data";
import { loadWorkStatus } from "@/lib/worktrack/load";
import { loadCashFlowAsync } from "@/lib/cashflow/load";
import { loadCollections } from "@/lib/payments/load";
import { loadReconciliation } from "@/lib/reconcile/load";
import { listDeals } from "@/lib/pipeline/store";
import { pipelineSummary } from "@/lib/pipeline/model";
import { listDocs } from "@/lib/documents/store";
import { summarizeVault } from "@/lib/documents/model";
import { loadAutomation } from "@/lib/automation/load";
import { appModules } from "@/lib/sdk/registry";
import { listRecords } from "@/lib/sdk/records";
import { loadLedger } from "@/lib/accounting/ledger-load";
import { loadTimeClock } from "@/lib/timeclock/load";
import { scheduleView } from "../timeclock/schedule";
import { restaurantManagementData } from "@/lib/restaurant/management";
import { specialManagementData } from "../restaurant/special-management";
import { diningManagementData } from "../restaurant/dining";
import { loadRestaurant } from "@/lib/restaurant/load";
import { loadHandlers } from "@/lib/handlers/load";
import { loadAssessments } from "@/lib/assessments/load";
import { loadEducation } from "@/lib/education/load";
import { capabilitySurface } from "@/lib/state/capabilities";
import { listWorkOrders, listAudit } from "@/lib/state/workorder";
import { PRIMITIVES, VERTICAL_MAP } from "@/lib/state/primitives";
import { setting } from "@/lib/connections/vault";
import type { SectionKey } from "@/lib/permissions/model";
import type { Expense } from "@/lib/expenses/model";


/**
 * Unified read API: GET /api/v1/<resource> — every core feature mapped so any
 * client (or the Shopify/QuickBooks sync) can pull it. Each resource declares the
 * section a role must be able to view; unknown paths 404, unauthorized 403.
 */
type Handler = { section: SectionKey; load: () => Promise<unknown> };

function safeExpenses(): Expense[] {
  return listExpenses();
}

export function businessHandlers(): Record<string, Handler> {
  // Developer/SDK modules — each publishes /api/v1/m/<id> from its manifest.
  const moduleHandlers: Record<string, Handler> = {};
  for (const m of appModules()) {
    moduleHandlers[`m/${m.id}`] = {
      section: m.section,
      load: async () => {
        const records = listRecords(m.id);
        return {
          module: { id: m.id, label: m.label, version: m.version },
          count: records.filter((r) => !r.archived).length,
          ...(m.api ? { data: m.api(records) } : {}),
          records: records.map((r) => ({ id: r.id, values: r.values, archived: r.archived, createdAt: r.createdAt })),
        };
      },
    };
  }
  return {
    ...moduleHandlers,
    "expense-accounting": { section: "money", load: async () => expenseAccountingData() },
    "receivables": { section: "money", load: async () => loadCollections() },
    "accounting-journal": { section: "money", load: async () => manualJournalData() },
    "accounting-manual": { section: "money", load: async () => ({ source: QBD_MANUAL_URL, summary: manualCoverage(), requirements: QBD_REQUIREMENTS }) },
    "auto-repair-inspections": { section: "services", load: async () => inspectionWorkspace({ id: "backend", memberId: "owner", name: "Authenticated backend" }, true) },
    "auto-repair-pricing": { section: "services", load: async () => repairWorkspace() },
    "cockpit": { section: "home", load: async () => (await loadCockpitData()) },
    "features": { section: "admin", load: async () => ({ enabled: readFeatures().enabled }) },

    "pipeline": { section: "sales", load: async () => { const deals = listDeals(); return { deals, summary: pipelineSummary(deals) }; } },
    "documents": { section: "admin", load: async () => { const docs = listDocs(); const today = new Date().toISOString().slice(0, 10); return { documents: docs.map((d) => ({ ...d, fileDataUrl: d.fileDataUrl ? "[stored]" : null })), summary: summarizeVault(docs, today) }; } },
    "automation": { section: "admin", load: async () => { const { rules, fired, summary } = await loadAutomation(); return { rules, summary, fired: fired.map((f) => ({ ruleId: f.rule.id, name: f.rule.name, matchCount: f.matches.length, matches: f.matches })) }; } },
    "customers": { section: "sales", load: async () => {
      const store = await getDealStore();
      const { customers } = await loadAnalytics(store);
      return { customers: customers.map((c) => ({ id: c.id, company: c.company, channel: c.channel, region: c.region, accountOwner: c.accountOwner })) };
    } },
    "orders": { section: "sales", load: async () => {
      const store = await getDealStore();
      const { orders } = await loadAnalytics(store);
      return { orders: orders.map((o) => ({ id: o.id, customerId: o.customerId, status: o.status, createdAt: o.createdAt, subtotalCents: o.subtotalCents, totalCents: o.totalCents })) };
    } },
    "products": { section: "sales", load: async () => {
      const store = await getDealStore();
      const { skus } = await loadAnalytics(store);
      return { products: skus };
    } },
    "vendors": { section: "money", load: async () => {
      const vendors = [...new Set(safeExpenses().map((e) => e.fields.merchant).filter(Boolean))].map((name) => ({ name }));
      return { vendors };
    } },
    "expenses": { section: "money", load: async () => ({
      expenses: safeExpenses().map((e) => ({ id: e.id, status: e.status, merchant: e.fields.merchant, date: e.fields.date, amountCents: e.fields.amountCents, category: e.fields.category, paymentStatus: e.fields.paymentStatus })),
    }) },
    "inventory": { section: "operations", load: async () => ({ inventory: getInventory() }) },
    "accounts": { section: "money", load: async () => { const chart = chartOfAccounts(); return { chartOfAccounts: chart.accounts, audit: chart.audit }; } },
    "performance": { section: "team", load: async () => (await loadScorecards()) },
    "benchmark": { section: "team", load: async () => ({ automationCases: BENCHMARKS.map((b) => assessRole(b)) }) },
    "worktrack": { section: "team", load: async () => loadWorkStatus() },
    "timeclock": { section: "team", load: async () => { const { summary, onClock, weekStartMs } = loadTimeClock(); return { summary, onClock, weekStartMs }; } },
    "restaurant": { section: "operations", load: async () => { const r = loadRestaurant(); return { dateISO: r.dateISO, night: r.night, kitchen: r.kitchen.summary, tables: r.tables.length, operations: restaurantManagementData(false) }; } },
    "staff-schedule": { section: "team", load: async () => scheduleView(undefined, true) },
    "restaurant-specials": { section: "marketing", load: async () => specialManagementData(true) },
    "restaurant-dining": { section: "operations", load: async () => ({ ...diningManagementData(), floor: loadRestaurant() }) },
    "vehicles": { section: "services", load: async () => vehicleRegistry() },
    "restaurant-credits": { section: "money", load: async () => restaurantManagementData(true).financial!.checks },
    "restaurant-stocktakes": { section: "operations", load: async () => restaurantManagementData(false).stocktakes },
    "restaurant-accounting": { section: "money", load: async () => restaurantManagementData(true).financial },
    "handlers": { section: "admin", load: async () => { const { cards } = loadHandlers(); return { handlers: cards.map((c) => ({ id: c.handler.id, name: c.handler.name, mode: c.handler.mode, autonomyPct: c.performance.autonomyPct, received: c.performance.received, hoursSavedEstimate: c.performance.hoursSavedEstimate, readyCapabilities: c.readyCapabilities, totalCapabilities: c.totalCapabilities })) }; } },
    "assessments": { section: "operations", load: async () => { const a = loadAssessments(); return { industryId: a.industryId, totalRuns: a.totalRuns, templates: a.cards.map((c) => ({ id: c.template.id, name: c.template.name, industry: c.template.industry, runs: c.runs, passRate: c.passRate })) }; } },
    "childcare": { section: "operations", load: async () => { const e = loadEducation(); return { dateISO: e.dateISO, ratio: e.ratio, present: e.present.length, enrolled: e.students.length, classes: e.classes.map((c) => ({ id: c.cls.id, name: c.cls.name, kind: c.cls.kind, enrolled: c.enrolled, capacity: c.cls.capacity })) }; } },
    "capabilities": { section: "admin", load: async () => ({ primitives: PRIMITIVES, verticals: VERTICAL_MAP, surface: capabilitySurface() }) },
    "workorders": { section: "operations", load: async () => ({ orders: listWorkOrders().map((o) => ({ id: o.id, customer: o.customerName, service: o.service, state: o.state })), audit: listAudit().slice(0, 50) }) },

    "analytics": { section: "money", load: async () => {
      const store = await getDealStore();
      const { analytics } = await loadAnalytics(store);
      return { analytics };
    } },

    "financials/pnl": { section: "money", load: async () => {
      const store = await getDealStore();
      const { orders, skus } = await loadAnalytics(store);
      return { pnl: computePnl(orders, skus, safeExpenses()) };
    } },
    "financials/costs": { section: "money", load: async () => {
      const store = await getDealStore();
      const { orders, skus } = await loadAnalytics(store);
      const velocity = velocityBySku(orders);
      return { costs: skus.map((s) => volumePlan(s, (velocity.get(s.id) ?? 0) * 30)) };
    } },
    "financials/balance-sheet": { section: "money", load: async () => {
      const store = await getDealStore();
      const { orders, skus } = await loadAnalytics(store);
      const inv = getInventory();
      const costBySku = new Map(inv.map((i) => [i.skuId, i.mfgCostPerCaseCents]));
      const inventoryValueCents = inv.reduce((n, i) => n + i.onHandCases * i.mfgCostPerCaseCents, 0);
      const live = orders.filter((o) => o.status !== "cancelled");
      const accountsReceivableCents = live.filter((o) => o.status === "submitted").reduce((n, o) => n + o.totalCents, 0);
      const accountsPayableCents = safeExpenses().filter((e) => e.status === "recorded" && e.fields.paymentStatus === "unpaid").reduce((n, e) => n + (e.fields.amountCents ?? 0), 0);
      const pnl = computePnl(orders, skus, safeExpenses());
      const salesTax = computeSalesTax(orders, (await loadAnalytics(store)).customers, Number(setting("SALES_TAX_RATE_BPS")) || 0);
      void costBySku;
      return { balanceSheet: computeBalanceSheet({
        accountsReceivableCents, inventoryValueCents, cashCents: 0,
        accountsPayableCents, salesTaxPayableCents: salesTax.estimatedTaxCents, retainedEarningsCents: pnl.netIncomeCents,
      }) };
    } },
    "ledger": { section: "money", load: async () => { const l = await loadLedger(); return { trialBalance: l.trialBalance, incomeStatement: l.incomeStatement, balanceSheet: l.balanceSheet, entryCount: l.entries.length, autoCount: l.autoCount, manualCount: l.manualCount }; } },
    "cashflow": { section: "money", load: async () => ({ baseline: await loadCashFlowAsync(), collectionsLate2wk: await loadCashFlowAsync(Date.now(), 14) }) },
    "collections": { section: "money", load: async () => (await loadCollections()) },
    "reconcile": { section: "money", load: async () => (await loadReconciliation()) },
    "sales-tax": { section: "money", load: async () => {
      const store = await getDealStore();
      const { orders, customers } = await loadAnalytics(store);
      return { salesTax: computeSalesTax(orders, customers, Number(setting("SALES_TAX_RATE_BPS")) || 0) };
    } },
  };
}

