/**
 * Multi-view boards (the core monday.com primitive): one dataset, many views.
 * Pure grouping helpers so any module's records can be shown as a Table, a Board
 * (Kanban grouped by a choice field), or a Calendar (grouped by a date field).
 * No React here — the component renders whatever these return.
 */
import type { Field } from "../features/model";
import type { ModuleRecord } from "./types";

export type ViewKind = "table" | "board" | "calendar";

/** Which views a module can offer, given its fields. Table is always available. */
export function availableViews(fields: Field[]): ViewKind[] {
  const views: ViewKind[] = ["table"];
  if (fields.some((f) => f.type === "select")) views.push("board");
  if (fields.some((f) => f.type === "date")) views.push("calendar");
  return views;
}

/** The first select field (board grouping) / first date field (calendar grouping). */
export function boardField(fields: Field[]): Field | null {
  return fields.find((f) => f.type === "select") ?? null;
}
export function dateField(fields: Field[]): Field | null {
  return fields.find((f) => f.type === "date") ?? null;
}

export interface Group<T> { key: string; label: string; records: T[] }

/**
 * Group records into Kanban columns by a select field, in the field's option order,
 * with a trailing "—" column for records that have no value. Preserves record order.
 */
export function groupByChoice(records: ModuleRecord[], field: Field): Group<ModuleRecord>[] {
  const columns = new Map<string, ModuleRecord[]>();
  for (const opt of field.options) columns.set(opt, []);
  columns.set("", []); // unset bucket
  for (const r of records) {
    const v = r.values[field.id];
    const key = typeof v === "string" && field.options.includes(v) ? v : "";
    columns.get(key)!.push(r);
  }
  return [...columns.entries()]
    .filter(([key, recs]) => key !== "" || recs.length > 0)
    .map(([key, recs]) => ({ key, label: key || "No status", records: recs }));
}

/**
 * Group records into calendar buckets by a date field (YYYY-MM), newest month first.
 * Records with no/invalid date go to an "Undated" bucket shown last.
 */
export function groupByMonth(records: ModuleRecord[], field: Field): Group<ModuleRecord>[] {
  const buckets = new Map<string, ModuleRecord[]>();
  for (const r of records) {
    const v = r.values[field.id];
    const iso = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    const key = iso ? iso.slice(0, 7) : "undated";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  const dated = [...buckets.entries()].filter(([k]) => k !== "undated").sort((a, b) => b[0].localeCompare(a[0]));
  const out: Group<ModuleRecord>[] = dated.map(([key, recs]) => ({
    key, label: monthLabel(key), records: recs.slice().sort((a, b) => String(a.values[field.id]).localeCompare(String(b.values[field.id]))),
  }));
  if (buckets.has("undated")) out.push({ key: "undated", label: "Undated", records: buckets.get("undated")! });
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${y}` : ym;
}
