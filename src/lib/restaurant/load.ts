/**
 * Assemble a restaurant service view: the floor + a chosen date's reservations with
 * a suggested best-fit table for anything unassigned, and the live kitchen board.
 */
import { restaurantState } from "./store";
import { summarizeNight, suggestTable, type RestaurantTable, type Reservation, type NightSummary } from "./reservations";
import { diningTimezone } from "./dining-availability";
import { localDateTime } from "../timeclock/zoned-time";
import { boardColumns, summarizeKitchen, type BoardColumn, type KitchenSummary } from "./kitchen";

export interface FloorReservation extends Reservation { suggestedTableId: string | null; suggestedTableName: string | null; carriedFromEarlierDate?: boolean }

export interface RestaurantOverview {
  dateISO: string;
  timezone: string;
  observedAt: number;
  tables: RestaurantTable[];
  night: NightSummary;
  reservations: FloorReservation[];
  kitchen: { columns: BoardColumn[]; summary: KitchenSummary };
}

export function loadRestaurant(dateISO?: string, nowMs = Date.now()): RestaurantOverview {
  const state = restaurantState.read(), timezone = diningTimezone(state);
  const date = dateISO ?? localDateTime(nowMs, timezone).slice(0, 10);
  const tables = state.tables;
  const allReservations = state.reservations;
  const night = summarizeNight(allReservations, date);

  const today = localDateTime(nowMs, timezone).slice(0, 10);
  const carryovers = date === today ? allReservations.filter(r => r.dateISO < date && ["waiting", "seated"].includes(r.status)) : [];
  const reservations: FloorReservation[] = [...night.reservations, ...carryovers].map((r) => {
    const carriedFromEarlierDate = r.dateISO !== date;
    if (r.tableId) return { ...r, carriedFromEarlierDate, suggestedTableId: null, suggestedTableName: null };
    const s = suggestTable(tables, allReservations, r.dateISO, r.time, r.partySize, r.durationMinutes, r.id, timezone, r.startAt);
    return { ...r, carriedFromEarlierDate, suggestedTableId: s?.id ?? null, suggestedTableName: s?.name ?? null };
  });

  const tickets = state.tickets;
  return {
    dateISO: date, timezone, observedAt: nowMs,
    tables,
    night,
    reservations,
    kitchen: { columns: boardColumns(tickets, nowMs), summary: summarizeKitchen(tickets, nowMs) },
  };
}
