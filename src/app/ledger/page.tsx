import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadLedger } from "@/lib/accounting/ledger-load";
import { chartOfAccounts } from "@/lib/accounting/journal-store";
import { formatCents } from "@/lib/money";
import { GeneralLedger } from "@/components/GeneralLedger";
import { journalCommandAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  await requireSectionAccess("money", "view");

  let canEdit = false;
  try { await requireSectionAccess("money", "edit"); canEdit = true; } catch {}
  const { entries, issues, autoCount, manualCount, trialBalance, incomeStatement, balanceSheet } = await loadLedger();
  const accounts = chartOfAccounts().accounts;

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Accounting</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">General ledger</h1>
        <p className="mt-2 text-sm text-slate-500">
          Review balanced manual entries and recorded restaurant postings alongside entries derived from sales, payments and expenses.
          Manual corrections retain the original entry and add a dated reversal. These summaries do not yet provide full period-close or cash-basis accounting.
        </p>
      </header>

      {issues.length > 0 && <div role="alert" className="mb-5 rounded border border-amber-300 bg-amber-50 p-4 text-sm"><p className="font-semibold">Accounting history needs review</p>{issues.map(issue => <p key={issue}>{issue}</p>)}<Link href="/collections" className="underline">Review receipts and returns</Link></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Journal entries" value={String(entries.length)} sub={`${autoCount} auto · ${manualCount} manual`} />
        <Stat label="Trial balance" value={trialBalance.balanced ? "In balance ✓" : "Off ✗"} tone={trialBalance.balanced ? "text-emerald-700" : "text-red-600"} />
        <Stat label="Net income" value={formatCents(incomeStatement.netIncomeCents)} tone={incomeStatement.netIncomeCents >= 0 ? "text-emerald-700" : "text-red-600"} />
        <Stat label="Balance sheet" value={balanceSheet.balanced ? "Balances ✓" : "Off ✗"} tone={balanceSheet.balanced ? "text-emerald-700" : "text-red-600"} />
      </div>

      <p className="mb-4 text-sm"><Link href="/ledger/accounts" className="font-semibold text-emerald-700 underline">Manage chart of accounts</Link></p>
      <GeneralLedger
        entries={entries}
        trialBalance={trialBalance}
        incomeStatement={incomeStatement}
        balanceSheet={balanceSheet}
        accounts={accounts}
        canEdit={canEdit}
        journalCommandAction={journalCommandAction}
      />

      <p className="mt-6 text-xs text-slate-400">
        Pairs with the <Link href="/books" className="font-semibold text-emerald-700 hover:underline">financial statements</Link> and <Link href="/reconcile" className="font-semibold text-emerald-700 hover:underline">reconciliation</Link>. <Link href="/api/v1/ledger" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}
