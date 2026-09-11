"use client";

/**
 * White-label branding editor — name, tagline, logo mark, brand colors, and which
 * sections to permanently switch off for everyone. Live preview updates as you
 * type; Save re-themes the whole app. Owner/admin only.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Branding } from "@/lib/branding/store";
import type { BrandingResult } from "@/app/branding/actions";
import { BusinessTemplateSettings } from "./BusinessTemplateSettings";
import { WorkspaceVisibilityEditor } from "./WorkspaceVisibilityEditor";
import { catalogWithTools, organizeItems, navigationGroups, visibleItems, type WorkspaceItem } from "@/lib/navigation/catalog";

const readableOn = (hex: string): string => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0f172a" : "#ffffff";
};

export function BrandingSettings({
  initial, items = catalogWithTools(), saveAction,
}: {
  initial: Branding;
  items?: WorkspaceItem[];
  saveAction: (patch: Partial<Branding>) => Promise<BrandingResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [b, setB] = useState<Branding>(initial);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setB((p) => ({ ...p, [k]: v }));
  const onUpload = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 64 * 1024) { setToast("Image too large — keep it under 64KB (a small square logo)."); return; }
    const reader = new FileReader();
    reader.onload = () => set("logoImageUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = () => start(async () => {
    const r = await saveAction(b);
    if (!r.ok) { setToast(r.error ?? "Save failed"); return; }
    if (r.branding) setB(r.branding);
    router.refresh();
    // Then a full reload so the server-rendered layout that holds the sidebar
    // re-renders with the applied workspace — router.refresh() alone leaves the
    // rail stale until a manual reload.
    if (typeof window !== "undefined") window.location.reload();
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      {/* Editor */}
      <div className="space-y-5">
        {toast && <p role="status" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Identity</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><input value={b.businessName} onChange={(e) => set("businessName", e.target.value)} maxLength={40} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" /></Field>
            <Field label="Tagline"><input value={b.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={40} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" /></Field>
            <Field label="Logo / hero icon (letter or emoji)">
              <div className="flex items-center gap-2">
                <input value={b.logoText} onChange={(e) => set("logoText", [...e.target.value].slice(0, 3).join(""))} className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm focus:border-emerald-500 focus:outline-none" />
                <div className="flex flex-wrap gap-1">
                  {["🌶️", "🔥", "🧾", "🛒", "🏭", "📦", "🥫", "⭐"].map((emo) => (
                    <button key={emo} type="button" onClick={() => set("logoText", emo)} className="rounded border border-slate-200 px-1.5 py-1 text-sm hover:bg-slate-50">{emo}</button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="Upload logo / icon image">
              <div className="flex items-center gap-2">
                {b.logoImageUrl
                  ? <img src={b.logoImageUrl} alt="logo" className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
                  : <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold" style={{ backgroundColor: b.accentColor, color: readableOn(b.accentColor) }}>{b.logoText}</span>}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" onChange={(e) => onUpload(e.target.files?.[0])} className="text-xs" />
                {b.logoImageUrl && <button type="button" onClick={() => set("logoImageUrl", null)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Remove</button>}
              </div>
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Brand colors</h2>
          <div className="flex flex-wrap gap-6">
            <ColorField label="Primary" value={b.primaryColor} onChange={(v) => set("primaryColor", v)} />
            <ColorField label="Accent" value={b.accentColor} onChange={(v) => set("accentColor", v)} />
            <ColorField label="App background" value={b.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
            <ColorField label="Sidebar" value={b.sidebarColor} onChange={(v) => set("sidebarColor", v)} />
            <ColorField label="Header bar" value={b.headerColor} onChange={(v) => set("headerColor", v)} />
          </div>
        </section>

        <WorkspaceVisibilityEditor value={b} items={organizeItems(items, b)} onChange={patch => setB(current => ({ ...current, ...patch }))}/>

        <BusinessTemplateSettings/>

        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-[#f5f5f4]/95 py-3"><button type="button" onClick={save} disabled={pending} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40">{pending ? "Saving…" : "Save & apply workspace"}</button><span className="ml-3 text-xs text-slate-500">Applies to everyone</span></div>
      </div>

      {/* Live preview */}
      <div className="self-start lg:sticky lg:top-20">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Live preview</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex h-12 items-center gap-2 px-3 text-white" style={{ backgroundColor: b.headerColor }}>
            {b.logoImageUrl ? <img src={b.logoImageUrl} alt="" className="h-7 w-7 rounded-lg object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold" style={{ backgroundColor: b.accentColor, color: readableOn(b.accentColor) }}>{b.logoText}</span>}
            <span className="text-sm font-semibold">{b.businessName || "Business"}<span className="ml-1.5 text-xs font-normal text-white/55">{b.tagline}</span></span>
          </div>
          <div className="space-y-3 p-4" style={{ backgroundColor: b.backgroundColor }}>
            <button type="button" className="rounded-lg px-3.5 py-2 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: b.primaryColor }}>Primary button</button>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: b.primaryColor }}>Eyebrow / accent</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">A card in {b.businessName || "your"} brand</p>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: b.accentColor, color: readableOn(b.accentColor) }}>Accent chip</span>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sidebar preview</h3><div className="mt-3 max-h-[460px] space-y-3 overflow-y-auto">{[{ label: "Workspace" }, ...navigationGroups].map(group => {
          const entries = visibleItems(b, organizeItems(items, b)).filter(item => item.group === group.label);
          return entries.length ? <div key={group.label}><p className="text-xs font-semibold text-slate-700">{group.label} <span className="font-normal text-slate-400">{entries.length}</span></p><ul className="mt-1 space-y-1 border-l border-slate-200 pl-3">{entries.map(item => <li key={item.id} className="text-xs leading-5 text-slate-500">{item.label}{item.status === "planned" && <span className="ml-1 text-[10px] text-amber-700">Planned</span>}</li>)}</ul></div> : null;
        })}</div><p className="mt-3 text-[11px] leading-5 text-slate-400">Role permissions and personal menu choices still apply.</p></div>
        <p className="mt-3 text-xs text-slate-400">Open source &amp; self-hostable — your brand, your data, your rules.</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-slate-500">{label}</span>{children}</label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-300" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none" />
      </div>
    </div>
  );
}
