import { z } from "zod";
const name = z.string().trim().min(1).max(100), key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), revision = z.number().int().positive();
export const inspectionDefinition = z.object({ name, version: z.number().int().min(1).max(100000), description: z.string().trim().max(1000), points: z.array(z.object({ key, group: name, label: name, instructions: z.string().trim().max(600), unit: z.string().trim().max(20), measurementRequired: z.boolean() }).strict()).min(1).max(60) }).strict();
export type InspectionDefinition = z.infer<typeof inspectionDefinition>;
export function validateInspectionDefinition(raw: unknown) { const d = inspectionDefinition.parse(raw); if (new Set(d.points.map(p => p.key)).size !== d.points.length) throw new Error("Inspection point keys must be unique."); return d; }
export interface InspectionTemplate { id: string; revision: number; status: "draft" | "published" | "retired"; definition: InspectionDefinition; shareInTemplates: boolean; imported: boolean; review: string; publishedBy: string | null; createdAt: string }
export const findingInput = z.object({ key, outcome: z.enum(["not_checked", "pass", "attention", "unsafe", "not_applicable"]), measurement: z.string().trim().max(120), observation: z.string().trim().max(1000), recommendation: z.string().trim().max(600) }).strict();
export type Finding = z.infer<typeof findingInput>;
export const dispositionInput = z.object({ key, disposition: z.enum(["repaired", "customer_declined", "deferred", "referred"]), evidence: z.string().trim().min(5).max(1000) }).strict();
export type Disposition = z.infer<typeof dispositionInput>;
export interface Inspection {
  id: string; revision: number; title: string; status: "assigned" | "in_progress" | "submitted" | "changes_requested" | "reviewed" | "cancelled";
  jobId: string; clientId: string; vehicle: { id: string; vin: string; label: string }; template: { id: string; definition: InspectionDefinition };
  technician: { memberId: string; name: string }; instructions: string; findings: Finding[]; odometer: number | null; odometerUnit: "miles" | "km";
  activeSince: string | null; timeAdjustmentMilliseconds: number; sessions: { start: string; end: string; memberId: string }[];
  photos: { id: string; key: string; name: string; mime: string; sha256: string; by: string; at: string }[];
  staffNotes: string; customerSummary: string; dispositions: Disposition[]; shared: boolean; review: string; reviewedBy: string | null; reviewedAt: string | null; timeEntryId: string | null; createdAt: string; updatedAt: string;
}
const versionInput = z.object({ id: z.uuid(), revision }).strict();
const templateSave = z.object({ id: z.uuid().optional(), revision: revision.optional(), definition: inspectionDefinition, shareInTemplates: z.boolean() }).strict();
const templateReview = versionInput.extend({ reviewed: z.literal(true), review: z.string().trim().min(5).max(1000) }).strict();
const create = z.object({ title: name, vehicleId: z.uuid(), jobId: z.uuid(), templateId: z.uuid(), technicianId: z.string().min(1).max(100), instructions: z.string().trim().min(3).max(2000) }).strict();
const findings = versionInput.extend({ findings: z.array(findingInput).max(60), odometer: z.number().int().min(0).max(10_000_000), odometerUnit: z.enum(["miles", "km"]), staffNotes: z.string().trim().max(3000), customerSummary: z.string().trim().max(2000) }).strict();
const photo = versionInput.extend({ key, name: z.string().trim().min(1).max(100), mime: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(4).max(700000) }).strict();
const inspectionReview = versionInput.extend({ reviewed: z.literal(true), review: z.string().trim().min(5).max(1000), dispositions: z.array(dispositionInput).max(60), hourlyCost: z.number().int().min(0).max(9_999_999), shareWithCustomer: z.boolean() }).strict();
export const inspectionActions = {
  "template.save": templateSave, "template.publish": templateReview, "template.retire": templateReview, "template.share": versionInput.extend({ shareInTemplates: z.boolean() }).strict(),
  "inspection.assign": create, "inspection.reassign": versionInput.extend({ technicianId: z.string().min(1).max(100), reason: z.string().trim().min(5).max(1000) }).strict(),
  "inspection.start": versionInput, "inspection.pause": versionInput, "inspection.save": findings, "inspection.photo": photo,
  "inspection.submit": versionInput.extend({ confirmed: z.literal(true) }).strict(), "inspection.return": versionInput.extend({ reason: z.string().trim().min(5).max(1000) }).strict(),
  "inspection.time.correct": versionInput.extend({ minutes: z.number().int().min(0).max(7200), reason: z.string().trim().min(5).max(1000) }).strict(),
  "inspection.review": inspectionReview, "inspection.cancel": versionInput.extend({ reason: z.string().trim().min(5).max(1000) }).strict(), "inspection.share": versionInput.extend({ shareWithCustomer: z.boolean() }).strict(),
} as const;
export const inspectionCommandInput = z.object({ requestId: z.uuid(), action: z.enum(Object.keys(inspectionActions) as [keyof typeof inspectionActions, ...(keyof typeof inspectionActions)[]]), input: z.record(z.string(), z.unknown()) }).strict();
export const technicianActions = new Set(["inspection.start", "inspection.pause", "inspection.save", "inspection.photo", "inspection.submit"]);
export function inspectionCatalog() { return Object.entries(inspectionActions).map(([action, schema]) => ({ action, technicianAction: technicianActions.has(action), inputSchema: z.toJSONSchema(schema) })); }
