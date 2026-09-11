"use client";

/**
 * TeamRoster — manage the team: add, edit and remove people. Each card shows
 * their level/XP (from tasks) and, in edit mode, inline controls. Roles use the
 * access roles so assigning one also sets what they can see (RBAC).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MemberProgress } from "@/lib/tasks/store";
import type { TeamResult } from "@/app/team/actions";

type MemberFormData = { name: string; email: string; role: string; online?: boolean; salaryCents?: number | null };
interface Actions {
  addAction: (form: MemberFormData) => Promise<TeamResult>;
  updateAction: (id: string, form: MemberFormData) => Promise<TeamResult>;
  removeAction: (id: string) => Promise<TeamResult>;
}

export function TeamRoster({ team, roles, addAction, updateAction, removeAction }: { team: MemberProgress[]; roles: string[] } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = (fn: () => Promise<TeamResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setToast(r.ok ? "Saved" : r.error ?? "Failed");
      if (r.ok) { onOk?.(); router.refresh(); }
    });

  return (
    <div className="space-y-4">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      <div className="flex justify-end">
        <button type="button" onClick={() => { setAdding((a) => !a); setEditingId(null); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          {adding ? "Cancel" : "+ Add teammate"}
        </button>
      </div>

      {adding && (
        <MemberForm
          roles={roles}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSubmit={(form) => run(() => addAction(form), () => setAdding(false))}
        />
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {team.map((m) => (
          <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {editingId === m.id ? (
              <MemberForm
                roles={roles}
                pending={pending}
                initial={{ name: m.name, email: m.email ?? "", role: m.role, online: m.online, salaryCents: m.salaryCents ?? null }}
                onCancel={() => setEditingId(null)}
                onSubmit={(form) => run(() => updateAction(m.id, form), () => setEditingId(null))}
              />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                    {m.initials}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${m.online ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.role}</p>
                  </div>
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">Lv {m.level.level}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">{m.level.title}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round(m.level.progress * 100)}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-slate-400">{m.level.xpIntoLevel}/{m.level.xpForNext} xp</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{m.openTasks} open · {m.doneTasks} done · {m.totalXp} total XP</p>
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-2">
                  <button type="button" onClick={() => { setEditingId(m.id); setAdding(false); }} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Edit</button>
                  {m.id !== "owner" && (
                    <button type="button" disabled={pending} onClick={() => { if (confirm(`Remove ${m.name} from the team?`)) run(() => removeAction(m.id)); }} className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">Remove</button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-400">
        Roles set what each person can see and do. Fine-tune access anytime in <Link href="/admin" className="font-semibold text-emerald-700 hover:underline">Roles &amp; access</Link>.
      </p>
    </div>
  );
}

function MemberForm({
  roles, pending, initial, onSubmit, onCancel,
}: {
  roles: string[];
  pending: boolean;
  initial?: { name: string; email: string; role: string; online: boolean; salaryCents?: number | null };
  onSubmit: (form: MemberFormData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState(initial?.role ?? roles[0] ?? "Viewer");
  const [online, setOnline] = useState(initial?.online ?? false);
  const [salary, setSalary] = useState(initial?.salaryCents != null ? String(Math.round(initial.salaryCents / 100)) : "");
  const roleOptions = roles.includes(role) ? roles : [role, ...roles];
  const submit = () => {
    const s = salary.trim();
    const salaryCents = s === "" ? null : Math.max(0, Math.round(Number(s) * 100));
    onSubmit({ name, email, role, online, salaryCents: Number.isFinite(salaryCents as number) ? salaryCents : null });
  };

  return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
      <div className="flex items-center gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none">
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Online
        </label>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Annual salary $</span>
        <input value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="e.g. 60000 (for ROI)" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={pending || !name.trim()} onClick={submit} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Save</button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}
