import { requireSectionAccess } from "@/lib/permissions/guard";
import { StaffSchedule } from "@/components/team/StaffSchedule";
import { scheduleView } from "@/lib/timeclock/schedule";
export const dynamic = "force-dynamic";
export default async function StaffSchedulePage() {
  await requireSectionAccess("team", "view"); let canEdit = false; try { await requireSectionAccess("team", "edit"); canEdit = true; } catch {}
  return <div className="space-y-5"><h1 className="text-3xl font-semibold">Staff schedule</h1><p>Assign shifts, publish the roster, review time away and compare planned work with recorded attendance.</p><StaffSchedule initial={scheduleView(undefined, true)} manager canEdit={canEdit}/></div>;
}
