"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import type { InvoiceStatus, Payment } from "@/lib/payments/collections";
import type { CollectResult } from "@/app/collections/actions";
import type { CollectionsOverview } from "@/lib/payments/load";
type Submit = (action: string, input: Record<string, unknown>, done: () => void) => void;
const dollars = (s: string) => /^\d+(?:\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s) * 100) : NaN;
const box = "block w-full rounded border border-slate-300 p-2 text-sm";
export function CollectionsBoard({ statuses, payments, audit, team, canEdit, commandAction }: { statuses: InvoiceStatus[]; payments: Payment[]; audit: CollectionsOverview["audit"]; team: { id: string; name: string }[]; canEdit: boolean; commandAction: (command: unknown) => Promise<CollectResult> }) {
  const router = useRouter(), requests = useRef(new Map<string, string>()), [pending, start] = useTransition();
  const [message, setMessage] = useState(""), [search, setSearch] = useState(""), [showPaid, setShowPaid] = useState(false), [form, setForm] = useState<string | null>(null);
  const submit: Submit = (action, input, done) => {
    if (!canEdit) return;
    const key = JSON.stringify({ action, input }), requestId = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key, requestId);
    start(async () => { try {
      const result = await commandAction({ requestId, action, input }); setMessage(result.ok ? "Record saved." : result.error ?? "Could not save.");
      if (result.ok) { requests.current.delete(key); done(); router.refresh(); }
    } catch { setMessage("The response was interrupted. Retry these unchanged details to check the result without duplicating it."); } });
  };
  const visible = statuses.filter(s => (showPaid || (s.status !== "paid" && s.status !== "void")) && `${s.company} ${s.invoiceId} ${s.poRef ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-4">
    {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
    <div className="flex flex-wrap gap-4"><label className="text-sm">Find invoice <input aria-label="Find invoice" value={search} onChange={e => setSearch(e.target.value)} className={box} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} />Include paid and cancelled invoices</label></div>
    <p className="text-xs text-slate-500">Show paid invoices to review receipts or record a returned payment. Amounts are USD. Receipt fees are amounts actually withheld when that receipt reached the bank.</p>
    {visible.length === 0 && <p className="rounded-lg border p-4 text-sm">No invoices match these filters.</p>}
    {visible.map(s => <article key={s.invoiceId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{s.company}</h2><p className="text-xs text-slate-500">{s.invoiceId}{s.poRef ? ` · PO ${s.poRef}` : ""} · {s.status} · Due {s.dueDateISO}</p></div><p className="font-semibold">{formatCents(s.balanceCents)} due <span className="text-xs font-normal">of {formatCents(s.totalCents)}</span></p></div>
      <p className="mt-2 text-sm text-slate-600">{s.nextAction} · {s.reminders} reminder records</p>
      {(s.customerFeeCents > 0 || s.feeCents > 0 || s.returnFeeCents > 0) && <p className="mt-1 text-xs">Customer return charges: {formatCents(s.customerFeeCents)} · Receipt processing fees: {formatCents(s.feeCents)} · Bank return fees: {formatCents(s.returnFeeCents)}</p>}
      {s.legacyReturnNeedsReview && <p role="alert" className="mt-2 text-sm text-amber-900">An imported refund has no dated return record. Review the original evidence before using the accounting totals.</p>}
      {canEdit && <div className="my-3 flex flex-wrap gap-3 text-sm">{s.status !== "void" && s.balanceCents > 0 && <button type="button" disabled={pending} onClick={() => setForm(`payment:${s.invoiceId}`)} className="font-semibold text-emerald-700">Record receipt</button>}<button type="button" disabled={pending} onClick={() => setForm(`followup:${s.invoiceId}`)} className="text-emerald-700">Edit follow-up</button><button type="button" disabled={pending} onClick={() => setForm(`reminder:${s.invoiceId}`)} className="text-emerald-700">Log reminder</button></div>}
      {canEdit && form === `payment:${s.invoiceId}` && <ReceiptForm key={form} invoice={s} pending={pending} submit={submit} close={() => setForm(null)} />}
      {canEdit && form === `followup:${s.invoiceId}` && <FollowupForm key={form} invoice={s} team={team} pending={pending} submit={submit} close={() => setForm(null)} />}
      {canEdit && form === `reminder:${s.invoiceId}` && <ReminderForm key={form} invoice={s} pending={pending} submit={submit} close={() => setForm(null)} />}
      <div className="mt-3 space-y-2">{payments.filter(p => p.invoiceId === s.invoiceId).map(p => <div key={p.id} className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="font-medium">{formatCents(p.amountCents)} · {p.method} · Received {p.receivedAtISO}</p><p className="text-xs">Reference: {p.reference || "Not recorded in legacy data"} · {p.actor || "Original author unavailable"}</p>{p.evidence && <p className="mt-1 text-xs">{p.evidence}</p>}
        {p.returned && <div className="mt-2 border-l-2 border-amber-300 pl-3 text-xs"><p>Returned {p.returned.date} · {p.returned.reference} · {p.returned.actor}</p><p>{p.returned.reason} · {p.returned.evidence}</p><p>Bank fee: {formatCents(p.returned.bankFeeCents)} · Customer fee: {formatCents(p.returned.customerFeeCents)} (tax included: {formatCents(p.returned.customerFeeTaxCents)})</p>{p.returned.customerFeeEvidence && <p>{p.returned.customerFeeEvidence}</p>}</div>}
        {canEdit && !p.returned && <button type="button" disabled={pending} onClick={() => setForm(`return:${p.id}`)} className="mt-2 font-semibold text-amber-900">{p.refunded ? "Review imported return" : "Record returned payment"}</button>}
        {canEdit && form === `return:${p.id}` && <ReturnForm key={form} payment={p} pending={pending} submit={submit} close={() => setForm(null)} />}
      </div>)}</div>
      <details className="mt-3 text-xs"><summary className="cursor-pointer">Collection history</summary>{audit.filter(a => a.recordId === s.invoiceId || (a.snapshot && typeof a.snapshot === "object" && "invoiceId" in a.snapshot && a.snapshot.invoiceId === s.invoiceId)).map(a => <p key={a.id} className="mt-1">{a.at} · {a.actor} · {a.action}{a.snapshot && typeof a.snapshot === "object" && "note" in a.snapshot ? ` · ${String(a.snapshot.note)}` : ""}</p>)}</details>
    </article>)}
  </div>;
}
function Frame({ title, children, pending, close, submit, disabled, button, reviewed, setReviewed }: { title: string; children: ReactNode; pending: boolean; close: () => void; submit: () => void; disabled?: boolean; button: string; reviewed?: boolean; setReviewed?: (value: boolean) => void }) {
  return <fieldset disabled={pending} onChangeCapture={e => { if (setReviewed && (e.target as HTMLElement).getAttribute("data-review") !== "true") setReviewed(false); }} className="my-3 space-y-3 rounded-lg border p-3"><legend className="px-2 font-semibold">{title}</legend><div className="grid gap-3 sm:grid-cols-2">{children}</div>{setReviewed && <label className="flex items-center gap-2 text-sm"><input data-review="true" type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the dates, amounts and supporting records.</label>}<button type="button" disabled={disabled || (setReviewed ? !reviewed : false)} onClick={submit} className="mr-3 rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">{button}</button><button type="button" onClick={close} className="text-sm">Cancel</button></fieldset>;
}
function Field({ label, value, set, type = "text" }: { label: string; value: string; set: (value: string) => void; type?: string }) { return <label className="text-sm">{label}<input aria-label={label} type={type} value={value} onChange={e => set(e.target.value)} className={box} /></label>; }
type Common = { pending: boolean; submit: Submit; close: () => void };
function ReceiptForm({ invoice, ...props }: Common & { invoice: InvoiceStatus }) {
  const [amount, setAmount] = useState((invoice.balanceCents / 100).toFixed(2)), [fee, setFee] = useState("0"), [date, setDate] = useState(""), [method, setMethod] = useState("check"), [reference, setReference] = useState(""), [evidence, setEvidence] = useState(""), [reviewed, setReviewed] = useState(false);
  return <Frame {...props} title="Record received money" button="Save receipt" reviewed={reviewed} setReviewed={setReviewed} disabled={!date || !reference.trim() || evidence.trim().length < 3 || !Number.isSafeInteger(dollars(amount)) || dollars(amount) <= 0 || !Number.isSafeInteger(dollars(fee))} submit={() => props.submit("payment.record", { invoiceId: invoice.invoiceId, amountCents: dollars(amount), feeCents: dollars(fee), receivedAtISO: date, method, reference, evidence, reviewed }, props.close)}>
    <Field label="Receipt amount $" value={amount} set={setAmount} /><Field label="Fee withheld $" value={fee} set={setFee} /><Field label="Receipt date" type="date" value={date} set={setDate} /><label className="text-sm">Payment method<select aria-label="Payment method" value={method} onChange={e => setMethod(e.target.value)} className={box}>{["check", "cash", "card", "link", "other"].map(m => <option key={m}>{m}</option>)}</select></label><Field label="Receipt reference" value={reference} set={setReference} /><Field label="Receipt evidence" value={evidence} set={setEvidence} />
  </Frame>;
}
function ReturnForm({ payment, ...props }: Common & { payment: Payment }) {
  const [date, setDate] = useState(""), [reference, setReference] = useState(""), [reason, setReason] = useState(""), [evidence, setEvidence] = useState(""), [bankFee, setBankFee] = useState("0"), [customerFee, setCustomerFee] = useState("0"), [tax, setTax] = useState("0"), [basis, setBasis] = useState(""), [reviewed, setReviewed] = useState(false);
  return <Frame {...props} title="Record returned money" button="Save returned payment" reviewed={reviewed} setReviewed={setReviewed} disabled={!date || !reference.trim() || reason.trim().length < 3 || evidence.trim().length < 3 || [bankFee, customerFee, tax].some(v => !Number.isSafeInteger(dollars(v)))} submit={() => props.submit("payment.return", { paymentId: payment.id, date, reference, reason, evidence, bankFeeCents: dollars(bankFee), customerFeeCents: dollars(customerFee), customerFeeTaxCents: dollars(tax), customerFeeEvidence: basis, reviewed }, props.close)}>
    <p className="text-sm sm:col-span-2">Record the bank&apos;s return of {formatCents(payment.amountCents)} and reopen that amount due. Original processing fees remain recorded. This records an external event; it does not transfer money or issue a customer credit.</p>
    <Field label="Return date" type="date" value={date} set={setDate} /><Field label="Bank return reference" value={reference} set={setReference} /><Field label="Return reason" value={reason} set={setReason} /><Field label="Return evidence" value={evidence} set={setEvidence} /><Field label="Additional bank fee $" value={bankFee} set={setBankFee} /><Field label="Customer return fee including tax $" value={customerFee} set={setCustomerFee} /><Field label="Tax included in customer fee $" value={tax} set={setTax} /><Field label="Reviewed customer fee basis" value={basis} set={setBasis} />
  </Frame>;
}
function FollowupForm({ invoice, team, ...props }: Common & { invoice: InvoiceStatus; team: { id: string; name: string }[] }) {
  const [date, setDate] = useState(invoice.promisedDate ?? ""), [owner, setOwner] = useState(invoice.escalatedTo ?? ""), [note, setNote] = useState(invoice.collectionNote);
  return <Frame {...props} title="Collection follow-up" button="Save follow-up" submit={() => props.submit("collection.update", { invoiceId: invoice.invoiceId, revision: invoice.collectionRevision, promisedDate: date || null, escalatedTo: owner || null, note }, props.close)}><Field label="Promised payment date" type="date" value={date} set={setDate} /><label className="text-sm">Responsible person<select aria-label="Responsible person" value={owner} onChange={e => setOwner(e.target.value)} className={box}><option value="">Unassigned</option>{owner && !team.some(t => t.name === owner) && <option>{owner}</option>}{team.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></label><Field label="Follow-up notes" value={note} set={setNote} /></Frame>;
}
function ReminderForm({ invoice, ...props }: Common & { invoice: InvoiceStatus }) {
  const [date, setDate] = useState(""), [note, setNote] = useState("");
  return <Frame {...props} title="Log a reminder already made" button="Save reminder record" disabled={!date || note.trim().length < 3} submit={() => props.submit("reminder.record", { invoiceId: invoice.invoiceId, date, note }, props.close)}><Field label="Reminder date" type="date" value={date} set={setDate} /><Field label="Reminder details" value={note} set={setNote} /></Frame>;
}
