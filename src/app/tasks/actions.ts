"use server";

/** Task board actions: create, move (awards XP on Done), and reassign. */
import { z } from "zod";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { listTeam } from "@/lib/team/store";
import { revalidatePath } from "next/cache";
import { createTask, moveTask, assignTask, TASK_STATUSES, type TaskStatus } from "@/lib/tasks/store";

export interface TaskResult {
  ok: boolean;
  message?: string;
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(140),
  assigneeId: z.string().trim().min(1).nullable(),
  priority: z.enum(["low", "medium", "high"]),
  goal: z.string().trim().max(120).nullable(),
});

export async function createTaskAction(input: {
  title: string;
  assigneeId: string | null;
  priority: "low" | "medium" | "high";
  goal: string | null;
}): Promise<TaskResult> {
  await requireSectionAccess("team", "edit");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Add a task title." };
  if (parsed.data.assigneeId && !listTeam().some(m => m.id === parsed.data.assigneeId)) return { ok: false, message: "Choose a current team member." };
  createTask(parsed.data);
  revalidatePath("/tasks");
  revalidatePath("/team");
  return { ok: true };
}

export async function moveTaskAction(id: string, status: TaskStatus): Promise<TaskResult> {
  await requireSectionAccess("team", "edit");
  if (!TASK_STATUSES.includes(status)) return { ok: false, message: "Bad status" };
  const t = moveTask(id, status);
  if (!t) return { ok: false, message: "Task not found" };
  revalidatePath("/tasks");
  revalidatePath("/team");
  return { ok: true, message: status === "done" ? `Nice — +${t.xp} XP!` : undefined };
}

export async function assignTaskAction(id: string, assigneeId: string | null): Promise<TaskResult> {
  await requireSectionAccess("team", "edit");
  if (assigneeId && !listTeam().some(m => m.id === assigneeId)) return { ok: false, message: "Choose a current team member." };
  const t = assignTask(id, assigneeId);
  if (!t) return { ok: false, message: "Task not found" };
  revalidatePath("/tasks");
  return { ok: true };
}
