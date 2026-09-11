/**
 * Lot / batch engine — FEFO allocation (First-Expired-First-Out), expiration
 * checks, and the recall trace that FSMA 204 exists for. Pure and deterministic.
 */
import type { Lot, TraceEvent } from "./model";

export interface LotAllocation {
  lotId: string;
  lotCode: string;
  cases: number;
  expiresOn: string;
}

export interface FefoResult {
  ok: boolean;
  allocations: LotAllocation[];
  /** cases that couldn't be covered from available lots. */
  shortfallCases: number;
}

/**
 * Allocate `cases` of a SKU from its lots, oldest-expiry-first (FEFO). Expired
 * lots are skipped by default so you never ship out-of-date product.
 */
export function allocateFefo(
  lots: Lot[],
  skuId: string,
  cases: number,
  asOf: string,
): FefoResult {
  if (!Number.isInteger(cases) || cases < 0) {
    throw new RangeError(`cases must be a non-negative integer, got ${cases}`);
  }
  const asOfDate = asOf.slice(0, 10);
  const candidates = lots
    .filter((l) => l.skuId === skuId && l.remainingCases > 0 && l.expiresOn.slice(0, 10) >= asOfDate)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));

  const allocations: LotAllocation[] = [];
  let need = cases;
  for (const lot of candidates) {
    if (need <= 0) break;
    const take = Math.min(need, lot.remainingCases);
    allocations.push({ lotId: lot.id, lotCode: lot.lotCode, cases: take, expiresOn: lot.expiresOn });
    need -= take;
  }
  return { ok: need === 0, allocations, shortfallCases: need };
}

/** Apply an allocation (decrement remaining) immutably. */
export function applyAllocation(lots: Lot[], allocations: LotAllocation[]): Lot[] {
  const byId = new Map(allocations.map((a) => [a.lotId, a.cases]));
  return lots.map((l) => (byId.has(l.id) ? { ...l, remainingCases: l.remainingCases - (byId.get(l.id) as number) } : l));
}

export interface ExpiryRow {
  lot: Lot;
  daysToExpiry: number;
  expired: boolean;
}

const DAY_MS = 86_400_000;

/** Lots sorted by soonest expiry, with days-to-expiry (negative = expired). */
export function expiryReport(lots: Lot[], asOf: string): ExpiryRow[] {
  const now = new Date(asOf.slice(0, 10)).getTime();
  return lots
    .filter((l) => l.remainingCases > 0)
    .map((l) => {
      const days = Math.round((new Date(l.expiresOn.slice(0, 10)).getTime() - now) / DAY_MS);
      return { lot: l, daysToExpiry: days, expired: days < 0 };
    })
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

export interface RecallTrace {
  lotCode: string;
  /** every event touching the lot, in date order (the FDA-facing record). */
  events: TraceEvent[];
  /** downstream: who received product from this lot (shipping events). */
  shippedTo: { customer: string; reference: string; quantityCases: number; date: string }[];
  /** upstream: input lots consumed to make this lot (from transformation events). */
  madeFromLotCodes: string[];
}

/**
 * Trace a lot both directions for a recall: every event on it, the customers it
 * shipped to (who to notify), and the input lots it was made from (where a
 * contaminated ingredient came from).
 */
export function recallTrace(lotCode: string, events: TraceEvent[]): RecallTrace {
  const onLot = events
    .filter((e) => e.lotCode === lotCode)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const shippedTo = onLot
    .filter((e) => e.type === "shipping")
    .map((e) => ({ customer: e.counterparty, reference: e.reference, quantityCases: e.quantityCases, date: e.eventDate }));

  const madeFromLotCodes = [
    ...new Set(onLot.filter((e) => e.type === "transformation").flatMap((e) => e.inputLotCodes)),
  ];

  return { lotCode, events: onLot, shippedTo, madeFromLotCodes };
}

/** Flatten events into FSMA-204-style rows for the 24-hour sortable export. */
export function toTraceabilityRows(events: TraceEvent[]): Record<string, string | number>[] {
  return events
    .slice()
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .map((e) => ({
      EventType: e.type,
      TraceabilityLotCode: e.lotCode,
      Product: e.itemDescription,
      Quantity_Cases: e.quantityCases,
      EventDate: e.eventDate.slice(0, 10),
      Location: e.location,
      Reference: e.reference,
      Counterparty: e.counterparty,
      InputLotCodes: e.inputLotCodes.join("|"),
    }));
}
