import { z } from "zod";

export const driverId = z.uuid().transform(s => s.toLowerCase());
const day = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const notes = z.string().trim().max(2000);
export const classification = z.enum(["business", "personal", "unclassified"]);
export const expenseCategories = ["fuel", "ev_charging", "repairs", "maintenance", "tires", "cleaning", "insurance", "registration", "rental", "lease", "interest", "tolls", "parking", "meals", "lodging", "amenities", "supplies", "phone", "fees", "subscriptions", "training", "professional", "other"] as const;
export const expenseCategoryLabels: Record<typeof expenseCategories[number], string> = {
  fuel: "Fuel", ev_charging: "EV charging", repairs: "Vehicle repairs", maintenance: "Maintenance & oil", tires: "Tires", cleaning: "Car wash & cleaning", insurance: "Vehicle insurance", registration: "Registration & inspections", rental: "Vehicle rental", lease: "Vehicle lease", interest: "Vehicle interest", tolls: "Tolls", parking: "Parking", meals: "Meals & food", lodging: "Lodging", amenities: "Rider snacks & amenities", supplies: "Supplies & equipment", phone: "Phone & data", fees: "Platform & payment fees", subscriptions: "Apps & subscriptions", training: "Training & licenses", professional: "Tax & professional fees", other: "Other",
};
const money = { amountCents: z.number().int().min(1).max(100_000_000), currency: z.literal("USD") };
const base = { id: driverId, revision: z.number().int().min(0).max(1_000_000_000), deleted: z.boolean() };
const trip = z.object({
  startedAt: instant, endedAt: instant.nullable().default(null), distanceMeters: z.number().finite().min(0).max(10_000_000),
  localDate: day.optional(), timeZoneId: z.string().min(1).max(100).optional(),
  classification, purpose: z.string().trim().max(240), notes,
  source: z.enum(["gps", "manual"]), hasGaps: z.boolean(), sampleCount: z.number().int().min(0).max(10_000_000),
}).strict().refine(v => !v.endedAt || Date.parse(v.endedAt) >= Date.parse(v.startedAt), "Trip ends before it starts.");
const expense = z.object({
  date: day, merchant: z.string().trim().min(1).max(160), category: z.enum(expenseCategories), ...money, classification, notes, receiptId: driverId.nullable().default(null),
  businessPurpose: z.string().trim().max(500).optional(), businessUsePercent: z.number().int().min(0).max(100).optional(),
  mealContext: z.string().trim().max(500).optional(), vehicle: z.string().trim().max(80).optional(),
  odometerMiles: z.number().finite().min(0).max(2_000_000).optional(), paymentMethod: z.enum(["cash", "card", "bank", "platform", "other"]).optional(), place: z.string().trim().max(240).optional(),
}).strict();
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
