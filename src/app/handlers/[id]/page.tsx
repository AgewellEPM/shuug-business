import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHandler, listActivity } from "@/lib/handlers/store";
import { templateById } from "@/lib/handlers/templates";
import { capabilityStatuses } from "@/lib/handlers/load";
import { performance } from "@/lib/handlers/model";
import { previewOpportunities } from "@/lib/handlers/runtime";
import { HandlerDetail } from "@/components/HandlerDetail";
import { setModeAction, setCapabilitiesAction, removeHandlerAction, previewAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function HandlerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSectionAccess("admin", "view");

  const { id } = await params;
  const handler = getHandler(id);
  if (!handler) notFound();
  const template = templateById(handler.templateId);
  if (!template) notFound();

  const statuses = capabilityStatuses(template);
  const activity = listActivity(id);
  const perf = performance(activity, template.baselineMinutesPerRequest);
  const opportunities = await previewOpportunities(template.id);

  return (
    <div>
      <header className="mb-5">
        <Link href="/handlers" className="text-sm text-slate-500 hover:text-slate-800">← All Handlers</Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl">{template.icon}</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{handler.name}</h1>
            <p className="text-sm text-slate-500">{template.outcome}</p>
          </div>
        </div>
      </header>

      <HandlerDetail
        handler={handler}
        template={template}
        capabilityStatuses={statuses}
        performance={perf}
        activity={activity}
        opportunities={opportunities}
        setModeAction={setModeAction}
        setCapabilitiesAction={setCapabilitiesAction}
        removeHandlerAction={removeHandlerAction}
        previewAction={previewAction}
      />
    </div>
  );
}
