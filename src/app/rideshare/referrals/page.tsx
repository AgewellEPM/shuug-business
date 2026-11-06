import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireIdentity } from "@/lib/auth/identity";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { driverAvailable } from "@/lib/rideshare-driver/policy";
import { approveReferral, fulfillReferralReward, referralProgram, rejectReferral, staffReferralLedger } from "@/lib/rideshare-driver/referrals";
export const dynamic = "force-dynamic";
async function action(form: FormData) {
  "use server";
  await requireSectionAccess("money", "edit");
  if (!driverAvailable()) notFound();
  const actor = (await requireIdentity()).id;
  const kind = String(form.get("action")), id = String(form.get("id")), proof = String(form.get("proof") ?? "");
  if (kind === "approve") approveReferral({ claimId: id, referrerUsesTaxPrep: form.get("referrerUsesTaxPrep") === "on", firstPaidPreparationComplete: form.get("firstPaidPreparationComplete") === "on", proof }, actor);
  else if (kind === "reject") rejectReferral({ claimId: id, reason: proof }, actor);
  else if (kind === "fulfill") fulfillReferralReward({ rewardId: id, reference: proof }, actor);
  else throw new Error("Unknown referral action.");
  revalidatePath("/rideshare/referrals");
}
const usd = (cents: number) => (cents/100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export default async function ReferralLedger() {
  await requireSectionAccess("money", "view"); if (!driverAvailable()) notFound();
  const ledger = staffReferralLedger();
  return <div className="space-y-6">
    <header><p className="dd-eyebrow">Rideshare Tax Pros</p><h1 className="text-2xl font-bold">Driver Rewards</h1><p className="mt-2 text-sm text-slate-600">{referralProgram.terms}</p></header>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Referral approvals</h2>
      {!ledger.claims.length && <p>No referrals have been submitted.</p>}
      {ledger.claims.map(claim => <article key={claim.id} className="rounded-xl border bg-white p-4 space-y-3">
        <p><strong>{claim.referrerName}</strong> referred <strong>{claim.referredName}</strong> · {claim.status}</p>
        <p className="text-xs text-slate-500">Submitted {claim.createdAt.slice(0,10)}{claim.qualifiedAt && ` · Qualified ${claim.qualifiedAt.slice(0,10)}`}</p>
        {claim.proof && <p className="text-sm">Verification: {claim.proof}</p>}
        {claim.status === "pending" && <>
          <form action={action} className="space-y-2"><input type="hidden" name="action" value="approve"/><input type="hidden" name="id" value={claim.id}/>
            <label className="block"><input type="checkbox" name="referrerUsesTaxPrep" required/> I verified the referrer uses our tax-prep services.</label>
            <label className="block"><input type="checkbox" name="firstPaidPreparationComplete" required/> I verified this new client's first tax preparation is complete and paid.</label>
            <label className="block">Invoice / service verification reference <input name="proof" required minLength={3} maxLength={300} className="rounded border p-2"/></label>
            <button className="rounded bg-purple-700 px-4 py-2 text-white">Approve $20 reward + 100 points</button>
          </form>
          <form action={action} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="reject"/><input type="hidden" name="id" value={claim.id}/><input name="proof" placeholder="Reason this referral does not qualify" required minLength={3} maxLength={300} className="rounded border p-2"/><button className="rounded border px-3">Reject referral</button></form>
        </>}
      </article>)}
    </section>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Rewards & fulfillment</h2>
      <p className="text-sm text-slate-600">Record fulfillment only after the cash payout has been made or the credit applied to the client's invoice. This page records the outcome; it does not send money or modify invoices.</p>
      {!ledger.rewards.length && <p>No earned rewards yet.</p>}
      {ledger.rewards.map(reward => <article key={reward.id} className="rounded-xl border bg-white p-4 space-y-3">
        <p><strong>{reward.clientName}</strong> · {usd(reward.amountCents)} · {reward.kind} · {reward.status}{reward.method && ` · ${reward.method}`}</p>
        {reward.reference && <p className="text-sm">Fulfillment reference: {reward.reference}</p>}
        {reward.status === "requested" && <form action={action} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="fulfill"/><input type="hidden" name="id" value={reward.id}/><input name="proof" placeholder="Completed payout or invoice-credit reference" required minLength={3} maxLength={240} className="rounded border p-2"/><button className="rounded border px-4">Record completed {reward.method === "cash" ? "payout" : "credit"}</button></form>}
      </article>)}
    </section>
    <Link className="underline" href="/rideshare">Back to driver journals</Link>
  </div>;
}
