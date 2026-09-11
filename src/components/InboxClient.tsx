"use client";

/**
 * InboxClient — inbound mail, triaged. Each email shows what the AI thinks it is
 * and where it should go; you can let the AI draft/handle it, route it to a
 * person, or archive. Auto-handleable mail is flagged so it barely needs you.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { Email } from "@/lib/email/store";
import type { InboxResult } from "@/app/inbox/actions";

const CAT_STYLE: Record<string, string> = {
  order: "bg-emerald-100 text-emerald-800",
  sample_request: "bg-sky-100 text-sky-800",
  invoice_ap: "bg-amber-100 text-amber-900",
  support: "bg-red-100 text-red-800",
  partnership: "bg-violet-100 text-violet-800",
  spam: "bg-slate-200 text-slate-500",
  other: "bg-slate-100 text-slate-600",
};
const CAT_LABEL: Record<string, string> = {
  order: "Order", sample_request: "Sample request", invoice_ap: "Invoice / AP",
  support: "Support", partnership: "Partnership", spam: "Spam", other: "Other",
};
const STATUS_STYLE: Record<string, string> = {
  new: "bg-white text-slate-600 ring-1 ring-slate-200",
  ai_handled: "bg-emerald-100 text-emerald-800",
  routed: "bg-indigo-100 text-indigo-800",
  archived: "bg-slate-200 text-slate-500",
};

export function InboxClient({
  emails,
  members,
  draftAction,
  aiHandleAction,
  routeToAction,
  archiveAction,
}: {
  emails: Email[];
  members: string[];
  draftAction: (id: string) => Promise<InboxResult>;
  aiHandleAction: (id: string) => Promise<InboxResult>;
  routeToAction: (id: string, to: string) => Promise<InboxResult>;
  archiveAction: (id: string) => Promise<InboxResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<InboxResult>) {
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.draft) setDrafts((d) => ({ ...d, [id]: res.draft! }));
      router.refresh();
    });
  }

  const active = emails.filter((e) => e.status !== "archived");

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{msg}</p>}
      {active.length === 0 && <p className="text-sm text-slate-400">Inbox zero. 🎉</p>}
      {active.map((e) => (
        <section key={e.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAT_STYLE[e.category]}`}>{CAT_LABEL[e.category]}</span>
            {e.autoHandle && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Draft available</span>}
            <span className="text-xs text-slate-400">→ {e.suggestedRole}</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[e.status]}`}>{e.status.replace("_", " ")}{e.routedTo ? ` · ${e.routedTo}` : ""}</span>
          </div>
          <p className="mt-2 font-medium text-slate-800">{e.subject}</p>
          <p className="text-xs text-slate-400">{e.fromName} &lt;{e.from}&gt; · {formatDate(e.receivedAt)}</p>
          <p className="mt-1 line-clamp-3 text-sm text-slate-600">{e.body}</p>

          {drafts[e.id] && (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">AI draft reply</p>
              <p className="whitespace-pre-wrap">{drafts[e.id]}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => run(e.id, () => draftAction(e.id))} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">AI draft reply</button>
            <button type="button" onClick={() => run(e.id, () => aiHandleAction(e.id))} disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Prepare reply</button>
            <select onChange={(ev) => ev.target.value && run(e.id, () => routeToAction(e.id, ev.target.value))} defaultValue="" disabled={pending} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none">
              <option value="">Route to…</option>
              {members.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button type="button" onClick={() => run(e.id, () => archiveAction(e.id))} disabled={pending} className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40">Archive</button>
          </div>
        </section>
      ))}
    </div>
  );
}
