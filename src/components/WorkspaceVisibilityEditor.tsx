"use client";
import { useState } from "react";
import { packs } from "@/lib/industry/catalog";
import { organizationOptions, serviceOptions, navigationGroups, featureShown, recommended, type WorkspaceItem, type WorkspaceVisibility } from "@/lib/navigation/catalog";

export function WorkspaceVisibilityEditor({ value, items, onChange }: { value: WorkspaceVisibility; items: WorkspaceItem[]; onChange: (patch: Partial<WorkspaceVisibility>) => void }) {
  const [query, setQuery] = useState("");
  const selected = value.organizationTypes ?? ["product"];
  const groups = [{ label: "Workspace" }, ...navigationGroups];
  const matching = items.filter(item => recommended(item, value)).filter(item => `${item.label} ${item.group} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-900">Workspace &amp; tools</h2>
    <p className="mt-1 text-sm leading-6 text-slate-500">Choose how your organization works. Combine types, then show or hide any group or individual tool for everyone.</p>
    {value.industrySetup && <fieldset className="mt-4 rounded-xl bg-emerald-50/50 p-4"><legend className="text-sm font-semibold">{value.industrySetup.templateName} · capability packs</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{packs.map(pack => <label key={pack.id} className="flex gap-2 text-xs"><input type="checkbox" checked={value.industrySetup!.packs.includes(pack.id)} disabled={value.industrySetup!.packs.length === 1 && value.industrySetup!.packs.includes(pack.id)} onChange={e => onChange({ industrySetup: { ...value.industrySetup!, packs: e.target.checked ? [...value.industrySetup!.packs, pack.id] : value.industrySetup!.packs.filter(id => id !== pack.id) }, organizationTypes: e.target.checked ? [...new Set([...selected, ...pack.profiles])] : selected })}/>{pack.label}</label>)}</div><p className="mt-3 text-xs text-slate-500">Packs set defaults. Your individual tool overrides below take precedence, and records stay available when hidden.</p></fieldset>}
    <fieldset className="mt-5"><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Organization type</legend>
      <div className="grid gap-2 sm:grid-cols-3">{organizationOptions.map(option => <label key={option.id} className={`cursor-pointer rounded-xl border p-3 ${selected.includes(option.id) ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200"}`}>
        <span className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selected.includes(option.id)} disabled={selected.length === 1 && selected.includes(option.id)} onChange={() => onChange({ organizationTypes: selected.includes(option.id) ? selected.filter(type => type !== option.id) : [...selected, option.id] })} className="accent-emerald-700"/>{option.label}</span>
        <span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
      </label>)}</div>
      <p className="mt-2 text-xs text-slate-500">A nonprofit can also sell products and deliver paid services. Only tools for selected profiles are shown. Your saved switches are kept when you change profiles.</p>
    </fieldset>
    {selected.includes("service") && <fieldset className="mt-4"><legend className="mb-2 text-xs font-semibold text-slate-600">Service templates · choose any combination</legend>
      <div className="flex flex-wrap gap-2">{serviceOptions.map(option => <label key={option.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"><input type="checkbox" className="accent-emerald-700" checked={value.serviceTypes?.includes(option.id) ?? false} onChange={() => onChange({ serviceTypes: value.serviceTypes?.includes(option.id) ? value.serviceTypes.filter(type => type !== option.id) : [...value.serviceTypes ?? [], option.id] })}/>{option.label}</label>)}</div>
      <p className="mt-2 text-xs text-slate-500">Leave these unselected to include all service templates.</p>
    </fieldset>}
    <div className="mt-5 border-t border-slate-100 pt-4">
      <label className="block text-xs font-medium text-slate-600">Find a tool or group<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search taxes, grants, scheduling…" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <p className="my-3 text-xs leading-5 text-slate-500">Hidden tools keep their records. These switches change navigation; Roles &amp; access controls who can use each tool. Specialist tools include record forms and workflow actions.</p>
      <div className="space-y-2">{groups.map(group => {
        const entries = matching.filter(item => item.group === group.label);
        if (!entries.length) return null;
        const hidden = value.hiddenSections.includes(group.label), shown = entries.filter(item => featureShown(item, value)).length;
        return <details key={`${group.label}:${query ? "search" : "browse"}`} open={query ? true : undefined} className="group rounded-xl border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl bg-slate-50/70 px-3 py-3">
            <span className="text-xs text-slate-400 group-open:rotate-90" aria-hidden>▶</span><span className="flex-1 text-sm font-semibold text-slate-700">{group.label}</span>
            <span className="text-[11px] text-slate-500">{hidden ? "Group hidden" : `${shown}/${entries.length} selected`}</span>
          </summary>
          <div className="border-t border-slate-200 p-3">
            <VisibilitySwitch label={`Show ${group.label} group`} checked={!hidden} onChange={() => onChange({ hiddenSections: hidden ? value.hiddenSections.filter(label => label !== group.label) : [...value.hiddenSections, group.label] })}/>
            <div className={`mt-2 divide-y divide-slate-100 ${hidden ? "opacity-60" : ""}`}>{entries.map(item => <div key={item.id} className="flex items-center gap-2 py-2">
              <VisibilitySwitch label={item.label} checked={featureShown(item, value)} onChange={() => onChange({ featureVisibility: { ...value.featureVisibility, [item.id]: !featureShown(item, value) } })}/>
              {item.status === "planned" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Planned</span>}
            </div>)}</div>
          </div>
        </details>;
      })}</div>
      {!matching.length && <p className="py-5 text-sm text-slate-500">No tools match this search.</p>}
    </div>
  </section>;
}
function VisibilitySwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={onChange} className="flex min-h-8 flex-1 items-center gap-2.5 rounded-md px-1 text-left text-sm text-slate-700 hover:bg-slate-50">
    <span aria-hidden className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? "bg-emerald-600" : "bg-slate-300"}`}><span className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-4" : ""}`}/></span><span>{label}</span>
  </button>;
}
