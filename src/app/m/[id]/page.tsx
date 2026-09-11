import { InspectionWorkspace } from "@/components/auto-repair/InspectionWorkspace";
import { inspectionWorkspace } from "@/lib/auto-repair/inspections";
import { requireIdentity } from "@/lib/auth/identity";
import { AutoRepairWorkbench } from "@/components/auto-repair/AutoRepairWorkbench";
import { repairWorkspace } from "@/lib/auto-repair/service";
import { VehicleVinLookup } from "@/components/vehicles/VehicleVinLookup";
import { vehicleClientOptions } from "@/lib/vehicles/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { getActiveRole } from "@/lib/permissions/active";
import { getMatrix } from "@/lib/permissions/store";
import { can } from "@/lib/permissions/model";
import { moduleById } from "@/lib/sdk/registry";
import { listRecords } from "@/lib/sdk/records";
import { getBranding } from "@/lib/branding/store";
import { restaurantWorkspaceLink } from "@/lib/restaurant/navigation";
import { ModuleRuntime } from "@/components/ModuleRuntime";
import { addRecordAction, updateRecordAction, archiveRecordAction, removeRecordAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mod = moduleById(id);
  if (!mod) notFound();

  await requireSectionAccess(mod.section, "view");
  const role = await getActiveRole();
  const canEdit = can(getMatrix(), role, mod.section, "edit");

  const records = listRecords(id);
  const panels = (mod.panels ?? []).map((p) => {
    try { return { id: p.id, label: p.label, stats: p.compute(records) }; }
    catch { return { id: p.id, label: p.label, stats: [] }; } // a bad panel never breaks the page
  });

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Module · v{mod.version}{mod.author ? ` · ${mod.author}` : ""}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{mod.label}</h1>
        {mod.description && <p className="mt-2 text-sm text-slate-500">{mod.description}</p>}
      </header>
      {(id === "staff-shifts" || getBranding().industrySetup?.packs.includes("restaurant")) && restaurantWorkspaceLink(id) && <p className="mb-5 rounded-lg border bg-amber-50 p-4 text-sm">These earlier reference records remain available here. <Link className="underline" href={restaurantWorkspaceLink(id)!}>Open the connected workflow</Link> to manage the live operation.</p>}

      {id === "vehicles" && <VehicleVinLookup records={records} clients={vehicleClientOptions()} canEdit={canEdit}/>}
      {getBranding().industrySetup?.packs.includes("auto_repair") && ["labor-rates", "parts-markups"].includes(id) && <AutoRepairWorkbench initial={repairWorkspace()} canEdit={canEdit} mode="rules"/>}
      {id === "vehicle-inspections" && getBranding().industrySetup?.packs.includes("auto_repair") && <InspectionWorkspace initial={inspectionWorkspace(await requireIdentity(), true)} canEdit={canEdit}/>}
      <ModuleRuntime
        moduleId={id}
        fields={mod.fields}
        panels={panels}
        records={records}
        canEdit={canEdit}
        addRecordAction={addRecordAction}
        updateRecordAction={updateRecordAction}
        archiveRecordAction={archiveRecordAction}
        removeRecordAction={removeRecordAction}
      />

      <p className="mt-6 text-xs text-slate-400">
        This screen is generated from a module manifest — see <Link href="/developer" className="font-semibold text-emerald-700 hover:underline">Developer &amp; modules</Link>. <Link href={`/api/v1/m/${id}`} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link>
      </p>
    </div>
  );
}
