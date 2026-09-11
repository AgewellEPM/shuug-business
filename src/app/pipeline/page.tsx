import { requireSectionAccess } from "@/lib/permissions/guard";
import { listDeals } from "@/lib/pipeline/store";
import { pipelineSummary } from "@/lib/pipeline/model";
import { listTeam } from "@/lib/team/store";
import { PipelineBoard } from "@/components/PipelineBoard";
import { createDealAction, moveStageAction, markLostAction, assignDealAction, updateNextActionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await requireSectionAccess("sales", "view");

  const deals = listDeals();
  const summary = pipelineSummary(deals);
  const team = listTeam().map((m) => ({ id: m.id, name: m.name }));

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Turn inquiries into orders</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Sales pipeline</h1>
        <p className="mt-2 text-sm text-slate-500">
          Every lead from inquiry to won — assigned rep, expected value, next action, and why deals were lost.
          The forecast is weighted by probability, so you see real expected revenue, not a wish list.
        </p>
      </header>
      <PipelineBoard
        deals={deals}
        summary={summary}
        team={team}
        createDealAction={createDealAction}
        moveStageAction={moveStageAction}
        markLostAction={markLostAction}
        assignDealAction={assignDealAction}
        updateNextActionAction={updateNextActionAction}
      />
    </div>
  );
}
