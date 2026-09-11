import { assembleIndustry } from "./model";
import { getBranding, saveBranding } from "../branding/store";
import { catalogWithTools, visibleItems } from "../navigation/catalog";
import { toolLinks } from "../features/store";
import { createHash } from "node:crypto";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function previewIndustry(raw: unknown) {
  const result = assembleIndustry(raw), current = getBranding();
  // A new template uses its own defaults. Existing business records and access
  // permissions are separate; per-tool choices remain editable after applying.
  const proposed = { ...current, industrySetup: result.setup, organizationTypes: result.organizationTypes, serviceTypes: result.serviceTypes, hiddenSections: [], featureVisibility: {} };
  const items = catalogWithTools(toolLinks(), proposed), shown = visibleItems(proposed, items);
  return { ...result, shown, hidden: items.filter(i => !shown.some(s => s.id === i.id)), currentDigest: digest(current), proposedDigest: digest(proposed), proposed };
}
export function applyIndustry(raw: unknown, expectedCurrent: string, expectedProposal: string) {
  const preview = previewIndustry(raw);
  if (preview.currentDigest !== expectedCurrent || preview.proposedDigest !== expectedProposal) throw new Error("Workspace configuration changed. Review the preview again before applying.");
  return saveBranding(preview.proposed);
}
