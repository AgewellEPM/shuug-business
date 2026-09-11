import { z } from "zod";
const cents = z.number().int().min(0).max(99_999_999), category = z.string().trim().min(1).max(60);
export const pricingDefinition = z.object({
  name: z.string().trim().min(1).max(100), version: z.number().int().min(1).max(100000), currency: z.enum(["USD", "CAD", "EUR", "GBP", "AUD", "NZD"]), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullable(),
  labor: z.array(z.object({ category, hourlyRate: cents.positive(), minimumMinutes: z.number().int().min(0).max(1440), incrementMinutes: z.number().int().min(1).max(60) }).strict()).max(30),
  parts: z.array(z.object({ category, bands: z.array(z.object({ fromCost: cents, untilCost: cents.positive().nullable(), markupBasisPoints: z.number().int().min(0).max(100000) }).strict()).min(1).max(15) }).strict()).max(30),
}).strict();
export type PricingDefinition = z.infer<typeof pricingDefinition>;
export interface PricingBook { id: string; revision: number; status: "draft" | "published" | "retired"; shareInTemplates: boolean; definition: PricingDefinition; createdAt: string; publishedAt: string | null; publishedBy: string | null; review: string; imported: boolean }
export const bookSaveInput = z.object({ requestId: z.uuid(), id: z.uuid().optional(), revision: z.number().int().positive().optional(), definition: pricingDefinition, shareInTemplates: z.boolean() }).strict();
export const bookVersionInput = z.object({ requestId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() }).strict();
export const bookShareInput = bookVersionInput.extend({ shareInTemplates: z.boolean() }).strict();
export const bookPublishInput = bookVersionInput.extend({ reviewed: z.literal(true), review: z.string().trim().min(5).max(500) }).strict();
export const estimateInput = z.object({
  inspectionId: z.uuid().optional(), bookId: z.uuid(), vehicleId: z.uuid(), title: z.string().trim().min(1).max(120), scope: z.string().trim().min(3).max(3000), exclusions: z.string().trim().min(3).max(3000), expires: z.iso.date(),
  labor: z.array(z.object({ category, description: z.string().trim().min(1).max(120), minutes: z.number().int().min(1).max(60000) }).strict()).max(20),
  parts: z.array(z.object({ category, description: z.string().trim().min(1).max(120), unitCost: cents.positive(), quantity: z.number().int().min(1).max(10000) }).strict()).max(20),
  laborTaxBasisPoints: z.number().int().min(0).max(3000), partsTaxBasisPoints: z.number().int().min(0).max(3000), taxReviewed: z.literal(true), taxReview: z.string().trim().min(3).max(500),
}).strict();
export type EstimateInput = z.infer<typeof estimateInput>;
export interface RepairQuote {
  inspection?: { id: string; revision: number; title: string; reviewedAt: string | null }; input: EstimateInput; pricedOn: string; currency: string; book: { id: string; name: string; version: number; revision: number };
  vehicle: { id: string; vin: string; label: string }; client: { id: string; title: string };
  labor: { category: string; description: string; requestedMinutes: number; billedMinutes: number; hourlyRate: number; minimumMinutes: number; incrementMinutes: number; amount: number }[];
  parts: { category: string; description: string; unitCost: number; quantity: number; fromCost: number; untilCost: number | null; markupBasisPoints: number; unitPrice: number; amount: number }[];
  laborSubtotal: number; partsSubtotal: number; laborTax: number; partsTax: number; subtotal: number; tax: number; total: number;
  customerScope: string; fingerprints: { book: string; vehicle: string; client: string };
}
export const estimateCreateInput = z.object({ requestId: z.uuid(), proof: z.string().min(20).max(180000), reviewed: z.literal(true) }).strict();
export const repairActions = { "book.save": bookSaveInput, "book.publish": bookPublishInput, "book.retire": bookPublishInput, "book.share": bookShareInput, "estimate.review": estimateInput, "estimate.create": estimateCreateInput } as const;
export const repairCommandInput = z.object({ action: z.enum(["book.save", "book.publish", "book.retire", "book.share", "estimate.review", "estimate.create"]), input: z.record(z.string(), z.unknown()) }).strict();
export function repairCatalog() { return Object.entries(repairActions).map(([action, schema]) => ({ action, inputSchema: z.toJSONSchema(schema) })); }
export function validatePricingDefinition(input: unknown) {
  const d = pricingDefinition.parse(input);
  const must = (v: unknown, message: string) => { if (!v) throw new Error(message); };
  must(!d.effectiveTo || d.effectiveTo >= d.effectiveFrom, "The pricing end date must be on or after its start date.");
  must(d.labor.length + d.parts.length > 0, "Add labor rates or parts markup rules.");
  for (const rows of [d.labor, d.parts]) must(new Set(rows.map(r => r.category.toLowerCase())).size === rows.length, "Use unique categories within each pricing matrix.");
  for (const part of d.parts) {
    let next = 0;
    for (const [i, band] of part.bands.entries()) {
      must(band.fromCost === next && (band.untilCost === null ? i === part.bands.length - 1 : band.untilCost > band.fromCost && i < part.bands.length - 1), `Cost bands for ${part.category} must cover zero upward without gaps or overlaps, ending with an unlimited band.`);
      next = band.untilCost ?? -1;
    }
    must(part.bands.at(-1)?.untilCost === null, `End ${part.category} with an unlimited cost band.`);
  }
  return d;
}
