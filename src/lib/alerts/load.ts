/**
 * Gather live signals from every module and build the ranked alert list for the
 * command center. Async because it reads the deal store for sales velocity.
 */
import { getDealStore } from "../data/store";
import { SKUS } from "../data/seed";
import { getInventory, listLots, listSupplierInvoices, listSampleRequests, listCcpChecks } from "../ops/store";
import { buildReorderPlan } from "../ops/inventory";
import { expiryReport } from "../ops/lots";
import { auditInvoices } from "../ops/invoice-audit";
import { haccpSummary } from "../ops/compliance";
import { velocityBySku } from "../ops/velocity";
import { listTasks } from "../tasks/store";
import { listTeam } from "../team/store";
import { listEmails } from "../email/store";
import { buildAlerts, alertCounts, type Alert, type AlertSeverity } from "./engine";

export interface AlertBundle {
  alerts: Alert[];
  counts: Record<AlertSeverity, number>;
}

export async function loadAlerts(): Promise<AlertBundle> {
  const store = await getDealStore();
  const customers = await store.listCustomers();
  const orderLists = await Promise.all(customers.map((c) => store.listOrders(c.id)));
  const velocity = velocityBySku(orderLists.flat());

  const nameById = new Map(SKUS.map((s) => [s.id, s.name]));
  const today = new Date().toISOString().slice(0, 10);

  const reorder = buildReorderPlan(getInventory(), velocity).rows
    .filter((r) => r.belowReorderPoint)
    .map((r) => ({ skuId: r.skuId, name: nameById.get(r.skuId) ?? r.skuId, onHandCases: r.onHandCases, reorderPointCases: r.reorderPointCases }));

  const expiringLots = expiryReport(listLots(), today)
    .filter((r) => r.expired || r.daysToExpiry < 90)
    .map((r) => ({ lotCode: r.lot.lotCode, name: nameById.get(r.lot.skuId) ?? r.lot.skuId, daysToExpiry: r.daysToExpiry, expired: r.expired }));

  const teamName = new Map(listTeam().map((m) => [m.id, m.name]));
  const overdueTasks = listTasks()
    .filter((t) => t.dueDate && t.dueDate < today && t.status !== "done")
    .map((t) => ({ id: t.id, title: t.title, assignee: t.assigneeId ? teamName.get(t.assigneeId) ?? t.assigneeId : "Unassigned", dueDate: t.dueDate as string }));

  const pendingSamples = listSampleRequests().filter((s) => s.status === "pending").length;

  const heldInvoices = auditInvoices(listSupplierInvoices()).invoices
    .filter((i) => i.status === "held")
    .map((i) => ({ vendor: i.vendor, invoiceNumber: i.invoiceNumber, atRiskCents: i.atRiskCents }));

  const unroutedEmails = listEmails()
    .filter((e) => e.status === "new" && !e.autoHandle)
    .map((e) => ({ subject: e.subject, category: e.category }));

  const failingCcp = haccpSummary(listCcpChecks()).failing.map((c) => ({ ccp: c.ccp, lotCode: c.lotCode }));

  const alerts = buildAlerts({ reorder, expiringLots, overdueTasks, pendingSamples, heldInvoices, unroutedEmails, failingCcp });
  return { alerts, counts: alertCounts(alerts) };
}
