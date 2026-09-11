import { requireSectionAccess } from "@/lib/permissions/guard";
import { SKUS } from "@/lib/data/seed";
import { listRecipes, listLabels, listCcpChecks, recipeCostPerCaseCents, skuAllergens } from "@/lib/ops/store";
import { checkLabel, containsStatement, haccpSummary } from "@/lib/ops/compliance";
import { ProductionClient, type RecipeRow, type LabelRow } from "@/components/ProductionClient";
import { produceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  await requireSectionAccess("operations", "view");

  const nameById = new Map(SKUS.map((s) => [s.id, s.name]));

  const recipes: RecipeRow[] = listRecipes().map((r) => ({
    skuId: r.skuId,
    name: nameById.get(r.skuId) ?? r.skuId,
    costPerCaseCents: recipeCostPerCaseCents(r.skuId) ?? 0,
    batchYieldCases: r.batchYieldCases,
    allergens: skuAllergens(r.skuId),
  }));

  const labels: LabelRow[] = listLabels().map((l) => {
    const check = checkLabel(l);
    return {
      skuId: l.skuId,
      name: nameById.get(l.skuId) ?? l.skuId,
      ingredientsStatement: l.ingredientsStatement,
      containsStatement: containsStatement(l.allergens),
      netWeight: l.netWeight,
      shelfLifeDays: l.shelfLifeDays,
      ok: check.ok,
      issues: check.issues,
    };
  });

  const summary = haccpSummary(listCcpChecks());
  const haccp = {
    total: summary.total,
    outOfLimit: summary.outOfLimit,
    openCorrectiveActions: summary.openCorrectiveActions,
    rows: listCcpChecks().map((c) => ({ ccp: c.ccp, criticalLimit: c.criticalLimit, measured: c.measured, withinLimit: c.withinLimit, lotCode: c.lotCode })),
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Production</h1>
        <p className="mt-1 text-sm text-slate-600">
          Recipes with real cost per case, one-click batches (creates a tracked lot), labels with
          allergens, and HACCP checks. Demo data (in-memory).
        </p>
      </header>
      <ProductionClient recipes={recipes} labels={labels} haccp={haccp} produceAction={produceAction} />
    </div>
  );
}
