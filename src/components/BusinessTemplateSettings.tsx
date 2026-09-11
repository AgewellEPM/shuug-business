"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { businessTemplateAction } from "@/app/branding/template-actions";
export function BusinessTemplateSettings() {
  const router = useRouter(), [pending, start] = useTransition();
  const [input, setInput] = useState<unknown>(null), [preview, setPreview] = useState(""), [message, setMessage] = useState("");
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Reusable business template</h2><p className="text-sm leading-6 text-slate-500">Package branding, organization profiles, visible tools, custom forms and published repair pricing and inspection checklists explicitly marked for template sharing. Imported pricing and checklists start as drafts for local review. Business records and connection credentials stay in their own workspace.</p><a href="/api/workspace/template" className="inline-block rounded-lg border px-3 py-2 text-sm font-semibold">Export saved template</a><label className="block text-sm">Preview a template to import<input type="file" accept="application/json,.json" disabled={pending} className="mt-2 block text-xs" onChange={e => {
    const file = e.target.files?.[0]; setInput(null); setPreview(""); if (!file) return;
    start(async () => { try { if (file.size > 1000000) throw new Error("Keep the template below 1 MB."); const value = JSON.parse(await file.text()), result = await businessTemplateAction(value);
      if (!result.ok) throw new Error(result.error); setInput(value); setPreview(`${result.preview.template.name}: ${result.preview.toolsToCreate} new tools, ${result.preview.toolsAlreadyPresent} existing tools, ${result.preview.newPricingVersions} new draft pricing versions and ${result.preview.existingPricingVersions} existing pricing versions, ${result.preview.newInspectionVersions} new draft checklists and ${result.preview.existingInspectionVersions} existing checklists. Branding and workspace choices will be applied.`); setMessage("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid template."); } });
  }}/></label>{preview && <><p className="rounded-lg bg-slate-50 p-3 text-sm">{preview}</p><button disabled={pending} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => start(async () => {
    try { const result = await businessTemplateAction(input, true); if (!result.ok) throw new Error(result.error); setMessage("Template applied. Reloading the workspace…"); router.refresh(); window.location.reload(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Import interrupted. Retry the same template."); }
  })}>Apply reviewed template</button></>}{message && <p role="status" className="text-sm text-slate-600">{message}</p>}</section>;
}
