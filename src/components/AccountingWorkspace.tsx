"use client";
import { BillingWorkspace } from "./accounting/BillingWorkspace";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { bookView } from "@/lib/accounting/book-service";
import type { BankStatement } from "@/lib/accounting/bank-model";
import { formatCents } from "@/lib/money";
import { FinancialReports } from "./FinancialReports";
import { ACCOUNT_CLASSES } from "@/lib/accounting/account-model";

type View = Awaited<ReturnType<typeof bookView>>;
type Send = (action: string, input: object) => Promise<void>;
const value = (f: FormData, key: string) => String(f.get(key) ?? "");
function cents(s: string) { if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(s.trim())) throw new Error("Enter a dollar amount with up to two decimal places."); const [whole, part = ""] = s.trim().replace("-", "").split("."); return (Number(whole)*100+Number(part.padEnd(2,"0")))*(s.trim().startsWith("-") ? -1 : 1); }
function Field({ label, name, type = "text", required = true, defaultValue }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) { return <label className="grid gap-1 text-sm">{label}<input className="rounded border p-2" name={name} type={type} required={required} defaultValue={defaultValue}/></label>; }
function CommandForm({ send, action, build, children, label }: { send: Send; action: string; build: (f: FormData) => object; children: ReactNode; label: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (busy) return; const f = new FormData(e.currentTarget); setBusy(true); setError(""); try { await send(action, { ...build(f), reviewed: true }); } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); } }}>
    <fieldset className="space-y-3" disabled={busy}>{children}<label className="flex gap-2 text-sm"><input type="checkbox" required/>I reviewed these details.</label><button className="dd-primary" type="submit">{busy ? "Saving…" : label}</button></fieldset>{error && <p role="alert" className="text-red-700">{error}</p>}
  </form>;
}
function AccountSelect({ accounts, name, bankOnly = false }: { accounts: View["accounts"]; name: string; bankOnly?: boolean }) { return <select className="w-full rounded border p-2" name={name} required>{accounts.filter(a => a.active && (!bankOnly || a.classification === "bank")).map(a => <option key={a.number} value={a.number}>{a.number} · {a.name}</option>)}</select>; }
export function AccountingWorkspace({ data, canEdit, owner, initialTab = "reports" }: { data: View; canEdit: boolean; owner: boolean; initialTab?: string }) {
  const router = useRouter(), [tab, setTab] = useState(initialTab), [notice,setNotice] = useState("");
  const retry = useRef<{ key: string; id: string } | null>(null);
  const send: Send = async (action, input) => {
    const key = JSON.stringify({ action, input }); if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    const r = await fetch(`/api/accounting/books/${data.book.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input, requestId: retry.current.id }) });
    const result = await r.json(); if (!r.ok) throw new Error(result.error ?? "Unable to save."); retry.current = null; setNotice("Saved. Accounting records refreshed."); router.refresh();
  };
  return <div className="space-y-6"><header><Link href="/accounting" className="underline">All client books</Link><h1 className="mt-3 text-2xl font-bold">{data.book.name}</h1><p className="text-sm text-slate-600">USD · {data.periods.active ? `Closed through ${data.periods.active.through}` : "Open books"}</p></header>
    <nav className="flex flex-wrap gap-2" aria-label="Accounting tools">{[["reports","Reports"],["billing","Invoices & bills"],["journal","Journal & accounts"],["bank","Bank reconciliation"],["close","Close & history"]].map(([id,label]) => <button key={id} className={tab===id ? "dd-primary" : "dd-button"} onClick={()=>setTab(id)} aria-pressed={tab===id}>{label}</button>)}</nav>
    {notice && <p role="status">{notice}</p>}{data.issues.map((issue,i)=><p role="alert" key={i} className="rounded border border-amber-300 p-3">{issue}</p>)}
    {tab==="reports" && <><ReportDates data={data}/><FinancialReports report={data.reports} journalHref={`/accounting/${data.book.id}?tool=journal`}/></>}
    {tab==="billing" && <BillingWorkspace data={data} canEdit={canEdit} owner={owner}/>}
    {tab==="journal" && <>
      {canEdit && <section className="dd-card"><h2 className="mb-3 text-xl font-semibold">Post a journal entry</h2><JournalForm send={send} accounts={data.accounts}/></section>}
      <section className="dd-card"><h2 className="mb-3 text-xl font-semibold">Recorded journal</h2>{data.entries.map(entry=><details key={entry.id} className="border-b py-3"><summary>{entry.date} · {entry.memo}</summary><div className="space-y-2 p-3">{entry.lines.map((l,i)=><p key={i}>{data.accounts.find(a=>a.number===l.accountNumber)?.name ?? l.accountNumber} · Debit {formatCents(l.debitCents)} · Credit {formatCents(l.creditCents)}</p>)}
      {canEdit && entry.id.startsWith("manual:") && !entry.manual?.reversedById && <CommandForm send={send} action="journal.reverse" label="Record reversal" build={f=>({ id:entry.id,revision:1,date:value(f,"date"),reason:value(f,"reason") })}><Field label="Reversal date" name="date" type="date"/><Field label="Reason" name="reason"/></CommandForm>}</div></details>)}</section>
      {canEdit && <section className="dd-card"><h2 className="mb-3 text-xl font-semibold">New account</h2><CommandForm send={send} action="account.save" label="Create account" build={f=>({ number:Number(value(f,"number")),revision:0,name:value(f,"name"),classification:value(f,"classification"),parentNumber:value(f,"parent")?Number(value(f,"parent")):null,active:true })}><Field label="Account number" name="number" type="number"/><Field label="Account name" name="name"/><label className="grid">Classification<select name="classification" className="rounded border p-2">{ACCOUNT_CLASSES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label className="grid">Parent account<select name="parent" className="rounded border p-2"><option value="">No parent</option>{data.accounts.map(a=><option key={a.number} value={a.number}>{a.name}</option>)}</select></label></CommandForm></section>}
    </>}
    {tab==="bank" && <>{canEdit && <StatementImport data={data} send={send}/>}<div className="space-y-5">{data.statements.map(statement=><StatementReview key={`${statement.id}:${statement.revision}`} data={data} statement={statement} canEdit={canEdit} send={send}/>)}{!data.statements.length && <p>No statements imported yet.</p>}</div></>}
    {tab==="close" && <section className="dd-card space-y-5"><h2 className="text-xl font-semibold">Period close</h2><p>Reconcile each active bank account through the closing date. Closing retains a statement snapshot and blocks backdated postings. The owner can reopen with a recorded reason.</p>
      {owner && <CommandForm send={send} action="period.close" label="Close period" build={f=>({through:value(f,"through"),reason:value(f,"reason")})}><Field label="Close through" name="through" type="date"/><Field label="Review evidence" name="reason"/></CommandForm>}
      {owner && <details><summary>Calendar-year closing</summary><p>Transfer income and expense balances to retained earnings and close December 31.</p><CommandForm send={send} action="year.close" label="Post year-end close" build={f=>({through:value(f,"through"),reason:value(f,"reason")})}><Field label="December 31 closing date" name="through" type="date"/><Field label="Review evidence" name="reason"/></CommandForm></details>}
      {owner && data.periods.active && <details><summary>Reopen closed books</summary><CommandForm send={send} action="period.reopen" label="Reopen period" build={f=>({through:data.periods.active!.through,reason:value(f,"reason")})}><Field label="Reason for reopening" name="reason"/></CommandForm></details>}
      <h3 className="font-semibold">Closing history</h3>{data.periods.history.map((h,i)=><p key={i}>{h.at} · {h.action} through {h.through} · {h.actor} · {h.reason}</p>)}</section>}
  </div>;
}
function JournalForm({ send, accounts }: { send:Send; accounts:View["accounts"] }) {
  const [lines,setLines]=useState(2);
  return <CommandForm send={send} action="journal.post" label="Post reviewed entry" build={f=>({date:value(f,"date"),memo:value(f,"memo"),lines:Array.from({length:lines},(_,i)=>({accountNumber:Number(value(f,`account${i}`)),debitCents:cents(value(f,`debit${i}`)||"0"),creditCents:cents(value(f,`credit${i}`)||"0")}))})}>
    <Field label="Posting date" name="date" type="date"/><Field label="Memo / source evidence" name="memo"/>{Array.from({length:lines},(_,i)=><div key={i} className="grid gap-2 sm:grid-cols-3"><label>Account<AccountSelect accounts={accounts} name={`account${i}`}/></label><Field label="Debit USD" name={`debit${i}`} defaultValue="0"/><Field label="Credit USD" name={`credit${i}`} defaultValue="0"/></div>)}<button className="dd-button" type="button" disabled={lines>=100} onClick={()=>setLines(lines+1)}>Add line</button>{lines>2&&<button className="dd-button" type="button" onClick={()=>setLines(lines-1)}>Remove last line</button>}
  </CommandForm>;
}
function ReportDates({data}:{data:View}) { return <form method="get" className="flex flex-wrap items-end gap-3"><Field label="Profit and loss from" name="from" type="date" required={false} defaultValue={data.reports.period.from}/><Field label="Reports through" name="through" type="date" required={false} defaultValue={data.reports.period.through}/><button className="dd-button">Apply dates</button><a className="dd-button" href={`/api/accounting/books/${data.book.id}?${new URLSearchParams({...data.reports.period,format:"csv"})}`}>Download trial balance</a></form>; }
function StatementImport({data,send}:{data:View;send:Send}) {
  const [csv,setCsv]=useState("date,description,amount,reference\n"), [error,setError]=useState("");
  return <details className="dd-card"><summary className="font-semibold">Import a bank statement</summary><p className="my-3">CSV columns: date,description,amount,reference. Use YYYY-MM-DD dates and signed USD amounts: deposits positive, withdrawals negative. Use the bank's unique transaction references.</p>
    <label>Read CSV file<input className="block" type="file" accept=".csv,text/csv" onChange={async e=>{const f=e.target.files?.[0]; if(!f)return; if(f.size>2000000){setError("Choose a CSV under 2 MB.");return;}setError("");setCsv(await f.text());}}/></label>{error&&<p role="alert">{error}</p>}
    <CommandForm send={send} action="statement.import" label="Import for review" build={f=>({accountNumber:Number(value(f,"account")),from:value(f,"from"),through:value(f,"through"),openingCents:cents(value(f,"opening")),closingCents:cents(value(f,"closing")),reference:value(f,"reference"),csv,openingEntryIds:f.getAll("openingIds").map(String)})}>
      <label>Bank account<AccountSelect accounts={data.accounts} name="account" bankOnly/></label><div className="grid gap-3 sm:grid-cols-2"><Field label="Statement start" name="from" type="date"/><Field label="Statement end" name="through" type="date"/><Field label="Opening balance USD" name="opening" defaultValue="0"/><Field label="Ending balance USD" name="closing"/><Field label="Statement reference" name="reference"/></div>
      <label className="grid">CSV preview<textarea className="h-36 rounded border p-2 font-mono" value={csv} onChange={e=>setCsv(e.target.value)} required/></label>
      <details><summary>First statement only: previously cleared opening entries</summary><p>Select only entries before the statement start that were already cleared by the bank. Their net amount must equal the opening balance.</p>{data.entries.map(e=><label key={e.id} className="flex gap-2"><input type="checkbox" name="openingIds" value={e.id}/>{e.date} · {e.memo}</label>)}</details>
    </CommandForm></details>;
}
function StatementReview({data,statement:s,canEdit,send}:{data:View;statement:BankStatement;canEdit:boolean;send:Send}) {
  return <section className="dd-card space-y-4"><h2 className="text-xl font-semibold">{s.reference} · {s.status === "reconciled" ? "Reconciled" : "Needs review"}</h2><p>{s.from} → {s.through} · Opening {formatCents(s.openingCents)} · Ending {formatCents(s.closingCents)}</p>
    {s.rows.map(row=>{const match=s.matches.find(m=>m.rowId===row.id);return <details key={row.id} className="border-t py-3"><summary>{match?"Matched":"Unmatched"} · {row.date} · {row.description} · {formatCents(row.amountCents)}</summary><p className="text-sm">Bank reference: {row.reference}</p>
      {match?<><p>Journal: {match.entryIds.join(", ")}</p>{canEdit&&s.status==="review"&&<CommandForm send={send} action="statement.unmatch" label="Remove match" build={()=>({id:s.id,revision:s.revision,rowId:row.id})}><p>The journal posting is retained.</p></CommandForm>}</>:
      canEdit&&s.status==="review"&&<div className="grid gap-4 lg:grid-cols-2"><div><h3 className="font-semibold">Match existing entries</h3><CommandForm send={send} action="statement.match" label="Save match" build={f=>({id:s.id,revision:s.revision,rowId:row.id,entryIds:f.getAll("entries").map(String)})}>{data.entries.filter(e=>e.lines.some(l=>l.accountNumber===s.accountNumber)).map(e=><label key={e.id} className="flex gap-2 text-sm"><input type="checkbox" name="entries" value={e.id}/>{e.date} · {e.memo} · {formatCents(e.lines.filter(l=>l.accountNumber===s.accountNumber).reduce((n,l)=>n+l.debitCents-l.creditCents,0))}</label>)}</CommandForm></div><SplitPost data={data} send={send} statement={s} rowId={row.id} amount={Math.abs(row.amountCents)}/></div>}</details>;})}
    {canEdit&&s.status==="review"&&<CommandForm send={send} action="statement.finish" label="Finish reconciliation" build={()=>({id:s.id,revision:s.revision})}><p>Every transaction must match and the cleared journal balance must equal the bank statement.</p></CommandForm>}
    {s.status==="reconciled"&&<div><p>Reconciled by {s.reconciledBy} · {s.reconciledAt}</p><p>Book balance: {formatCents(s.endingBookCents??0)}</p><h3 className="font-semibold">Outstanding entries at reconciliation</h3>{s.outstanding?.map(e=><p key={e.id}>{e.date} · {e.memo} · {formatCents(e.amountCents)}</p>)}</div>}
  </section>;
}
function SplitPost({data,send,statement:s,rowId,amount}:{data:View;send:Send;statement:BankStatement;rowId:string;amount:number}) {
  const [count,setCount]=useState(1);
  return <div><h3 className="font-semibold">Post an unrecorded transaction</h3><p className="text-sm">Check existing entries first to avoid posting the same activity twice.</p><CommandForm send={send} action="statement.post" label="Post and match" build={f=>({id:s.id,revision:s.revision,rowId,allocations:Array.from({length:count},(_,i)=>({accountNumber:Number(value(f,`account${i}`)),amountCents:cents(value(f,`amount${i}`))}))})}>{Array.from({length:count},(_,i)=><div key={i}><label>Offset account<AccountSelect accounts={data.accounts.filter(a=>a.number!==s.accountNumber)} name={`account${i}`}/></label><Field name={`amount${i}`} label="Allocation USD" defaultValue={i===0?(amount/100).toFixed(2):"0"}/></div>)}<button type="button" className="dd-button" onClick={()=>setCount(count+1)} disabled={count>=100}>Split into another account</button></CommandForm></div>;
}
