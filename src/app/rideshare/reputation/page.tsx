import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { staffReputation } from "@/lib/driver-reputation/store";
import { reputationGuide } from "@/lib/driver-reputation/guide";

export const dynamic = "force-dynamic";
export default async function ReputationReview() {
  await requireSectionAccess("services", "view");
  const accounts = (() => { try { return staffReputation(); } catch { notFound(); } })();
  return <div className="space-y-6"><h1 className="text-2xl font-bold">Client ratings &amp; personal reviews</h1>
    <p>Client-entered measurements and notes, shared through their existing account. These are not verified provider scores or predictions.</p>
    <Link className="underline" href="/rideshare">Driver records</Link>
    {!accounts.length && <p>No reputation records have been shared.</p>}
    {accounts.map(account => <section key={account.accountId} className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">{account.name}</h2>
      {reputationGuide(account.state).snapshots.map(text => <p key={text}>{text}</p>)}
      {account.state.reviews.filter(row => !row.deleted).map(review => <article key={review.id} className="rounded border p-4"><strong>{review.platformName} · {review.sentiment}</strong><p className="text-xs">{review.recordedAt} · {review.topics.join(", ")}</p><p className="whitespace-pre-wrap">{review.text}</p></article>)}
    </section>)}
  </div>;
}
