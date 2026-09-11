import { inspectionDefinition } from "../auto-repair/inspection-model";
import { exportInspectionDefinitions, previewInspectionDefinitions, importInspectionDefinitions } from "../auto-repair/inspection-templates";
import { pricingDefinition } from "../auto-repair/model";
import { exportedPricingDefinitions, previewPricingDefinitions, importPricingDefinitions } from "../auto-repair/library";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getBranding, saveBranding, brandingPatchSchema } from "./store";
import { readFeatures, createTracker, setFeatureEnabled } from "../features/store";
import { trackerDefinitionSchema } from "../features/model";
import { FEATURES } from "../features/catalog";
import { catalogWithTools, visibleItems } from "../navigation/catalog";
import { moduleById } from "../sdk/registry";
export const businessTemplateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), name: z.string().trim().min(1).max(200), branding: brandingPatchSchema,
  requiredModules: z.array(z.object({ id: z.string().max(40), version: z.string().max(20) }).strict()).max(100).optional(),
  autoRepairInspections: z.array(inspectionDefinition).max(30).optional(),
  autoRepairPricing: z.array(pricingDefinition).max(30).optional(),
  tools: z.array(trackerDefinitionSchema).max(100), enabledFeatures: z.array(z.string().refine(id => FEATURES.some(f => f.id === id))).max(100),
}).strict();
export function exportBusinessTemplate() {
  const branding = getBranding(), features = readFeatures();
  // Per-instance tracker UUIDs have no meaning in another client's installation.
  const featureVisibility = Object.fromEntries(Object.entries(branding.featureVisibility).filter(([id]) => !id.startsWith("tracker:")));
  const requiredModules = visibleItems(branding, catalogWithTools()).filter(i => i.id.startsWith("module:")).map(i => moduleById(i.id.slice(7))!).map(m => ({ id: m.id, version: m.version }));
  const autoRepairPricing = exportedPricingDefinitions(), autoRepairInspections = exportInspectionDefinitions();
  if (autoRepairInspections.length) for (const id of ["vehicles", "vehicle-inspections"]) if (!requiredModules.some(m => m.id === id)) { const m = moduleById(id)!; requiredModules.push({ id, version: m.version }); }
  if (autoRepairPricing.length) for (const id of ["vehicles", "labor-rates", "parts-markups"]) if (!requiredModules.some(m => m.id === id)) { const m = moduleById(id)!; requiredModules.push({ id, version: m.version }); }
  return businessTemplateSchema.parse({ version: autoRepairInspections.length ? 4 : autoRepairPricing.length ? 3 : 2, ...(autoRepairInspections.length ? { autoRepairInspections } : {}), ...(autoRepairPricing.length ? { autoRepairPricing } : {}), name: branding.industrySetup ? `${branding.industrySetup.templateName} — v${branding.industrySetup.revision}` : `${branding.businessName} business template`, requiredModules, branding: { ...branding, featureVisibility },
    tools: features.trackers.filter(t => t.enabled).map(t => ({ name: t.name, description: t.description, fields: t.fields })), enabledFeatures: features.enabled });
}
function stableId(input: string) { const hex = createHash("sha256").update(input).digest("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; }
export function previewBusinessTemplate(input: unknown) {
  const template = businessTemplateSchema.parse(input), current = readFeatures();
  if (template.version >= 2 && !template.requiredModules) throw new Error("This template is missing its module dependency list.");
  if (template.version === 3 && !template.autoRepairPricing || template.version < 3 && template.autoRepairPricing) throw new Error("Pricing definitions require template format version 3.");
  if (template.autoRepairPricing?.length && ["vehicles", "labor-rates", "parts-markups"].some(id => !template.requiredModules?.some(m => m.id === id))) throw new Error("Repair pricing templates must declare vehicles, labor-rates and parts-markups dependencies.");
  if (template.version === 4 && !template.autoRepairInspections || template.version < 4 && template.autoRepairInspections) throw new Error("Inspection checklist definitions require template format version 4.");
  if (template.autoRepairInspections?.length && ["vehicles", "vehicle-inspections"].some(id => !template.requiredModules?.some(m => m.id === id))) throw new Error("Inspection templates must declare vehicles and vehicle-inspections dependencies.");
  const inspectionPreview = previewInspectionDefinitions(template.autoRepairInspections);
  const pricingPreview = previewPricingDefinitions(template.autoRepairPricing);
  for (const requirement of template.requiredModules ?? []) {
    const installed = moduleById(requirement.id);
    if (!installed || installed.version !== requirement.version) throw new Error(`Install module '${requirement.id}' version ${requirement.version} before applying this template.`);
  }
  if (new Set(template.tools.map(t => t.name.toLowerCase())).size !== template.tools.length) throw new Error("A template cannot contain duplicate tool names.");
  for (const tool of template.tools) {
    const existing = current.trackers.find(t => t.name.toLowerCase() === tool.name.toLowerCase());
    if (existing && (existing.description !== tool.description || JSON.stringify(existing.fields) !== JSON.stringify(tool.fields))) throw new Error(`The existing tool '${tool.name}' has a different definition. Rename it or the imported tool first.`);
  }
  const additions = template.tools.filter(t => !current.trackers.some(c => c.name.toLowerCase() === t.name.toLowerCase()));
  if (current.trackers.length + additions.length > 100) throw new Error("This template would exceed the 100 custom tool limit.");
  return { template, ...pricingPreview, ...inspectionPreview, toolsToCreate: additions.length, toolsAlreadyPresent: template.tools.length - additions.length };
}
export function importBusinessTemplate(input: unknown) {
  const preview = previewBusinessTemplate(input), current = readFeatures();
  // Every step is idempotent, so an interrupted multi-file import can be retried.
  // This config import never imports records, account credentials or sessions.
  const inspectionVersionsCreated = importInspectionDefinitions(preview.template.autoRepairInspections);
  const pricingVersionsCreated = importPricingDefinitions(preview.template.autoRepairPricing);
  for (const tool of preview.template.tools) {
    const existing = current.trackers.find(t => t.name.toLowerCase() === tool.name.toLowerCase());
    createTracker(tool, existing?.id ?? stableId(JSON.stringify(tool)));
  }
  for (const feature of preview.template.enabledFeatures) setFeatureEnabled(feature, true);
  const branding = saveBranding(preview.template.branding);
  return { branding, pricingVersionsCreated, inspectionVersionsCreated, toolsCreated: preview.toolsToCreate };
}
