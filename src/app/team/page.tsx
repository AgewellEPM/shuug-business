import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import Link from "next/link";
import { memberProgress } from "@/lib/tasks/store";
import { listRoles } from "@/lib/permissions/store";
import { adpStatus } from "@/lib/payroll/adp";
import { TeamRoster } from "@/components/TeamRoster";
import { PayrollPanel } from "@/components/PayrollPanel";
import { addMemberAction, updateMemberAction, removeMemberAction, syncTeamToAdpAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireSectionAccess("team", "view");

  const user = await requireIdentity();
  const team = memberProgress();
  if (!user.isOwner) return <div><h1 className="text-2xl font-bold">Team directory</h1><Link href="/tasks" className="mt-4 inline-block text-emerald-800 underline">Shared task board</Link><ul className="mt-5 space-y-3">{team.map(m => <li key={m.id} className="rounded-lg border bg-white p-4"><p className="font-semibold">{m.name}</p><p className="text-sm text-slate-500">{m.role}</p></li>)}</ul></div>;
  const roles = listRoles();
  const adp = adpStatus();
  return (
    <div>
      <Link href="/admin/users" className="mb-4 inline-block rounded-lg border bg-white px-4 py-2 text-sm">Manage employee logins</Link>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-600">
            Everyone on your team, their level, and what they&apos;re carrying. {team.filter((m) => m.online).length} online now.
          </p>
        </div>
        <Link href="/tasks" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">Task board →</Link>
      </header>

      <PayrollPanel status={{ configured: adp.configured, detail: adp.detail }} syncAction={syncTeamToAdpAction} />

      <TeamRoster
        team={team}
        roles={roles}
        addAction={addMemberAction}
        updateAction={updateMemberAction}
        removeAction={removeMemberAction}
      />
    </div>
  );
}
