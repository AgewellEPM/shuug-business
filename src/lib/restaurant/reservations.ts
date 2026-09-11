/**
 * Restaurant reservations — run the floor. Pure logic for booking tables, avoiding
 * double-books, and suggesting the best-fit table for a party. Cents-free; the store
 * holds tables + bookings, the loader shapes a night. Times are "HH:MM" 24h strings.
 */
export type ReservationStatus = "requested" | "waiting" | "confirmed" | "seated" | "completed" | "cancelled" | "no-show";

export interface RestaurantTable {
  id: string;
  name: string;      // "T1", "Booth 4", "Patio 2"
  seats: number;
  area: string;      // "Main", "Patio", "Bar"
}

export interface Reservation {
  id: string;
  name: string;
  partySize: number;
  dateISO: string;   // YYYY-MM-DD
  time: string;      // HH:MM
  tableId: string | null;
  status: ReservationStatus;
  phone: string;
  notes: string;
  createdAt: string;
  revision?: number;
  startAt?: string;
  timezone?: string;
  durationMinutes?: number;
  serviceMinutes?: number;
  source?: "staff" | "website" | "walk_in";
  email?: string;
  arrivedAt?: string | null;
  seatedAt?: string | null;
  completedAt?: string | null;
  quotedWaitMinutes?: number | null;
  host?: string;
  customerChangeLeadMinutes?: number;
  customerInstructions?: string;
}

/** Minutes a table is held for one seating (turn time). */
export const DEFAULT_TURN_MINUTES = 90;

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

const ACTIVE: ReservationStatus[] = ["requested", "confirmed", "waiting", "seated"];

/** Two bookings clash if same table + date and their turn windows overlap. */
export function overlaps(a: Reservation, b: Reservation, turnMinutes = DEFAULT_TURN_MINUTES, timezone?: string): boolean {
  if (a.tableId === null || a.tableId !== b.tableId) return false;
  const as = (a.status === "seated" && a.seatedAt ? Date.parse(a.seatedAt) : reservationStart(a, timezone)) / 60000;
  const bs = (b.status === "seated" && b.seatedAt ? Date.parse(b.seatedAt) : reservationStart(b, timezone)) / 60000;
  return as < bs + (b.durationMinutes ?? turnMinutes) && bs < as + (a.durationMinutes ?? turnMinutes);
}
import { instantForLocal } from "../timeclock/zoned-time";
export function reservationStart(r: Pick<Reservation, "startAt" | "dateISO" | "time">, timezone?: string) { return r.startAt ? Date.parse(r.startAt) : timezone ? Date.parse(instantForLocal(`${r.dateISO}T${r.time}`, timezone)) : Date.parse(`${r.dateISO}T00:00:00Z`) + toMin(r.time) * 60000; }

/** Tables free at a given date/time, i.e. not held by an active booking's turn window. */
export function availableTables(tables: RestaurantTable[], reservations: Reservation[], dateISO: string, time: string, partySize: number, turnMinutes = DEFAULT_TURN_MINUTES, ignoreId?: string, timezone?: string, startAt?: string): RestaurantTable[] {
  const probe: Reservation = { id: "probe", name: "", partySize, dateISO, time, startAt, durationMinutes: turnMinutes, tableId: null, status: "confirmed", phone: "", notes: "", createdAt: "" };
  const taken = new Set(
    reservations
      .filter((r) => r.id !== ignoreId && ACTIVE.includes(r.status) && r.tableId)
      .filter((r) => overlaps({ ...probe, tableId: r.tableId }, r, DEFAULT_TURN_MINUTES, timezone))
      .map((r) => r.tableId!),
  );
  return tables.filter((t) => !taken.has(t.id) && t.seats >= partySize);
}

/** Best-fit table: the smallest free table that still seats the party (least wasted seats). */
export function suggestTable(tables: RestaurantTable[], reservations: Reservation[], dateISO: string, time: string, partySize: number, turnMinutes = DEFAULT_TURN_MINUTES, ignoreId?: string, timezone?: string, startAt?: string): RestaurantTable | null {
  const free = availableTables(tables, reservations, dateISO, time, partySize, turnMinutes, ignoreId, timezone, startAt);
  return free.sort((a, b) => a.seats - b.seats || a.name.localeCompare(b.name))[0] ?? null;
}

export interface NightSummary {
  reservations: Reservation[];
  covers: number;
  byStatus: Record<ReservationStatus, number>;
  seatedNow: number;
  upcoming: Reservation[];
}

/** Roll up one service date: total covers, status counts, who's coming up. */
export function summarizeNight(reservations: Reservation[], dateISO: string): NightSummary {
  const forDate = reservations.filter((r) => r.dateISO === dateISO).sort((a, b) => a.time.localeCompare(b.time));
  const byStatus = { requested: 0, waiting: 0, confirmed: 0, seated: 0, completed: 0, cancelled: 0, "no-show": 0 } as Record<ReservationStatus, number>;
  for (const r of forDate) byStatus[r.status]++;
  const covers = forDate.filter((r) => ACTIVE.includes(r.status) || r.status === "completed").reduce((n, r) => n + r.partySize, 0);
  return {
    reservations: forDate,
    covers,
    byStatus,
    seatedNow: byStatus.seated,
    upcoming: forDate.filter((r) => r.status === "requested" || r.status === "confirmed"),
  };
}
