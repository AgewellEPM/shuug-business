/** Transactional restaurant state shared by the floor, kitchen and operations. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { persistentState } from "../workspace/state";
import { availableTables, type RestaurantTable, type Reservation, type ReservationStatus } from "./reservations";
import { ticketStatus, TICKET_STATUSES, type KitchenTicket, type TicketItem, type TicketStatus } from "./kitchen";
import type { RestaurantBusiness } from "./business-model";

export interface RestaurantState { tables: RestaurantTable[]; reservations: Reservation[]; tickets: KitchenTicket[]; archivedTickets?: KitchenTicket[]; business?: RestaurantBusiness; dining?: import("./dining-model").DiningState }
export const restaurantState = persistentState<RestaurantState>("restaurant", () => {
  try {
    const value = JSON.parse(readFileSync(path.join(dataDirectory(), "restaurant.json"), "utf8"));
    if (!value || !Array.isArray(value.tables) || !Array.isArray(value.reservations) || !Array.isArray(value.tickets)) throw new Error("Invalid legacy restaurant records.");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The existing restaurant file cannot be imported. Repair or restore it before continuing; it has not been replaced.");
    return { tables: [], reservations: [], tickets: [], archivedTickets: [] };
  }
});
const reservationInput = z.object({ name: z.string().trim().min(1).max(120), partySize: z.number().int().min(1).max(50), dateISO: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), tableId: z.uuid().nullable().optional(), phone: z.string().max(40).optional(), notes: z.string().max(500).optional() }).strict();
import { reservationTransitions } from "./transitions";
export function assertReservationTable(s: RestaurantState, r: Reservation) {
  if (r.status === "seated" && !r.tableId) throw new Error("Assign a table before seating this party.");
  if (r.status === "seated" && s.reservations.some(x => x.id !== r.id && x.tableId === r.tableId && x.status === "seated")) throw new Error("Another party is still seated at this table. Complete their visit first.");
  if (r.tableId && !availableTables(s.tables, s.reservations, r.dateISO, r.time, r.partySize, r.durationMinutes, r.id, r.timezone ?? s.business?.config.timezone, r.status === "seated" ? r.seatedAt ?? r.startAt : r.startAt).some(t => t.id === r.tableId)) throw new Error("This table is unavailable or too small for the party.");
}
export function saveRestaurantTable(raw: unknown) {
  const input = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(60), seats: z.number().int().min(1).max(50), area: z.string().trim().min(1).max(60) }).strict().parse(raw);
  return restaurantState.change(s => {
    if (input.id && !s.tables.some(t => t.id === input.id)) throw new Error("Table unavailable.");
    if (s.tables.some(t => t.id !== input.id && t.name.toLowerCase() === input.name.toLowerCase())) throw new Error("Use a unique table name.");
    if (input.id && s.reservations.some(r => r.tableId === input.id && ["requested", "confirmed", "waiting", "seated"].includes(r.status) && r.partySize > input.seats)) throw new Error("This table has a larger party assigned. Reassign their booking before reducing capacity.");
    const table: RestaurantTable = { ...input, id: input.id ?? randomUUID() }; s.tables = [...s.tables.filter(t => t.id !== table.id), table]; return table;
  });
}

// ---- Tables ----
export function listTables(): RestaurantTable[] { return restaurantState.read().tables.map((t) => ({ ...t })); }

// ---- Reservations ----
export function listReservations(): Reservation[] { return restaurantState.read().reservations.map((r) => ({ ...r })); }

export interface NewReservation { name: string; partySize: number; dateISO: string; time: string; tableId?: string | null; phone?: string; notes?: string }
export function addReservation(raw: NewReservation): Reservation {
  const input = reservationInput.parse(raw);
  return restaurantState.change(s => {
    const r: Reservation = { ...input, id: randomUUID(), name: input.name, tableId: input.tableId ?? null, status: "requested", phone: input.phone ?? "", notes: input.notes ?? "", createdAt: new Date().toISOString() };
    r.revision = 1; assertReservationTable(s, r); s.reservations.push(r); return r;
  });
}
export function setReservationStatus(id: string, status: ReservationStatus): Reservation {
  return restaurantState.change(s => {
    const r = s.reservations.find(r => r.id === id); if (!r) throw new Error("Reservation not found.");
    if (r.status === status) return r;
    if (!reservationTransitions[r.status]?.includes(status)) throw new Error("That reservation transition is not allowed.");
    if (status === "completed" && s.business?.orders.some(o => o.reservationId === r.id && !["closed", "cancelled"].includes(o.status))) throw new Error("Close or cancel this party's orders before releasing the table.");
    const next = { ...r, status };
    const at = new Date().toISOString(); if (status === "waiting") next.arrivedAt ??= at; if (status === "seated") { next.arrivedAt ??= at; next.seatedAt = at; } if (status === "completed") next.completedAt = at;
    if (["confirmed", "waiting", "seated"].includes(status)) assertReservationTable(s, next);
    Object.assign(r, next, { revision: (r.revision ?? 1) + 1 }); return r;
  });
}
export function assignReservationTable(id: string, tableId: string | null): Reservation {
  return restaurantState.change(s => {
    const r = s.reservations.find(r => r.id === id); if (!r) throw new Error("Reservation not found.");
    if (!["requested", "confirmed", "waiting", "seated"].includes(r.status)) throw new Error("This visit is closed.");
    const next = { ...r, tableId }; assertReservationTable(s, next); Object.assign(r, next, { revision: (r.revision ?? 1) + 1 }); return r;
  });
}

// ---- Kitchen tickets ----
export function listTickets(): KitchenTicket[] { return restaurantState.read().tickets.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i })) })); }

export interface NewTicket { ref: string; server?: string; note?: string; items: { name: string; station: string; qty: number; modifiers?: string[]; allergens?: string }[] }
export function addTicket(raw: NewTicket, nowMs = Date.now()): KitchenTicket {
  const input = z.object({ ref: z.string().trim().min(1).max(40), server: z.string().max(60).optional(), note: z.string().max(200).optional(), items: z.array(z.object({ name: z.string().trim().min(1).max(80), station: z.string().trim().min(1).max(40), qty: z.number().int().min(1).max(99), modifiers: z.array(z.string().max(130)).max(12).optional(), allergens: z.string().max(7000).optional() }).strict()).min(1).max(100) }).strict().parse(raw);
  return restaurantState.change(s => {
    const items: TicketItem[] = input.items.map(i => ({ ...i, status: "new" }));
    const ticket: KitchenTicket = { id: randomUUID(), ref: input.ref, server: input.server ?? "", items, status: "new", createdAtMs: nowMs, note: input.note ?? "" };
    s.tickets.push(ticket); return ticket;
  });
}
export function setTicketItemStatus(ticketId: string, itemIndex: number, status: TicketStatus): void {
  restaurantState.change(s => {
    const t = s.tickets.find(t => t.id === ticketId), item = t?.items[itemIndex]; if (!t || !item || !Number.isInteger(itemIndex)) throw new Error("Item not found.");
    if (t.kitchenReviewRequired) throw new Error("Review the online order and dietary notes before starting kitchen work.");
    if (item.status === status) return;
    if (status === "served" && s.business?.orders.some(o => o.ticketId === ticketId)) throw new Error("Mark the priced order served from Restaurant orders so sales and food costs post together.");
    if (TICKET_STATUSES.indexOf(status) !== TICKET_STATUSES.indexOf(item.status) + 1) throw new Error("Advance this item through cooking, ready and served in order.");
    item.status = status; t.status = ticketStatus(t.items);
  });
}
export function advanceTicket(ticketId: string, status: TicketStatus): void {
  restaurantState.change(s => {
    const t = s.tickets.find(t => t.id === ticketId); if (!t) throw new Error("Ticket not found.");
    if (t.kitchenReviewRequired) throw new Error("Review the online order and dietary notes before starting kitchen work.");
    const current = ticketStatus(t.items); if (current === status) return;
    if (status === "served" && s.business?.orders.some(o => o.ticketId === ticketId)) throw new Error("Mark the priced order served from Restaurant orders so sales and food costs post together.");
    if (TICKET_STATUSES.indexOf(status) !== TICKET_STATUSES.indexOf(current) + 1) throw new Error("Advance this ticket through cooking, ready and served in order.");
    for (const item of t.items) if (TICKET_STATUSES.indexOf(item.status) < TICKET_STATUSES.indexOf(status)) item.status = status;
    t.status = ticketStatus(t.items);
  });
}
export function clearServedTickets(): void {
  restaurantState.change(s => { s.archivedTickets = [...(s.archivedTickets ?? []), ...s.tickets.filter(t => ticketStatus(t.items) === "served")]; s.tickets = s.tickets.filter(t => ticketStatus(t.items) !== "served"); });
}
