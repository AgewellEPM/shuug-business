import { createHash, randomUUID } from "node:crypto";
import { restaurantState, assertReservationTable, setReservationStatus, assignReservationTable, type RestaurantState } from "./store";
import { diningCommandSchema, diningSettingsInput, reservationSaveInput, diningVisitInput, visitQuoteInput, visitStatusInput, visitTableInput, emptyDining } from "./dining-model";
import { diningTimezone, validateDiningSettings } from "./dining-availability";
import { instantsForLocal, localDateTime } from "../timeclock/zoned-time";
import { allowedOrigin } from "../getting-started/model";
import type { Reservation } from "./reservations";
export function diningState(s: RestaurantState) { return s.dining ??= emptyDining(); }
function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
export function executeDiningCommand(raw: unknown, actor: string, owner: boolean) {
  const command = diningCommandSchema.parse(raw), request = createHash("sha256").update(JSON.stringify({ command, actor })).digest("hex");
  must(command.action !== "settings.save" || owner, "Only the owner can publish reservation settings.");
  return restaurantState.change(s => {
    const d = diningState(s), previous = d.commands[command.requestId]; if (previous) { must(previous.request === request, "This request identifier was used for another action."); return previous.result; }
    let id = "", before: unknown;
    if (command.action === "settings.save") {
      const input = diningSettingsInput.parse(command.input); must(input.revision === d.settings.revision, "Reservation settings changed. Reload before saving."); validateDiningSettings(input);
      must(input.tableIds.every(id => s.tables.some(t => t.id === id)), "Choose existing restaurant tables."); before = d.settings;
      d.settings = { ...input, revision: input.revision + 1, origins: [...new Set(input.origins.map(allowedOrigin))] }; id = "settings";
    } else if (command.action === "reservation.save") {
      const input = reservationSaveInput.parse(command.input), old = s.reservations.find(r => r.id === input.id), timezone = diningTimezone(s);
      must(!input.id || old && (old.revision ?? 1) === input.revision, "This reservation changed. Reload before editing.");
      must(!old || ["requested", "confirmed"].includes(old.status), "Only upcoming reservations can be rescheduled. Manage arrivals from the floor.");
      const now = new Date().toISOString();
      if (input.walkIn) { must(!old, "Use Guest arrived for an existing reservation."); const local = localDateTime(now, timezone); input.dateISO = local.slice(0, 10); input.time = local.slice(11, 16); }
      const instant = input.walkIn ? now : instantsForLocal(`${input.dateISO}T${input.time}`, timezone)[input.occurrence === "second" ? 1 : 0]; must(instant, "This time has only one occurrence. Select the first occurrence.");
      before = old ? structuredClone(old) : undefined;
      const next: Reservation = { ...(old ?? {}), id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1, name: input.name, partySize: input.partySize, dateISO: input.dateISO, time: input.time, startAt: instant, timezone, durationMinutes: old?.durationMinutes ?? d.settings.turnMinutes + d.settings.bufferMinutes, serviceMinutes: old?.serviceMinutes ?? d.settings.turnMinutes, phone: input.phone, email: input.email, notes: input.notes, tableId: input.tableId, source: old?.source ?? (input.walkIn ? "walk_in" : "staff"), status: input.walkIn ? "waiting" : old?.status ?? "requested", createdAt: old?.createdAt ?? now, arrivedAt: input.walkIn ? now : null, seatedAt: null, completedAt: null, quotedWaitMinutes: input.quotedWaitMinutes, host: input.host };
      if (input.walkIn && !next.host) next.host = actor;
      assertReservationTable(s, next); s.reservations = [...s.reservations.filter(r => r.id !== next.id), next]; id = next.id;
    } else {
      const input = command.action === "visit.quote" ? visitQuoteInput.parse(command.input) : command.action === "visit.status" ? visitStatusInput.parse(command.input) : command.action === "visit.table" ? visitTableInput.parse(command.input) : diningVisitInput.parse(command.input);
      const r = s.reservations.find(r => r.id === input.id); must(r && (r.revision ?? 1) === input.revision, "This visit changed. Reload before continuing."); before = structuredClone(r); id = r.id;
      if (command.action === "visit.arrive") { must(["requested", "confirmed"].includes(r.status), "Only an upcoming party can arrive."); setReservationStatus(r.id, "waiting"); }
      else if (command.action === "visit.status") setReservationStatus(r.id, visitStatusInput.parse(command.input).status);
      else if (command.action === "visit.table") assignReservationTable(r.id, visitTableInput.parse(command.input).tableId);
      else { const quote = visitQuoteInput.parse(command.input); must(r.status === "waiting", "Quote a wait for a party that has arrived."); r.quotedWaitMinutes = quote.quotedWaitMinutes; r.host = quote.host; r.revision = (r.revision ?? 1) + 1; }
    }
    const result = { id }; d.audit.push({ at: new Date().toISOString(), actor, action: command.action, id, ...(before ? { before } : {}) }); d.commands[command.requestId] = { request, result }; return result;
  });
}
export function diningManagementData() {
  return restaurantState.change(s => ({ timezone: diningTimezone(s), name: s.business?.config.name ?? "Restaurant", today: localDateTime(Date.now(), diningTimezone(s)).slice(0, 10), settings: diningState(s).settings, tables: s.tables, audit: diningState(s).audit.slice(-100).reverse() }));
}
