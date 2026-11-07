import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { financialReports } from "@/lib/accounting/reports";

export function FinancialReports({ report, journalHref = "/ledger" }: { report: ReturnType<typeof financialReports>; journalHref?: string }) {
  const pnl = report.pnl, bs = report.balanceSheet;
  const rows = (type: string) => report.trialBalance.rows.filter(a => a.type === type);
  const amount = (type: string, d: number, c: number) => ["asset", "expense", "cogs"].includes(type) ? d - c : c - d;
  return <div className="space-y-6">
    <section className="dd-card space-y-3"><h2 className="text-xl font-semibold">Profit &amp; loss</h2><p className="text-sm text-slate-500">{report.period.from ?? "First recorded entry"} through {report.period.through ?? "latest recorded entry"}</p>
      <Value label="Income" cents={pnl.incomeCents}/><Value label="Cost of goods sold" cents={pnl.cogsCents}/><Value label="Gross profit" cents={pnl.grossProfitCents}/>
      {pnl.operatingExpensesByCategory.map((r, i) => <Value key={i} label={r.label} cents={r.cents}/>)}<Value label="Operating expenses" cents={pnl.expenseCents}/><Value label="Net profit" cents={pnl.netIncomeCents}/>
    </section>
    <section className="dd-card space-y-3"><h2 className="text-xl font-semibold">Balance sheet</h2><p className="text-sm text-slate-500">As of {report.period.through ?? "the latest recorded entry"}. Includes balances before the selected profit-and-loss period.</p>
      {["asset", "liability", "equity"].map(type => <div key={type}><h3 className="mt-4 font-semibold capitalize">{type === "asset" ? "Assets" : type === "liability" ? "Liabilities" : "Posted equity"}</h3>{rows(type).map(a => <Value key={a.accountNumber} label={`${a.accountNumber} · ${a.name}`} cents={amount(type, a.debitCents, a.creditCents)}/>)}</div>)}
      <Value label="Unclosed earnings" cents={bs.netIncomeCents}/><Value label="Total assets" cents={bs.assetsCents}/><Value label="Total liabilities and equity" cents={bs.liabilitiesCents + bs.equityCents}/>
      <p role="status" className={bs.balanced ? "text-emerald-800" : "text-red-700"}>{bs.balanced ? "Assets equal liabilities plus equity." : "Out of balance — review journal entries before using this report."}</p>
    </section>
    <section className="dd-card"><h2 className="text-xl font-semibold">Trial balance</h2><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{report.trialBalance.rows.map(a => <tr key={a.accountNumber} className="border-t"><td className="py-2">{a.accountNumber} · {a.name}</td><td>{formatCents(a.debitCents)}</td><td>{formatCents(a.creditCents)}</td></tr>)}</tbody><tfoot><tr className="border-t font-bold"><td>Total</td><td>{formatCents(report.trialBalance.totalDebitCents)}</td><td>{formatCents(report.trialBalance.totalCreditCents)}</td></tr></tfoot></table></div></section>
    <Link href={journalHref} className="underline">Review journal entries</Link>
  </div>;
}
function Value({ label, cents }: { label: string; cents: number }) { return <div className="flex justify-between gap-4 border-b py-2"><span>{label}</span><span className="tabular-nums">{formatCents(cents)}</span></div>; }
