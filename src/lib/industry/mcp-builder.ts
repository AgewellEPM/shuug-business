import { createHash } from "node:crypto";
import { z } from "zod";
import { getBranding, saveBranding, type Branding } from "../branding/store";
import { toolLinks } from "../features/store";
import { catalogWithTools, visibleItems, type WorkspaceItem } from "../navigation/catalog";
import { workspaceLayoutSchema } from "../navigation/workspace-layout";
import { workspaceDatabase } from "../workspace/database";
import { industries, packs } from "./catalog";
import { industryRequestSchema } from "./model";
import { previewIndustry } from "./service";

const toolId = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
export const workspacePlanSchema = z.object({
  description: z.string().trim().min(1).max(3000).describe("Business needs only; do not include taxpayer records, identifiers, credentials or private keys. The MCP caller selects installed capabilities explicitly."),
  industry: industryRequestSchema,
  layout: workspaceLayoutSchema,
  visibleToolIds: z.array(toolId).min(1).max(300).refine(ids => new Set(ids).size === ids.length, "Visible tool IDs must be unique.").optional(),
  businessName: z.string().trim().min(1).max(40).optional(),
}).strict();
export const workspaceApplySchema = z.object({
  plan: workspacePlanSchema,
  currentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  proposedDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
type WorkspacePlan = z.infer<typeof workspacePlanSchema>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const toolSummary = ({ id, label, href, group, section, status, description, requiredToolIds }: WorkspaceItem) => ({ id, label, href, group, section, status: status ?? "installed", ...(description ? { description } : {}), ...(requiredToolIds?.length ? { requiredToolIds: [...requiredToolIds] } : {}) });
const taxLimits = [
  { id: "tax-return-calculation", status: "not_implemented", detail: "Complete federal/state tax calculation is still required for the requested filing product." },
  { id: "tax-return-forms", status: "not_implemented", detail: "Shuug does not generate or certify complete filing-ready federal or state return forms." },
  { id: "tax-efile-transmission", status: "not_implemented", detail: "Shuug does not transmit returns to IRS MeF or state e-file systems. Its filing workflow records reviewed handoff and external acknowledgment evidence." },
] as const;
const boundary = "The MCP caller interprets the business description and selects installed industry capabilities and tool IDs. This operation configures the existing workspace; it does not generate code, execute the description, authorize providers, file returns or change employee permissions or encrypted enrollment.";

export function workspaceCatalog(raw: unknown = {}) {
  z.object({}).strict().parse(raw);
  const current = getBranding(), tools = catalogWithTools(toolLinks(), current);
  return {
    version: 1, scope: "workspace-configuration", interpretation: boundary,
    industries, packs, tools: tools.map(toolSummary),
    current: { businessName: current.businessName, industrySetup: current.industrySetup, workspaceLayout: current.workspaceLayout ?? null },
    capabilityLimits: taxLimits,
    applyRequires: ["exact plan", "currentDigest", "proposedDigest"],
    navigationDoesNotGrantAccess: true,
  };
}

function previewPlan(plan: WorkspacePlan) {
  const industry = previewIndustry(plan.industry), current = getBranding();
  // The industry preview reads the same durable branding. Refuse a concurrent
  // change rather than merge two independently observed configurations.
  if (createHash("sha256").update(JSON.stringify(current)).digest("hex") !== industry.currentDigest) throw new Error("Workspace configuration changed. Review the preview again before applying.");
  const proposed: Branding = { ...industry.proposed, ...(plan.businessName ? { businessName: plan.businessName } : {}), workspaceLayout: plan.layout };
  const tools = catalogWithTools(toolLinks(), proposed), known = new Map(tools.map(item => [item.id, item]));
  if (plan.visibleToolIds) {
    for (const id of plan.visibleToolIds) if (!known.has(id)) throw new Error(`Tool ${id} is not installed. Read workspace_catalog and select existing tool IDs.`);
    const selected = new Set(plan.visibleToolIds);
    proposed.featureVisibility = Object.fromEntries(tools.map(item => [item.id, selected.has(item.id)]));
  }
  const shown = visibleItems(proposed, tools), shownIds = new Set(shown.map(item => item.id));
  for (const id of plan.visibleToolIds ?? []) if (!shownIds.has(id)) throw new Error(`Tool ${id} is outside the selected industry profiles. Review the industry capabilities before selecting it.`);
  for (const id of plan.layout.primaryToolIds) {
    const item = known.get(id);
    if (!item || !shownIds.has(id) || item.status === "planned" || id === "home") throw new Error(`Primary tool ${id} must be an installed, visible workspace destination.`);
  }
  for (const item of shown) {
    const missing = (item.requiredToolIds ?? []).filter(id => !shownIds.has(id));
    if (missing.length) throw new Error(`${item.label} (${item.id}) requires visible tools: ${missing.join(", ")}. Add these exact IDs to visibleToolIds, or remove ${item.id} from the plan. No configuration was changed.`);
  }
  const unsupportedRequests = [
    ...(industry.setup.packs.includes("tax_firm") || /\b(tax|taxes|efile|e-file|mef)\b/i.test(plan.description) ? taxLimits : []),
    ...shown.filter(item => item.status === "planned").map(item => ({ id: item.id, status: "not_implemented", detail: `${item.label} is marked planned in the installed catalog; selecting it does not implement that capability.` })),
  ];
  return {
    version: 1, plan, interpretation: boundary,
    currentDigest: digest(current), proposedDigest: digest({ version: 1, plan, proposed }),
    proposed, visibleTools: shown.map(toolSummary), hiddenToolIds: tools.filter(item => !shownIds.has(item.id)).map(item => item.id),
    unsupportedRequests, connectionsRequiringSeparateAuthorization: industry.connections,
    navigationDoesNotGrantAccess: true,
  };
}
export function previewWorkspace(raw: unknown) { return previewPlan(workspacePlanSchema.parse(raw)); }

/** Configuration only. The backend's existing authenticated whole-workspace
 * credential is the authority; no user records, roles or key stores are edited. */
export function applyWorkspace(raw: unknown) {
  const input = workspaceApplySchema.parse(raw), preview = previewPlan(input.plan);
  if (preview.proposedDigest !== input.proposedDigest) throw new Error("The reviewed workspace plan changed. Preview the exact plan again before applying.");
  const duplicate = preview.currentDigest === digest(preview.proposed);
  if (!duplicate && preview.currentDigest !== input.currentDigest) throw new Error("Workspace configuration changed. Review the preview again before applying.");
  return workspaceDatabase(db => {
    if (digest(getBranding()) !== preview.currentDigest) throw new Error("Workspace configuration changed. Review the preview again before applying.");
    const branding = duplicate ? getBranding() : saveBranding(preview.proposed);
    if (digest(branding) !== digest(preview.proposed)) throw new Error("Saved workspace differs from the reviewed proposal. Read the current configuration before retrying.");
    const id = `workspace-build:${input.proposedDigest}`;
    const prior = db.prepare("SELECT body FROM documents WHERE id=? AND kind='workspace-build'").get(id) as { body: string } | undefined;
    const receipt = prior ? JSON.parse(prior.body) : { version: 1, id, appliedAt: new Date().toISOString(), businessContext: input.plan.description, plan: input.plan, currentDigest: input.currentDigest, proposedDigest: input.proposedDigest, configurationDigest: digest(branding), unsupportedRequests: preview.unsupportedRequests, actor: "Authenticated backend" };
    if (!prior) db.prepare("INSERT INTO documents VALUES(?,'workspace-build',?)").run(id, JSON.stringify(receipt));
    return { ...preview, applied: true, duplicate, receipt, branding };
  }, true);
}
