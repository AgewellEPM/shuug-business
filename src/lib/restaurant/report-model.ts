import { z } from "zod";

export const reportQuery = z.object({
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  basis: z.enum(["open_hour", "open_day"]).default("open_hour"),
}).strict().superRefine((v, ctx) => {
  if (!!v.from !== !!v.to) ctx.addIssue({ code: "custom", message: "Choose both the first and last business date." });
  if (v.from && v.to && (v.from > v.to || dayNumber(v.to) - dayNumber(v.from) > 365)) ctx.addIssue({ code: "custom", message: "Choose an ordered date range of at most 366 days." });
});
export type ReportQuery = z.input<typeof reportQuery>;
export function dayNumber(date: string) { return Date.parse(`${date}T12:00:00Z`) / 86_400_000; }
export function shiftReportDate(date: string, days: number) { return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10); }
export function reportRequestQuery(url?: string) {
  const params = new URL(url ?? "http://localhost").searchParams;
  for (const key of ["from", "to", "basis"]) if (params.getAll(key).length > 1) throw new Error("Use one value for each report filter.");
  return reportQuery.parse({ ...(params.get("from") ? { from: params.get("from") } : {}), ...(params.get("to") ? { to: params.get("to") } : {}), ...(params.get("basis") ? { basis: params.get("basis") } : {}) });
}
export function reportPageQuery(values: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "basis"]) for (const value of [values[key]].flat()) if (value) params.append(key, value);
  return reportRequestQuery(`http://localhost/?${params}`);
}
export const openMinutesInput = z.number().int().min(1).max(1500);
export const serviceHoursInput = z.object({ closeId: z.uuid(), revision: z.number().int().min(0), openMinutes: openMinutesInput, evidence: z.string().trim().min(3).max(1000), reviewed: z.literal(true) }).strict();
export interface ServiceHoursReview { id: string; closeId: string; revision: number; openMinutes: number; evidence: string; actor: string; at: string }
