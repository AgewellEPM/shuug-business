/**
 * Kitchen display / ticket board — run the line. A ticket is an order routed to
 * stations (grill, fry, salad, pass…); items advance new → cooking → ready → served.
 * Pure grouping + timing so the kitchen board is a live Kanban. Cents-free.
 */
export type TicketStatus = "new" | "cooking" | "ready" | "served";

export interface TicketItem { modifiers?: string[]; allergens?: string; name: string; station: string; qty: number; status: TicketStatus }

export interface KitchenTicket {
  id: string;
  /** Priced restaurant check; serving must post through the order workflow. */
  orderId?: string;
  kitchenReviewRequired?: boolean;
  /** table name or order ref this ticket is for. */
  ref: string;
  server: string;
  items: TicketItem[];
  status: TicketStatus;
  createdAtMs: number;
  note: string;
}

export const TICKET_STATUSES: TicketStatus[] = ["new", "cooking", "ready", "served"];

/** A ticket's status is the least-advanced of its items (all served → served). */
export function ticketStatus(items: TicketItem[]): TicketStatus {
  if (items.length === 0) return "new";
  const rank = { new: 0, cooking: 1, ready: 2, served: 3 };
  return TICKET_STATUSES[Math.min(...items.map((i) => rank[i.status]))];
}

/** Minutes since fired — for the "how long has this been up" color on the rail. */
export function ticketAgeMinutes(ticket: KitchenTicket, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - ticket.createdAtMs) / 60000));
}

export interface BoardColumn { status: TicketStatus; tickets: KitchenTicket[] }

/** Kanban columns for the kitchen board, excluding served (cleared off the line). */
export function boardColumns(tickets: KitchenTicket[], nowMs: number): BoardColumn[] {
  const live = tickets.map((t) => ({ ...t, status: ticketStatus(t.items) }));
  return (["new", "cooking", "ready"] as TicketStatus[]).map((status) => ({
    status,
    tickets: live.filter((t) => t.status === status).sort((a, b) => ticketAgeMinutes(b, nowMs) - ticketAgeMinutes(a, nowMs)),
  }));
}

export interface StationLoad { station: string; open: number }

/** How many un-served items each station is carrying — where's the bottleneck. */
export function stationLoads(tickets: KitchenTicket[]): StationLoad[] {
  const loads = new Map<string, number>();
  for (const t of tickets) for (const i of t.items) {
    if (i.status === "served") continue;
    loads.set(i.station, (loads.get(i.station) ?? 0) + i.qty);
  }
  return [...loads.entries()].map(([station, open]) => ({ station, open })).sort((a, b) => b.open - a.open);
}

export interface KitchenSummary {
  activeTickets: number;
  oldestMinutes: number;
  stationLoads: StationLoad[];
}

export function summarizeKitchen(tickets: KitchenTicket[], nowMs: number): KitchenSummary {
  const active = tickets.filter((t) => ticketStatus(t.items) !== "served");
  return {
    activeTickets: active.length,
    oldestMinutes: active.reduce((max, t) => Math.max(max, ticketAgeMinutes(t, nowMs)), 0),
    stationLoads: stationLoads(tickets),
  };
}
