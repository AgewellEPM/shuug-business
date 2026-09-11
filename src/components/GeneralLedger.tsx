"use client";

/**
 * General ledger UI: Trial Balance, ledger-derived P&L + Balance Sheet, the journal
 * (auto-posted + manual), and a balanced manual-entry form that won't submit until
 * debits equal credits — the app enforces double-entry, the user can't post junk.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import type { JournalEntry, TrialBalance, LedgerIncomeStatement, LedgerBalanceSheet, JournalLine } from "@/lib/accounting/ledger";
import type { ActionResult } from "@/app/ledger/actions";

interface Account { number: number; name: string; type: string; active?: boolean }
interface Actions {
  journalCommandAction: (command: unknown) => Promise<ActionResult>;
}

type FormLine = { accountNumber: number; debit: string; credit: string };
const dollarsToCents = (s: string) => (s.trim() === "" ? 0 : /^\d+(?:\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s) * 100) : NaN);

export function GeneralLedger({ entries, trialBalance, incomeStatement, balanceSheet, accounts, canEdit, ...actions }: {
  entries: JournalEntry[]; trialBalance: TrialBalance; incomeStatement: LedgerIncomeStatement; balanceSheet: LedgerBalanceSheet; accounts: Account[]; canEdit: boolean;
} & Actions) {
  const activeAccounts = accounts.filter(a => a.active !== false);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const requests = useRef(new Map<string, string>());
  const [reviewed, setReviewed] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reversalDate, setReversalDate] = useState("");
  const [reason, setReason] = useState("");
  const [reversalReviewed, setReversalReviewed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<FormLine[]>([{ accountNumber: activeAccounts[0].number, debit: "", credit: "" }, { accountNumber: activeAccounts[1].number, debit: "", credit: "" }]);

  const run = (action: string, input: Record<string, unknown>, after: () => void) => {
    if (!canEdit) return;
    const key = JSON.stringify({ action, input });
    const requestId = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, requestId);
    start(async () => {
      try {
        const r = await actions.journalCommandAction({ requestId, action, input });
        setToast(r.ok ? "Journal entry recorded." : r.error ?? "Could not record the entry.");
        if (r.ok) { requests.current.delete(key); after(); router.refresh(); }
      } catch { setToast("The response was interrupted. Retry this unchanged entry to check its result without posting it twice."); }
    });
  };

  const debitTotal = lines.reduce((n, l) => n + dollarsToCents(l.debit), 0);
  const creditTotal = lines.reduce((n, l) => n + dollarsToCents(l.credit), 0);
  const balanced = Number.isSafeInteger(debitTotal) && Number.isSafeInteger(creditTotal) && debitTotal > 0 && debitTotal === creditTotal;

  const setLine = (i: number, patch: Partial<FormLine>) => { setReviewed(false); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };
  const post = () => {
    const jl: JournalLine[] = lines.map((l) => ({ accountNumber: l.accountNumber, debitCents: dollarsToCents(l.debit), creditCents: dollarsToCents(l.credit) })).filter((l) => l.debitCents > 0 || l.creditCents > 0);
    run("journal.post", { date, memo, lines: jl, reviewed }, () => { setAdding(false); setReviewed(false); setMemo(""); setLines([{ accountNumber: activeAccounts[0].number, debit: "", credit: "" }, { accountNumber: activeAccounts[1].number, debit: "", credit: "" }]); });
  };
  const nameOf = (n: number) => accounts.find((a) => a.number === n)?.name ?? `#${n}`;

  return (
    <div className="space-y-6">
      {toast && <p role="status" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Trial balance */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="p-4 pb-2 text-sm font-semibold text-slate-900">Trial balance</h2>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="py-2 text-left">Account</th><th className="py-2 text-right">Debit</th><th className="py-2 text-right">Credit</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialBalance.rows.map((r) => (
                  <tr key={r.accountNumber}>
                    <td className="py-1.5 text-slate-700">{r.accountNumber} · {r.name}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-700">{r.debitCents ? formatCents(r.debitCents) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-700">{r.creditCents ? formatCents(r.creditCents) : "—"}</td>
                  </tr>
                ))}
                {trialBalance.rows.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400">No activity yet.</td></tr>}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-semibold">
                <tr>
                  <td className="py-2 text-slate-900">Total {trialBalance.balanced ? "✓" : "✗ out of balance"}</td>
                  <td className="py-2 text-right tabular-nums">{formatCents(trialBalance.totalDebitCents)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCents(trialBalance.totalCreditCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Statements from the ledger */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Income statement</h2>
            <Row label="Income" cents={incomeStatement.incomeCents} />
            <Row label="Cost of goods" cents={-incomeStatement.cogsCents} />
            <Row label="Gross profit" cents={incomeStatement.grossProfitCents} strong />
            <Row label="Operating expenses" cents={-incomeStatement.expenseCents} />
            <Row label="Net income" cents={incomeStatement.netIncomeCents} strong />
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Balance sheet</h2>
            <Row label="Assets" cents={balanceSheet.assetsCents} strong />
            <Row label="Liabilities" cents={balanceSheet.liabilitiesCents} />
            <Row label="Equity (incl. net income)" cents={balanceSheet.equityCents} />
            <p className={`mt-2 text-xs font-semibold ${balanceSheet.balanced ? "text-emerald-700" : "text-red-600"}`}>{balanceSheet.balanced ? "Assets = Liabilities + Equity ✓" : "Out of balance ✗"}</p>
          </section>
        </div>
      </div>

      {/* Journal */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Journal ({entries.length})</h2>
          {canEdit && <button type="button" disabled={pending} onClick={() => setAdding((a) => !a)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">{adding ? "Cancel" : "+ Manual entry"}</button>}
        </div>

        {adding && canEdit && (
          <fieldset disabled={pending} className="mx-4 mb-4 space-y-3 rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">
              <input aria-label="Posting date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setReviewed(false); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
              <input aria-label="Entry memo" maxLength={1000} value={memo} onChange={(e) => { setMemo(e.target.value); setReviewed(false); }} placeholder="Memo (e.g. depreciation, owner draw)" className="min-w-[200px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select aria-label={`Account ${i + 1}`} value={l.accountNumber} onChange={(e) => setLine(i, { accountNumber: Number(e.target.value) })} className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm">
                  {accounts.filter(a => a.active !== false).map((a) => <option key={a.number} value={a.number}>{a.number} · {a.name}</option>)}
                </select>
                <input aria-label={`Debit ${i + 1}`} inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })} placeholder="Debit $" className="w-28 rounded border border-slate-300 px-2 py-1.5 text-right text-sm" />
                <input aria-label={`Credit ${i + 1}`} inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })} placeholder="Credit $" className="w-28 rounded border border-slate-300 px-2 py-1.5 text-right text-sm" />
                {lines.length > 2 && <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => { setReviewed(false); setLines((ls) => ls.filter((_, j) => j !== i)); }} className="text-slate-400 hover:text-red-600">×</button>}
              </div>
            ))}
            <div className="flex items-center gap-3 text-xs">
              <button type="button" disabled={lines.length >= 100} onClick={() => { setReviewed(false); setLines((ls) => [...ls, { accountNumber: activeAccounts[0].number, debit: "", credit: "" }]); }} className="font-semibold text-emerald-700">+ line</button>
              <span className={`ml-auto tabular-nums ${balanced ? "text-emerald-700" : "text-slate-500"}`}>Dr {Number.isFinite(debitTotal) ? formatCents(debitTotal) : "Invalid amount"} · Cr {Number.isFinite(creditTotal) ? formatCents(creditTotal) : "Invalid amount"} {balanced ? "✓ balanced" : "— must match"}</span>
              <button type="button" disabled={pending || !balanced || !date || !memo.trim() || !reviewed} onClick={post} className="rounded-lg bg-slate-900 px-4 py-1.5 font-semibold text-white disabled:opacity-40">Post entry</button>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the posting date, accounts and amounts.</label>
          </fieldset>
        )}

        <div className="divide-y divide-slate-100">
          {entries.map((e) => (
            <div key={e.id} id={e.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">{e.memo}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">{e.date} · {e.source === "manual" ? "manual" : "auto"}</span>
                  {e.source === "manual" && canEdit && !e.manual?.reversedById && <button type="button" disabled={pending} onClick={() => { setReversing(e.id); setReversalDate(""); setReason(""); setReversalReviewed(false); }} className="text-xs font-semibold text-emerald-700">Review reversal</button>}
                </div>
              </div>
              {e.manual && <p className="mt-1 text-xs text-slate-500">Recorded by {e.manual.actor} · {e.manual.recordedAt}
                {e.manual.imported && " · Imported historical entry"}
                {e.manual.reversesId && <> · <a className="underline" href={`#${e.manual.reversesId}`}>Original entry</a> · {e.manual.reason}</>}
                {e.manual.reversedById && <> · <a className="underline" href={`#${e.manual.reversedById}`}>Recorded reversal</a></>}
              </p>}
              {reversing === e.id && canEdit && <fieldset disabled={pending} className="my-3 space-y-3 rounded-lg border border-amber-200 p-3">
                <p className="text-sm">This adds equal and opposite amounts. The original entry stays in the journal.</p>
                <label className="block text-sm">Reversal date <input aria-label="Reversal date" type="date" min={e.date} value={reversalDate} onChange={v => { setReversalDate(v.target.value); setReversalReviewed(false); }} className="rounded border p-2" /></label>
                <label className="block text-sm">Correction reason <input aria-label="Correction reason" maxLength={1000} value={reason} onChange={v => { setReason(v.target.value); setReversalReviewed(false); }} className="w-full rounded border p-2" /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reversalReviewed} onChange={v => setReversalReviewed(v.target.checked)} />I reviewed this reversal and its date.</label>
                <button type="button" disabled={!reversalDate || reason.trim().length < 3 || !reversalReviewed} onClick={() => run("journal.reverse", { id: e.id, revision: 1, date: reversalDate, reason, reviewed: reversalReviewed }, () => setReversing(null))} className="mr-3 rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">Record reversal</button>
                <button type="button" onClick={() => setReversing(null)} className="text-sm">Cancel reversal</button>
              </fieldset>}
              <div className="mt-1 space-y-0.5">
                {e.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-500">
                    <span className={l.debitCents ? "" : "pl-6"}>{nameOf(l.accountNumber)}</span>
                    <span className="tabular-nums">{l.debitCents ? `Dr ${formatCents(l.debitCents)}` : `Cr ${formatCents(l.creditCents)}`}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {entries.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No journal entries yet — post a sale or add one manually.</p>}
        </div>
      </section>
    </div>
  );
}

function Row({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${strong ? "border-t border-slate-100 pt-1 font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span><span className="tabular-nums">{formatCents(cents)}</span>
    </div>
  );
}
