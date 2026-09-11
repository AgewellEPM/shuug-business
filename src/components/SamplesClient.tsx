"use client";

/**
 * SamplesClient — request a sample (goes to an owner) and approve/decline from
 * the queue. Approving ships it and decrements inventory (same path as orders).
 */
import { useState, useTransition } from "react";
import type { SampleRequest } from "@/lib/ops/model";
import type { SampleActionResult } from "@/app/samples/actions";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-blue-100 text-blue-800",
  shipped: "bg-emerald-100 text-emerald-800",
  declined: "bg-slate-200 text-slate-600",
};

export function SamplesClient({
  skus,
  samples,
  createAction,
  decideAction,
}: {
  skus: { id: string; name: string }[];
  samples: SampleRequest[];
  createAction: (input: {
    requesterName: string;
    company: string;
    email: string;
    phone: string;
    shippingAddress: string;
    note: string;
    lines: { skuId: string; cases: number }[];
  }) => Promise<SampleActionResult>;
  decideAction: (id: string, approve: boolean) => Promise<SampleActionResult>;
}) {
  const nameById = new Map(skus.map((s) => [s.id, s.name]));
  const [requesterName, setRequester] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [note, setNote] = useState("");
  const [cases, setCases] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<SampleActionResult | null>(null);

  const pendingReqs = samples.filter((s) => s.status === "pending");
  const history = samples.filter((s) => s.status !== "pending");
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";

  function submit() {
    const lines = skus.map((s) => ({ skuId: s.id, cases: Math.floor(Number(cases[s.id] || "0")) })).filter((l) => l.cases > 0);
    setMsg(null);
    startTransition(async () => {
      let res: SampleActionResult;
      try { res = await createAction({ requesterName, company, email, phone, shippingAddress, note, lines }); }
      catch { res = {ok:false,message:"The request could not be saved. Your entered details are still here."}; }
      setMsg(res);
      if (res.ok) {
        setRequester(""); setCompany(""); setEmail(""); setPhone(""); setShippingAddress(""); setNote(""); setCases({});
      }
    });
  }
  function decide(id: string, approve: boolean) {
    setMsg(null);
    startTransition(async () => setMsg(await decideAction(id, approve)));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {msg && (
          <p className={`rounded-lg px-3 py-2 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.message}</p>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Approval queue</h2>
          {pendingReqs.length === 0 ? (
            <p className="text-sm text-slate-400">No pending sample requests.</p>
          ) : (
            <ul className="space-y-3">
              {pendingReqs.map((s) => (
                <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-800">{s.company} <span className="text-slate-400">· {s.requesterName}</span></p>
                      <ContactDetails sample={s}/>
                      <p className="text-sm text-slate-600">
                        {s.lines.map((l) => `${l.cases}× ${nameById.get(l.skuId) ?? l.skuId}`).join(", ")}
                      </p>
                      {s.note && <p className="mt-0.5 text-sm text-slate-400">{s.note}</p>}
                    </div>
                    <div className="flex flex-none gap-2">
                      <button type="button" onClick={() => decide(s.id, true)} disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Approve & ship</button>
                      <button type="button" onClick={() => decide(s.id, false)} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Decline</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No decided requests yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {history.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <div><p>{s.company} · {s.requesterName}</p><ContactDetails sample={s}/><p>{s.lines.map((l) => `${l.cases}× ${nameById.get(l.skuId) ?? l.skuId}`).join(", ")}</p></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">New sample request</h2>
          <form className="space-y-3" onSubmit={e=>{e.preventDefault();submit();}}>
            <label className="block text-xs font-medium">Store / company requesting<input className={`${input} mt-1`} required maxLength={120} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Store name and branch" /></label>
            <label className="block text-xs font-medium">Contact name<input className={`${input} mt-1`} required maxLength={120} autoComplete="name" value={requesterName} onChange={(e) => setRequester(e.target.value)} placeholder="Person requesting the samples" /></label>
            <label className="block text-xs font-medium">Phone number<input className={`${input} mt-1`} type="tel" required minLength={7} maxLength={60} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Include area code and extension" /></label>
            <label className="block text-xs font-medium">Email<input className={`${input} mt-1`} type="email" required maxLength={160} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Contact email" /></label>
            <label className="block text-xs font-medium">Shipping address<textarea className={`${input} mt-1`} required minLength={8} maxLength={600} autoComplete="street-address" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Street, suite, city, state, ZIP / postal code, country" rows={3}/></label>
            <div className="space-y-2">
              {skus.map((s) => (
                <label key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">{s.name}</span>
                  <input type="number" min={0} value={cases[s.id] ?? ""} onChange={(e) => setCases((p) => ({ ...p, [s.id]: e.target.value }))} placeholder="cs" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none" />
                </label>
              ))}
            </div>
            <textarea className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} />
            <button type="submit" disabled={pending} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
              Submit for approval
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function ContactDetails({sample:s}:{sample:SampleRequest}) {return <div className="my-2 space-y-1 text-xs text-slate-500"><p>{s.phone?<a className="text-emerald-700 underline" href={`tel:${s.phone.replace(/[^\d+*#,;]/g,"")}`}>{s.phone}</a>:"Phone not recorded"}{s.email&&<> · <a className="break-all underline" href={`mailto:${s.email}`}>{s.email}</a></>}</p><p className="whitespace-pre-line">{s.shippingAddress||"Shipping address not recorded"}</p></div>;}
