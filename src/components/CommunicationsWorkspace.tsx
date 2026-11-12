"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CommunicationMessage, CommunicationInbound, SmsConsent } from "@/lib/communications/model";
import type { communicationConnectionStatus } from "@/lib/communications/provider";

export interface CommunicationsView {
  messages: CommunicationMessage[]; consents: SmsConsent[]; inbound: CommunicationInbound[];
  counts?: Record<string, number>;
  connections: ReturnType<typeof communicationConnectionStatus>;
}
const date = (value: string) => new Date(value).toLocaleString();
const label = "block text-sm font-medium text-slate-700";
const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
export function CommunicationsWorkspace({ initial }: { initial: CommunicationsView }) {
  const [data, setData] = useState(initial), [notice, setNotice] = useState(""), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [channel, setChannel] = useState<"sms" | "email">("sms"), [tab, setTab] = useState<"inbox" | "outbox" | "compose" | "consent">("inbox");
  const busy = useRef(false), writing = useRef(false), generation = useRef(0), [checkedAt, setCheckedAt] = useState("");
  const composeAttempt = useRef<{ payload: string; eventKey: string } | null>(null);
  async function refresh() {
    if (busy.current || writing.current) return;
    busy.current = true; const selected = generation.current;
    try {
      const response = await fetch("/api/communications", { cache: "no-store" }), body = await response.json();
      if (!response.ok) {
        if (response.status === 403) setData(current => ({ ...current, messages: [], counts: {}, consents: [], inbound: [] }));
        throw new Error(body.error || "Messages could not be refreshed.");
      }
      if (generation.current === selected) { setData(body); setCheckedAt(new Date().toLocaleTimeString()); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh."); }
    finally { busy.current = false; }
  }
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => clearInterval(timer);
    // Forms keep their local values while the history refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function run(command: unknown) {
    if (writing.current) return false;
    writing.current = true; generation.current++;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "The action could not be completed.");
      setData(body); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); return false; }
    finally { writing.current = false; setPending(false); }
  }
  async function compose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    const payload = { channel, to: String(fields.get("to")), body: String(fields.get("body")), ...(channel === "email" ? { subject: String(fields.get("subject")) } : {}), purpose: "owner-service-message", source: "message-center" };
    const digest = JSON.stringify(payload);
    if (composeAttempt.current?.payload !== digest) composeAttempt.current = { payload: digest, eventKey: `owner-message:${crypto.randomUUID()}` };
    if (await run({ command: "queue", input: { eventKey: composeAttempt.current.eventKey, ...payload } })) {
      composeAttempt.current = null; form.reset(); setNotice("Message queued. Its delivery state appears in Sent & queued."); setTab("outbox");
    }
  }
  async function consent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    if (await run({ command: "consent", input: { phone: String(fields.get("phone")), granted: fields.get("granted") === "yes",
      source: "owner-reviewed-consent", evidence: String(fields.get("evidence")), policyVersion: "shop-service-sms-v1", requestId: crypto.randomUUID() } })) {
      form.reset(); setNotice("SMS preference and its evidence were saved. A provider STOP requires a verified START reply to clear it.");
    }
  }
  async function resolve(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    if (await run({ command: "resolve", id, outcome: String(fields.get("outcome")), evidence: String(fields.get("evidence")),
      ...(fields.get("providerId") ? { providerId: String(fields.get("providerId")) } : {}) })) setNotice("Provider evidence saved. This action does not resend the message.");
  }
  const counts = data.counts ?? data.messages.reduce<Record<string, number>>((result, message) => { result[message.status] = (result[message.status] ?? 0) + 1; return result; }, {});
  const active = (counts.queued ?? 0) + (counts.blocked ?? 0) + (counts.sending ?? 0);
  const attention = (counts.uncertain ?? 0) + (counts.failed ?? 0), total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="dd-eyebrow">Customer communications</p><h1 className="mt-1 text-2xl font-bold">Message center</h1><p className="mt-2 text-sm text-slate-600">Customer replies, service updates and delivery history in one place.</p></div><button className="dd-button" onClick={() => void refresh()} disabled={pending}>Refresh</button></header>
    <div className="grid gap-3 sm:grid-cols-3"><div className="dd-card"><p className="text-sm text-slate-500">Waiting or sending</p><strong className="text-2xl">{active}</strong></div><div className="dd-card"><p className="text-sm text-slate-500">Needs review</p><strong className="text-2xl">{attention}</strong></div><div className="dd-card"><p className="font-semibold">Sending {data.connections.enabled ? "enabled" : "off"}</p><p className="mt-1 text-xs text-slate-500">SMS: {data.connections.sms.mode ?? "not connected"} · Email: {data.connections.email.mode ?? "not connected"}</p></div></div>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><p>{data.connections.sms.detail}</p><p className="mt-1">{data.connections.email.detail}</p><a href="/integrations" className="mt-2 inline-block font-semibold underline">Manage connections</a></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <nav aria-label="Message center views" className="flex flex-wrap gap-2">{([['inbox', 'Customer replies'], ['outbox', 'Sent & queued'], ['compose', 'New message'], ['consent', 'SMS preferences']] as const).map(([id, title]) => <button key={id} className={tab === id ? "dd-primary" : "dd-button"} aria-pressed={tab === id} onClick={() => setTab(id)}>{title}</button>)}</nav>
    {tab === "outbox" && total > data.messages.length && <p className="text-sm text-slate-500">Showing {data.messages.length} of {total} messages. Waiting items and failures appear before completed history.</p>}
    {tab === "inbox" && <section className="space-y-3"><h2 className="text-lg font-semibold">Customer replies</h2>{data.inbound.length === 0 ? <p className="dd-card text-sm text-slate-500">No customer texts have arrived yet.</p> : data.inbound.map(message => <article key={message.id} className="dd-card"><div className="flex flex-wrap justify-between gap-2"><strong>{message.from}</strong><time className="text-xs text-slate-500">{date(message.receivedAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>{message.action !== "message" && <p className="mt-2 text-xs font-semibold">Preference: {message.action}</p>}</article>)}</section>}
    {tab === "outbox" && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Sent & queued</h2><button className="dd-button" disabled={pending || !data.connections.enabled} onClick={async () => { if (await run({ command: "dispatch", limit: 20 })) setNotice("Queue checked. Review each message's actual outcome below."); }}>Process queue</button></div>{data.messages.length === 0 ? <p className="dd-card text-sm text-slate-500">No outgoing messages yet.</p> : data.messages.map(message => <article key={message.id} className="dd-card"><div className="flex flex-wrap justify-between gap-2"><strong>{message.to}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{message.status}</span></div><p className="mt-1 text-xs text-slate-500">{message.channel.toUpperCase()} · {message.purpose.replaceAll('_', ' ')} · {date(message.createdAt)}</p><p className="mt-2 text-sm">{message.detail}</p>{message.subject && <h3 className="mt-3 text-sm font-semibold">{message.subject}</h3>}<p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>{message.body.includes("[private link]") && <p className="mt-2 text-xs text-slate-500">Links are hidden in message history.</p>}{message.providerId && <p className="mt-1 break-all text-xs text-slate-500">Provider reference: {message.providerId}</p>}{["queued", "blocked"].includes(message.status) && !message.attemptId && <button className="mt-3 dd-button" disabled={pending} onClick={() => void run({ command: "cancel", id: message.id })}>Cancel message</button>}{message.status === "uncertain" && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Record reviewed provider outcome</summary><form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event => void resolve(event, message.id)}><label className={label}>Provider result<select name="outcome" className={input}><option value="not_sent">Confirmed not sent</option><option value="accepted">Provider accepted</option></select></label><label className={label}>Actual provider reference<input className={input} name="providerId" maxLength={300}/></label><label className={`${label} sm:col-span-2`}>Evidence checked<textarea className={input} name="evidence" minLength={10} maxLength={2000} required/></label><button className="dd-button justify-self-start" disabled={pending}>Save evidence</button></form></details>}</article>)}</section>}
    {tab === "compose" && <form className="dd-card max-w-2xl space-y-4" onSubmit={event => void compose(event)}><h2 className="text-lg font-semibold">New service message</h2><label className={label}>Channel<select className={input} value={channel} onChange={event => setChannel(event.target.value as "sms" | "email")}><option value="sms">SMS</option><option value="email">Email</option></select></label><label className={label}>{channel === "sms" ? "Phone number" : "Email address"}<input className={input} name="to" type={channel === "sms" ? "tel" : "email"} placeholder={channel === "sms" ? "+1 860 555 0100" : "customer@example.com"} required maxLength={200}/></label>{channel === "email" && <label className={label}>Subject<input className={input} name="subject" required maxLength={160}/></label>}<label className={label}>Message<textarea className={input} name="body" rows={5} required maxLength={channel === "sms" ? 1400 : 8000}/></label><p className="text-xs text-slate-500">SMS requires recorded opt-in. The shop name and “Reply STOP to opt out” are added automatically. Queued messages are processed when sending is enabled.</p><button className="dd-primary" disabled={pending}>Queue message</button></form>}
    {tab === "consent" && <section className="space-y-4"><form className="dd-card max-w-2xl space-y-4" onSubmit={event => void consent(event)}><h2 className="text-lg font-semibold">Record an SMS preference</h2><label className={label}>Phone number<input className={input} name="phone" type="tel" required maxLength={50}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="granted" value="yes"/>The customer explicitly agreed to service texts at this number.</label><label className={label}>How and when was this preference confirmed?<textarea className={input} name="evidence" rows={3} maxLength={2000} required/></label><p className="text-xs text-slate-500">Leave the agreement box clear to revoke consent. A general website contact request does not establish SMS permission.</p><button className="dd-primary" disabled={pending}>Save preference</button></form><div className="space-y-2">{data.consents.map(preference => <article key={preference.phone} className="dd-card"><div className="flex flex-wrap justify-between gap-2"><strong>{preference.phone}</strong><span className="text-sm">{preference.providerStopped ? "Stopped by customer" : preference.granted ? "Service texts permitted" : "Texts off"}</span></div><p className="mt-1 text-xs text-slate-500">{preference.source} · {date(preference.updatedAt)}</p><p className="mt-2 text-sm">{preference.evidence}</p></article>)}</div></section>}
    <p className="text-xs text-slate-400">{checkedAt ? `Last checked ${checkedAt}. ` : ""}Provider acceptance, delivery and customer reading are different states.</p>
  </div>;
}
