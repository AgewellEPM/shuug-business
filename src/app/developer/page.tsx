import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { appModules } from "@/lib/sdk/registry";

export const dynamic = "force-dynamic";

const EXAMPLE = `// src/modules/service-tickets.ts
import { defineModule } from "@/lib/sdk/module";

export default defineModule({
  id: "service-tickets",
  label: "Service tickets",
  description: "Track support tickets to resolution.",
  group: "Sales",          // which nav group it appears in
  section: "sales",        // which RBAC section governs access
  version: "1.0.0",
  fields: [
    { id: "subject",  label: "Subject",  type: "text",   required: true,  options: [] },
    { id: "priority", label: "Priority", type: "select", required: true,  options: ["Low","High"] },
    { id: "resolved", label: "Resolved", type: "checkbox", required: false, options: [] },
  ],
  panels: [{
    id: "open",
    label: "Open tickets",
    compute: (records) => [{
      label: "Open",
      value: String(records.filter(r => !r.archived && r.values.resolved !== true).length),
    }],
  }],
});

// then add it to src/modules/index.ts — that's the only other step.`;

export default async function DeveloperPage() {
  await requireSectionAccess("admin", "view");
  const modules = appModules();

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Make it yours</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Developer &amp; modules</h1>
        <p className="mt-2 text-sm text-slate-500">
          The whole platform is extensible. There are two ways to add a feature — no code, or code — and both are
          first-class: they get the same nav, permissions, API and UI as anything we ship.
        </p>
      </header>

      {/* Two paths */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">🧩 No code — anyone</h2>
          <p className="mt-2 text-sm text-slate-500">Build a tracker from the UI: name it, add fields, start entering records. No developer needed.</p>
          <Link href="/features" className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Build a tracker →</Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">⌨️ Code — developers</h2>
          <p className="mt-2 text-sm text-slate-500">Write one manifest file with <code className="rounded bg-slate-100 px-1">defineModule()</code>. Fields, computed panels, a pure API — all validated. Register it in the barrel and it wires itself in.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/api/v1" target="_blank" rel="noreferrer" className="rounded-lg px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">Browse the API</Link>
          </div>
        </div>
      </div>

      {/* Registered modules */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Registered code modules ({modules.length})</h2>
        {modules.length === 0 ? (
          <p className="text-sm text-slate-400">None yet — add one to <code>src/modules/</code>.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {modules.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{m.label} <span className="text-xs font-normal text-slate-400">v{m.version}{m.author ? ` · ${m.author}` : ""}</span></p>
                  <p className="text-xs text-slate-500">{m.description}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">group <b>{m.group}</b> · section <b>{m.section}</b> · {m.fields.length} field{m.fields.length === 1 ? "" : "s"}{m.panels?.length ? ` · ${m.panels.length} panel(s)` : ""}{m.api ? " · API" : ""}</p>
                </div>
                <div className="flex flex-none gap-2 text-xs">
                  <Link href={`/m/${m.id}`} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">Open</Link>
                  <Link href={`/api/v1/m/${m.id}`} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 font-semibold text-emerald-700 ring-1 ring-emerald-200">API</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The recipe */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Write a module</h2>
        <p className="mb-3 text-sm text-slate-500">Field types: <code>text</code>, <code>notes</code>, <code>number</code>, <code>money</code>, <code>date</code>, <code>select</code>, <code>checkbox</code>. Full guide in <code>docs/MODULES.md</code>.</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100"><code>{EXAMPLE}</code></pre>
      </section>
    </div>
  );
}
