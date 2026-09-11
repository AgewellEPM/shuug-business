/**
 * Unified customer timeline — one record, every interaction. Orders, quotes,
 * payments, messages, notes, and commitments merge into a single chronological
 * stream so anyone authorized sees what was promised, who owns it, and what's
 * next. Pure merge/sort + a summary of what still needs action (open quotes,
 * unpaid invoices, messages awaiting a reply). The loader shapes each source
 * into these events.
 */
export type EventType = "order" | "quote" | "payment" | "message" | "note" | "commitment" | "document";

export interface TimelineEvent {
  id: string;
  type: EventType;
  atMs: number;
  title: string;
  detail: string;
  /** who did it / owns it (rep, sender, author). */
  actor?: string;
  /** status chip (order status, quote status, "needs reply"…). */
  status?: string;
  amountCents?: number;
  href?: string;
  /** open item needing attention (unpaid, awaiting reply, quote pending). */
  needsAction?: boolean;
}

export interface TimelineSummary {
  events: TimelineEvent[];
  totalEvents: number;
  openItems: number;
  awaitingReply: number;
  openQuotes: number;
  lastContactMs: number | null;
}

/** Merge + sort newest-first. Stable for equal timestamps (input order kept). */
export function buildTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => b.atMs - a.atMs);
}

export function summarizeTimeline(events: TimelineEvent[]): TimelineSummary {
  const sorted = buildTimeline(events);
  return {
    events: sorted,
    totalEvents: sorted.length,
    openItems: sorted.filter((e) => e.needsAction).length,
    awaitingReply: sorted.filter((e) => e.type === "message" && e.needsAction).length,
    openQuotes: sorted.filter((e) => e.type === "quote" && e.needsAction).length,
    lastContactMs: sorted.length ? Math.max(...sorted.map((e) => e.atMs)) : null,
  };
}
