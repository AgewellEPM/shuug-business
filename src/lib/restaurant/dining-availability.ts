import { z } from "zod";
import type { RestaurantState } from "./store";
import { availableTables, reservationStart, type Reservation } from "./reservations";
import { emptyDining, type DiningSettings } from "./dining-model";
import { instantsForLocal, localDateTime } from "../timeclock/zoned-time";
const dayMs = 86400000;
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function dateAfter(date: string, days: number) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * dayMs).toISOString().slice(0, 10); }
export function diningTimezone(s: RestaurantState) { return s.business?.config.timezone ?? "UTC"; }
export function validateDiningSettings(settings: DiningSettings) {
  if (new Set(settings.tableIds).size !== settings.tableIds.length || new Set(settings.exceptions.map(e => e.date)).size !== settings.exceptions.length) throw new Error("Choose each table and exception date once.");
  const windows = [...settings.weekly, ...settings.exceptions.flatMap(e => e.windows)];
  for (const window of windows) { const duration = minutes(window.end) + (window.overnight ? 1440 : 0) - minutes(window.start); if (duration <= 0 || duration > 1440 || duration < settings.turnMinutes + settings.bufferMinutes) throw new Error("Each service window must fit a seating and cleanup buffer and last no more than 24 hours."); }
  for (const group of [...[0, 1, 2, 3, 4, 5, 6].map(day => settings.weekly.filter(w => w.weekday === day)), ...settings.exceptions.map(e => e.windows)]) {
    const weekly = group.map(w => ({ start: minutes(w.start), end: minutes(w.end) + (w.overnight ? 1440 : 0) }));
    if (weekly.some((w, i) => weekly.some((v, j) => i !== j && w.start < v.end && v.start < w.end))) throw new Error("Combine overlapping service windows on the same day.");
  }
  if (settings.enabled && (!settings.tableIds.length || !settings.weekly.length && !settings.exceptions.some(e => e.windows.length))) throw new Error("Choose bookable tables and publish opening hours before enabling reservations.");
}
export function diningSlots(s: RestaurantState, date: string, partySize: number, ignoreId?: string, now = Date.now()) {
  z.iso.date().parse(date); z.number().int().min(1).max(50).parse(partySize);
  const cfg = s.dining?.settings ?? emptyDining().settings, timezone = diningTimezone(s), today = localDateTime(now, timezone).slice(0, 10);
  if (!cfg.enabled || partySize > cfg.maxPartySize || date < today || date > dateAfter(today, cfg.horizonDays)) return [];
  if (cfg.exceptions.some(e => e.date === date && !e.windows.length)) return [];
  const tablePool = s.tables.filter(t => cfg.tableIds.includes(t.id)), found = new Map<string, { startAt: string; dateISO: string; time: string; serviceMinutes: number; durationMinutes: number; tableIds: string[] }>();
  for (const anchor of [dateAfter(date, -1), date]) {
    const exception = cfg.exceptions.find(e => e.date === anchor), weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay(), windows = exception ? exception.windows : cfg.weekly.filter(w => w.weekday === weekday);
    for (const window of windows) {
      const begin = minutes(window.start), end = minutes(window.end) + (window.overnight ? 1440 : 0), duration = cfg.turnMinutes + cfg.bufferMinutes;
      const wallAt = (minute: number) => `${dateAfter(anchor, Math.floor(minute / 1440))}T${String(Math.floor(minute % 1440 / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      let close: number; try { close = Math.max(...instantsForLocal(wallAt(end), timezone).map(Date.parse)); } catch { continue; }
      for (let minute = begin; minute + duration <= end; minute += Number(cfg.intervalMinutes)) {
        const wall = wallAt(minute); if (!wall.startsWith(date)) continue;
        let instants: string[]; try { instants = instantsForLocal(wall, timezone); } catch { continue; }
        for (const startAt of instants) {
          const start = Date.parse(startAt); if (start < now + cfg.leadMinutes * 60000 || start + duration * 60000 > close) continue;
          const covers = s.reservations.filter(r => r.id !== ignoreId && !["cancelled", "no-show"].includes(r.status) && Math.abs(reservationStart(r, timezone) - start) < Number(cfg.intervalMinutes) * 60000).reduce((sum, r) => sum + r.partySize, 0);
          if (covers + partySize > cfg.maxArrivingCovers) continue;
          const tables = availableTables(tablePool, s.reservations, date, wall.slice(11), partySize, duration, ignoreId, timezone, startAt).sort((a, b) => a.seats - b.seats || a.name.localeCompare(b.name));
          if (tables.length) found.set(startAt, { startAt, dateISO: date, time: wall.slice(11), serviceMinutes: cfg.turnMinutes, durationMinutes: duration, tableIds: tables.map(t => t.id) });
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}
export function canCustomerChange(s: RestaurantState, r: Reservation, now = Date.now()) { return ["requested", "confirmed"].includes(r.status) && reservationStart(r, diningTimezone(s)) >= now + (r.customerChangeLeadMinutes ?? s.dining?.settings.changeLeadMinutes ?? 60) * 60000; }
