"use client";

/**
 * Childcare & classes hub — three tabs:
 *  • Today: sign kids in/out (with who dropped off / picked up), live present list.
 *  • Roster: children + guardians + authorized pickups.
 *  • Classes: daycare rooms, art class, swim levels — capacity + enrollment.
 * The ratio banner lives on the page above this; check-ins here drive it.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { AGE_GROUP_LABEL, type AgeGroup } from "@/lib/education/model";
import type { EducationOverview } from "@/lib/education/load";
import type { ClassKind } from "@/lib/education/store";
import type { ActionResult } from "@/app/childcare/actions";

interface Actions {
  addStudentAction: (form: { name: string; dobISO: string; guardians: { name: string; phone: string; relationship: string }[]; authorizedPickups: string[]; notes: string }) => Promise<ActionResult>;
  removeStudentAction: (id: string) => Promise<ActionResult>;
  addClassAction: (form: { name: string; kind: ClassKind; ageGroup: AgeGroup | null; capacity: number; schedule: string; level: string; priceDollars: number }) => Promise<ActionResult>;
  removeClassAction: (id: string) => Promise<ActionResult>;
  enrollAction: (studentId: string, classId: string) => Promise<ActionResult>;
  unenrollAction: (id: string) => Promise<ActionResult>;
  checkInAction: (studentId: string, by: string, dateISO: string) => Promise<ActionResult>;
  checkOutAction: (studentId: string, by: string, dateISO: string) => Promise<ActionResult>;
  generateTuitionAction: (month: string) => Promise<ActionResult>;
  setTuitionStatusAction: (id: string, status: "draft" | "sent" | "paid") => Promise<ActionResult>;
  removeTuitionAction: (id: string) => Promise<ActionResult>;
}

const KINDS: ClassKind[] = ["daycare", "art", "swim", "music", "dance", "tutoring", "sports", "other"];

export function ChildcareHub({ data, ...actions }: { data: EducationOverview } & Actions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "roster" | "classes" | "billing">("today");
  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setToast(r.ok ? (r.created !== undefined ? `Generated ${r.created} · skipped ${r.skipped} already billed` : "Saved") : r.error ?? "Failed"); router.refresh(); });

  return (
    <div className="space-y-5">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}
      <div className="flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {(["today", "roster", "classes", "billing"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-4 py-1.5 font-semibold capitalize ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{t}</button>
        ))}
      </div>

      {tab === "today" && <Today data={data} pending={pending} run={run} actions={actions} />}
      {tab === "roster" && <Roster data={data} pending={pending} run={run} actions={actions} />}
      {tab === "classes" && <Classes data={data} pending={pending} run={run} actions={actions} />}
      {tab === "billing" && <Billing data={data} pending={pending} run={run} actions={actions} />}
    </div>
  );
}

function Today({ data, pending, run, actions }: { data: EducationOverview; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const [by, setBy] = useState<Record<string, string>>({});
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Here now ({data.present.length})</h2>
        <div className="space-y-2">
          {data.present.map((p) => (
            <div key={p.record.id} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/40 p-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{p.name}</p><p className="text-[11px] text-slate-500">{p.ageGroup ? AGE_GROUP_LABEL[p.ageGroup] : "age n/a"} · in {p.hours}h · by {p.record.checkedInBy}</p></div>
              <div className="flex items-center gap-1">
                <input value={by[p.record.studentId] ?? ""} onChange={(e) => setBy((m) => ({ ...m, [p.record.studentId]: e.target.value }))} placeholder="picked up by" className="w-28 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
                <button type="button" disabled={pending} onClick={() => run(() => actions.checkOutAction(p.record.studentId, by[p.record.studentId] ?? "", data.dateISO))} className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">Check out</button>
              </div>
            </div>
          ))}
          {data.present.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No one checked in yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Not here yet ({data.notHereYet.length})</h2>
        <div className="space-y-2">
          {data.notHereYet.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
              <p className="text-sm text-slate-800">{s.name}</p>
              <div className="flex items-center gap-1">
                <input value={by[s.id] ?? ""} onChange={(e) => setBy((m) => ({ ...m, [s.id]: e.target.value }))} placeholder="dropped off by" className="w-28 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
                <button type="button" disabled={pending} onClick={() => run(() => actions.checkInAction(s.id, by[s.id] ?? "", data.dateISO))} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">Check in</button>
              </div>
            </div>
          ))}
          {data.notHereYet.length === 0 && <p className="py-2 text-center text-xs text-slate-400">Everyone&apos;s here (or add children in Roster).</p>}
        </div>
      </section>
    </div>
  );
}

function Roster({ data, pending, run, actions }: { data: EducationOverview; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gName, setGName] = useState(""); const [gPhone, setGPhone] = useState("");
  const [pickups, setPickups] = useState("");
  const add = () => {
    if (!name.trim()) return;
    run(() => actions.addStudentAction({ name, dobISO: dob, guardians: gName ? [{ name: gName, phone: gPhone, relationship: "Guardian" }] : [], authorizedPickups: pickups.split(",").map((p) => p.trim()).filter(Boolean), notes: "" }));
    setName(""); setDob(""); setGName(""); setGPhone(""); setPickups("");
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-2">Child</th><th className="px-4 py-2">Guardians</th><th className="px-4 py-2">Authorized pickup</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.students.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 font-medium text-slate-800">{s.name}<span className="block text-[11px] font-normal text-slate-400">{s.dobISO || "DOB n/a"}</span></td>
                <td className="px-4 py-2 text-xs text-slate-600">{s.guardians.map((g) => `${g.name}${g.phone ? ` (${g.phone})` : ""}`).join(", ") || "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-600">{s.authorizedPickups.join(", ") || "—"}</td>
                <td className="px-4 py-2 text-right"><button type="button" disabled={pending} onClick={() => run(() => actions.removeStudentAction(s.id))} className="text-xs text-slate-400 hover:text-red-600">remove</button></td>
              </tr>
            ))}
            {data.students.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No children yet. Add one →</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Add a child</h2>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Child's name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <label className="block text-xs text-slate-500">Date of birth (for age & ratio)<input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>
          <input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Guardian name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input value={gPhone} onChange={(e) => setGPhone(e.target.value)} placeholder="Guardian phone" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input value={pickups} onChange={(e) => setPickups(e.target.value)} placeholder="Authorized pickups (comma separated)" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <button type="button" disabled={pending || !name.trim()} onClick={add} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Add child</button>
        </div>
      </section>
    </div>
  );
}

function Billing({ data, pending, run, actions }: { data: EducationOverview; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const b = data.billing;
  const [month, setMonth] = useState(b.month);
  const STATUS = ["draft", "sent", "paid"] as const;
  const tone: Record<string, string> = { draft: "bg-slate-100 text-slate-500", sent: "bg-amber-100 text-amber-900", paid: "bg-emerald-100 text-emerald-800" };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Monthly recurring" value={formatCents(b.monthlyRecurringCents)} sub={`${b.draftPreview.length} enrolled`} />
        <Stat label="Billed this month" value={formatCents(b.summary.billedCents)} sub={`${b.summary.count} invoices`} />
        <Stat label="Collected" value={formatCents(b.summary.paidCents)} />
        <Stat label="Outstanding" value={formatCents(b.summary.outstandingCents)} tone={b.summary.outstandingCents > 0 ? "text-amber-700" : undefined} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Generate monthly tuition</h2>
            <p className="text-xs text-slate-500">One invoice per enrolled child = the sum of their classes&apos; fees. Runs are idempotent — a child is never billed twice for the same month.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <button type="button" disabled={pending || !/^\d{4}-\d{2}$/.test(month)} onClick={() => run(() => actions.generateTuitionAction(month))} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Run {month}</button>
          </div>
        </div>
        {b.draftPreview.length > 0 && b.invoices.length === 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview — what will be billed</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {b.draftPreview.slice(0, 8).map((d) => <li key={d.studentId}>• {d.studentName} — {formatCents(d.totalCents)} ({d.lines.map((l) => l.className).join(", ")})</li>)}
              {b.draftPreview.length > 8 && <li className="text-slate-400">+ {b.draftPreview.length - 8} more…</li>}
            </ul>
          </div>
        )}
      </section>

      {b.invoices.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="p-4 pb-2 text-sm font-semibold text-slate-900">{b.month} invoices</h2>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-2">Child</th><th className="px-4 py-2">Classes</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {b.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-2 font-medium text-slate-800">{inv.studentName}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{inv.lines.map((l) => l.className).join(", ")}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{formatCents(inv.totalCents)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {STATUS.map((s) => <button key={s} type="button" disabled={pending} onClick={() => run(() => actions.setTuitionStatusAction(inv.id, s))} className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${inv.status === s ? tone[s] : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>{s}</button>)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right"><button type="button" disabled={pending} onClick={() => run(() => actions.removeTuitionAction(inv.id))} className="text-xs text-slate-400 hover:text-red-600">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Classes({ data, pending, run, actions }: { data: EducationOverview; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const [name, setName] = useState(""); const [kind, setKind] = useState<ClassKind>("swim");
  const [capacity, setCapacity] = useState("8"); const [schedule, setSchedule] = useState(""); const [level, setLevel] = useState(""); const [price, setPrice] = useState("0");
  const add = () => { if (!name.trim()) return; run(() => actions.addClassAction({ name, kind, ageGroup: null, capacity: Number(capacity) || 1, schedule, level, priceDollars: Number(price) || 0 })); setName(""); setSchedule(""); setLevel(""); setPrice("0"); };
  const enrollableFor = (classId: string) => data.students.filter((s) => !data.classes.find((c) => c.cls.id === classId)?.students.some((st) => st.id === s.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.classes.map((c) => (
          <div key={c.cls.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div><p className="font-semibold text-slate-900">{c.cls.name}</p><p className="text-[11px] uppercase tracking-wide text-slate-400">{c.cls.kind}{c.cls.level ? ` · ${c.cls.level}` : ""}</p></div>
              <button type="button" disabled={pending} onClick={() => run(() => actions.removeClassAction(c.cls.id))} className="text-xs text-slate-300 hover:text-red-600">×</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">{c.cls.schedule || "—"} · {c.cls.priceCents ? `${formatCents(c.cls.priceCents)}` : "free"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">{c.enrolled}/{c.cls.capacity} enrolled</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {c.students.map((st) => <li key={st.id} className="flex items-center justify-between"><span className="truncate">{st.name}</span></li>)}
            </ul>
            {data.students.length > 0 && (
              <select disabled={pending || c.enrolled >= c.cls.capacity} defaultValue="" onChange={(e) => { if (e.target.value) run(() => actions.enrollAction(e.target.value, c.cls.id)); }} className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs">
                <option value="">{c.enrolled >= c.cls.capacity ? "Full" : "Enroll a child…"}</option>
                {enrollableFor(c.cls.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Add a class or lesson</h2>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Swim — Level 3)" className="min-w-[180px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <select value={kind} onChange={(e) => setKind(e.target.value as ClassKind)} className="rounded border border-slate-300 px-2 py-1.5 text-sm capitalize">{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Schedule" className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Level" className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Cap" className="w-16 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ fee" className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <button type="button" disabled={pending || !name.trim()} onClick={add} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Add</button>
        </div>
      </section>
    </div>
  );
}
