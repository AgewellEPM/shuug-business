import Link from "next/link";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { chartOfAccounts } from "@/lib/accounting/journal-store";
import { ChartOfAccounts } from "@/components/ChartOfAccounts";
import { accountCommandAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function AccountsPage() {
  await requireSectionAccess("money", "view");
  let canEdit = false; try { await requireSectionAccess("money", "edit"); canEdit = true; } catch {}
  const data = chartOfAccounts();
  return <div className="space-y-5"><header><p className="dd-eyebrow">Accounting</p><h1 className="mt-1 text-2xl font-bold">Chart of accounts</h1><p className="mt-2 text-sm text-slate-600">Create accounts and organize up to five levels of subaccounts. Each subaccount uses the same classification as its parent. Inactive accounts retain their history.</p></header><Link href="/ledger" className="inline-block text-sm font-semibold text-emerald-700">← General ledger</Link><ChartOfAccounts {...data} canEdit={canEdit} commandAction={accountCommandAction} /></div>;
}
