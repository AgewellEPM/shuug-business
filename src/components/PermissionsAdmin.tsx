"use client";

/**
 * PermissionsAdmin — the owner's control panel for who can see and do what.
 *   • Matrix: for each role × section, pick none / view / edit.
 *   • Team: assign each person a role.
 *   • Preview: view the whole app AS a role to confirm what's hidden.
 * All changes persist via server actions and re-render the nav immediately.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_ROLES, type PermissionLevel, type SectionKey } from "@/lib/permissions/model";
import type { AdminResult } from "@/app/admin/actions";

const isBuiltIn = (role: string) => (DEFAULT_ROLES as readonly string[]).includes(role);

const LEVELS: PermissionLevel[] = ["none", "view", "edit"];
const LEVEL_STYLE: Record<PermissionLevel, string> = {
  none: "bg-slate-100 text-slate-400",
  view: "bg-sky-100 text-sky-800",
  edit: "bg-emerald-100 text-emerald-800",
};

export function PermissionsAdmin({
  roles, sections, matrix, members, assignments, activeRole,
  setPermissionAction, assignRoleAction, setActiveRoleAction, createRoleAction, deleteRoleAction, renameMemberAction, removeMemberAction,
}: {
  roles: string[];
  sections: { key: SectionKey; label: string }[];
  matrix: Record<string, Partial<Record<SectionKey, PermissionLevel>>>;
  members: { id: string; name: string; role: string }[];
  assignments: Record<string, string>;
  activeRole: string;
  setPermissionAction: (role: string, section: SectionKey, level: PermissionLevel) => Promise<AdminResult>;
  assignRoleAction: (memberId: string, role: string) => Promise<AdminResult>;
  setActiveRoleAction: (role: string) => Promise<AdminResult>;
  createRoleAction: (name: string) => Promise<AdminResult>;
  deleteRoleAction: (name: string) => Promise<AdminResult>;
  renameMemberAction: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  removeMemberAction: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, onOk?: () => void) =>
    start(async () => { const r = await fn(); setToast(r.message ?? r.error ?? (r.ok ? "Saved" : "Failed")); if (r.ok) onOk?.(); router.refresh(); });

  const levelOf = (role: string, section: SectionKey): PermissionLevel => matrix[role]?.[section] ?? "none";
  const cycle = (l: PermissionLevel): PermissionLevel => LEVELS[(LEVELS.indexOf(l) + 1) % LEVELS.length];

  return (
    <div className="space-y-8">
      {toast && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{toast}</p>}

      {/* Preview-as */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Preview the app as…</h2>
        <p className="text-xs text-slate-500">See exactly what a role can reach. Sections they can’t view disappear from the menu.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() => run(() => setActiveRoleAction(r))}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                r === activeRole ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-indigo-200 hover:bg-white/70"
              }`}
            >
              {r}{r === activeRole ? " ✓" : ""}
            </button>
          ))}
        </div>
      </section>

      {/* Matrix */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What each role can do</h2>
            <p className="text-xs text-slate-500">Tap a cell to cycle none → view → edit. Owner is locked to full access.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newRole.trim()) run(() => createRoleAction(newRole), () => setNewRole("")); }}
              placeholder="New custom role…"
              maxLength={40}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button type="button" disabled={pending || !newRole.trim()} onClick={() => run(() => createRoleAction(newRole), () => setNewRole(""))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
              + Add role
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Role</th>
                {sections.map((s) => <th key={s.key} className="px-3 py-2.5 font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      {role}
                      {isBuiltIn(role) ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-slate-400">built-in</span>
                      ) : (
                        <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete the “${role}” role? Anyone using it becomes a Viewer.`)) run(() => deleteRoleAction(role)); }} className="rounded-full px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${role} role`}>×</button>
                      )}
                    </span>
                  </td>
                  {sections.map((s) => {
                    const lvl = levelOf(role, s.key);
                    const locked = role === "Owner";
                    return (
                      <td key={s.key} className="px-3 py-2">
                        <button
                          type="button"
                          disabled={locked || pending}
                          onClick={() => run(() => setPermissionAction(role, s.key, cycle(lvl)))}
                          className={`w-16 rounded-md px-2 py-1 text-xs font-semibold capitalize transition ${LEVEL_STYLE[lvl]} ${locked ? "cursor-not-allowed opacity-70" : "hover:ring-2 hover:ring-slate-300"}`}
                        >
                          {lvl}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Team assignment */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Who has which role</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                {m.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <EditableName name={m.name} disabled={pending} onSave={(name) => { if (name && name !== m.name) run(() => renameMemberAction(m.id, name)); }} />
                <p className="text-xs text-slate-400">Job title: {m.role}</p>
              </div>
              <select
                value={assignments[m.id] ?? "Viewer"}
                disabled={pending}
                onChange={(e) => run(() => assignRoleAction(m.id, e.target.value))}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {m.id !== "owner" && (
                <button type="button" disabled={pending} onClick={() => { if (confirm(`Remove ${m.name} from the team?`)) run(() => removeMemberAction(m.id)); }} aria-label={`Remove ${m.name}`} className="flex-none rounded-full px-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">×</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Click the name to edit it; Enter or blur saves, Escape cancels. */
function EditableName({ name, disabled, onSave }: { name: string; disabled: boolean; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing) {
    return (
      <button type="button" disabled={disabled} onClick={() => { setValue(name); setEditing(true); }} className="block truncate text-left text-sm font-medium text-slate-800 hover:text-emerald-700" title="Click to rename">
        {name}
      </button>
    );
  }
  const commit = () => { setEditing(false); onSave(value.trim()); };
  return (
    <input
      autoFocus
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(name); setEditing(false); } }}
      className="w-full rounded border border-emerald-400 px-1.5 py-0.5 text-sm focus:outline-none"
    />
  );
}
