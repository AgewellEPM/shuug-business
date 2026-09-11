/**
 * Assemble a customer's unified timeline from every source. Returns the merged
 * event stream plus the raw comms + quotes so the page can render interactive
 * panels (assign owner, mark replied, accept quote) alongside the history.
 */
import { getDealStore } from "../data/store";
import { listComms, type Comm } from "../comms/store";
import { listQuotes, effectiveStatus, isOpen, type Quote } from "../quotes/store";
import { listTeam } from "../team/store";
import { listDocs } from "../documents/store";
import { expiryStatus, daysUntil, DOC_CATEGORIES, type DocRecord } from "../documents/model";
import { formatCents } from "../money";
import { summarizeTimeline, type TimelineEvent, type TimelineSummary } from "./engine";

export interface CustomerTimeline {
  summary: TimelineSummary;
  comms: Comm[];
  quotes: Quote[];
  docs: DocRecord[];
}

const CATEGORY_LABEL = new Map(DOC_CATEGORIES.map((c) => [c.key, c.label]));

export async function loadCustomerTimeline(customerId: string, nowMs = Date.now()): Promise<CustomerTimeline> {
  const store = await getDealStore();
  const orders = await store.listOrders(customerId);
  const comms = listComms(customerId);
  const quotes = listQuotes(customerId);
  const docs = listDocs().filter((d) => d.linkedType === "customer" && d.linkedId === customerId);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const teamName = new Map(listTeam().map((m) => [m.id, m.name]));

  const events: TimelineEvent[] = [];

  for (const o of orders) {
    events.push({
      id: `order-${o.id}`, type: "order", atMs: Date.parse(o.createdAt),
      title: `Order ${o.id}`, detail: `${o.lines.length} line${o.lines.length === 1 ? "" : "s"} · ${formatCents(o.totalCents)}`,
      status: o.status === "submitted" ? "to fulfill" : o.status, amountCents: o.totalCents,
      href: `/customers/${customerId}/orders`, needsAction: o.status === "submitted",
    });
  }

  for (const q of quotes) {
    const st = effectiveStatus(q, today);
    events.push({
      id: `quote-${q.id}`, type: "quote", atMs: Date.parse(q.createdAt),
      title: `Quote · ${formatCents(q.subtotalCents)}`, detail: q.note || `${q.lines.length} product${q.lines.length === 1 ? "" : "s"}`,
      status: st, amountCents: q.subtotalCents, needsAction: isOpen(q, today),
    });
  }

  for (const c of comms) {
    events.push({
      id: `comm-${c.id}`, type: "message", atMs: Date.parse(c.at),
      title: `${c.channel === "call" ? "Call" : c.channel === "note" ? "Note" : "Message"}: ${c.subject}`,
      detail: c.body, actor: c.ownerId ? teamName.get(c.ownerId) ?? c.ownerId : "Unassigned",
      status: c.replied ? "replied" : c.direction === "in" ? "needs reply" : "sent",
      needsAction: c.direction === "in" && !c.replied,
    });
  }

  for (const d of docs) {
    const status = expiryStatus(d.expiresAt, today);
    const expiryNote = d.expiresAt
      ? status === "expired" ? `expired ${d.expiresAt}` : `renews in ${daysUntil(d.expiresAt, today)}d (${d.expiresAt})`
      : "no expiry";
    events.push({
      id: `doc-${d.id}`, type: "document", atMs: Date.parse(d.createdAt),
      title: `${CATEGORY_LABEL.get(d.category) ?? "Document"}: ${d.name}`,
      detail: `${d.issuer ? `${d.issuer} · ` : ""}${expiryNote}`,
      status: d.signature === "signed" ? "signed" : d.signature === "sent" ? "awaiting signature" : status === "expired" ? "expired" : status === "expiring" ? "renew soon" : undefined,
      href: `/customers/${customerId}/timeline`,
      needsAction: status === "expired" || status === "expiring" || d.signature === "sent",
    });
  }

  return { summary: summarizeTimeline(events), comms, quotes, docs };
}
