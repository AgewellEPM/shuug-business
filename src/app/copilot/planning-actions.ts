"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireIdentity } from "@/lib/auth/identity";
import { readableNotes } from "@/lib/notes/access";
import { listDocuments, saveDocument } from "@/lib/workspace/documents";
import { askRoadmap } from "@/lib/planning/service";
import { planSchema, type PlanningThread, type Roadmap } from "@/lib/planning/model";
import { activeWorkspace } from "@/lib/navigation/active-profile";
const profileSchema = z.enum(["all", "product", "service", "nonprofit"]);
async function identity() { const user = await requireIdentity(); return user.isOwner ? "Workspace Owner" : user.id; }
async function checkProfile(profile: string) { const { config } = await activeWorkspace(); if (profile !== "all" && !config.organizationTypes?.includes(profile as "product" | "service" | "nonprofit")) throw new Error("Select an enabled workspace profile."); }
export async function planningStateAction() {
  const owner = await identity(), { config } = await activeWorkspace(), notes = await readableNotes();
  const allowed = (r: { owner: string; profile: string; noteIds: string[] }) => r.owner === owner && r.noteIds.every(id => notes.some(n => n.id === id)) && (r.profile === "all" || config.organizationTypes?.includes(r.profile as "product" | "service" | "nonprofit"));
  return { threads: listDocuments<PlanningThread>("thread").filter(allowed), roadmaps: listDocuments<Roadmap>("roadmap").filter(allowed) };
}
export async function chatPlanningAction(input: unknown) {
  try {
    const owner = await identity();
    const parsed = z.object({ id: z.string().max(100).optional(), revision: z.number().int().positive().optional(), message: z.string().trim().min(1).max(4000), goal: z.string().trim().max(2000), jobRole: z.string().trim().max(200), profile: profileSchema, noteIds: z.array(z.string().max(100)).max(8) }).strict().parse(input);
    await checkProfile(parsed.profile);
    const available = await readableNotes(), selected = available.filter(n => parsed.noteIds.includes(n.id));
    if (selected.length !== new Set(parsed.noteIds).size || selected.some(n => n.profile !== "all" && parsed.profile !== "all" && n.profile !== parsed.profile)) throw new Error("One of the selected notes is unavailable in this profile.");
    const old = parsed.id ? listDocuments<PlanningThread>("thread").find(t => t.id === parsed.id && t.owner === owner) : undefined;
    if (parsed.id && (!old || parsed.revision !== old.revision)) throw new Error("Conversation changed. Reload before continuing.");
    if (old && (old.profile !== parsed.profile || JSON.stringify(old.noteIds) !== JSON.stringify(parsed.noteIds))) throw new Error("Start a new conversation to change its profile or source notes.");
    const messages: PlanningThread["messages"] = [...old?.messages ?? [], { role: "user" as const, content: parsed.message }].slice(-16);
    const response = await askRoadmap({ goal: parsed.goal, jobRole: parsed.jobRole, profile: parsed.profile, notes: selected, messages });
    const thread = saveDocument<PlanningThread>("thread", { owner, profile: parsed.profile, goal: parsed.goal, jobRole: parsed.jobRole, noteIds: parsed.noteIds, messages: [...messages, { role: "assistant", content: response.answer }], draft: response.plan ?? old?.draft ?? null }, old);
    return { ok: true as const, thread };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Could not create the roadmap." }; }
}
export async function saveRoadmapAction(input: unknown) {
  try {
    const owner = await identity();
    const parsed = z.object({ id: z.string().max(100).optional(), revision: z.number().int().positive().optional(), profile: profileSchema, noteIds: z.array(z.string().max(100)).max(8), plan: planSchema }).strict().parse(input);
    await checkProfile(parsed.profile);
    const notes = await readableNotes(); if (parsed.noteIds.some(id => !notes.some(n => n.id === id && (n.profile === "all" || parsed.profile === "all" || n.profile === parsed.profile)))) throw new Error("Source note unavailable in this profile.");
    const previous = parsed.id ? listDocuments<Roadmap>("roadmap").find(r => r.id === parsed.id && r.owner === owner) : undefined;
    if (parsed.id && (!previous || previous.revision !== parsed.revision)) throw new Error("Roadmap changed. Reload before saving.");
    const roadmap = saveDocument<Roadmap>("roadmap", { owner, profile: parsed.profile, noteIds: parsed.noteIds, plan: parsed.plan }, previous);
    revalidatePath("/copilot"); return { ok: true as const, roadmap };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Could not save the roadmap." }; }
}
