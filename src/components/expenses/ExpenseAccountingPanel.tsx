"use client";
import { useRef, useState, type ReactNode } from "react";
import type { Expense } from "@/lib/expenses/model";
import { decimalCents, money } from "@/lib/expenses/model";
import { expenseOutstanding, type ExpenseAllocation } from "@/lib/expenses/accounting-model";
import type { WorkspaceAccount } from "@/lib/accounting/account-model";

const field = "dd-input mt-1 block w-full", button = "dd-primary";
const text = (f: FormData, key: string) => String(f.get(key) ?? "");
function cents(f: FormData, key: string) { const value = decimalCents(text(f, key)); if (value === null) throw new Error("Enter every required monetary amount."); return value; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm">{label}{children}</label>; }
function Amount({ label, name, value, required = true }: { label: string; name: string; value?: number; required?: boolean }) { return <Field label={label}><input className={field} name={name} inputMode="decimal" defaultValue={value === undefined ? "" : (value / 100).toFixed(2)} required={required}/></Field>; }
function Account({ label, name, accounts, value, optional }: { label: string; name: string; accounts: WorkspaceAccount[]; value?: number; optional?: boolean }) { return <Field label={label}><select className={field} name={name} defaultValue={value ?? ""} required={!optional}><option value="">{optional ? "No exchange difference" : "Choose account"}</option>{accounts.filter(a => a.active).map(a => <option key={a.number} value={a.number}>{a.number} · {a.name}</option>)}</select></Field>; }
function Evidence({ label, name = "evidence" }: { label: string; name?: string }) { return <Field label={label}><textarea className={field} name={name} minLength={3} maxLength={2000} required/></Field>; }
const paymentAccounts = (accounts: WorkspaceAccount[]) => accounts.filter(a => ["bank", "credit_card"].includes(a.classification));
function PaymentFields({ row, accounts, today, amount }: { row: Expense; accounts: WorkspaceAccount[]; today: string; amount: number }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Actual settlement date"><input className={field} type="date" name="payment.date" min={row.accounting?.lastEventDate ?? row.fields.date} max={today} defaultValue={today} required/></Field>
    <Account label="Payment or refund account" name="payment.account" accounts={paymentAccounts(accounts)} value={1000}/>
    <Amount label={`Amount settled (${row.fields.currency})`} name="payment.amount" value={amount}/>
    {row.fields.currency !== "USD" && <Amount label="Actual principal paid or received (USD)" name="payment.home"/>}
    <Amount label="Additional payment fees (USD)" name="payment.fee" value={0}/>
    {row.fields.currency !== "USD" && <Account label="Realized exchange gain/loss account" name="payment.fx" accounts={accounts.filter(a => ["income", "expense"].includes(a.type))} optional/>}
    <Field label="Unique settlement reference"><input className={field} name="payment.reference" maxLength={160} required/></Field>
    <Evidence label="Bank or card settlement evidence" name="payment.evidence"/>
  </div>;
}
function payment(f: FormData, row: Expense) { return { date: text(f, "payment.date"), accountNumber: Number(text(f, "payment.account")), amountCents: cents(f, "payment.amount"), homeAmountCents: cents(f, row.fields.currency === "USD" ? "payment.amount" : "payment.home"), feeCents: cents(f, "payment.fee"), fxAccountNumber: text(f, "payment.fx") ? Number(text(f, "payment.fx")) : null, reference: text(f, "payment.reference"), evidence: text(f, "payment.evidence") }; }

export function ExpenseAccountingPanel({ row, accounts, today, disabled, saved }: { row: Expense; accounts: WorkspaceAccount[]; today: string; disabled: boolean; saved: (row: Expense) => void }) {
  const a = row.accounting, outstanding = a ? expenseOutstanding(a) : null;
  const defaultMode = !a ? row.fields.treatment === "transfer" ? "transfer" : "post" : a.mode === "transfer" ? "void" : outstanding?.amountCents ? "settle" : "correct";
  const [mode, setMode] = useState(defaultMode), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reviewed, setReviewed] = useState(false);
  const [withPayment, setWithPayment] = useState(row.fields.paymentStatus === "paid");
  const [returnId, setReturnId] = useState(a?.settlements.find(p => !p.reversal)?.id ?? "");
  const requests = useRef(new Map<string, string>());
  const blocked = disabled || busy, originalPayment = a?.settlements.find(p => p.id === returnId);
  const canPost = !a && row.status === "recorded", canChange = a?.status === "posted";
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError("");
    try {
      const f = new FormData(form), common = { id: row.id, revision: row.revision, reviewed: true, evidence: text(f, "evidence") };
      let action: string, input: unknown;
      if (mode === "post" || mode === "correct") {
        const amountCents = mode === "correct" ? cents(f, "receipt.amount") : row.fields.amountCents!;
        const fields = mode === "correct" ? { ...row.fields, amountCents, taxCents: decimalCents(text(f, "receipt.tax")), category: text(f, "receipt.category") || row.fields.category } : row.fields;
        const value = { homeAmountCents: row.fields.currency === "USD" ? amountCents : cents(f, "home"), conversionEvidence: text(f, "conversion"), dueDate: text(f, "dueDate"), allocations: JSON.parse(text(f, "allocations")) };
        action = mode === "post" ? "expense.post" : "expense.correct";
        input = mode === "post" ? { ...common, ...value, settlement: withPayment ? payment(f, row) : null } : { ...common, ...value, fields, date: text(f, "date") };
      } else if (mode === "settle") { action = "expense.settle"; input = { id: row.id, revision: row.revision, reviewed: true, ...payment(f, row) }; }
      else if (mode === "reverse") { action = "expense.settlement.reverse"; input = { ...common, settlementId: returnId, date: text(f, "date"), homeAmountCents: cents(f, "return.home"), feeRefundCents: cents(f, "return.feeRefund"), additionalFeeCents: cents(f, "return.fee"), fxAccountNumber: text(f, "return.fx") ? Number(text(f, "return.fx")) : null, reference: text(f, "return.reference") }; }
      else if (mode === "void") { action = "expense.void"; input = { ...common, date: text(f, "date") }; }
      else { action = "expense.transfer"; input = { ...common, fromAccount: Number(text(f, "from")), toAccount: Number(text(f, "to")) }; }
      const key = JSON.stringify({ action, input }), requestId = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key, requestId);
      const response = await fetch("/api/accounting/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action, input }) });
      const result = await response.json(); if (!response.ok || !result.expense) throw new Error(result.error ?? "Could not confirm the posting. Retry the same reviewed values."); saved(result.expense);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm the posting. Retry the same reviewed values."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 space-y-4 border-t pt-5" aria-label="Expense accounting">
    <h2 className="text-lg font-semibold">Bill and payment accounting</h2>
    {!a && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">This receipt has not been posted to the ledger. Review its accounts and actual settlement dates. Older saved receipts retain their original files; a paid label alone is not payment evidence.</p>}
    {a && <div className="space-y-2 rounded border bg-slate-50 p-3 text-sm"><p>{a.status === "voided" ? "Voided with accounting history preserved" : "Posted to the general ledger"} · {a.postedBy}<br/>Posted value {money(a.homeAmountCents)} USD · Due {a.dueDate}</p>
      {a.mode === "bill" && <p><strong>{row.fields.kind === "refund" ? "Vendor credit still owed to you" : "Remaining bill balance"}: {money(outstanding!.amountCents, row.fields.currency)}</strong> · USD carrying value {money(outstanding!.homeAmountCents)}</p>}
      <p>Archiving preserves these entries and any remaining balance. <a className="underline" href="/ledger">Open general ledger</a></p>
    </div>}
    {error && <p role="alert" className="rounded bg-amber-50 p-3 text-sm">{error}</p>}
    {(canPost || canChange) && <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (reviewed) void submit(e.currentTarget); }} onChange={e => { if (!(e.target instanceof HTMLInputElement) || e.target.name !== "reviewed") setReviewed(false); }}>
      <fieldset disabled={blocked} className="space-y-4">
        {canChange && <Field label="Accounting action"><select className={field} value={mode} onChange={e => setMode(e.target.value)}>
          {a.mode === "bill" && <><option value="settle" disabled={!outstanding?.amountCents}>Record a dated payment or refund receipt</option><option value="correct">Correct account allocations or amount</option>{a.settlements.some(p => !p.reversal) && <option value="reverse">Record a returned settlement</option>}</>}
          <option value="void" disabled={!!outstanding?.settledAmountCents}>Void the unsettled posting</option>
        </select></Field>}
        <div key={mode} className="space-y-4">
          {(mode === "post" || mode === "correct") && <>
            {mode === "correct" && <><Amount label={`Corrected receipt total (${row.fields.currency})`} name="receipt.amount" value={row.fields.amountCents!}/><Amount label={`Corrected included tax (${row.fields.currency})`} name="receipt.tax" value={row.fields.taxCents ?? undefined} required={false}/><p className="text-sm">A dated correction reverses the prior account allocation and posts the reviewed replacement. Original payments remain intact. Use a separate vendor credit when a reduction is below the amount already settled.</p></>}
            <Field label="Bill or credit due date"><input className={field} name="dueDate" type="date" defaultValue={a?.dueDate ?? row.fields.date} min={row.fields.date} required/></Field>
            {row.fields.currency !== "USD" && <><Amount label="Reviewed receipt value in USD" name="home" value={a?.homeAmountCents}/><Evidence label="USD conversion evidence" name="conversion"/></>}
            <Allocations row={row} accounts={accounts}/>
          </>}
          {mode === "post" && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={withPayment} onChange={e => setWithPayment(e.target.checked)}/>Record an actual settlement with this posting</label>{withPayment && <PaymentFields {...{ row, accounts, today }} amount={row.fields.amountCents!}/>}</>}
          {mode === "settle" && <PaymentFields {...{ row, accounts, today }} amount={outstanding?.amountCents ?? 0}/>}
          {["correct", "void", "reverse"].includes(mode) && <Field label="Correction or return date"><input className={field} type="date" name="date" min={a?.lastEventDate} max={today} defaultValue={today} required/></Field>}
          {mode === "reverse" && <><Field label="Settlement returned"><select className={field} value={returnId} onChange={e => setReturnId(e.target.value)} required>{a?.settlements.filter(p => !p.reversal).map(p => <option value={p.id} key={p.id}>{p.date} · {p.reference} · {money(p.amountCents, row.fields.currency)}</option>)}</select></Field>
            <div key={returnId} className="space-y-3"><Amount label="Actual returned principal (USD)" name="return.home" value={originalPayment?.homeAmountCents}/><Amount label="Original fees refunded (USD)" name="return.feeRefund" value={0}/><Amount label="Additional return fees (USD)" name="return.fee" value={0}/></div>
            {row.fields.currency !== "USD" && <Account label="Return exchange gain/loss account" name="return.fx" accounts={accounts.filter(a => ["income", "expense"].includes(a.type))} optional/>}
            <Field label="Unique return reference"><input className={field} name="return.reference" maxLength={160} required/></Field><p className="text-sm">The full original currency settlement is returned. Original fees remain unless an actual fee refund is entered; additional bank fees are recorded separately.</p>
          </>}
          {mode === "transfer" && <><p className="text-sm">Record an already completed bank transfer, card payment, loan principal payment or owner transfer. This moves balances between accounts without creating another purchase.</p><Account label="Transfer from account" name="from" accounts={accounts.filter(a => ["bank", "credit_card", "long_term_liability", "equity"].includes(a.classification))} value={1000}/><Account label="Transfer to account" name="to" accounts={accounts.filter(a => ["bank", "credit_card", "long_term_liability", "equity"].includes(a.classification))}/></>}
          {mode === "void" && <p className="text-sm">A dated reversal preserves the original posting. A paid bill requires a vendor credit or an actual returned settlement first.</p>}
          {mode !== "settle" && <Evidence label="Accounting review evidence"/>}
        </div>
        <label className="flex gap-2 text-sm"><input name="reviewed" type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} required/>I reviewed these accounts, amounts, dates and supporting evidence.</label>
        <p className="text-xs">This records your books. It does not send payments or synchronize entries to an external accounting service. Inventory allocations record value; quantities still require their inventory workflow.</p>
        <button className={button} disabled={blocked || !reviewed}>{busy ? "Recording…" : mode === "post" ? "Post reviewed bill or vendor credit" : mode === "settle" ? "Record verified settlement" : mode === "correct" ? "Post dated correction" : mode === "reverse" ? "Record returned settlement" : mode === "void" ? "Post dated void" : "Post reviewed transfer"}</button>
      </fieldset>
    </form>}
    {a && <details><summary className="cursor-pointer text-sm font-semibold">Settlement and posting evidence · {a.settlements.length} settlements</summary><div className="mt-3 space-y-3 text-sm"><p>{a.evidence}</p>{a.conversionEvidence && <p>{a.conversionEvidence}</p>}{a.settlements.map(p => <article className="rounded border p-3" key={p.id}><p>{p.date} · {p.reference} · {money(p.amountCents, row.fields.currency)} · {p.actor}</p><p>USD principal {money(p.homeAmountCents)} · Fees {money(p.feeCents)} · Account {p.accountNumber}</p><p>{p.evidence}</p>{p.reversal && <p className="mt-2">Returned {p.reversal.date}: {p.reversal.reference} · {p.reversal.evidence} · {p.reversal.actor}<br/>Fee refund {money(p.reversal.feeRefundCents)} · Additional fees {money(p.reversal.additionalFeeCents)}</p>}</article>)}</div></details>}
  </section>;
}

