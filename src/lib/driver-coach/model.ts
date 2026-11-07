import { z } from "zod";
import { DriverError } from "../rideshare-driver/model";

export const preferencesSchema = z.object({
  vehicleCostCentsPerMile: z.number().finite().min(0).max(10_000).optional(),
  targetHourlyCents: z.number().int().min(0).max(100_000_000).optional(),
  dailyNetCents: z.number().int().min(0).max(100_000_000).optional(),
  weeklyNetCents: z.number().int().min(0).max(100_000_000).optional(),
}).strict();
export const businessTypes = ["sole-proprietor", "single-member-llc", "partnership", "corporation", "unsure"] as const;
export const intakeSchema = z.object({
  taxYear: z.number().int().min(1900).max(9999).optional(),
  jurisdiction: z.string().trim().min(2).max(80).regex(/^[\p{L} .,'-]+$/u, "Use a state or country name, without account or taxpayer numbers.").optional(),
  businessType: z.enum(businessTypes).optional(),
}).strict();
const dateFields = { from: z.iso.date().optional(), through: z.iso.date().optional() };
const mutationId = z.uuid().transform(value => value.toLowerCase());
export const coachMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("message"), mutationId, messageId: mutationId,
    text: z.string().trim().min(1).max(2000), ...dateFields, preferences: preferencesSchema.optional() }).strict(),
  z.object({ action: z.literal("intake"), mutationId, answers: intakeSchema,
    confirmed: z.literal(true), ...dateFields }).strict(),
  z.object({ action: z.literal("preferences"), mutationId, preferences: preferencesSchema, ...dateFields }).strict(),
]);
export type CoachMutation = z.infer<typeof coachMutation>;
export type CoachPreferences = z.infer<typeof preferencesSchema>;
export type CoachIntake = z.infer<typeof intakeSchema>;
export type CoachSource = { id: string; title: string; url: string };
export type CoachMessage = { id: string; role: "user" | "assistant" | "staff"; text: string; createdAt: string;
  engine?: string; sources?: CoachSource[]; recordIds?: string[] };
export type CoachMilestone = { id: string; title: string; detail: string; status: "todo" | "done"; recordIds: string[] };
export type CoachState = { apiVersion: 1; messages: CoachMessage[]; preferences: CoachPreferences; intake: CoachIntake;
  milestones: CoachMilestone[]; engine: { mode: "record-rules"; peelAvailable: boolean; llmAvailable: false } };
export type CoachPeriod = { from: string; through: string };
export function coachPeriod(raw: { from?: unknown; through?: unknown } = {}, now = new Date()): CoachPeriod {
  const parsed = z.object(dateFields).parse(raw), today = now.toISOString().slice(0, 10);
  const through = parsed.through ?? today;
  const from = parsed.from ?? `${through.slice(0, 4)}-01-01`;
  if (from > through || (Date.parse(through) - Date.parse(from)) / 86400000 > 3660) {
    throw new DriverError(400, "Choose an ordered record period of ten years or less.");
  }
  return { from, through };
}
export const evidenceIds = (values: string[]) => [...new Set(values)].slice(0, 100);
export const coachSources = {
  gig: { id: "irs-gig-work", title: "IRS · Manage taxes for your gig work", url: "https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work" },
  records: { id: "irs-recordkeeping", title: "IRS · Recordkeeping", url: "https://www.irs.gov/businesses/small-businesses-self-employed/recordkeeping" },
  car: { id: "irs-business-car", title: "IRS · Business use of car", url: "https://www.irs.gov/taxtopics/tc510" },
  expenses: { id: "irs-publication-463", title: "IRS · Publication 463: Travel, gift and car expenses", url: "https://www.irs.gov/publications/p463" },
  estimated: { id: "irs-estimated-taxes", title: "IRS · Estimated taxes", url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes" },
} satisfies Record<string, CoachSource>;
