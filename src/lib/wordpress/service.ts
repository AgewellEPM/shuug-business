import { z } from "zod";
import { requireIdentity, requireOwnerAccess } from "../auth/identity";
import { requireSectionAccess } from "../permissions/guard";
import { getMatrix } from "../permissions/store";
import { allowedSections, can } from "../permissions/model";
import { getBranding } from "../branding/store";
import { catalogWithTools, visibleItems } from "../navigation/catalog";
import { toolLinks } from "../features/store";
import { recordDefinitions, definitionsForModule } from "../workspace/catalog";
import { readableBusinessRecords } from "../workspace/access";
import { listTasks, createTask, moveTask, assignTask } from "../tasks/store";
import { listTeam } from "../team/store";
import { readableNotes } from "../notes/access";
import { businessRecordAction, businessHistoryAction } from "@/app/modules/actions";
import { addNoteAction } from "@/app/notes/actions";
import { chatPlanningAction, planningStateAction, saveRoadmapAction } from "@/app/copilot/planning-actions";
import { saveBrandingAction } from "@/app/branding/actions";
import { GET as employeeAccounts, POST as employeeCommand } from "@/app/api/workspace/employees/route";
import { POST as personalCommand } from "@/app/api/workspace/me/route";
import { businessHandlers } from "../backend/resources";
import { appBaseUrl } from "../connections/vault";
import type { BrandingPatch } from "../branding/store";
import type { NewNote } from "../notes/store";
export const wordpressOperations = ["workspace", "me", "task.save", "task.status", "password", "notes", "note.save", "planning", "planning.chat", "planning.save", "records", "record.save", "record.transition", "record.history", "employees", "employee.save", "branding.save", "business.read", "team.tasks", "team.task.save", "team.task.assign"] as const;
const commandRequest = (body: unknown) => new Request(new URL("/api/workspace/me", appBaseUrl()), { method: "POST", headers: { Origin: new URL(appBaseUrl()).origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function unpack(response: Response) { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Operation failed."); return result; }
function unwrap<T extends { ok: boolean; error?: string }>(result: T) { if (!result.ok) throw new Error(result.error ?? "Operation failed."); return result; }
export async function wordpressOperation(operation: typeof wordpressOperations[number], input: Record<string, unknown>) {
  const user = await requireIdentity();
  if (operation === "workspace") {
    const branding = getBranding(), sections = allowedSections(getMatrix(), user.role).filter(s => user.isOwner || s !== "admin");
    const items = visibleItems(branding, catalogWithTools(toolLinks(), branding), sections);
    const modules = items.filter(i => i.href.startsWith("/modules/")).map(m => ({ ...m, kinds: definitionsForModule(m.href.split("/").pop()!).map(d => d.kind) }));
    const kinds = new Set(modules.flatMap(m => definitionsForModule(m.href.split("/").pop()!).map(d => d.kind)));
    return { user, branding, modules, navigation: items, configurableItems: user.isOwner ? catalogWithTools(toolLinks(), branding) : [], definitions: recordDefinitions.filter(d => kinds.has(d.kind) && can(getMatrix(), user.role, d.section, "view")), editable: sections.filter(s => can(getMatrix(), user.role, s, "edit")), backendUrl: appBaseUrl() };
  }
  if (operation === "me") return { user, tasks: listTasks().filter(t => t.assigneeId === user.memberId) };
  if (operation === "task.save") return unpack(await personalCommand(commandRequest({ ...input, action: "task" })));
  if (operation === "task.status") return unpack(await personalCommand(commandRequest({ ...input, action: "status" })));
  if (operation === "password") return unpack(await personalCommand(commandRequest({ ...input, action: "password" })));
  if (operation === "notes") return readableNotes();
  if (operation === "note.save") {
    const parsed = z.object({ note: z.record(z.string(), z.unknown()), previous: z.object({ id: z.string().max(100), revision: z.number().int().positive() }).strict().optional() }).strict().parse(input);
    return unwrap(await addNoteAction(parsed.note as NewNote, parsed.previous));
  }
  if (operation === "planning") return planningStateAction();
  if (operation === "planning.chat") return unwrap(await chatPlanningAction(input));
  if (operation === "planning.save") return unwrap(await saveRoadmapAction(input));
  if (operation === "records") {
    const query = z.object({ module: z.string().max(80).optional(), offset: z.number().int().nonnegative().default(0) }).strict().parse(input);
    const readable = await readableBusinessRecords(), kinds = query.module ? new Set(definitionsForModule(query.module).map(d => d.kind)) : null;
    const rows = readable.filter(r => !kinds || kinds.has(r.kind));
    return { records: rows.slice(query.offset, query.offset + 100), nextOffset: rows.length > query.offset + 100 ? query.offset + 100 : null, references: readable.map(r => ({ id: r.id, kind: r.kind, title: r.title })), total: rows.length };
  }
  if (operation === "record.save") return unwrap(await businessRecordAction("save", input));
  if (operation === "record.transition") return unwrap(await businessRecordAction("transition", input));
  if (operation === "record.history") return businessHistoryAction(z.uuid().parse(input.id));
  if (operation === "employees") return unpack(await employeeAccounts());
  if (operation === "employee.save") { if (input.action === "setup") throw new Error("Configure the owner on the backend before connecting WordPress."); return unpack(await employeeCommand(commandRequest(input))); }
  if (operation === "branding.save") return unwrap(await saveBrandingAction(input as BrandingPatch));
  if (operation === "business.read") {
    const resource = z.string().max(80).parse(input.resource), handler = businessHandlers()[resource]; if (!handler) throw new Error("Unknown business report.");
    if (resource === "cockpit") await requireOwnerAccess();
    await requireSectionAccess(handler.section, ["performance", "worktrack"].includes(resource) ? "edit" : "view"); return handler.load();
  }
  await requireSectionAccess("team", "edit");
  if (operation === "team.tasks") return { tasks: listTasks(), members: listTeam().map(m => ({ id: m.id, name: m.name })) };
  if (operation === "team.task.save") {
    const parsed = z.object({ title: z.string().trim().min(1).max(140), assigneeId: z.string().max(100).nullable(), priority: z.enum(["low", "medium", "high"]), goal: z.string().max(120).nullable(), dueDate: z.iso.date().nullable() }).strict().parse(input);
    if (parsed.assigneeId && !listTeam().some(m => m.id === parsed.assigneeId)) throw new Error("Select a current team member."); return createTask(parsed);
  }
  const parsed = z.object({ id: z.string().max(100), assigneeId: z.string().max(100).nullable().optional(), status: z.enum(["todo", "in_progress", "review", "done"]).optional() }).strict().parse(input);
  if (parsed.assigneeId !== undefined) { if (parsed.assigneeId && !listTeam().some(m => m.id === parsed.assigneeId)) throw new Error("Select a current team member."); if (!assignTask(parsed.id, parsed.assigneeId)) throw new Error("Task unavailable."); }
  if (parsed.status && !moveTask(parsed.id, parsed.status)) throw new Error("Task unavailable.");
  return { ok: true };
}
