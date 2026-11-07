import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
export const dynamic="force-dynamic";
export default async function FinancePage(){
  await requireSectionAccess("money","view");
  const tools=[["/accounting","Client books","Separate client ledgers, access and monthly work."],["/accounting/office","Office books & reconciliation","Import bank statements, match transactions and close periods."],["/books","Financial reports","Profit and loss, balance sheet and trial balance from Shuug's ledger."],["/ledger","General ledger","Review journal entries and record adjustments."],["/ledger/accounts","Chart of accounts","Classified accounts, hierarchy and history."],["/expenses","Bills & receipts","Reviewed bills, allocations, settlements and supporting documents."],["/modules/service-billing","Client billing","Issue service invoices and record payments."],["/collections","Collections","Review receipts, returns and outstanding customer balances."]];
  return <div className="space-y-6"><header><p className="dd-eyebrow">Shuug accounting</p><h1 className="text-2xl font-bold">Money</h1><p className="mt-2 text-slate-600">Manage your office and client books with Shuug's own accounting tools.</p></header><div className="grid gap-4 sm:grid-cols-2">{tools.map(([href,title,detail])=><Link key={href} href={href} className="dd-card"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-slate-600">{detail}</p></Link>)}</div></div>;
}