function Allocations({ row, accounts }: { row: Expense; accounts: WorkspaceAccount[] }) {
  const initialPurpose = row.fields.treatment === "inventory" ? "inventory" : row.fields.treatment === "asset" ? "asset" : "operating";
  const [lines, setLines] = useState(() => (row.accounting?.allocations ?? [{ purpose: initialPurpose, accountNumber: initialPurpose === "operating" ? 6000 : initialPurpose === "inventory" ? 1300 : 0, amountCents: row.fields.currency === "USD" ? row.fields.amountCents! : 0 }]).map(l => ({ purpose: l.purpose as ExpenseAllocation["purpose"], accountNumber: String(l.accountNumber || ""), amount: l.amountCents ? (l.amountCents / 100).toFixed(2) : "" })));
  function update(index: number, part: Partial<typeof lines[number]>) { setLines(lines.map((l, i) => i === index ? { ...l, ...part } : l)); }
  let serialized = "[]", total = 0; try { const allocations = lines.map(l => ({ purpose: l.purpose, accountNumber: Number(l.accountNumber), amountCents: decimalCents(l.amount) })); serialized = JSON.stringify(allocations); total = allocations.reduce((n, l) => n + (l.amountCents ?? 0), 0); } catch { /* Amount validation remains visible on submit; original input is retained. */ }
  return <div className="space-y-3"><h3 className="font-semibold">Allocate the total to accounts</h3><p className="text-sm">Allocation amounts use USD and must add up to the reviewed total. Split recoverable tax only where your reviewed accounting treatment requires it. <a className="underline" href="/ledger/accounts">Manage account classifications</a>.</p>
    <input type="hidden" name="allocations" value={serialized}/>
    {lines.map((line, index) => <div key={index} className="grid gap-3 rounded border p-3 sm:grid-cols-2">
      <Field label={`Allocation ${index + 1} purpose`}><select className={field} value={line.purpose} onChange={e => update(index, { purpose: e.target.value as ExpenseAllocation["purpose"] })}><option value="operating">Operating cost</option><option value="cost_of_sales">Cost of goods sold</option><option value="inventory">Inventory value</option><option value="asset">Fixed or other asset</option><option value="tax">Recoverable tax asset</option></select></Field>
      <Field label={`Allocation ${index + 1} account`}><select className={field} value={line.accountNumber} onChange={e => update(index, { accountNumber: e.target.value })} required><option value="">Choose account</option>{accounts.filter(a => a.active).map(a => <option key={a.number} value={a.number}>{a.number} · {a.name}</option>)}</select></Field>
      <Field label={`Allocation ${index + 1} amount (USD)`}><input className={field} value={line.amount} inputMode="decimal" onChange={e => update(index, { amount: e.target.value })} required/></Field><button type="button" className="dd-secondary self-end" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, n) => n !== index))}>Remove allocation {index + 1}</button>
    </div>)}
    <p className="text-sm">Allocated {money(total)} USD</p><button className="dd-secondary" type="button" disabled={lines.length >= 100} onClick={() => setLines([...lines, { purpose: "operating", accountNumber: "", amount: "" }])}>Add account allocation</button>
  </div>;
}
