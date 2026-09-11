import type { inspectionWorkspace } from "@/lib/auto-repair/inspections";
export type InspectionWorkspaceData = ReturnType<typeof inspectionWorkspace>;
export type InspectionRun = (action: string, input: Record<string, unknown>) => Promise<void>;
export const inspectionInput = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100";
export const inspectionButton = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40";
