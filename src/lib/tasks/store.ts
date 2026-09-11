import { persistentState } from "../workspace/state";
/**
 * Tasks + XP store — a Kanban board of who's working on what, with a WoW-style
 * XP payout when a task is completed. Durable SQLite state; example records require DEMO_DATA=true.
 */
import { createHash, randomUUID } from "node:crypto";
import { listTeam } from "../team/store";
import { levelForXp, xpForPriority, type LevelInfo, type TaskPriority } from "./xp";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export interface Task {
  id: string;
  title: string;
  assigneeId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** story points (effort estimate), monday-style. */
  storyPoints: number;
  dueDate: string | null; // ISO date
  xp: number;
  goal: string | null;
  createdAt: string;
  completedAt: string | null;
}

function spForPriority(priority: TaskPriority): number {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

interface TaskState {
  tasks: Task[];
  xpByMember: Record<string, number>;
}

function seed(): TaskState {
  const now = "2026-09-08T09:00:00.000Z";
  const t = (id: string, title: string, assigneeId: string, status: TaskStatus, priority: TaskPriority, goal: string | null, dueDate: string | null = null): Task => ({
    id, title, assigneeId, status, priority, storyPoints: spForPriority(priority), dueDate, xp: xpForPriority(priority), goal,
    createdAt: now, completedAt: status === "done" ? now : null,
  });
  return {
    tasks: [
      t("T1", "Follow up with Big Y on Q1 promo", "alex", "in_progress", "high", "Grow wholesale 20%", "2026-09-05"),
      t("T2", "Call 5 new CT grocery buyers", "alex", "todo", "medium", "Grow wholesale 20%", "2026-09-15"),
      t("T3", "Schedule next Harissa production run", "sam", "todo", "medium", "Never stock out", "2026-09-12"),
      t("T4", "Ship Whole Foods sample", "mia", "review", "low", "Sample→PO conversion"),
      t("T5", "Reconcile GlassCo overcharge", "jordan", "done", "medium", "Stop overpaying"),
      t("T6", "Update Amazon listings", "jordan", "todo", "low", "Grow online"),
      t("T7", "Post month-end numbers", "owner", "done", "high", "Know the business"),
    ],
    xpByMember: { alex: 180, jordan: 90, sam: 40, mia: 25, owner: 260 },
  };
}

const legacy = globalThis as unknown as { __taskState?: TaskState };
const durable = persistentState<TaskState>("tasks", () => legacy.__taskState ?? (process.env.DEMO_DATA === "true" ? seed() : { tasks: [], xpByMember: {} }));

function nextId(): string {
  return `T-${randomUUID().slice(0, 6)}`;
}

export function listTasks(): Task[] {
  const state = durable.read();
  return state.tasks.map((t) => ({ ...t }));
}

export function tasksByStatus(): Record<TaskStatus, Task[]> {
  const state = durable.read();
  const out: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
  for (const task of state.tasks) out[task.status].push({ ...task });
  return out;
}

export interface NewTask {
  title: string;
  assigneeId: string | null;
  priority: TaskPriority;
  goal: string | null;
  storyPoints?: number;
  dueDate?: string | null;
}

export function createTask(input: NewTask, idempotencyKey?: string): Task {
  return durable.change(state => {
  const id = idempotencyKey ? `T-${createHash("sha256").update(idempotencyKey).digest("hex")}` : nextId();
  const existing = state.tasks.find(task => task.id === id);
  if (existing) return { ...existing };
  const task: Task = {
    id,
    title: input.title,
    assigneeId: input.assigneeId,
    status: "todo",
    priority: input.priority,
    storyPoints: input.storyPoints ?? spForPriority(input.priority),
    dueDate: input.dueDate ?? null,
    xp: xpForPriority(input.priority),
    goal: input.goal,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  state.tasks.push(task);
  return { ...task };

  });
}

export function assignTask(id: string, assigneeId: string | null): Task | null {
  return durable.change(state => {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return null;
  if (task.status === "done" && task.assigneeId !== assigneeId) {
    if (task.assigneeId) state.xpByMember[task.assigneeId] = Math.max(0, (state.xpByMember[task.assigneeId] || 0) - task.xp);
    if (assigneeId) state.xpByMember[assigneeId] = (state.xpByMember[assigneeId] || 0) + task.xp;
  }
  task.assigneeId = assigneeId;
  return { ...task };

  });
}

/** Move a task. Completing it awards XP to the assignee; un-completing reverses it. */
export function moveTask(id: string, status: TaskStatus, expectedAssignee?: string): Task | null {
  return durable.change(state => {
  const task = state.tasks.find((t) => t.id === id);
  if (!task || (expectedAssignee !== undefined && task.assigneeId !== expectedAssignee)) return null;
  const wasDone = task.status === "done";
  const nowDone = status === "done";
  task.status = status;
  task.completedAt = nowDone ? task.completedAt ?? new Date().toISOString() : null;
  if (task.assigneeId) {
    if (nowDone && !wasDone) {
      state.xpByMember[task.assigneeId] = (state.xpByMember[task.assigneeId] || 0) + task.xp;
      task.completedAt = new Date().toISOString();
    } else if (!nowDone && wasDone) {
      state.xpByMember[task.assigneeId] = Math.max(0, (state.xpByMember[task.assigneeId] || 0) - task.xp);
      task.completedAt = null;
    }
  }
  return { ...task };

  });
}

export interface MemberProgress {
  id: string;
  name: string;
  role: string;
  email: string;
  initials: string;
  online: boolean;
  salaryCents: number | null;
  totalXp: number;
  level: LevelInfo;
  openTasks: number;
  doneTasks: number;
}

/** Per-member XP, level, and task load — for the Team leveling view. */
export function memberProgress(): MemberProgress[] {
  const state = durable.read();
  return listTeam()
    .map((m) => {
      const totalXp = state.xpByMember[m.id] || 0;
      const mine = state.tasks.filter((t) => t.assigneeId === m.id);
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        initials: m.initials,
        online: m.online,
        salaryCents: m.salaryCents ?? null,
        totalXp,
        level: levelForXp(totalXp),
        openTasks: mine.filter((t) => t.status !== "done").length,
        doneTasks: mine.filter((t) => t.status === "done").length,
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp);
}
