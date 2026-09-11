import { z } from "zod";
export const formKinds = ["contact", "quote", "booking", "wholesale", "volunteer", "job"] as const;
export const formLabels: Record<typeof formKinds[number], string> = { contact: "Contact request", quote: "Quote request", booking: "Appointment request", wholesale: "Wholesale application", volunteer: "Volunteer signup", job: "Job application inquiry" };
export const formInput = z.object({ id: z.uuid().optional(), revision: z.number().int().positive().optional(), title: z.string().trim().min(1).max(100), kind: z.enum(formKinds), origins: z.array(z.string().max(250)).max(8), enabled: z.boolean() }).strict();
export const submissionInput = z.object({ requestId: z.uuid(), name: z.string().trim().min(1).max(100), email: z.email().max(160), message: z.string().trim().min(1).max(4000), consent: z.literal(true) }).strict();
export const workflowInput = z.object({ name: z.string().trim().min(1).max(100), formId: z.uuid(), taskTitle: z.string().trim().min(1).max(100), assigneeId: z.string().max(100).nullable(), priority: z.enum(["low", "medium", "high"]), channels: z.array(z.enum(["slack", "zapier"])).max(2).refine(a => new Set(a).size === a.length, "Choose each channel once.") }).strict();
export type Form = z.infer<typeof formInput> & { id: string; revision: number; createdAt: string };
export type Submission = z.infer<typeof submissionInput> & { id: string; formId: string; formTitle: string; kind: typeof formKinds[number]; createdAt: string; status: "new" | "reviewed"; records?: { id: string; kind: string }[] };
export type WorkflowInput = z.infer<typeof workflowInput>;
export type Workflow = WorkflowInput & { id: string; enabled: boolean; testedAt: string; createdAt: string; actor: string; destinations: Partial<Record<"slack" | "zapier", string>> };
export type Run = { id: string; workflowId: string; workflowName: string; submissionId: string; action: "task" | "slack" | "zapier"; status: "pending" | "working" | "completed" | "review" | "canceled"; detail: string; createdAt: string; updatedAt: string; snapshot: WorkflowInput; destination: string };
export function allowedOrigin(value: string): string {
  const url = new URL(value);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || (local && !["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /[\s*]/.test(value)) throw new Error("Use exact HTTPS website origins, such as https://www.example.org.");
  return url.origin;
}
