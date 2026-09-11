/**
 * Handler runtime — the honest "what would this Handler actually do right now?" layer.
 * It inspects real Shuug data and surfaces concrete opportunities the handler could
 * act on (overdue invoices to remind, low stock to reorder, recent orders to answer
 * status for). Nothing external is sent here — this is the sandbox/preview that powers
 * "Test it" and "What it did today". Every source is guarded so one failure = fewer
 * opportunities, never a crash or a fabricated action.
 */
import { formatCents } from "../money";

export interface Opportunity { label: string; detail: string; href?: string }

export async function previewOpportunities(templateId: string): Promise<Opportunity[]> {
  switch (templateId) {
    case "collections": return await collections();
    case "purchasing": return await purchasing();
    case "customer-service": return await customerService();
    case "wholesale-sales": return await wholesale();
    case "appointment": return appointment();
    default: return [];
  }
}

async function collections(): Promise<Opportunity[]> {
  try {
    const { loadCollections } = await import("../payments/load");
    const { statuses } = await loadCollections();
    return statuses.filter((s) => s.status === "overdue").slice(0, 8).map((s) => ({
      label: `Remind ${s.company}`, detail: `${formatCents(s.balanceCents)} · ${s.daysOverdue}d overdue`, href: "/collections",
    }));
  } catch { return []; }
}

async function purchasing(): Promise<Opportunity[]> {
  try {
    const { getInventory } = await import("../ops/store");
    return getInventory()
      .filter((i) => typeof i.onHandCases === "number" && typeof i.reorderPointCases === "number" && i.onHandCases <= i.reorderPointCases)
      .slice(0, 8)
      .map((i) => ({ label: `Reorder ${i.skuId}`, detail: `${i.onHandCases} on hand · reorder point ${i.reorderPointCases}`, href: "/operations" }));
  } catch { return []; }
}

async function customerService(): Promise<Opportunity[]> {
  try {
    const { getDealStore } = await import("../data/store");
    const { loadAnalytics } = await import("../analytics/load");
    const store = await getDealStore();
    const { orders, customers } = await loadAnalytics(store);
    const name = new Map(customers.map((c) => [c.id, c.company]));
    return orders.filter((o) => o.status === "submitted").slice(0, 8).map((o) => ({
      label: `Answer status — ${name.get(o.customerId) ?? o.customerId}`, detail: `Order ${o.id} · ${formatCents(o.totalCents)}`, href: `/customers/${o.customerId}/orders`,
    }));
  } catch { return []; }
}

async function wholesale(): Promise<Opportunity[]> {
  try {
    const { listDeals } = await import("../pipeline/store");
    return listDeals().filter((d) => d.stage === "new" || d.stage === "qualified").slice(0, 8).map((d) => ({
      label: `Quote ${d.company || d.title}`, detail: `${d.stage} · ${formatCents(d.expectedValueCents ?? 0)}`, href: "/pipeline",
    }));
  } catch { return []; }
}

function appointment(): Opportunity[] {
  return [{ label: "Answer inbound scheduling requests", detail: "Connect Twilio (phone/SMS) to take live calls; until then, book from the calendar.", href: "/integrations" }];
}
