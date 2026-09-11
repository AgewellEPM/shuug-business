import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { must, pricingHash } from "./library";
import { inspectionTemplates, putInspectionDocument } from "./inspection-state";
import { inspectionActions, validateInspectionDefinition, type InspectionTemplate } from "./inspection-model";
export function updateInspectionTemplate(db: DatabaseSync, action: string, raw: unknown, actor: string) {
  const list = inspectionTemplates(db); let result: InspectionTemplate;
  if (action === "template.save") {
    const input = inspectionActions["template.save"].parse(raw), old = list.find(t => t.id === input.id), definition = validateInspectionDefinition(input.definition);
    must(!input.id || old && old.revision === input.revision, "This inspection template changed. Refresh before editing."); must(!old || old.status === "draft", "Published inspection checklists are preserved. Copy to a new version to change them.");
    must(!list.some(t => t.id !== old?.id && t.definition.name.toLowerCase() === definition.name.toLowerCase() && t.definition.version === definition.version), "This checklist name and version already exists."); must(old || list.length < 100, "The inspection template library has reached 100 versions.");
    result = { id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1, status: "draft", definition, shareInTemplates: input.shareInTemplates, imported: old?.imported ?? false, review: "", publishedBy: null, createdAt: old?.createdAt ?? new Date().toISOString() };
  } else {
    const input = action === "template.share" ? inspectionActions["template.share"].parse(raw) : inspectionActions["template.publish"].parse(raw), old = list.find(t => t.id === input.id); must(old && old.revision === input.revision, "This inspection template changed. Refresh before continuing."); result = old;
    if (action === "template.share") result.shareInTemplates = inspectionActions["template.share"].parse(raw).shareInTemplates;
    else {
      const v = inspectionActions["template.publish"].parse(raw);
      if (action === "template.publish") { must(old.status === "draft", "Only draft checklists can be published."); validateInspectionDefinition(old.definition); result.status = "published"; result.publishedBy = actor; }
      else { must(old.status === "published", "Only published checklists can be retired."); result.status = "retired"; }
      result.review = v.review;
    }
    result.revision++;
  }
  must(!result.shareInTemplates || result.status === "retired" || list.filter(t => t.id !== result.id && t.shareInTemplates && t.status !== "retired").length < 30, "Share no more than 30 inspection template versions.");
  putInspectionDocument(db, result, actor, action); return result.id;
}
export function exportInspectionDefinitions() { return workspaceDatabase(db => inspectionTemplates(db).filter(t => t.status === "published" && t.shareInTemplates).map(t => t.definition)); }
function preview(db: DatabaseSync, raw: unknown[]) {
  must(raw.length <= 30, "Import no more than 30 inspection checklists."); const definitions = raw.map(validateInspectionDefinition), list = inspectionTemplates(db), keys = definitions.map(d => `${d.name.toLowerCase()}\u0000${d.version}`); must(new Set(keys).size === keys.length, "A template cannot repeat an inspection checklist name/version.");
  for (const d of definitions) { const old = list.find(t => t.definition.name.toLowerCase() === d.name.toLowerCase() && t.definition.version === d.version); must(!old || pricingHash(old.definition) === pricingHash(d), `Inspection checklist '${d.name}' v${d.version} has different existing points. Rename or version the imported checklist.`); }
  const added = definitions.filter(d => !list.some(t => t.definition.name.toLowerCase() === d.name.toLowerCase() && t.definition.version === d.version)); must(list.length + added.length <= 100, "Inspection template import exceeds the 100-version limit."); return { definitions, added };
}
export function previewInspectionDefinitions(raw: unknown[] = []) { return workspaceDatabase(db => { const p = preview(db, raw); return { newInspectionVersions: p.added.length, existingInspectionVersions: p.definitions.length - p.added.length }; }); }
export function importInspectionDefinitions(raw: unknown[] = []) { return workspaceDatabase(db => { const p = preview(db, raw); for (const definition of p.added) putInspectionDocument(db, { id: randomUUID(), revision: 1, status: "draft", definition, shareInTemplates: false, imported: true, review: "", publishedBy: null, createdAt: new Date().toISOString() }, "Business template import", "Imported inspection checklist for local review"); return p.added.length; }, true); }
