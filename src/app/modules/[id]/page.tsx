import { AutoRepairWorkbench } from "@/components/auto-repair/AutoRepairWorkbench";
import { repairWorkspace } from "@/lib/auto-repair/service";
import { getBranding } from "@/lib/branding/store";
import { notFound } from "next/navigation";
import { specialistModules } from "@/lib/navigation/catalog";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { can } from "@/lib/permissions/model";
import { readableBusinessRecords, workspaceIdentity } from "@/lib/workspace/access";
import { definitionsForModule, recordDefinitions } from "@/lib/workspace/catalog";
import { BusinessModule } from "@/components/BusinessModule";
export const dynamic = "force-dynamic";
export default async function ModulePage({ params, searchParams }: { searchParams: Promise<{ record?: string }>; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const definition = specialistModules.find(item => item.id === id);
  if (!definition) notFound();
  await requireSectionAccess(definition.section);
  const { role, matrix } = await workspaceIdentity();
  const selectedId = (await searchParams).record;
  return <>{id === "service-proposals" && getBranding().industrySetup?.packs.includes("auto_repair") && <AutoRepairWorkbench initial={repairWorkspace()} canEdit={can(matrix, role, "services", "edit")} mode="estimate"/>}<BusinessModule key={id} selectedId={selectedId} module={definition}
    definitions={definitionsForModule(id).filter(d => can(matrix, role, d.section, "view"))}
    initialRecords={await readableBusinessRecords()}
    editableKinds={recordDefinitions.filter(d => can(matrix, role, d.section, "edit")).map(d => d.kind)}/></>;
}
