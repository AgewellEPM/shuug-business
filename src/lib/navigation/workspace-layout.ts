import { z } from "zod";
import type { WorkspaceItem } from "./catalog";

const toolId = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
/** Saved tool references only. A layout never changes visibility or permissions. */
export const workspaceLayoutSchema = z.object({
  homeToolId: toolId,
  primaryToolIds: z.array(toolId).min(1).max(12),
}).strict().superRefine((value, context) => {
  if (new Set(value.primaryToolIds).size !== value.primaryToolIds.length) context.addIssue({ code: "custom", path: ["primaryToolIds"], message: "Choose each primary tool once." });
  if (!value.primaryToolIds.includes(value.homeToolId)) context.addIssue({ code: "custom", path: ["homeToolId"], message: "The home tool must be one of the primary tools." });
});
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;
export interface WorkspaceNavigationPreferences { hiddenGroups?: string[]; hiddenItems?: string[] }

/** Callers supply the already role/profile/feature-filtered catalog. */
export function resolveWorkspaceLayout(layout: WorkspaceLayout | null | undefined, shown: WorkspaceItem[], preferences: WorkspaceNavigationPreferences = {}) {
  if (!layout) return { configured: false, primary: shown.filter(item => item.group === "Workspace"), home: null, header: null };
  const available = shown.filter(item => item.status !== "planned" && !preferences.hiddenGroups?.includes(item.group) && !preferences.hiddenItems?.includes(item.href));
  const primary = layout.primaryToolIds.flatMap(id => { const item = available.find(candidate => candidate.id === id); return item ? [item] : []; });
  const candidate = available.find(item => item.id === layout.homeToolId);
  // The root route must never redirect back to itself, even for hand-edited settings.
  const home = candidate && candidate.href.startsWith("/") && !candidate.href.startsWith("//") && new URL(candidate.href, "http://workspace.local").pathname !== "/" ? candidate : null;
  const header = primary.find(item => ["service-clients", "customers", "nonprofit-donors", "nonprofit-participants"].includes(item.id)) ?? home ?? primary[0] ?? null;
  return { configured: true, primary, home, header };
}
