import { z } from "zod";
export const formKinds = ["contact", "quote", "auto-repair", "booking", "wholesale", "volunteer", "job"] as const;
export const formLabels: Record<typeof formKinds[number], string> = { contact: "Contact request", quote: "Quote request", "auto-repair": "Auto repair service request", booking: "Appointment request", wholesale: "Wholesale application", volunteer: "Volunteer signup", job: "Job application inquiry" };
export const automotiveSmsConsentVersion = "auto-repair-service-sms-v1";
export const automotiveSmsConsentText = "I agree to receive texts about this service request, appointments and repair updates at the number provided. Consent is optional and is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.";
/** US local numbers are normalized for this shop's service texts. Other countries
 * must supply an explicit country code; a blank number grants no SMS consent. */
export const intakePhoneInput = z.string().trim().max(40).transform((value, ctx) => {
  if (!value) return "";
  const digits = value.replace(/[\s().-]/g, "");
  const phone = /^\d{10}$/.test(digits) ? `+1${digits}` : /^1\d{10}$/.test(digits) ? `+${digits}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) { ctx.addIssue({ code: "custom", message: "Enter a US phone number or include its international country code." }); return z.NEVER; }
  return phone;
});
export const automotiveVehicleInput = z.object({
  year: z.number().int().min(1886).max(2100).optional(), make: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(100).optional(), plate: z.string().trim().min(1).max(40).optional(),
  odometer: z.number().int().min(0).max(10_000_000).optional(), vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Enter the complete 17-character VIN or leave it blank.").optional(),
}).strict();
export type AutomotiveVehicle = z.infer<typeof automotiveVehicleInput>;
export const formInput = z.object({ id: z.uuid().optional(), revision: z.number().int().positive().optional(), title: z.string().trim().min(1).max(100), kind: z.enum(formKinds), origins: z.array(z.string().max(250)).max(8), enabled: z.boolean() }).strict();
export const submissionInput = z.object({ requestId: z.uuid(), name: z.string().trim().min(1).max(100), email: z.email().max(160), message: z.string().trim().min(1).max(4000), consent: z.literal(true),
  phone: intakePhoneInput.optional(), vehicle: automotiveVehicleInput.optional(), requestedDate: z.iso.date().optional(),
  smsConsent: z.boolean().optional(), smsConsentVersion: z.literal(automotiveSmsConsentVersion).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.smsConsent && (!input.phone || input.smsConsentVersion !== automotiveSmsConsentVersion)) ctx.addIssue({ code: "custom", path: ["smsConsent"], message: "Text consent requires a phone number and the current displayed consent wording." });
});
export const workflowInput = z.object({ name: z.string().trim().min(1).max(100), formId: z.uuid(), taskTitle: z.string().trim().min(1).max(100), assigneeId: z.string().max(100).nullable(), priority: z.enum(["low", "medium", "high"]), channels: z.array(z.enum(["slack", "zapier"])).max(2).refine(a => new Set(a).size === a.length, "Choose each channel once.") }).strict();
export type Form = z.infer<typeof formInput> & { id: string; revision: number; createdAt: string };
export interface AutomotiveIntakeReceipt { id: string; receivedAt: string; formRevision: number; status: "received"; ownerInboxId: string; smsAcknowledgment: "not_requested" | "automation_disabled" | "queued" | "blocked"; messageId?: string; emailAcknowledgment?: "automation_disabled" | "queued"; emailMessageId?: string }
export type Submission = z.infer<typeof submissionInput> & { id: string; formId: string; formTitle: string; kind: typeof formKinds[number]; createdAt: string; status: "new" | "reviewed"; records?: { id: string; kind: string }[]; intakeReceipt?: AutomotiveIntakeReceipt };
export type WorkflowInput = z.infer<typeof workflowInput>;
export type Workflow = WorkflowInput & { id: string; enabled: boolean; testedAt: string; createdAt: string; actor: string; destinations: Partial<Record<"slack" | "zapier", string>> };
export type Run = { id: string; workflowId: string; workflowName: string; submissionId: string; action: "task" | "slack" | "zapier"; status: "pending" | "working" | "completed" | "review" | "canceled"; detail: string; createdAt: string; updatedAt: string; snapshot: WorkflowInput; destination: string };
export function allowedOrigin(value: string): string {
  const url = new URL(value);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || (local && !["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /[\s*]/.test(value)) throw new Error("Use exact HTTPS website origins, such as https://www.example.org.");
  return url.origin;
}
