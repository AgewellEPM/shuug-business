/**
 * PUBLIC feature catalog for the marketing showcase (public/showcase.html fetches it).
 * No auth — it exposes only the feature map (names + status), the primitives and the
 * vertical list, all of which are already public marketing facts. Driven straight from
 * the real feature map so the showcase never drifts from what's actually built.
 */
import { QB_FEATURES, type QbFeature } from "@/lib/quickbooks/features";
import { capabilitySurface } from "@/lib/state/capabilities";
import { PRIMITIVES, VERTICAL_MAP } from "@/lib/state/primitives";

export const dynamic = "force-dynamic";

/** Map a feature to a marketing filter bucket the showcase groups by. */
function marketingCategory(f: QbFeature): string {
  const ai = ["ai-handlers", "state-layer", "automation-rules", "work-order-engine", "workspace-blueprint", "general-ledger"];
  const setup = ["integrations-hub", "developer-modules", "company-home"];
  const ops = ["restaurant", "childcare", "assessments"];
  if (ai.includes(f.id)) return "AI";
  if (setup.includes(f.id)) return "Setup";
  if (ops.includes(f.id)) return "Ops";
  if (f.group === "Payroll & Team") return "Team";
  if (f.group === "Inventory") return "Ops";
  if (f.group === "Sales & A/R") return "Sales";
  if (f.group === "Company") return "Setup";
  return "Money"; // Purchases & A/P, Banking, Reports, Sales Tax
}

export function GET() {
  const s = capabilitySurface();
  const features = QB_FEATURES.map((f) => ({
    id: f.id,
    label: f.label,
    // A friendly one-liner: what it mirrors, unless it's a beyond-QuickBooks platform feature.
    sub: f.qbTerm.startsWith("n/a") ? "Beyond QuickBooks" : `mirrors ${f.qbTerm}`,
    status: f.status,
    cat: marketingCategory(f),
  }));

  return Response.json(
    {
      count: features.length,
      liveCount: features.filter((f) => f.status === "live").length,
      features,
      primitives: PRIMITIVES.map((p) => ({ kind: p.kind, label: p.label })),
      verticals: VERTICAL_MAP.map((v) => ({ id: v.vertical, label: v.label })),
      capabilities: { live: s.live, total: s.total },
    },
    { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } },
  );
}
