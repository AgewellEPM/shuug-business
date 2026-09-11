import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadEducation } from "@/lib/education/load";
import { ChildcareHub } from "@/components/ChildcareHub";
import { addStudentAction, removeStudentAction, addClassAction, removeClassAction, enrollAction, unenrollAction, checkInAction, checkOutAction, generateTuitionAction, setTuitionStatusAction, removeTuitionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ChildcarePage() {
  await requireSectionAccess("operations", "view");

  const data = loadEducation();

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Run your daycare, school or classes</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Childcare &amp; classes</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign children in and out with authorized pickups, keep your <strong>staff-to-child ratio</strong> compliant in
          real time, and run classes and lessons — daycare rooms, art class, swim levels. Staff hours come from the time clock;
          progress and safety checks live in <Link href="/assessments" className="font-semibold text-emerald-700 hover:underline">Assessments</Link>.
        </p>
      </header>

      {/* Ratio banner — the safety-critical headline */}
      <div className={`mb-5 rounded-2xl border p-4 shadow-sm ${data.ratio.compliant ? "border-emerald-200 bg-emerald-50/50" : "border-red-300 bg-red-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Staff-to-child ratio</p>
            <p className={`text-2xl font-bold ${data.ratio.compliant ? "text-emerald-700" : "text-red-700"}`}>
              {data.ratio.compliant ? "Compliant ✓" : `Understaffed — need ${data.ratio.shortfall} more`}
            </p>
            <p className="text-sm text-slate-600">{data.ratio.childrenPresent} children present · {data.ratio.staffPresent} staff on the clock · {data.ratio.requiredStaff} required</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.ratio.byGroup.map((g) => (
              <span key={g.group} className="rounded-lg bg-white px-3 py-1.5 shadow-sm">{g.present} × <b>{g.group}</b> (1:{g.ratio}) → {g.requiredForGroup} staff</span>
            ))}
            {data.ratio.byGroup.length === 0 && <span className="text-slate-400">No children checked in.</span>}
          </div>
        </div>
        {!data.ratio.compliant && <p className="mt-2 text-xs font-semibold text-red-700">Add staff on the <Link href="/timeclock" className="underline">time clock</Link> or reduce children present to meet licensing ratios.</p>}
      </div>

      <ChildcareHub
        data={data}
        addStudentAction={addStudentAction}
        removeStudentAction={removeStudentAction}
        addClassAction={addClassAction}
        removeClassAction={removeClassAction}
        enrollAction={enrollAction}
        unenrollAction={unenrollAction}
        checkInAction={checkInAction}
        checkOutAction={checkOutAction}
        generateTuitionAction={generateTuitionAction}
        setTuitionStatusAction={setTuitionStatusAction}
        removeTuitionAction={removeTuitionAction}
      />

      {/* Program assessments (runnable directly) */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Program assessments</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "daycare-daily", label: "Daily childcare check" },
            { id: "child-development", label: "Child development check-in" },
            { id: "swim-level", label: "Swim level assessment" },
            { id: "student-progress", label: "Student progress report" },
          ].map((a) => (
            <Link key={a.id} href={`/assessments/${a.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-emerald-300">{a.label} →</Link>
          ))}
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-400">Tuition &amp; class fees bill through <Link href="/collections" className="font-semibold text-emerald-700 hover:underline">invoicing</Link>. PTO/PTA fundraising uses the <Link href="/marketing" className="font-semibold text-emerald-700 hover:underline">campaigns</Link> &amp; nonprofit tools. <Link href="/api/v1/childcare" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link></p>
    </div>
  );
}
