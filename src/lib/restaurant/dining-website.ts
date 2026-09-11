import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { sealSecret, openSecret } from "../connections/vault";
import { restaurantState, assertReservationTable, setReservationStatus } from "./store";
import { diningState } from "./dining";
import { publicDiningInput } from "./dining-model";
import { diningSlots, diningTimezone, canCustomerChange } from "./dining-availability";
import { localDateTime } from "../timeclock/zoned-time";
import type { Reservation } from "./reservations";
function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex"), seal = (v: unknown) => Buffer.from(sealSecret(JSON.stringify(v))).toString("base64url");
function open(token: string) { must(token.length > 20 && token.length < 20000, "Use a valid reservation link."); try { return JSON.parse(openSecret(Buffer.from(token, "base64url").toString())); } catch { throw new Error("Use a valid reservation link."); } }
const searchTicket = z.object({ purpose: z.literal("dining-search"), id: z.uuid(), issued: z.number().int(), changeId: z.uuid().nullable(), revision: z.number().int().positive().nullable() }).strict();
const reviewTicket = z.object({ purpose: z.literal("dining-review"), id: z.uuid(), issued: z.number().int(), changeId: z.uuid().nullable(), revision: z.number().int().positive().nullable(), settingsRevision: z.number().int().positive(), timezone: z.string(), input: publicDiningInput }).strict();
const manageTicket = z.object({ purpose: z.literal("dining-manage"), id: z.uuid(), issued: z.number().int() }).strict();
function fresh(issued: number, minutes: number) { must(issued <= Date.now() && Date.now() - issued <= minutes * 60000, "This reservation link has expired. Start again or contact the restaurant."); }
function manage(token: string) { const ticket = manageTicket.parse(open(token)); fresh(ticket.issued, 365 * 1440); return ticket; }
export function diningPublicInfo() { return restaurantState.change(s => { const settings = diningState(s).settings; return { name: s.business?.config.name ?? "Restaurant", timezone: diningTimezone(s), enabled: settings.enabled, instructions: settings.instructions, origins: settings.origins }; }); }
export function publicDining(date?: string, partySize = 2, manageToken?: string) {
  const authority = manageToken ? manage(manageToken) : null;
  return restaurantState.change(s => {
    const d = diningState(s), timezone = diningTimezone(s), today = localDateTime(Date.now(), timezone).slice(0, 10), selectedDate = date ? z.iso.date().parse(date) : today;
    const r = authority ? s.reservations.find(r => r.id === authority.id && r.source === "website") : null; must(!authority || r && canCustomerChange(s, r), "Contact the restaurant to change this reservation.");
    return { name: s.business?.config.name ?? "Restaurant", enabled: d.settings.enabled, timezone, today, date: selectedDate, maxPartySize: d.settings.maxPartySize, horizonDays: d.settings.horizonDays, instructions: d.settings.instructions, origins: d.settings.origins, partySize, changing: Boolean(r), guest: r ? { name: r.name, phone: r.phone, email: r.email ?? "", notes: r.notes } : null,
      slots: diningSlots(s, selectedDate, partySize, r?.id).map(slot => ({ startAt: slot.startAt, serviceMinutes: slot.serviceMinutes })), proof: seal({ purpose: "dining-search", id: randomUUID(), issued: Date.now(), changeId: r?.id ?? null, revision: r?.revision ?? (r ? 1 : null) }) };
  });
}
export function reviewDining(proof: string, raw: unknown) {
  const ticket = searchTicket.parse(open(proof)); fresh(ticket.issued, 30); const input = publicDiningInput.parse(raw);
  return restaurantState.change(s => {
    const d = diningState(s), timezone = diningTimezone(s), old = ticket.changeId ? s.reservations.find(r => r.id === ticket.changeId && r.source === "website") : null;
    must(!ticket.changeId || old && (old.revision ?? 1) === ticket.revision && canCustomerChange(s, old), "This reservation changed or is too close to arrival. Contact the restaurant.");
    const date = localDateTime(input.startAt, timezone).slice(0, 10), slot = diningSlots(s, date, input.partySize, old?.id).find(slot => Date.parse(slot.startAt) === Date.parse(input.startAt)); must(slot, "That seating time is no longer available. Choose another time.");
    return { input, timezone, serviceMinutes: slot.serviceMinutes, instructions: d.settings.instructions, changeLeadMinutes: d.settings.changeLeadMinutes, changing: Boolean(old), quote: seal({ purpose: "dining-review", id: ticket.id, issued: Date.now(), changeId: ticket.changeId, revision: ticket.revision, settingsRevision: d.settings.revision, timezone, input }) };
  });
}
export function confirmDining(token: string) {
  const ticket = reviewTicket.parse(open(token)), request = hash(ticket);
  const id = restaurantState.change(s => {
    const d = diningState(s), prior = d.commands[ticket.id]; if (prior) { must(prior.request === request, "This review was already used for another reservation."); return prior.result.id; }
    fresh(ticket.issued, 15); const timezone = diningTimezone(s); must(d.settings.revision === ticket.settingsRevision && timezone === ticket.timezone, "Reservation terms changed. Review your seating time again.");
    const old = ticket.changeId ? s.reservations.find(r => r.id === ticket.changeId && r.source === "website") : null; must(!ticket.changeId || old && (old.revision ?? 1) === ticket.revision && canCustomerChange(s, old), "This reservation changed or is too close to arrival. Contact the restaurant.");
    const input = ticket.input, wall = localDateTime(input.startAt, timezone), slot = diningSlots(s, wall.slice(0, 10), input.partySize, old?.id).find(slot => Date.parse(slot.startAt) === Date.parse(input.startAt)); must(slot, "That seating time is no longer available. Your existing reservation, if any, has not changed.");
    const now = new Date().toISOString(), id = old?.id ?? randomUUID();
    const next: Reservation = { id, revision: (old?.revision ?? 0) + 1, name: input.name, partySize: input.partySize, dateISO: wall.slice(0, 10), time: wall.slice(11), startAt: slot.startAt, timezone, durationMinutes: slot.durationMinutes, serviceMinutes: slot.serviceMinutes, tableId: slot.tableIds[0], status: "confirmed", source: "website", phone: input.phone, email: input.email, notes: input.notes, createdAt: old?.createdAt ?? now, customerChangeLeadMinutes: d.settings.changeLeadMinutes, customerInstructions: d.settings.instructions, arrivedAt: null, seatedAt: null, completedAt: null, quotedWaitMinutes: null, host: "" };
    assertReservationTable(s, next); const before = old ? structuredClone(old) : undefined; s.reservations = [...s.reservations.filter(r => r.id !== id), next];
    d.audit.push({ at: now, actor: "Website guest", action: old ? "reservation.rescheduled" : "reservation.confirmed", id, ...(before ? { before } : {}) }); d.commands[ticket.id] = { request, result: { id } }; return id;
  });
  return seal({ purpose: "dining-manage", id, issued: Date.now() });
}
export function diningReceipt(token: string) {
  const ticket = manage(token);
  return restaurantState.change(s => { const r = s.reservations.find(r => r.id === ticket.id && r.source === "website"); must(r, "Reservation unavailable."); return { name: r.name, partySize: r.partySize, startAt: r.startAt!, timezone: r.timezone ?? diningTimezone(s), serviceMinutes: r.serviceMinutes ?? 90, status: r.status, canChange: canCustomerChange(s, r), changeLeadMinutes: r.customerChangeLeadMinutes ?? diningState(s).settings.changeLeadMinutes, instructions: r.customerInstructions ?? diningState(s).settings.instructions }; });
}
export function cancelDining(token: string) {
  const ticket = manage(token);
  restaurantState.change(s => { const d = diningState(s), r = s.reservations.find(r => r.id === ticket.id && r.source === "website"); must(r, "Reservation unavailable."); if (r.status === "cancelled") return; must(canCustomerChange(s, r), "Contact the restaurant to cancel this visit."); const before = structuredClone(r); setReservationStatus(r.id, "cancelled"); d.audit.push({ at: new Date().toISOString(), actor: "Website guest", action: "reservation.cancelled", id: r.id, before }); });
}
