/**
 * Adapt real tasks + team into work/goal statuses. Shared by the page and API.
 */
import { listTeam } from "../team/store";
import { listTasks } from "../tasks/store";
import { computeWorkStatus, type WorkStatus, type WorkState } from "./engine";
import { setting } from "../connections/vault";

export interface WorkOverview {
  statuses: WorkStatus[];
  counts: Record<WorkState, number>;
  nowMs: number;
}

export function loadWorkStatus(nowMs = Date.now()): WorkOverview {
  const members = listTeam().map((m) => ({ id: m.id, name: m.name, role: m.role }));
  const tasks = listTasks().map((t) => ({
    assigneeId: t.assigneeId,
    status: t.status,
    storyPoints: t.storyPoints,
    createdAtMs: Date.parse(t.createdAt),
    completedAtMs: t.completedAt ? Date.parse(t.completedAt) : null,
    dueDate: t.dueDate,
  }));

  const statuses = computeWorkStatus({
    members,
    tasks,
    nowMs,
    hoursPerPoint: Number(setting("WORK_HOURS_PER_POINT")) || 4,
    weeklyHours: Number(setting("WORK_WEEKLY_HOURS")) || 40,
  });

  const counts: Record<WorkState, number> = { "on-track": 0, behind: 0, "at-risk": 0, stalled: 0, idle: 0 };
  for (const s of statuses) counts[s.state] += 1;
  return { statuses, counts, nowMs };
}
