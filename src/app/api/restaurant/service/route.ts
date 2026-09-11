import { z } from "zod";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { appBaseUrl } from "@/lib/connections/vault";
import { boundedJson } from "@/lib/social/http";
import { loadRestaurant } from "@/lib/restaurant/load";
import { addReservation, saveRestaurantTable, setReservationStatus, assignReservationTable, addTicket, advanceTicket, setTicketItemStatus, clearServedTickets } from "@/lib/restaurant/store";
import type { NewReservation, NewTicket } from "@/lib/restaurant/store";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try { await requireSectionAccess("operations", "view"); } catch { return json({ error: "Restaurant access required." }, 403); }
  try { const date = new URL(request.url).searchParams.get("date"); return json(loadRestaurant(date ? z.iso.date().parse(date) : undefined)); } catch { return json({ error: "Choose a valid service date." }, 400); }
}
export async function POST(request: Request) {
  try { await requireSectionAccess("operations", "edit"); } catch { return json({ error: "Restaurant editing access required." }, 403); }
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return json({ error: "Origin not permitted." }, 403);
  try {
    const body = z.object({ action: z.enum(["table", "reservation", "reservation.status", "reservation.table", "ticket", "ticket.status", "ticket.item", "ticket.archive"]), input: z.record(z.string(), z.unknown()) }).strict().parse(await boundedJson(new Response(request.body), 30000));
    if (body.action === "table") return json({ table: saveRestaurantTable(body.input) });
    if (body.action === "reservation") return json({ reservation: addReservation(body.input as unknown as NewReservation) });
    if (body.action === "ticket") return json({ ticket: addTicket(body.input as unknown as NewTicket) });
    if (body.action === "reservation.status") { const input = z.object({ id: z.uuid(), status: z.enum(["requested", "confirmed", "waiting", "seated", "completed", "cancelled", "no-show"]) }).strict().parse(body.input); return json({ reservation: setReservationStatus(input.id, input.status) }); }
    if (body.action === "reservation.table") { const input = z.object({ id: z.uuid(), tableId: z.uuid().nullable() }).strict().parse(body.input); return json({ reservation: assignReservationTable(input.id, input.tableId) }); }
    if (body.action === "ticket.archive") { z.object({}).strict().parse(body.input); clearServedTickets(); return json({ ok: true }); }
    const input = z.object({ id: z.uuid(), status: z.enum(["new", "cooking", "ready", "served"]), index: z.number().int().min(0).max(99).optional() }).strict().parse(body.input);
    if (body.action === "ticket.item") { if (input.index === undefined) throw new Error("Choose a kitchen item."); setTicketItemStatus(input.id, input.index, input.status); } else advanceTicket(input.id, input.status);
    return json({ ok: true });
  } catch (e) { return json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not update the restaurant." }, 400); }
}
