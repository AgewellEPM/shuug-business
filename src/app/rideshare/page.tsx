import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { driverAvailable } from "@/lib/rideshare-driver/policy";
import { staffDriverRecords } from "@/lib/rideshare-driver/store";
import { expenseCategoryLabels } from "@/lib/rideshare-driver/model";
import { listBusinessRecords } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";
const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export default async function DriverJournal({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireSectionAccess("money", "view");
  if (!driverAvailable()) notFound();
  const filter = (await searchParams).client, clients = listBusinessRecords(["client"]);
  if (filter && !clients.some(c => c.id === filter)) notFound();
  const rows = staffDriverRecords(filter);
  const totals = rows.reduce((sum, { record }) => {
    if (record.kind === "trip" && record.body.classification === "business") sum.meters += record.body.distanceMeters;
    if (record.kind === "expense") sum.expenses += record.body.amountCents;
    if (record.kind === "income") sum.income += record.body.amountCents;
    return sum;
  }, { meters: 0, expenses: 0, income: 0 });
  return <div className="space-y-6">
    <header><p className="dd-eyebrow">Rideshare Tax Pros · iPhone journal</p><h1 className="text-2xl font-bold">Driver trips, expenses & receipts</h1><p className="mt-2 text-sm text-slate-600">Client-submitted records from the driver app. Classifications and amounts need professional review; these are not posted accounting entries or calculated deductions.</p></header>
    <form className="flex flex-wrap gap-3"><label>Service client <select name="client" defaultValue={filter ?? ""} className="rounded border p-2"><option value="">All clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button className="rounded border px-4">Filter records</button></form>
    <div className="grid gap-3 sm:grid-cols-3">{[["Recorded business miles", (totals.meters / 1609.344).toFixed(2)], ["Recorded expenses · all classifications", usd(totals.expenses)], ["Recorded income", usd(totals.income)]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">{label}</p><strong className="text-xl">{value}</strong></div>)}</div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr>{["Client", "Record", "Date", "Distance / amount", "Review / receipt"].map(label => <th key={label} className="border-b p-3">{label}</th>)}</tr></thead><tbody>{rows.map(({ record: r, clientId, accountId }) => <tr key={`${accountId}:${r.id}`}>
      <td className="border-b p-3">{clients.find(c => c.id === clientId)?.title ?? "Linked client"}</td><td className="border-b p-3">{r.kind === "trip" ? r.body.purpose || "Driving trip" : r.kind === "expense" ? `${r.body.merchant} · ${expenseCategoryLabels[r.body.category]}` : `${r.body.platform} · ${r.body.description}`}
      {r.kind === "expense" && <div className="mt-1 space-y-1 text-xs text-slate-600">
        {r.body.businessPurpose && <p>Purpose: {r.body.businessPurpose}</p>}
        {r.body.businessUsePercent != null && <p>Recorded business use: {r.body.businessUsePercent}% · requires review</p>}
        {r.body.mealContext && <p>Meal / travel context: {r.body.mealContext}</p>}
        {r.body.vehicle && <p>Vehicle: {r.body.vehicle}</p>}
        {r.body.odometerMiles != null && <p>Odometer: {r.body.odometerMiles.toLocaleString("en-US")} mi</p>}
        {r.body.paymentMethod && <p>Paid using: {r.body.paymentMethod === "platform" ? "Deducted from payout" : r.body.paymentMethod}</p>}
        {r.body.place && <p>Place: {r.body.place}</p>}
      </div>}
      {r.kind === "trip" && <div className="mt-1 space-y-1 text-xs text-slate-600">
        {r.body.earningsCents != null && <p>Fare and tips: {usd(r.body.earningsCents)}</p>}
        {r.body.platformFeesCents != null && <p>Platform fees: {usd(r.body.platformFeesCents)}</p>}
        {r.body.rideRole && <p>Drive type: {r.body.rideRole}</p>}
        {r.body.platform && <p>Platform: {r.body.platform}</p>}
        {r.body.workArea && <p>Work area: {r.body.workArea}</p>}
        {r.body.automaticallyDetected && <p>Automatically detected; review start/end and business use</p>}
      </div>}
      {r.kind !== "trip" && r.body.bankReference && <p className="mt-1 text-xs text-slate-600">Bank source: {r.body.bankReference.accountLabel} · {r.body.bankReference.provider} · reference {r.body.bankReference.transactionId}</p>}</td>
      <td className="border-b p-3">{r.kind === "trip" ? r.body.localDate ?? r.body.startedAt.slice(0, 10) : r.body.date}</td><td className="border-b p-3">{r.kind === "trip" ? `${(r.body.distanceMeters / 1609.344).toFixed(2)} mi` : usd(r.body.amountCents)}</td>
      <td className="border-b p-3">{r.kind === "trip" ? `${r.body.classification} · ${r.body.source}${r.body.hasGaps ? " · location gaps: review mileage" : ""}${!r.body.endedAt ? " · in progress" : ""}` : r.kind === "expense" ? <>{r.body.classification}{r.body.receiptId && <> · <a className="underline" href={`/api/rideshare/receipts/${accountId}/${r.body.receiptId}`}>Private receipt</a></>}</> : "Client-entered income"}<p className="mt-1 text-xs text-slate-500">{r.body.notes}</p></td>
    </tr>)}</tbody></table>{!rows.length && <p className="p-6 text-slate-500">No driver records have synced for this selection. The iPhone app can record offline while its workspace connection is being configured.</p>}</div>
    <p className="flex gap-4"><Link className="underline" href="/m/rideshare-tax-records">Return to rideshare record review</Link><Link className="underline" href="/rideshare/referrals">Driver Rewards approvals & payouts</Link></p>
  </div>;
}
