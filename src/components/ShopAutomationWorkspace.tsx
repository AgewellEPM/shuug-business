"use client";
import { useState } from "react";
import Link from "next/link";
import type { shopAutomationState } from "@/lib/shop-automation/service";
type State = ReturnType<typeof shopAutomationState>;

export function ShopAutomationWorkspace({ initial, origin }: { initial: State; origin: string }) {
  const [state, setState] = useState(initial), [settings, setSettings] = useState(initial.settings);
  const [invoicing, setInvoicing] = useState(initial.invoicing);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  async function command(body: unknown, endpoint = "/api/shop-automation") {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The action could not be completed.");
      const next = result.state ?? await (await fetch("/api/shop-automation")).json();
      setState(next); setSettings(next.settings); setInvoicing(next.invoicing); setNotice("Saved. The current run and message status are shown below.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Check the workspace connection."); }
    finally { setBusy(false); }
  }
  const local = !origin.startsWith("https://");
  return <div className="space-y-6">
    <header><p className="dd-eyebrow">Your repair shop</p><h1 className="text-2xl font-bold">Shop operations</h1>
      <p className="mt-2 text-slate-600">Requests, appointments, repair updates, invoicing, and the follow-through in one workspace.</p></header>
    {notice && <p role="status" className="rounded border p-3">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Link href="/setup" className="dd-card"><strong>{state.intakePending} new requests</strong><p>Review website intake and vehicle details</p></Link>
      <Link href="/communications" className="dd-card"><strong>Message center</strong><p>{state.messageCounts.queued ?? 0} queued · {state.messageCounts.blocked ?? 0} blocked · {state.messageCounts.uncertain ?? 0} need review</p></Link>
      <Link href="/modules/service-billing" className="dd-card"><strong>Repair invoices</strong><p>One service invoice and one accounting posting</p></Link>
    </div>
    <section className="dd-card space-y-3"><h2 className="text-xl font-semibold">Website requests</h2>
      {local && <p className="rounded bg-amber-50 p-3 text-amber-900">This workspace is local. Connect a persistent HTTPS host before adding these forms to the public website.</p>}
      {state.websiteForms.filter(form => form.kind === "auto-repair").map(form => <div key={form.id} className="rounded border p-3">
        <strong>{form.title}</strong><p>{form.enabled ? "Accepting requests" : "Paused"} · requests require staff review</p>
        <a href={`${origin}/api/website/forms/${form.id}`} target="_blank" rel="noreferrer" className="underline">Open service request form</a>
      </div>)}
      {!state.websiteForms.some(form => form.kind === "auto-repair") && <p>Create an automotive form in <Link href="/setup" className="underline">Get started</Link>, or configure it through Shuug MCP.</p>}
    </section>
    <form className="dd-card space-y-4" onSubmit={event => { event.preventDefault(); const { updatedAt: _, updatedBy: __, ...input } = settings; void command({ action: "configure", input: { ...input, reviewed: true } }); }}>
      <h2 className="text-xl font-semibold">Automatic follow-through</h2>
      {([['enabled', 'Enable shop follow-through'], ['bookingConfirmations', 'Send appointment confirmations'], ['appointmentReminders', 'Send appointment reminders'], ['jobUpdates', 'Send updates when agreed work starts or finishes'], ['paymentReceipts', 'Send receipts after payments are recorded']] as const).map(([key, label]) =>
        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.checked })}/>{label}</label>)}
      <label className="block">Remind before appointment (hours)<input className="ml-3 w-20 rounded border p-2" type="number" min="1" max="72" value={settings.reminderHours} onChange={event => setSettings({ ...settings, reminderHours: Number(event.target.value) })}/></label>
      <label className="block">Shop time zone<input className="ml-3 rounded border p-2" value={settings.timeZone} onChange={event => setSettings({ ...settings, timeZone: event.target.value })}/></label>
      <p className="text-sm text-slate-600">Texts require the customer's separate SMS consent. Repair scope, prices, and customer approvals keep their review steps.</p>
      <button disabled={busy} className="dd-primary">Save automation settings</button>
    </form>
    <form className="dd-card space-y-3" onSubmit={event => { event.preventDefault(); void command({ action: "settings", input: invoicing, reviewed: true }, "/api/shop-invoicing"); }}>
      <h2 className="text-xl font-semibold">Automatic repair invoices</h2>
      <label className="flex items-center gap-2"><input type="checkbox" checked={invoicing.enabled} onChange={event => setInvoicing({ ...invoicing, enabled: event.target.checked })}/>Issue invoices after customer completion acceptance</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={invoicing.emailOnIssue} onChange={event => setInvoicing({ ...invoicing, emailOnIssue: event.target.checked })}/>Queue the private invoice link by email</label>
      <label className="block">Payment due in days<input type="number" min="0" max="90" className="ml-3 w-20 rounded border p-2" value={invoicing.dueDays} onChange={event => setInvoicing({ ...invoicing, dueDays: Number(event.target.value) })}/></label>
      <p className="text-sm text-slate-600">Uses the reviewed repair estimate, customer acceptance, and existing accounting. Existing drafts or changed scope go to review. Sending still requires enabled business accounts.</p>
      <button disabled={busy} className="dd-primary">Save invoicing settings</button>
    </form>
    <section className="dd-card space-y-3"><h2 className="text-xl font-semibold">Connected business accounts</h2>
      <p>Email: {state.communications.email.detail}</p><p>SMS: {state.communications.sms.detail}</p>
      <p>Outbound messages: <strong>{state.dispatchEnabled ? "Enabled for eligible messages" : "Off"}</strong>. Provider acceptance and confirmed delivery are recorded separately.</p>
      <div className="flex flex-wrap gap-3"><Link href="/integrations" className="dd-button">Connect business accounts</Link>
        <button disabled={busy} className="dd-button" onClick={() => void command({ action: "dispatch.configure", enabled: !state.dispatchEnabled, reviewed: true })}>{state.dispatchEnabled ? "Turn outbound messages off" : "Enable outbound messages"}</button></div>
    </section>
    <section className="dd-card space-y-3"><h2 className="text-xl font-semibold">Run history</h2>
      <p>Last pass: {state.lastRun?.finishedAt ?? "No pass yet"} {state.lastRun ? `(${state.lastRun.status})` : ""}. Keep the shop worker running on the persistent host.</p>
      {state.lastRun?.detail && <p className="text-amber-800">{state.lastRun.detail}</p>}
      {state.notificationReviews.map((item, index) => <p className="text-amber-800" key={index}>{item.detail}</p>)}
      <button disabled={busy} className="dd-button" onClick={() => void command({ action: "tick", limit: 20 })}>Run eligible follow-through now</button>
    </section>
  </div>;
}
