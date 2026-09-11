import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { listDocs } from "@/lib/documents/store";
import { summarizeVault } from "@/lib/documents/model";
import { esignStatus } from "@/lib/integrations/esign";
import { legalZoomStatus } from "@/lib/integrations/legalzoom";
import { DocumentVault } from "@/components/DocumentVault";
import { addDocAction, removeDocAction, requestSignatureAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requireSectionAccess("admin", "view");

  const docs = listDocs();
  const todayIso = new Date().toISOString().slice(0, 10);
  const summary = summarizeVault(docs, todayIso);
  const esign = esignStatus();
  const lz = legalZoomStatus();

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Everything legal, under one roof</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Documents &amp; legal</h1>
        <p className="mt-2 text-sm text-slate-500">
          Licenses, insurance, permits, agreements, tax papers and forms — stored, renewal-tracked, and ready to
          send for signature. Connect DocuSign/PandaDoc for e-sign and LegalZoom for entity data.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Documents" value={String(summary.total)} />
        <Stat label="Renew soon" value={String(summary.expiring)} tone={summary.expiring > 0 ? "text-amber-600" : "text-slate-900"} />
        <Stat label="Expired" value={String(summary.expired)} tone={summary.expired > 0 ? "text-red-600" : "text-slate-900"} />
        <Stat label="Awaiting signature" value={String(summary.awaitingSignature)} />
      </div>

      {/* Integrations */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <IntegrationCard title="E-signature" name={esign.provider ? (esign.provider === "docusign" ? "DocuSign" : "PandaDoc") : "DocuSign / PandaDoc"} connected={esign.configured} detail={esign.detail} />
        <IntegrationCard title="Legal services" name="LegalZoom" connected={lz.configured} detail={lz.detail} />
      </div>

      <DocumentVault
        docs={docs}
        todayIso={todayIso}
        esign={{ configured: esign.configured, detail: esign.detail }}
        addDocAction={addDocAction}
        removeDocAction={removeDocAction}
        requestSignatureAction={requestSignatureAction}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
function IntegrationCard({ title, name, connected, detail }: { title: string; name: string; connected: boolean; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{title}</p>
          <p className="font-semibold text-slate-900">{name}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{connected ? "Connected" : "Not connected"}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
      {!connected && <Link href="/settings" className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline">Connect in Settings →</Link>}
    </div>
  );
}
