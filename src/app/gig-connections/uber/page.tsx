import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { staffUberConnections, staffUberRecordPage } from "@/lib/gig-connections/uber";
export const dynamic = "force-dynamic";
export default async function UberSourceReview({ searchParams }: { searchParams: Promise<{ account?: string; kind?: string; page?: string }> }) {
  await requireSectionAccess("money", "view");
  const parameters = await searchParams;
  const connections = (() => { try { return staffUberConnections(); } catch { notFound(); } })();
  const selected = connections.find(item => item.accountId === parameters.account);
  const records = selected ? staffUberRecordPage(selected.accountId, parameters.kind === "trips" ? "trips" : "payments", Number(parameters.page ?? 1)) : null;
  const url = (page: number) => `?account=${selected?.accountId}&kind=${records?.kind}&page=${page}`;
  return <div className="space-y-6"><header><p className="dd-eyebrow">Verified provider sources</p><h1 className="text-2xl font-bold">Uber source review</h1><p>Read-only source records retrieved through clients' authorized Uber driver connections. They remain separate from tax-journal income, bank deposits and recorded trip fares.</p></header>
    {!connections.length && <p>No client has completed an approved Uber account connection yet.</p>}
    <form className="flex flex-wrap gap-3"><label>Client account <select className="rounded border p-2" name="account" defaultValue={parameters.account ?? ""}><option value="">Choose a client</option>{connections.map(item => <option key={item.accountId} value={item.accountId}>{item.user.name} · {item.user.email}</option>)}</select></label><label>Source records <select className="rounded border p-2" name="kind" defaultValue={parameters.kind === "trips" ? "trips" : "payments"}><option value="payments">Provider payments</option><option value="trips">Provider trips</option></select></label><button className="rounded border px-4">Review records</button></form>
    {selected && <section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{selected.user.name}</h2><p>Verified Uber driver: {selected.profile?.name ?? "Unavailable"} · Connection: {selected.status} · Client account: {selected.user.status}</p><p>Last successful sync: {selected.lastSyncAt ?? "No provider records synced"}</p><p>{selected.trips} saved trips · {selected.payments} saved payment records.</p><p>{selected.accountingPolicy}</p></section>}
    {records && <section><p>{records.count} records · Page {records.page} of {records.pages}</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Date", "Provider record", "Amount / status", "Last retrieved"].map(label => <th className="border-b p-3" key={label}>{label}</th>)}</tr></thead><tbody>{records.records.map(record => <tr key={record.id}><td className="border-b p-3">{record.date ?? "Not supplied"}</td><td className="border-b p-3">{record.category}<br/><small>{record.id}</small></td><td className="border-b p-3">{record.amount != null ? `${record.currency} ${record.amount.toFixed(2)}` : record.status}</td><td className="border-b p-3">{record.observedAt}</td></tr>)}</tbody></table></div><p className="flex gap-4">{records.page > 1 && <Link className="underline" href={url(records.page - 1)}>Previous page</Link>}{records.page < records.pages && <Link className="underline" href={url(records.page + 1)}>Next page</Link>}</p></section>}
    <Link className="underline" href="/rideshare">Return to driver journals</Link>
  </div>;
}
