"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { addReservation, setReservationStatus, assignReservationTable, addTicket, setTicketItemStatus, advanceTicket, clearServedTickets, saveRestaurantTable } from "@/lib/restaurant/store";
import { parseBookingRequest, type ParseResult } from "@/lib/restaurant/ai";
import type { ReservationStatus } from "@/lib/restaurant/reservations";
import type { TicketStatus } from "@/lib/restaurant/kitchen";

export interface ActionResult { ok: boolean; error?: string; id?: string }

export async function saveTableAction(input: { id?: string; name: string; seats: number; area: string }): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); const table = saveRestaurantTable(input); revalidatePath("/restaurant"); return { ok: true, id: table.id }; }
  catch (e) { return fail(e); }
}

const reservationSchema = z.object({
  name: z.string().trim().min(1, "Guest name required").max(120),
  partySize: z.coerce.number().int().min(1).max(50),
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  tableId: z.string().nullable().optional(),
  phone: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(500).default(""),
});

export async function addReservationAction(form: z.input<typeof reservationSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    const v = reservationSchema.parse(form);
    const r = addReservation(v);
    revalidatePath("/restaurant");
    return { ok: true, id: r.id };
  } catch (e) { return fail(e); }
}

export async function setReservationStatusAction(id: string, status: ReservationStatus): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); setReservationStatus(id, status); revalidatePath("/restaurant"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}
export async function assignTableAction(id: string, tableId: string | null): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); assignReservationTable(id, tableId); revalidatePath("/restaurant"); return { ok: true, id }; }
  catch (e) { return fail(e); }
}

const ticketSchema = z.object({
  ref: z.string().trim().min(1, "Table/order ref required").max(40),
  server: z.string().trim().max(60).default(""),
  note: z.string().trim().max(200).default(""),
  items: z.array(z.object({ name: z.string().trim().min(1), station: z.string().trim().max(40).default("Line"), qty: z.coerce.number().int().min(1).max(99).default(1) })).min(1, "Add at least one item"),
});

export async function addTicketAction(form: z.input<typeof ticketSchema>): Promise<ActionResult> {
  try {
    await requireSectionAccess("operations", "edit");
    const v = ticketSchema.parse(form);
    const t = addTicket(v);
    revalidatePath("/restaurant");
    return { ok: true, id: t.id };
  } catch (e) { return fail(e); }
}

export async function setItemStatusAction(ticketId: string, itemIndex: number, status: TicketStatus): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); setTicketItemStatus(ticketId, itemIndex, status); revalidatePath("/restaurant"); return { ok: true }; }
  catch (e) { return fail(e); }
}
export async function advanceTicketAction(ticketId: string, status: TicketStatus): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); advanceTicket(ticketId, status); revalidatePath("/restaurant"); return { ok: true }; }
  catch (e) { return fail(e); }
}
export async function clearServedAction(): Promise<ActionResult> {
  try { await requireSectionAccess("operations", "edit"); clearServedTickets(); revalidatePath("/restaurant"); return { ok: true }; }
  catch (e) { return fail(e); }
}

/** AI: turn a plain-language request into a structured booking (fail-closed). */
export async function parseBookingAction(message: string, todayISO: string): Promise<ParseResult> {
  try {
    await requireSectionAccess("operations", "edit");
    return await parseBookingRequest(message, todayISO);
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not parse." }; }
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input" : e instanceof Error ? e.message : "Something went wrong" };
}
