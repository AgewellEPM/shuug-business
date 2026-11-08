"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { bookView } from "@/lib/accounting/book-service";
import type { BillingDocument } from "@/lib/accounting/billing-model";
import type { InvoiceDeliveryResult } from "@/lib/accounting/invoice-delivery-model";

type View = Awaited<ReturnType<typeof bookView>>;
export function InvoiceDelivery({ bookId, doc, connection, history, canEdit, owner }: {
  bookId: string; doc: BillingDocument; connection: View["deliveryConnection"];
  history: View["invoiceDeliveries"]; canEdit: boolean; owner: boolean;
}) {
  const router = useRouter(), retry = useRef<{ key: string; id: string } | null>(null);
  const [preview, setPreview] = useState<InvoiceDeliveryResult | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [attempted, setAttempted] = useState(false);
  const deliveries = history.filter(item => item.documentId === doc.id);
  async function command(action: string, input: object) {
    const key = JSON.stringify({ action, input }); if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    const response = await fetch(`/api/accounting/books/${bookId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: retry.current.id, action, input: { ...input, reviewed: true } }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Invoice email could not be updated.");
    retry.current = null; return body.result as InvoiceDeliveryResult;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setNotice("");
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "Check this request's saved delivery history before trying again."); }
    finally { setBusy(false); }
  }
  return <details className="space-y-3 border-t pt-3"><summary className="font-semibold">Email invoice</summary>
    <p className="text-sm">Email contains a private invoice link. Tax files, line items and internal notes are not attached. Mailgun acceptance does not confirm recipient delivery.</p>
    {!connection.ready ? <p className="text-sm text-amber-800">Invoice email is not connected. {connection.message} {owner ? <a className="underline" href="/integrations">Open Connections</a> : "Ask the owner to review the Mailgun connection."}</p> : <p className="text-sm">From {connection.from} · {connection.region} · {connection.mode === "test" ? "Test mode: email will not be delivered" : "Live email mode"}. Sending domain must be verified with Mailgun.</p>}
    {!doc.party.email && <p className="text-sm text-amber-800">This issued invoice has no recipient email. Correct the invoice through the existing credit/void and replacement workflow before emailing it.</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {canEdit && doc.status === "posted" && connection.ready && doc.party.email && <button className="dd-button" type="button" disabled={busy} onClick={() => void run(async () => { const result = await command("billing.delivery.preview", { id: doc.id, revision: doc.revision }); setPreview(result); setAttempted(false); setNotice(result.message); })}>Preview invoice email</button>}
    {preview?.preview && doc.status === "posted" && <div className="space-y-3 rounded border bg-slate-50 p-4">
      <dl className="text-sm"><div><dt className="inline font-semibold">To: </dt><dd className="inline break-all">{preview.preview.recipient}</dd></div><div><dt className="inline font-semibold">From: </dt><dd className="inline break-all">{preview.preview.from}</dd></div><div><dt className="inline font-semibold">Subject: </dt><dd className="inline">{preview.preview.subject}</dd></div></dl>
      <pre className="whitespace-pre-wrap break-all text-sm">{preview.preview.text}</pre>
      <p className="text-xs text-slate-600">The link activates only when sending. This preview expires at {preview.preview.previewExpiresAt}. Existing invoice links remain valid.</p>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!preview.preview) return; const recipient = preview.preview.recipient; setAttempted(true); void run(async () => { const result = await command("billing.delivery.send", { id: doc.id, revision: doc.revision, deliveryId: preview.deliveryId, previewDigest: preview.previewDigest, recipient }); setPreview(null); setNotice(result.message); router.refresh(); }); }}>
        <label className="flex gap-2 text-sm"><input type="checkbox" required disabled={busy}/>I reviewed this exact message and recipient, and authorize this {preview.preview.mode === "test" ? "Mailgun test request" : "invoice email"}.</label>
        <button className="dd-primary" disabled={busy}>{busy ? "Checking request…" : attempted ? "Check this send attempt" : preview.preview.mode === "test" ? "Send test request" : "Send invoice email"}</button>
      </form>
    </div>}
    {!!deliveries.length && <div className="space-y-3"><h3 className="text-sm font-semibold">Email delivery history</h3>{deliveries.map(item => <div key={item.deliveryId} className="space-y-2 border-t pt-3 text-sm">
      <p>{item.createdAt} · {item.recipient} · {item.mode === "test" ? "Test" : "Live"} · {item.status}</p><p>{item.message}</p><p className="break-all text-xs">Request {item.deliveryId}{item.providerId ? ` · Mailgun ${item.providerId}` : ""}{item.verification === "staff_recorded_provider_evidence" ? " · Staff-recorded provider evidence" : ""}</p>
      {canEdit && ["uncertain", "sending"].includes(item.status) && <details><summary>Record outcome after checking Mailgun</summary><p className="my-2 text-xs">Check this exact request in Mailgun first. A timeout is not proof of failure. Interrupted requests must be at least one minute old before resolution.</p><form className="space-y-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget), providerId = String(form.get("providerId") || ""); void run(async () => { const result = await command("billing.delivery.resolve", { id: doc.id, revision: doc.revision, deliveryId: item.deliveryId, outcome: form.get("outcome"), evidence: form.get("evidence"), ...(providerId ? { providerId } : {}) }); setNotice(result.message); router.refresh(); }); }}>
        <label className="grid gap-1">Reviewed provider outcome<select name="outcome" className="rounded border p-2" required><option value="accepted">Provider accepted; recipient delivery unconfirmed</option><option value="not_sent">Confirmed not sent</option></select></label>
        <label className="grid gap-1">Actual Mailgun message ID (required if accepted)<input name="providerId" maxLength={300} className="rounded border p-2"/></label>
        <label className="grid gap-1">Evidence checked in Mailgun<textarea name="evidence" minLength={10} maxLength={2000} required className="rounded border p-2"/></label>
        <label className="flex gap-2"><input type="checkbox" required/>I verified this request in the provider account.</label><button className="dd-button" disabled={busy}>Record reviewed outcome</button>
      </form></details>}
    </div>)}</div>}
  </details>;
}
