import { requireIdentity } from "@/lib/auth/identity";
import { redirect } from "next/navigation";
import Link from "next/link";
import { activeWorkspace } from "@/lib/navigation/active-profile";
import { OrganizationHome } from "@/components/OrganizationHome";
import { Cockpit } from "@/components/Cockpit";
import { loadCockpitData } from "@/lib/cockpit/data";
import { getActiveRole } from "@/lib/permissions/active";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await requireIdentity()).isOwner) redirect("/me");
  const profiles = (await activeWorkspace()).config.organizationTypes ?? ["product"];
  if (!profiles.includes("product")) return <OrganizationHome profiles={profiles}/>;
  const [data, role] = await Promise.all([loadCockpitData(), getActiveRole()]);

  return (
    <div className="space-y-6">
      {profiles.length > 1 && <OrganizationHome profiles={profiles}/>}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="dd-eyebrow">Your business, right now</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Command center.</h1>
          <p className="mt-2 text-sm text-slate-500">The numbers and moves that matter to you — pin what you want, arrange it your way.</p>
        </div>
        <Link href="/customers?order=1" className="dd-primary">+ Create order</Link>
      </header>

      {!data.onboarding.durable && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span>Imported customers and new orders are saved locally. Review connected source data before using financial reports.</span>
          <Link href="/settings" className="ml-auto shrink-0 font-semibold underline">Set up your business</Link>
        </div>
      )}

      <Cockpit role={role} data={data} />
    </div>
  );
}
