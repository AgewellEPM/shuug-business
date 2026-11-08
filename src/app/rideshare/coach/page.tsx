import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { staffCoachThreads } from "@/lib/driver-coach/store";
import { requireIdentity } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";
export default async function CoachReview() {
  await requireSectionAccess("money", "view");
  await requireSectionAccess("services", "view");
  const user=await requireIdentity();
  const threads = (() => { try { return staffCoachThreads(user); } catch { notFound(); } })();
  return <div className="space-y-6">
    <header><p className="dd-eyebrow">Gig Tax Pros · Shared client work</p><h1 className="text-2xl font-bold">Tax &amp; Goals conversations</h1>
      <p className="mt-2 text-sm text-slate-600">Client questions, confirmed preparation facts and recorded-data replies share the existing client account. These are not approved deductions, filed returns or accountant-reviewed advice.</p></header>
    <p><Link className="underline" href="/rideshare">Driver records</Link> · <Link className="underline" href="/tax-documents">Private tax-document review</Link></p>
    {!threads.length && <p>No shared coach conversations have been saved yet.</p>}
    {threads.map(thread => <section key={thread.accountId + thread.clientId} className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-lg font-bold">{thread.name}</h2>
      <p className="text-sm">Confirmed context: {thread.intake.taxYear ?? "Tax year unknown"} · {thread.intake.jurisdiction ?? "Jurisdiction unknown"} · {thread.intake.businessType ?? "Business structure unknown"}</p>
      <p className="text-sm">Client-supplied vehicle cost: {thread.preferences.vehicleCostCentsPerMile === undefined ? "Unknown" : `$${(thread.preferences.vehicleCostCentsPerMile / 100).toFixed(4)}/mi`} · not a tax mileage rate.</p>
      <div className="max-h-[620px] space-y-3 overflow-auto" aria-label={`${thread.name} shared conversation`}>
        {thread.messages.map(message => <article key={message.id} className="rounded-lg border p-4">
          <p className="font-semibold">{message.role === "user" ? "Client" : message.role === "staff" ? "Tax team" : "Records coach"} · {message.createdAt}</p>
          <p className="whitespace-pre-wrap text-sm">{message.text}</p>
          {message.engine && <p className="text-xs text-slate-500">{message.engine}</p>}
          {!!message.sources?.length && <ul>{message.sources.map(source => <li key={source.id}><a className="text-sm underline" href={source.url} rel="noreferrer">{source.title}</a></li>)}</ul>}
          {!!message.recordIds?.length && <details><summary className="text-sm">Referenced record IDs</summary><p className="break-all text-xs">{message.recordIds.join(", ")}</p></details>}
        </article>)}
      </div>
    </section>)}
  </div>;
}
