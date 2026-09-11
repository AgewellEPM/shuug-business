/**
 * Gather the live business signals the automation engine reasons over, then
 * evaluate the owner's rules against them. Each source is guarded so one failing
 * loader never blanks the whole page — a missing source just contributes no
 * signals (honest: fewer signals, never fake ones).
 */
import { getDealStore } from "../data/store";
import { loadAnalytics } from "../analytics/load";
import { loadCollections } from "../payments/load";
import { listDocs } from "../documents/store";
import { daysUntil } from "../documents/model";
import { listQuotes, effectiveStatus } from "../quotes/store";
import { listRules } from "./store";
import { evaluate, summarize, type Signal, type FiredRule, type AutomationSummary, type AutomationRule } from "./model";

const DAY = 86_400_000;

export interface AutomationOverview {
  rules: AutomationRule[];
  signals: Signal[];
  fired: FiredRule[];
  summary: AutomationSummary;
}

export async function gatherSignals(nowMs = Date.now()): Promise<Signal[]> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const signals: Signal[] = [];

  // Documents nearing (or past) their renewal date.
  try {
    for (const d of listDocs()) {
      if (!d.expiresAt) continue;
      signals.push({
        kind: "document-expiring", entityId: d.id, entityLabel: d.name,
        value: daysUntil(d.expiresAt, today),
        detail: `${d.category} · expires ${d.expiresAt}`,
        href: d.linkedType === "customer" && d.linkedId ? `/customers/${d.linkedId}/timeline` : "/documents",
      });
    }
  } catch { /* documents unavailable — no signals */ }

  // Overdue invoices.
  try {
    const { statuses } = await loadCollections(today);
    for (const s of statuses) {
      if (s.status === "overdue" && s.daysOverdue > 0) {
        signals.push({
          kind: "invoice-overdue", entityId: s.invoiceId, entityLabel: s.company,
          value: s.daysOverdue, detail: `${s.daysOverdue}d overdue`, href: "/collections",
        });
      }
    }
  } catch { /* collections unavailable */ }

  // Orders + per-customer recency (large orders, dormant customers), pending quotes.
  try {
    const store = await getDealStore();
    const { customers, orders } = await loadAnalytics(store);
    const companyById = new Map(customers.map((c) => [c.id, c.company]));

    for (const o of orders) {
      signals.push({
        kind: "large-order", entityId: o.id, entityLabel: companyById.get(o.customerId) ?? o.customerId,
        value: Math.round(o.totalCents / 100), detail: `Order ${o.id}`, href: `/customers/${o.customerId}/orders`,
      });
    }

    const lastOrderMs = new Map<string, number>();
    for (const o of orders) {
      const t = Date.parse(o.createdAt);
      if (!lastOrderMs.has(o.customerId) || t > lastOrderMs.get(o.customerId)!) lastOrderMs.set(o.customerId, t);
    }
    for (const c of customers) {
      const last = lastOrderMs.get(c.id);
      if (last === undefined) continue; // never ordered — not "dormant", just new
      signals.push({
        kind: "customer-dormant", entityId: c.id, entityLabel: c.company,
        value: Math.floor((nowMs - last) / DAY), detail: `last order ${new Date(last).toISOString().slice(0, 10)}`,
        href: `/customers/${c.id}/timeline`,
      });
    }

    for (const c of customers) {
      for (const q of listQuotes(c.id)) {
        if (effectiveStatus(q, today) !== "sent") continue; // only still-open quotes
        signals.push({
          kind: "quote-pending", entityId: q.id, entityLabel: c.company,
          value: Math.floor((nowMs - Date.parse(q.createdAt)) / DAY), detail: `open quote`,
          href: `/customers/${c.id}/timeline`,
        });
      }
    }
  } catch { /* deal store unavailable */ }

  return signals;
}

export async function loadAutomation(nowMs = Date.now()): Promise<AutomationOverview> {
  const rules = listRules();
  const signals = await gatherSignals(nowMs);
  const fired = evaluate(rules, signals);
  return { rules, signals, fired, summary: summarize(rules, fired) };
}
