"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNT_CLASSES, accountDepth, type AccountClass, type WorkspaceAccount } from "@/lib/accounting/account-model";
import type { ActionResult } from "@/app/ledger/actions";
type Audit = { id: string; number: number; actor: string; at: string; before: WorkspaceAccount | null; after: WorkspaceAccount };
export function ChartOfAccounts({ accounts, audit, canEdit, commandAction }: { accounts: WorkspaceAccount[]; audit: Audit[]; canEdit: boolean; commandAction: (command: unknown) => Promise<ActionResult> }) {
  const router = useRouter(), requests = useRef(new Map<string, string>()), [pending, start] = useTransition();
  const [editing, setEditing] = useState<WorkspaceAccount | "new" | null>(null), [number, setNumber] = useState(""), [name, setName] = useState("");
  const [classification, setClassification] = useState<AccountClass>("expense"), [parentNumber, setParent] = useState<number | null>(null), [active, setActive] = useState(true), [reviewed, setReviewed] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false), [filter, setFilter] = useState(""), [message, setMessage] = useState("");
  function edit(account: WorkspaceAccount | "new") {
    setEditing(account); setNumber(account === "new" ? "" : String(account.number)); setName(account === "new" ? "" : account.name);
    setClassification(account === "new" ? "expense" : account.classification); setParent(account === "new" ? null : account.parentNumber); setActive(account === "new" || account.active); setReviewed(false); setMessage("");
  }
  function save() {
    if (!canEdit || !editing) return;
    const input = { number: Number(number), revision: editing === "new" ? 0 : editing.revision, name, classification, parentNumber, active, reviewed };
    const key = JSON.stringify(input), requestId = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key, requestId);
    start(async () => {
      try { const result = await commandAction({ requestId, action: "account.save", input });
        setMessage(result.ok ? "Account saved." : result.error ?? "Could not save the account.");
        if (result.ok) { requests.current.delete(key); setEditing(null); router.refresh(); }
      } catch { setMessage("The response was interrupted. Retry these unchanged values to check the result safely."); }
    });
  }
  const rows: WorkspaceAccount[] = [];
  function walk(parent: number | null) { for (const account of accounts.filter(a => a.parentNumber === parent)) { rows.push(account); walk(account.number); } }
  walk(null);
  return <section className="space-y-4">
    {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
    <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Find account <input aria-label="Find account" value={filter} onChange={e => setFilter(e.target.value)} className="ml-2 rounded border p-2" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />Include inactive accounts</label>{canEdit && <button type="button" disabled={pending} onClick={() => edit("new")} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">New account</button>}</div>
    {editing && canEdit && <fieldset disabled={pending} className="space-y-3 rounded-xl border bg-white p-4"><legend className="px-2 font-semibold">{editing === "new" ? "New account" : `Edit account ${editing.number}`}</legend>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Account number <input aria-label="Account number" inputMode="numeric" disabled={editing !== "new"} value={number} onChange={e => { setNumber(e.target.value); setReviewed(false); }} className="block w-full rounded border p-2" /></label>
      <label className="text-sm">Account name <input aria-label="Account name" maxLength={150} value={name} onChange={e => { setName(e.target.value); setReviewed(false); }} className="block w-full rounded border p-2" /></label>
      <label className="text-sm">Classification <select aria-label="Account classification" disabled={editing !== "new" && editing.system} value={classification} onChange={e => { setClassification(e.target.value as AccountClass); setParent(null); setReviewed(false); }} className="block w-full rounded border p-2">{ACCOUNT_CLASSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="text-sm">Parent account <select aria-label="Parent account" value={parentNumber ?? ""} onChange={e => { setParent(e.target.value ? Number(e.target.value) : null); setReviewed(false); }} className="block w-full rounded border p-2"><option value="">Top level</option>{accounts.filter(a => a.classification === classification && a.number !== Number(number) && (a.active || !active)).map(a => <option key={a.number} value={a.number}>{a.number} · {a.name}</option>)}</select></label></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={editing !== "new" && editing.system} checked={active} onChange={e => { setActive(e.target.checked); setReviewed(false); }} />Active for new postings</label>
      {editing !== "new" && editing.system && <p className="text-sm text-slate-500">Automatic workflows use this system account. Its classification and active status are protected.</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the classification and account details.</label>
      <button type="button" disabled={!reviewed || !name.trim() || !/^\d{1,9}$/.test(number) || Number(number) < 1} onClick={save} className="mr-3 rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-40">Save account</button><button type="button" onClick={() => setEditing(null)} className="text-sm">Cancel</button>
    </fieldset>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-3">Account</th><th className="p-3">Classification</th><th className="p-3">Status</th><th className="p-3">History</th></tr></thead><tbody className="divide-y">{rows.filter(a => (includeInactive || a.active) && `${a.number} ${a.name}`.toLowerCase().includes(filter.toLowerCase())).map(a => <tr key={a.number}><td className="p-3"><span style={{ paddingLeft: `${accountDepth(a, accounts) * 16}px` }}>{canEdit ? <button type="button" disabled={pending} onClick={() => edit(a)} className="font-semibold text-emerald-700 underline">{a.number} · {a.name}</button> : `${a.number} · ${a.name}`}</span></td><td className="p-3">{ACCOUNT_CLASSES.find(c => c.id === a.classification)?.label}</td><td className="p-3">{a.active ? "Active" : "Inactive"}{a.system ? " · System" : ""}</td><td className="p-3"><details><summary className="cursor-pointer">Revision {a.revision}</summary>{audit.filter(e => e.number === a.number).map(e => <p key={e.id} className="mt-2 text-xs">{e.at} · {e.actor} · {e.before ? `Changed from ${e.before.name} (${e.before.classification}, parent ${e.before.parentNumber ?? "none"}, ${e.before.active ? "active" : "inactive"})` : "Created"} → {e.after.name} ({e.after.classification}, parent {e.after.parentNumber ?? "none"}, {e.after.active ? "active" : "inactive"})</p>)}{!audit.some(e => e.number === a.number) && <p className="mt-2 text-xs">Original system account.</p>}</details></td></tr>)}</tbody></table></div>
  </section>;
}
