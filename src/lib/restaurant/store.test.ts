// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { addReservation, saveRestaurantTable, listTables, setReservationStatus, assignReservationTable, addTicket, advanceTicket, setTicketItemStatus, listTickets, clearServedTickets, restaurantState } from "./store";
let dir: string;
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-restaurant-store-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const table = () => saveRestaurantTable({ name: "T1", seats: 4, area: "Main" });
const booking = (tableId: string | null, time = "19:00", dateISO = "2026-09-11") => addReservation({ name: "Guest", partySize: 4, dateISO, time, tableId });
it("starts with the owner's real floor and rejects invalid date, time and capacity", () => {
  expect(listTables()).toEqual([]); const t = table(); expect(() => saveRestaurantTable({ name: "T1", seats: 4, area: "Other" })).toThrow("unique");
  expect(() => booking(t.id, "25:00")).toThrow(); expect(() => booking(t.id, "19:00", "2026-02-30")).toThrow();
  expect(() => addReservation({ name: "Large party", partySize: 5, dateISO: "2026-09-11", time: "19:00", tableId: t.id })).toThrow("too small");
});
it("checks booking and reassignment conflicts inside the durable write transaction", () => {
  const t = table(), a = booking(t.id); expect(() => booking(t.id, "20:00")).toThrow("unavailable");
  const b = booking(null, "20:00"); expect(() => assignReservationTable(b.id, t.id)).toThrow("unavailable");
  expect(() => saveRestaurantTable({ ...t, seats: 2 })).toThrow("larger party"); setReservationStatus(a.id, "cancelled"); expect(assignReservationTable(b.id, t.id).tableId).toBe(t.id);
});
it("blocks cross-midnight overlap and a second party on a still-occupied table", () => {
  const t = table(), a = booking(t.id, "23:30"); expect(() => booking(t.id, "00:15", "2026-09-12")).toThrow("unavailable");
  setReservationStatus(a.id, "seated"); const b = booking(t.id, "01:00", "2026-09-12"); expect(() => setReservationStatus(b.id, "seated")).toThrow("still seated"); setReservationStatus(a.id, "completed"); expect(setReservationStatus(b.id, "seated").status).toBe("seated");
});
it("runs the in-person waitlist through assignment, seating and completed service", () => {
  const t = table(), r = booking(null); setReservationStatus(r.id, "waiting"); expect(() => setReservationStatus(r.id, "seated")).toThrow("Assign a table"); assignReservationTable(r.id, t.id); setReservationStatus(r.id, "seated"); setReservationStatus(r.id, "completed"); expect(() => setReservationStatus(r.id, "confirmed")).toThrow("not allowed");
});
it("prevents kitchen skips and regressions and keeps cleared tickets in history", () => {
  const t = addTicket({ ref: "T1", items: [{ name: "Soup", station: "Line", qty: 2 }, { name: "Salad", station: "Cold", qty: 1 }] });
  expect(() => advanceTicket(t.id, "served")).toThrow("in order"); setTicketItemStatus(t.id, 0, "cooking"); setTicketItemStatus(t.id, 0, "ready"); advanceTicket(t.id, "cooking"); expect(listTickets()[0].items[0].status).toBe("ready"); advanceTicket(t.id, "ready"); advanceTicket(t.id, "served"); clearServedTickets(); expect(listTickets()).toEqual([]); expect(restaurantState.read().archivedTickets?.[0].id).toBe(t.id);
});
it("imports legacy data once and refuses to silently replace a malformed file", () => {
  writeFileSync(`${dir}/restaurant.json`, "broken"); expect(() => listTables()).toThrow("cannot be imported"); expect(readFileSync(`${dir}/restaurant.json`, "utf8")).toBe("broken");
  writeFileSync(`${dir}/restaurant.json`, JSON.stringify({ tables: [], reservations: [], tickets: [] })); table(); writeFileSync(`${dir}/restaurant.json`, "broken later"); expect(listTables()).toHaveLength(1);
});
