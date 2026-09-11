import { describe, it, expect } from "vitest";
import { overlaps, availableTables, suggestTable, summarizeNight, type Reservation, type RestaurantTable } from "./reservations";
import { ticketStatus, boardColumns, stationLoads, summarizeKitchen, type KitchenTicket } from "./kitchen";

const tables: RestaurantTable[] = [
  { id: "t2", name: "T1", seats: 2, area: "Main" },
  { id: "t4", name: "T3", seats: 4, area: "Main" },
  { id: "t6", name: "Booth", seats: 6, area: "Main" },
];
const resv = (over: Partial<Reservation>): Reservation => ({ id: Math.random().toString(36).slice(2), name: "Guest", partySize: 2, dateISO: "2026-09-11", time: "19:00", tableId: null, status: "confirmed", phone: "", notes: "", createdAt: "", ...over });

describe("reservations overlap + availability", () => {
  it("two bookings on the same table within the turn window clash", () => {
    const a = resv({ tableId: "t4", time: "19:00" });
    const b = resv({ tableId: "t4", time: "20:00" }); // 60min < 90min turn
    expect(overlaps(a, b)).toBe(true);
    const c = resv({ tableId: "t4", time: "20:30" }); // 90min — no overlap
    expect(overlaps(a, c)).toBe(false);
  });

  it("availableTables excludes held tables and too-small tables", () => {
    const existing = [resv({ tableId: "t4", time: "19:00", status: "confirmed" })];
    const free = availableTables(tables, existing, "2026-09-11", "19:30", 4);
    expect(free.map((t) => t.id)).toEqual(["t6"]); // t4 held, t2 too small
  });

  it("suggestTable picks the smallest table that fits (least wasted seats)", () => {
    const s = suggestTable(tables, [], "2026-09-11", "19:00", 3);
    expect(s?.id).toBe("t4"); // 4-top over the 6-top booth
  });

  it("cancelled bookings free the table again", () => {
    const existing = [resv({ tableId: "t4", time: "19:00", status: "cancelled" })];
    const free = availableTables(tables, existing, "2026-09-11", "19:00", 4);
    expect(free.some((t) => t.id === "t4")).toBe(true);
  });
});

describe("summarizeNight", () => {
  it("counts covers for active/completed bookings and lists upcoming", () => {
    const list = [
      resv({ dateISO: "2026-09-11", partySize: 2, status: "seated" }),
      resv({ dateISO: "2026-09-11", partySize: 4, status: "confirmed" }),
      resv({ dateISO: "2026-09-11", partySize: 5, status: "cancelled" }),
      resv({ dateISO: "2026-09-12", partySize: 9, status: "confirmed" }), // other night
    ];
    const n = summarizeNight(list, "2026-09-11");
    expect(n.covers).toBe(6);        // 2 + 4 (cancelled excluded)
    expect(n.byStatus.cancelled).toBe(1);
    expect(n.upcoming).toHaveLength(1); // the confirmed one
  });
});

describe("kitchen board", () => {
  const ticket = (statuses: ("new" | "cooking" | "ready" | "served")[], createdAtMs: number): KitchenTicket => ({
    id: Math.random().toString(36).slice(2), ref: "T3", server: "Sam", note: "", createdAtMs,
    items: statuses.map((s, i) => ({ name: `item${i}`, station: i === 0 ? "Grill" : "Fry", qty: 1, status: s })), status: "new",
  });

  it("ticket status is the least-advanced item", () => {
    expect(ticketStatus([{ name: "a", station: "G", qty: 1, status: "ready" }, { name: "b", station: "F", qty: 1, status: "cooking" }])).toBe("cooking");
    expect(ticketStatus([{ name: "a", station: "G", qty: 1, status: "served" }])).toBe("served");
  });

  it("board columns exclude served and sort oldest-first within a column", () => {
    const cols = boardColumns([ticket(["new"], 1000), ticket(["cooking", "cooking"], 500), ticket(["served"], 100)], 100000);
    expect(cols.map((c) => c.status)).toEqual(["new", "cooking", "ready"]);
    expect(cols.find((c) => c.status === "new")!.tickets).toHaveLength(1);
    expect(cols.find((c) => c.status === "cooking")!.tickets).toHaveLength(1);
  });

  it("stationLoads counts un-served items per station; summary finds the oldest", () => {
    const loads = stationLoads([ticket(["new", "cooking"], 0)]);
    expect(loads.find((l) => l.station === "Grill")?.open).toBe(1);
    const sum = summarizeKitchen([ticket(["new"], 0)], 5 * 60000);
    expect(sum.activeTickets).toBe(1);
    expect(sum.oldestMinutes).toBe(5);
  });
});
