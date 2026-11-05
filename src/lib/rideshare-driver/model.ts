import { z } from "zod";

export const driverId = z.uuid().transform(s => s.toLowerCase());
const day = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const notes = z.string().trim().max(2000);
export const classification = z.enum(["business", "personal", "unclassified"]);
export const expenseCategories = ["fuel", "maintenance", "insurance", "tolls", "parking", "supplies", "phone", "fees", "other"] as const;
const money = { amountCents: z.number().int().min(1).max(100_000_000), currency: z.literal("USD") };
const base = { id: driverId, revision: z.number().int().min(0).max(1_000_000_000), deleted: z.boolean() };
const trip = z.object({
  startedAt: instant, endedAt: instant.nullable().default(null), distanceMeters: z.number().finite().min(0).max(10_000_000),
  classification, purpose: z.string().trim().max(240), notes,
  source: z.enum(["gps", "manual"]), hasGaps: z.boolean(), sampleCount: z.number().int().min(0).max(10_000_000),
}).strict().refine(v => !v.endedAt || Date.parse(v.endedAt) >= Date.parse(v.startedAt), "Trip ends before it starts.");
const expense = z.object({ date: day, merchant: z.string().trim().min(1).max(160), category: z.enum(expenseCategories), ...money, classification, notes, receiptId: driverId.nullable().default(null) }).strict();
const income = z.object({ date: day, platform: z.enum(["uber", "lyft", "other"]), description: z.string().trim().min(1).max(160), ...money, notes }).strict();
export const driverRecord = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("trip"), body: trip }).strict(),
  z.object({ ...base, kind: z.literal("expense"), body: expense }).strict(),
  z.object({ ...base, kind: z.literal("income"), body: income }).strict(),
]);
export const driverMutation = z.object({ mutationId: driverId, record: driverRecord }).strict();
export type DriverRecord = z.infer<typeof driverRecord>;
export type DriverMutation = z.infer<typeof driverMutation>;
export class DriverError extends Error { constructor(public status: number, message: string) { super(message); } }
