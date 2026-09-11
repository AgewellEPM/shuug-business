import { requireSectionAccess } from "@/lib/permissions/guard";
import { getProfile } from "@/lib/onboarding/store";
import { SetupWizard } from "@/components/SetupWizard";
import { traceBusinessAction } from "./actions";
import { GettingStarted } from "@/components/GettingStarted";
import { setupState } from "@/lib/getting-started/store";
import { connectionCatalog } from "@/lib/connections/catalog";
import { getBranding } from "@/lib/branding/store";
import { appBaseUrl } from "@/lib/connections/vault";
import { listTeam } from "@/lib/team/store";
import { BrandingSettings } from "@/components/BrandingSettings";
import { saveBrandingAction } from "../branding/actions";
import { catalogWithTools } from "@/lib/navigation/catalog";
import { toolLinks } from "@/lib/features/store";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requireSectionAccess("admin", "view");

  const profile = getProfile();
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Connect your tools. Run your work.</h1>
        <p className="mt-2 text-slate-600">
          Keep your website, accounting and communication tools. Configure Shuug around your organization, attach it to your website, and test a complete workflow.
        </p>
      </header>
      <GettingStarted initial={setupState()} connections={connectionCatalog()} branding={getBranding()} members={listTeam().map(m => ({ id: m.id, name: m.name }))} baseUrl={appBaseUrl()} configuration={<BrandingSettings initial={getBranding()} items={catalogWithTools(toolLinks())} saveAction={saveBrandingAction}/>}/>
      <details className="mt-10 rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">Optional: research your existing website</summary><p className="my-4 text-sm text-slate-500">Trace products and business information to review before importing.</p><SetupWizard initial={profile} traceAction={traceBusinessAction}/></details>
    </div>
  );
}
