"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { WorkspaceItem } from "@/lib/navigation/catalog";
import { definitionFor, type RecordDefinition, type Field } from "@/lib/workspace/catalog";
import { numberField as n, paymentTotal, type BusinessRecord, type FieldValue } from "@/lib/workspace/model";
import { businessRecordAction, businessHistoryAction } from "@/app/modules/actions";
import { PortalLinks } from "./PortalLinks";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100";
const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-40";
const money = (value: number, currency: string) => `${currency} ${(value / 100).toFixed(2)}`;
function displayValue(field: Field, value: FieldValue | undefined, records: BusinessRecord[], currency: string) {
  if (value === undefined || value === "") return "—";
  if (field.type === "ref") return records.find(r => r.id === value)?.title ?? "Restricted or unavailable record";
  if (field.type === "money") return money(Number(value), currency);
  if (field.type === "boolean") return value ? "Yes" : "No";
  return String(value);
}
function formFields(record: BusinessRecord | null, definition: RecordDefinition) {
  return Object.fromEntries(definition.fields.map(f => {
    const value = record?.fields[f.key];
    return [f.key, f.type === "boolean" ? Boolean(value) : value === undefined ? "" : f.type === "money" ? (Number(value) / 100).toFixed(2) : f.type === "datetime" ? new Date(String(value)).toLocaleString("sv-SE").replace(" ", "T").slice(0, 16) : String(value)];
  }));
}
export function BusinessModule({ module, definitions, initialRecords, editableKinds, selectedId }: { selectedId?: string; module: WorkspaceItem; definitions: RecordDefinition[]; initialRecords: BusinessRecord[]; editableKinds: string[] }) {
  const [records, setRecords] = useState(initialRecords), [kind, setKind] = useState(definitions[0]?.kind ?? "");
  const [selected, setSelected] = useState<BusinessRecord | null>(() => initialRecords.find(r => r.id === selectedId && definitions.some(d => d.kind === r.kind)) ?? null), [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(""), [currency, setCurrency] = useState("USD"), [fields, setFields] = useState<Record<string, string | boolean>>({});
  const [requestId, setRequestId] = useState("");
  const [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [message, setMessage] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof businessHistoryAction>>>([]), [pending, startTransition] = useTransition();
  const definition = definitions.find(d => d.kind === kind);
  const entries = records.filter(r => r.kind === kind && (status === "all" || r.status === status) && `${r.title} ${Object.values(r.fields).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  function choose(next: string) { setKind(next); setSelected(null); setEditing(false); setHistory([]); setStatus("all"); setMessage(""); }
  function edit(record: BusinessRecord | null) {
    if (!definition) return; setRequestId(crypto.randomUUID()); setSelected(record); setTitle(record?.title ?? ""); setCurrency(record?.currency ?? "USD"); setFields(formFields(record, definition)); setEditing(true); setMessage("");
  }
  async function apply(command: "save" | "transition", input: unknown) {
    try {
      const result = await businessRecordAction(command, input);
      if (!result.ok) { setMessage(result.error); return; }
      setRecords(result.records); setSelected(result.record); setEditing(false); setHistory([]); setMessage("Saved.");
    } catch { setMessage("Connection interrupted. Reload and check the record before trying again."); }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!definition) return;
    try {
      const values: Record<string, FieldValue> = {};
      for (const field of definition.fields) {
        const value = fields[field.key];
        if ((value === "" || value === undefined) && !field.required) continue;
        if (field.type === "money") {
          if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error(`${field.label}: use an amount with up to two decimal places.`);
          const [whole, decimals = ""] = String(value).split("."); values[field.key] = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
        } else if (field.type === "number") values[field.key] = Number(value);
        else if (field.type === "boolean") values[field.key] = Boolean(value);
        else if (field.type === "datetime") values[field.key] = new Date(String(value)).toISOString();
        else values[field.key] = String(value ?? "");
      }
      startTransition(() => apply("save", { ...(selected ? { id: selected.id, revision: selected.revision } : { requestId }), kind, title, currency, fields: values }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check the form."); }
  }
  const linked = selected ? records.filter(r => Object.values(r.fields).includes(selected.id)) : [];
  return <div className="max-w-7xl space-y-5">
    <header><p className="dd-eyebrow">{module.group}</p><h1 className="mt-2 text-2xl font-bold">{module.label}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{module.description}</p></header>
    <BusinessTotals module={module.id} records={records}/>
    {module.id === "service-portal" && editableKinds.includes("client") && <PortalLinks clients={records.filter(r => r.kind === "client").map(r => ({ id: r.id, title: r.title }))}/>}
    <nav aria-label="Record types" className="flex flex-wrap gap-2">{definitions.map(d => <button key={d.kind} onClick={() => choose(d.kind)} className={`${buttonClass} ${kind === d.kind ? "bg-slate-900 text-white" : "bg-white"}`}>{d.label}</button>)}</nav>
    {message && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{message}</p>}
    {definition && <>
      <div className="flex flex-wrap items-center gap-3"><input aria-label="Search records" placeholder="Search records" value={query} onChange={e => setQuery(e.target.value)} className={`${inputClass} max-w-sm`}/><select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)} className={`${inputClass} max-w-48`}><option value="all">All statuses</option>{definition.states.map(state => <option key={state}>{state}</option>)}</select><button className={`${buttonClass} bg-emerald-800 text-white`} disabled={!editableKinds.includes(kind)} onClick={() => edit(null)}>New {definition.label.toLowerCase()}</button><a href={`/api/workspace/records?kind=${kind}&download=1`} className={buttonClass}>Export records</a></div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,1fr)_minmax(380px,1fr)]">
        <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead><tbody>{entries.map(record => <tr key={record.id} className="border-t"><td className="p-3"><button onClick={() => { setSelected(record); setEditing(false); setHistory([]); }} className="text-left font-medium text-emerald-800 hover:underline">{record.title}</button></td><td className="p-3">{record.status.replaceAll("_", " ")}</td><td className="p-3 text-xs text-slate-500">{new Date(record.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!entries.length && <p className="p-6 text-sm text-slate-500">No records match. Create your first {definition.label.toLowerCase()} to begin.</p>}</section>
        {editing ? <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">{selected ? "Edit" : "New"} {definition.label.toLowerCase()}</h2><label className="block text-sm">Title<input required maxLength={200} className={`${inputClass} mt-1`} value={title} onChange={e => setTitle(e.target.value)}/></label><label className="block text-sm">Currency<input pattern="[A-Z]{3}" maxLength={3} required value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} className={`${inputClass} mt-1`}/></label>
          {definition.fields.map(field => <RecordField key={field.key} field={field} value={fields[field.key] ?? ""} onChange={value => setFields({ ...fields, [field.key]: value })} records={records.filter(r => r.id !== selected?.id)}/>)}
          <div className="flex gap-2"><button disabled={pending} className={`${buttonClass} bg-emerald-800 text-white`}>{pending ? "Saving…" : "Save record"}</button><button type="button" className={buttonClass} onClick={() => setEditing(false)}>Cancel</button></div>
        </form> : selected ? <section className="space-y-4 rounded-xl border bg-white p-5"><div><h2 className="font-semibold">{selected.title}</h2><p className="mt-1 text-xs text-slate-500">{selected.status} · Revision {selected.revision}</p></div><dl className="space-y-3">{definition.fields.map(field => <div key={field.key}><dt className="text-xs font-medium text-slate-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{displayValue(field, selected.fields[field.key], records, selected.currency)}</dd></div>)}</dl>
          <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={!editableKinds.includes(kind) || pending} onClick={() => edit(selected)}>Edit details</button>{definition.transitions[selected.status]?.map(target => <button key={target} disabled={pending || !editableKinds.includes(kind)} className={`${buttonClass} bg-emerald-800 text-white`} onClick={() => startTransition(() => apply("transition", { id: selected.id, revision: selected.revision, target, commandId: crypto.randomUUID() }))}>{target === "confirmed" ? "Confirm recorded payment" : `Mark ${target.replaceAll("_", " ")}`}</button>)}<button className={buttonClass} onClick={() => startTransition(async () => { try { setHistory(await businessHistoryAction(selected.id)); } catch (e) { setMessage(e instanceof Error ? e.message : "History unavailable."); } })}>View history</button><a className={buttonClass} href={`/api/workspace/records?id=${selected.id}&download=1`}>Download record</a></div>
          {selected.computed && <div className="rounded-lg bg-slate-50 p-3"><h3 className="text-sm font-semibold">Verified snapshot</h3><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(selected.computed, null, 2)}</pre></div>}
          {linked.length > 0 && <div><h3 className="text-sm font-semibold">Linked history</h3><ul className="mt-2 space-y-2 text-sm">{linked.map(r => <li key={r.id}><Link className="text-emerald-800 underline" href={`/modules/${definitionFor(r.kind).module}`}>{r.title}</Link> · {r.status}{typeof r.fields.amount === "number" ? ` · ${money(r.fields.amount, r.currency)}` : ""}</li>)}</ul></div>}
          {history.length > 0 && <ol className="space-y-2 border-t pt-3 text-xs text-slate-600">{history.map(h => <li key={h.sequence}>{h.action} · {h.actor} · {new Date(h.at).toLocaleString()}</li>)}</ol>}
        </section> : <p className="rounded-xl border border-dashed p-6 text-sm text-slate-500">Select a record to review details, linked history and available workflow actions.</p>}
      </div>
    </>}
  </div>;
}
function RecordField({ field, value, onChange, records }: { field: Field; value: string | boolean; onChange: (value: string | boolean) => void; records: BusinessRecord[] }) {
  return <label className="block text-sm">{field.label}{field.required ? " *" : ""}
    {field.type === "long" ? <textarea rows={3} required={field.required} className={`${inputClass} mt-1`} value={String(value)} onChange={e => onChange(e.target.value)}/>
      : field.type === "boolean" ? <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} className="ml-3"/>
      : ["select", "ref"].includes(field.type) ? <><select required={field.required} className={`${inputClass} mt-1`} value={String(value)} onChange={e => onChange(e.target.value)}><option value="">Select…</option>{field.type === "ref" ? records.filter(r => field.kinds?.includes(r.kind)).map(r => <option key={r.id} value={r.id}>{r.title} · {r.status}</option>) : field.options?.map(o => <option key={o}>{o}</option>)}</select>{field.type === "ref" && <span className="mt-1 block text-xs text-slate-500">Create linked records: {field.kinds?.map(k => <Link key={k} className="mr-2 underline" href={`/modules/${definitionFor(k).module}`}>{definitionFor(k).label}</Link>)}.</span>}</>
      : <input required={field.required} className={`${inputClass} mt-1`} type={field.type === "datetime" ? "datetime-local" : field.type === "money" || field.type === "number" ? "number" : field.type === "email" || field.type === "date" ? field.type : "text"} min={field.type === "money" || field.type === "number" ? 0 : undefined} step={field.type === "money" ? "0.01" : "1"} value={String(value)} onChange={e => onChange(e.target.value)}/>}</label>;
}
function BusinessTotals({ module, records }: { module: string; records: BusinessRecord[] }) {
  if (!["nonprofit-funding", "nonprofit-donors", "nonprofit-campaigns", "service-profitability", "service-collections"].includes(module)) return null;
  return <div className="grid gap-3 md:grid-cols-3">{[...new Set(records.map(r => r.currency))].map(unit => {
    const data = records.filter(r => r.currency === unit), invoices = data.filter(r => r.kind === "invoice" && r.status === "issued");
    const invoiced = invoices.reduce((t, r) => t + n(r, "amount"), 0), paid = invoices.reduce((t, r) => t + paymentTotal(data, "service_payment", "invoice", r.id), 0);
    return <div key={unit} className="space-y-2 rounded-xl border bg-white p-4 text-sm">{module.startsWith("nonprofit") ? <><p>Donation cash received: <strong>{money(data.filter(r => r.kind === "donation").reduce((t, r) => t + paymentTotal(data, "gift_payment", "donation", r.id), 0), unit)}</strong></p><p>Pledges committed: {money(data.filter(r => r.kind === "pledge" && r.status === "committed").reduce((t, r) => t + n(r, "amount"), 0), unit)}</p><p>Grant awards: {money(data.filter(r => r.kind === "grant" && r.status === "awarded").reduce((t, r) => t + n(r, "award"), 0), unit)}</p><p>Grant cash received: {money(data.filter(r => r.kind === "grant").reduce((t, r) => t + paymentTotal(data, "grant_payment", "grant", r.id), 0), unit)}</p></> : <><p>Service invoices: <strong>{money(invoiced, unit)}</strong></p><p>Open balance: {money(invoiced - paid, unit)}</p><p>Approved job costs: {money(data.filter(r => r.kind === "time_entry" && r.status === "approved").reduce((t, r) => t + n(r, "cost"), 0), unit)}</p></>}</div>;
  })}</div>;
}
