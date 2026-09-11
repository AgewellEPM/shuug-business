import { requireSectionAccess } from "@/lib/permissions/guard";
import { SKUS } from "@/lib/data/seed";
import { listSampleRequests } from "@/lib/ops/store";
import { SamplesClient } from "@/components/SamplesClient";
import { createSampleAction, decideSampleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SamplesPage() {
  await requireSectionAccess("sales", "view");

  const samples = listSampleRequests();
  const skus = SKUS.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Samples</h1>
        <p className="mt-1 text-sm text-slate-600">
          Requests come here for a quick approve — approving ships the sample and deducts inventory.
          Demo data (in-memory).
        </p>
      </header>
      <SamplesClient
        skus={skus}
        samples={samples}
        createAction={createSampleAction}
        decideAction={decideSampleAction}
      />
    </div>
  );
}
