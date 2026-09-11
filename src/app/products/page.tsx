import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadWorkspace } from "@/lib/data/workspace";
import { SKUS } from "@/lib/data/seed";
import { PricingMatrix } from "@/components/PricingMatrix";
import { formatCents } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function ProductsPage() {
  await requireSectionAccess("sales", "view");

  const {deals}=await loadWorkspace(),skus=deals[0]?.skus||SKUS;
  return <div className="space-y-6"><header><p className="dd-eyebrow">Shared across Bulk, Stores & Online</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Products & pricing</h1><p className="mt-2 text-sm text-slate-500">One catalog. Clear costs. Customer pricing that protects your margin.</p></header><div className="grid gap-4 md:grid-cols-3">{skus.map((s,i)=><section className="dd-card" key={s.id}><div className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-semibold ${["bg-amber-100 text-amber-800","bg-emerald-100 text-emerald-800","bg-orange-100 text-orange-800"][i%3]}`}>{s.name.slice(0,1)}</div><h2 className="mt-4 font-semibold">{s.name}</h2><p className="mt-1 text-xs text-slate-400">{s.unitsPerCase} bottles / case · {s.id}</p><dl className="mt-5 space-y-3 text-xs">{[{name:"Retail / bottle",value:s.retailPriceCents},{name:"Standard / case",value:s.standardPriceCents},{name:"Landed cost / case",value:s.costPerCaseCents},{name:"Gross profit / case",value:s.standardPriceCents-s.costPerCaseCents}].map(r=><div className="flex justify-between" key={r.name}><dt className="text-slate-500">{r.name}</dt><dd className="font-semibold tabular-nums">{formatCents(r.value)}</dd></div>)}</dl><Link className="dd-button mt-5 w-full" href="/ads">Plan marketing →</Link><Link className="dd-button mt-2 w-full" href={`/amazon-marketing?product=${encodeURIComponent(s.id)}`}>Advertise on Amazon →</Link></section>)}</div><section><h2 className="mb-3 text-sm font-semibold">Customer price agreements</h2><PricingMatrix skus={skus} columns={deals.map(d=>({customerId:d.customer.id,company:d.customer.company,targetFraction:d.agreement.targetMarginFraction,floorFraction:d.agreement.floorMarginFraction,prices:Object.fromEntries(d.agreement.lines.map(l=>[l.skuId,l.unitPriceCents]))}))}/></section></div>;
}
