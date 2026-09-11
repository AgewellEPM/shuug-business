"use client";

/**
 * TaskBoard — a Kanban of who's working on what: To do → In progress → Review →
 * Done. Move a card with the arrows; dropping it in Done awards the assignee XP.
 * An XP leaderboard up top shows everyone's level (WoW-style).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task, TaskStatus } from "@/lib/tasks/store";
import type { MemberProgress } from "@/lib/tasks/store";
import type { TaskResult } from "@/app/tasks/actions";

const ORDER: TaskStatus[] = ["todo", "in_progress", "review", "done"];
const LABELS: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", review: "Review", done: "Done" };
const PRIORITY: Record<string, string> = { high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-900", low: "bg-slate-100 text-slate-600" };

export function TaskBoard({
  columns,
  progress,
  members,
  createAction,
  moveAction,
  assignAction,
}: {
  columns: Record<TaskStatus, Task[]>;
  progress: MemberProgress[];
  members: { id: string; name: string }[];
  createAction: (input: { title: string; assigneeId: string | null; priority: "low" | "medium" | "high"; goal: string | null }) => Promise<TaskResult>;
  moveAction: (id: string, status: TaskStatus) => Promise<TaskResult>;
  assignAction: (id: string, assigneeId: string | null) => Promise<TaskResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(members[0]?.id ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const todayStr = new Date().toISOString().slice(0, 10);
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const initials = (id: string | null) => (id ? (nameById.get(id) ?? id).split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() : "—");

  function run(fn: () => Promise<TaskResult>, afterSave?: () => void) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.message) setToast(res.message);
        if (res.ok) { afterSave?.(); router.refresh(); }
      } catch { setToast("The task could not be saved. Your draft is still here."); }
    });
  }
  function add() {
    if (!title.trim()) return;
    run(() => createAction({ title, assigneeId: assignee || null, priority, goal: null }), () => setTitle(""));
  }

  return (
    <div className="space-y-6">
      {toast && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{toast}</p>}

      {/* XP leaderboard */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Team levels</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {progress.map((m) => (
            <div key={m.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{m.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.role} · {m.openTasks} open</p>
                </div>
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">Lv {m.level.level}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">{m.level.title}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round(m.level.progress * 100)}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-slate-400">{m.level.xpIntoLevel}/{m.level.xpForNext}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add task */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New task…" className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none">
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")} className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none">
            <option value="low">Low · 10xp</option>
            <option value="medium">Medium · 25xp</option>
            <option value="high">High · 50xp</option>
          </select>
          <button type="button" onClick={add} disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Add task</button>
        </div>
      </section>

      {/* Kanban */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((status) => (
          <div key={status} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-700">{LABELS[status]}</h3>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">{columns[status].length}</span>
            </div>
            <div className="space-y-2">
              {columns[status].map((task) => {
                const idx = ORDER.indexOf(status);
                return (
                  <div key={task.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-sm font-medium text-slate-800">{task.title}</p>
                    {task.goal && <p className="mt-0.5 text-xs text-slate-400">🎯 {task.goal}</p>}
                    <select aria-label={`Assign ${task.title}`} disabled={pending} value={task.assigneeId ?? ""} onChange={event => run(() => assignAction(task.id, event.target.value || null))} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs">
                      <option value="">Unassigned</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{initials(task.assigneeId)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY[task.priority]}`}>{task.priority} · {task.xp}xp</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{task.storyPoints} SP</span>
                      {task.dueDate && task.status !== "done" && (
                        <span className={`text-[10px] tabular-nums ${task.dueDate < todayStr ? "font-semibold text-red-600" : "text-slate-400"}`}>
                          {task.dueDate < todayStr ? "⚠ " : ""}{task.dueDate.slice(5)}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1">
                        <button type="button" disabled={idx === 0 || pending} onClick={() => run(() => moveAction(task.id, ORDER[idx - 1]))} className="rounded border border-slate-200 px-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30" aria-label="Move left">←</button>
                        <button type="button" disabled={idx === ORDER.length - 1 || pending} onClick={() => run(() => moveAction(task.id, ORDER[idx + 1]))} className="rounded border border-slate-200 px-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30" aria-label="Move right">→</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {columns[status].length === 0 && <p className="px-1 py-2 text-xs text-slate-400">Nothing here.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
