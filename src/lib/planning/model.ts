import { z } from "zod";
import type { WorkspaceDocument } from "../workspace/documents";
export const planSchema = z.object({
  title: z.string().trim().min(1).max(200), outcome: z.string().trim().min(1).max(2000),
  steps: z.array(z.object({ title: z.string().trim().min(1).max(200), detail: z.string().max(2000), milestone: z.string().max(200), due: z.union([z.iso.date(), z.literal("")]), status: z.enum(["todo", "in_progress", "done"]).default("todo") }).strict()).min(1).max(20),
}).strict();
export type Plan = z.infer<typeof planSchema>;
export const responseSchema = z.object({ answer: z.string().min(1).max(6000), plan: planSchema.nullable() }).strict();
export interface PlanningThread extends WorkspaceDocument {
  owner: string; profile: "all" | "product" | "service" | "nonprofit"; goal: string; jobRole: string;
  noteIds: string[]; messages: { role: "user" | "assistant"; content: string }[]; draft: Plan | null;
}
export interface Roadmap extends WorkspaceDocument { owner: string; profile: PlanningThread["profile"]; noteIds: string[]; plan: Plan }
