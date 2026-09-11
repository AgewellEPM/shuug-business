import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { getBranding } from "@/lib/branding/store";
import { getActiveRole } from "@/lib/permissions/active";
import { getMatrix } from "@/lib/permissions/store";
import { can } from "@/lib/permissions/model";
import { BrandingSettings } from "@/components/BrandingSettings";
import { saveBrandingAction } from "./actions";
import { catalogWithTools } from "@/lib/navigation/catalog";
import { toolLinks } from "@/lib/features/store";

export const dynamic = "force-dynamic";


export default async function BrandingPage() {
  await requireSectionAccess("admin", "view");

  const role = await getActiveRole();
  if (!can(getMatrix(), role, "admin", "view")) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-2 text-lg font-bold text-slate-900">No access to branding</h1>
        <p className="mt-1 text-sm text-slate-500">Only an owner/admin can change how the app looks.</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Home</Link>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <p className="dd-eyebrow">Make it yours</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Branding &amp; white-label</h1>
        <p className="mt-2 text-sm text-slate-500">
          Name, logo, colors, and which sections to show — so the whole system feels like your brand. Open source
          and self-hostable: your brand, your data, your rules.
        </p>
      </header>
      <BrandingSettings initial={getBranding()} items={catalogWithTools(toolLinks())} saveAction={saveBrandingAction} />
    </div>
  );
}
