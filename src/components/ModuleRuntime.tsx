"use client";

/**
 * Generic module runtime — renders ANY registered module from its field manifest:
 * computed panels, an add/edit form, and a records table with archive/delete. One
 * component drives every dev-built and no-code module, so they all look and behave
 * consistently. Field types mirror the no-code tracker builder.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Field, Cell } from "@/lib/features/model";
import type { ModuleRecord } from "@/lib/sdk/types";
import { availableViews, boardField, dateField, groupByChoice, groupByMonth, type ViewKind } from "@/lib/sdk/views";
import type { ActionResult } from "@/app/m/[id]/actions";

type Stat = { label: string; value: string; tone?: "good" | "warn" | "bad" };
interface Panel { id: string; label: string; stats: Stat[] }

interface Actions {
  addRecordAction: (moduleId: string, values: Record<string, unknown>) => Promise<ActionResult>;
  updateRecordAction: (moduleId: string, id: string, values: Record<string, unknown>) => Promise<ActionResult>;
  archiveRecordAction: (moduleId: string, id: string, archived: boolean) => Promise<ActionResult>;
  removeRecordAction: (moduleId: string, id: string) => Promise<ActionResult>;
}

const TONE = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-600" } as const;

function emptyValues(fields: Field[]): Record<string, string | boolean> {
  return Object.fromEntries(fields.map((f) => [f.id, f.type === "checkbox" ? false : ""]));
}
function toInput(values: Record<string, string | boolean>, fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (f.type === "checkbox") out[f.id] = Boolean(v);
    else if (f.type === "number" || f.type === "money") out[f.id] = v === "" ? "" : Number(v);
    else out[f.id] = v;
  }
  return out;
}
function fromRecord(rec: ModuleRecord, fields: Field[]): Record<string, string | boolean> {
  return Object.fromEntries(fields.map((f) => {
    const v = rec.values[f.id];
    return [f.id, f.type === "checkbox" ? Boolean(v) : v === undefined ? "" : String(v)];
  }));
}
function display(cell: Cell | undefined, field: Field): string {
  if (cell === undefined || cell === "") return "—";
  if (field.type === "checkbox") return cell ? "Yes" : "No";
  if (field.type === "money") return typeof cell === "number" ? `$${cell.toFixed(2)}` : String(cell);
  return String(cell);
}

export function ModuleRuntime({ moduleId, fields, panels, records, canEdit, ...actions }: { moduleId: string; fields: Field[]; panels: Panel[]; records: ModuleRecord[]; canEdit: boolean } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyValues(fields));
  const [showArchived, setShowArchived] = useState(false);
  const views = availableViews(fields);
  const [view, setView] = useState<ViewKind>("table");

  const run = (fn: () => Promise<ActionResult>, after?: () => void) => start(async () => {
    const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed");
    if (r.ok && after) after();
    router.refresh();
  });
  const set = (id: string, v: string | boolean) => setForm((f) => ({ ...f, [id]: v }));

  const submit = () => {
    if (editing) run(() => actions.updateRecordAction(moduleId, editing, toInput(form, fields)), () => { setEditing(null); setForm(emptyValues(fields)); });
    else run(() => actions.addRecordAction(moduleId, toInput(form, fields)), () => setForm(emptyValues(fields)));
  };
  const startEdit = (rec: ModuleRecord) => { setEditing(rec.id); setForm(fromRecord(rec, fields)); };

  const visible = records.filter((r) => showArchived || !r.archived);

  return (
    <div className="space-y-6">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      {/* Computed panels */}
      {panels.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {panels.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">{p.label}</h2>
              <div className="grid grid-cols-3 gap-2">
                {p.stats.map((s, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${s.tone ? TONE[s.tone] : "text-slate-900"}`}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{s.label}</p>
                  </div>
                ))}
                {p.stats.length === 0 && <p className="col-span-3 text-xs text-slate-400">No data yet.</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit form */}
      {canEdit && fields.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{editing ? "Edit record" : "Add a record"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.id} className="text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                {f.type === "checkbox" ? (
                  <input type="checkbox" checked={Boolean(form[f.id])} disabled={pending} onChange={(e) => set(f.id, e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                ) : f.type === "select" ? (
                  <select value={String(form[f.id] ?? "")} disabled={pending} onChange={(e) => set(f.id, e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5">
                    <option value="">Choose…</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === "notes" ? (
                  <textarea value={String(form[f.id] ?? "")} disabled={pending} rows={2} onChange={(e) => set(f.id, e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" />
                ) : (
                  <input type={f.type === "number" || f.type === "money" ? "number" : f.type === "date" ? "date" : "text"} value={String(form[f.id] ?? "")} disabled={pending} onChange={(e) => set(f.id, e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" />
                )}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">{editing ? "Save changes" : "Add record"}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyValues(fields)); }} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 ring-1 ring-slate-200">Cancel</button>}
          </div>
        </section>
      )}

      {/* Records — Table / Board / Calendar views over the same data */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Records ({visible.length})</h2>
            {views.length > 1 && (
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                {views.map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 font-semibold capitalize ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{v}</button>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-slate-500" /> Show archived</label>
        </div>

        {fields.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">This module has no data fields — it’s compute-only. See the panels above.</p>
        ) : view === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <tr>{fields.map((f) => <th key={f.id} className="px-4 py-2 font-medium">{f.label}</th>)}{canEdit && <th className="px-4 py-2" />}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((rec) => (
                  <tr key={rec.id} className={rec.archived ? "opacity-50" : ""}>
                    {fields.map((f) => <td key={f.id} className="px-4 py-2 text-slate-700">{display(rec.values[f.id], f)}</td>)}
                    {canEdit && (
                      <td className="px-4 py-2 text-right text-xs whitespace-nowrap">
                        <button type="button" disabled={pending} onClick={() => startEdit(rec)} className="text-emerald-700 hover:underline">Edit</button>
                        <button type="button" disabled={pending} onClick={() => run(() => actions.archiveRecordAction(moduleId, rec.id, !rec.archived))} className="ml-2 text-slate-400 hover:text-slate-700">{rec.archived ? "Restore" : "Archive"}</button>
                        <button type="button" disabled={pending} onClick={() => run(() => actions.removeRecordAction(moduleId, rec.id))} className="ml-2 text-slate-400 hover:text-red-600">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={fields.length + (canEdit ? 1 : 0)} className="px-4 py-6 text-center text-sm text-slate-400">No records yet.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : view === "board" ? (
          <div className="flex gap-3 overflow-x-auto p-4">
            {groupByChoice(visible, boardField(fields)!).map((col) => (
              <div key={col.key} className="w-64 flex-none rounded-xl bg-slate-50 p-2">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{col.label} <span className="text-slate-400">({col.records.length})</span></p>
                <div className="space-y-2">
                  {col.records.map((rec) => <RecordCard key={rec.id} rec={rec} fields={fields} canEdit={canEdit} pending={pending} onEdit={() => startEdit(rec)} />)}
                  {col.records.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">Empty</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {groupByMonth(visible, dateField(fields)!).map((grp) => (
              <div key={grp.key}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{grp.label} <span className="text-slate-400">({grp.records.length})</span></p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {grp.records.map((rec) => <RecordCard key={rec.id} rec={rec} fields={fields} canEdit={canEdit} pending={pending} onEdit={() => startEdit(rec)} dateFieldId={dateField(fields)!.id} />)}
                </div>
              </div>
            ))}
            {visible.length === 0 && <p className="py-2 text-center text-sm text-slate-400">No records yet.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

/** A compact record card for the Board and Calendar views. Shows the first text-ish
 *  field as a title plus up to two more, and an edit affordance. */
function RecordCard({ rec, fields, canEdit, pending, onEdit, dateFieldId }: { rec: ModuleRecord; fields: Field[]; canEdit: boolean; pending: boolean; onEdit: () => void; dateFieldId?: string }) {
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const rest = fields.filter((f) => f.id !== titleField.id && f.id !== dateFieldId && f.type !== "notes").slice(0, 2);
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm ${rec.archived ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{display(rec.values[titleField.id], titleField)}</p>
        {canEdit && <button type="button" disabled={pending} onClick={onEdit} className="flex-none text-[11px] font-semibold text-emerald-700 hover:underline">Edit</button>}
      </div>
      {dateFieldId && <p className="text-[11px] text-slate-400">{display(rec.values[dateFieldId], fields.find((f) => f.id === dateFieldId)!)}</p>}
      {rest.map((f) => <p key={f.id} className="mt-0.5 text-[11px] text-slate-500"><span className="text-slate-400">{f.label}:</span> {display(rec.values[f.id], f)}</p>)}
    </div>
  );
}
