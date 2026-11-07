import Link from "next/link";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { loadFinancialReports } from "@/lib/accounting/reports";
import { FinancialReports } from "@/components/FinancialReports";
import { businessHandlers } from "@/lib/backend/resources";
import { formatCents } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function BooksPage({ searchParams }: { searchParams: Promise<{ from?: string; through?: string; view?: string }> }) {
  await requireSectionAccess("money", "view");
  const query = await searchParams;
  if (query.view === "sales-tax") {
    const { salesTax } = await businessHandlers()["sales-tax"].load() as { salesTax: { taxableSalesCents: number; estimatedTaxCents: number; note: string } };
    return <div className="space-y-5"><h1 className="text-2xl font-bold">Sales tax estimate</h1><p>Taxable sales: {formatCents(salesTax.taxableSalesCents)}</p><p>Estimated tax: {formatCents(salesTax.estimatedTaxCents)}</p><p>{salesTax.note}</p><Link href="/books">Financial reports</Link></div>;
  }
  let report;
  try { report = await loadFinancialReports({ ...(query.from ? { from: query.from } : {}), ...(query.through ? { through: query.through } : {}) }); }
  catch (e) { return <div role="alert"><h1>Reports unavailable</h1><p>{e instanceof Error ? e.message : "Review the report dates and accounting history."}</p><Link href="/books">Reset dates</Link></div>; }
  const params = new URLSearchParams({ ...(query.from ? { from: query.from } : {}), ...(query.through ? { through: query.through } : {}), format: "csv" });
  return <div className="space-y-6"><header><p className="dd-eyebrow">Shuug accounting</p><h1 className="text-2xl font-bold">Financial reports</h1><p className="mt-2 text-slate-600">Your journal, profit and loss, and balance sheet share the same accounting records.</p></header>
    <form className="flex flex-wrap items-end gap-3"><label>From<input className="block rounded border p-2" type="date" name="from" defaultValue={query.from}/></label><label>Through<input className="block rounded border p-2" type="date" name="through" defaultValue={query.through}/></label><button className="dd-button">Update reports</button><a className="dd-button" href={`/api/accounting/reports?${params}`}>Download trial balance</a></form>
    {!!report.issues.length && <div role="alert" className="rounded border border-amber-300 p-4"><strong>Records need review</strong>{report.issues.map((issue, i) => <p key={i}>{issue}</p>)}</div>}
    <FinancialReports report={report}/>
  </div>;
}
