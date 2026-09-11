import { randomUUID } from "node:crypto";
import { restaurantDay, type RestaurantBusiness } from "./business-model";
import { serviceHoursInput, shiftReportDate } from "./report-model";

function serviceDayMinutes(b: RestaurantBusiness, date: string) {
  // Find the boundary used by restaurantDay itself, including a repeated or
  // skipped local hour. Minute resolution matches the reviewed duration input.
  const boundary = (target: string) => {
    const center = Date.parse(`${target}T12:00:00Z`) / 60000;
    let low = center - 2880, high = center + 2880;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (restaurantDay(b.config, new Date(mid * 60000)) < target) low = mid + 1; else high = mid; }
    return low;
  };
  return boundary(shiftReportDate(date, 1)) - boundary(date);
}

/** Appends measurement evidence; immutable financial closes and journals stay intact. */
export function reviewServiceHours(b: RestaurantBusiness, raw: unknown, actor: string) {
  const input = serviceHoursInput.parse(raw), close = b.closes.find(c => c.id === input.closeId);
  if (!close?.operated) throw new Error("Choose a reviewed day that was open for service.");
  if (input.openMinutes > serviceDayMinutes(b, close.date)) throw new Error("Opening time exceeds the elapsed length of this restaurant business day. Exclude overlapping services and closed breaks.");
  const history = b.serviceHours ??= [], previous = history.filter(h => h.closeId === close.id).at(-1);
  if (input.revision !== (previous?.revision ?? 0)) throw new Error("Opening time changed. Reload and review the latest evidence.");
  if (history.length >= 100000) throw new Error("The opening-time review archive is full. Export and review the deployment capacity before continuing.");
  const entry = { id: randomUUID(), closeId: close.id, revision: input.revision + 1, openMinutes: input.openMinutes, evidence: input.evidence, actor, at: new Date().toISOString() };
  history.push(entry); return entry.id;
}
