import { InspectionWorkspace } from "@/components/auto-repair/InspectionWorkspace";
import { inspectionWorkspace } from "@/lib/auto-repair/inspections";
import { getBranding } from "@/lib/branding/store";
import { requireIdentity } from "@/lib/auth/identity";
import { listTasks } from "@/lib/tasks/store";
import { MyWork } from "@/components/MyWork";
import { StaffSchedule } from "@/components/team/StaffSchedule";
import { scheduleView } from "@/lib/timeclock/schedule";
export const dynamic = "force-dynamic";
export default async function MyWorkPage() {
  const user = await requireIdentity(), inspections = inspectionWorkspace(user, false);
  return <div className="space-y-8"><MyWork user={user} initialTasks={listTasks().filter(t => t.assigneeId === user.memberId)}/>{(inspections.inspections.length > 0 || getBranding().industrySetup?.packs.includes("auto_repair")) && <InspectionWorkspace initial={inspections}/>}<StaffSchedule initial={scheduleView(user.memberId)}/></div>;
}
