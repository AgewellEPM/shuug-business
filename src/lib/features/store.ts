import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { FEATURES, TEMPLATES } from "./catalog";
import { featureStateSchema, trackerDefinitionSchema, channelSchema, validateValues, type FeatureState, type Tracker, type ToolLink } from "./model";

export function readFeatures(): FeatureState {
  try { return featureStateSchema.parse(JSON.parse(readFileSync(path.join(dataDirectory(), "features.json"), "utf8"))); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, enabled: [], trackers: [], activity: [] };
    throw new Error("Saved tools could not be read. Restore features.json before making changes.");
  }
}

/** Local durable storage. The file lock spans the full synchronous transaction;
 * multiple Node workers cannot overwrite one another. A crashed owner's lock is
 * recoverable only after verifying its process is gone. No network in this scope. */
function update<T>(change: (state: FeatureState) => T): T {
  const dir = dataDirectory(); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, "features.lock");
  let fd: number;
  try { fd = openSync(lock, "wx", 0o600); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    let pid = 0;
    try { pid = Number(readFileSync(lock, "utf8")); } catch { /* another save released it */ }
    let gone = false;
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); } catch (err) { gone = (err as NodeJS.ErrnoException).code === "ESRCH"; }
    }
    if (!gone) throw new Error("Another workspace save is in progress. Try again in a moment.");
    unlinkSync(lock); fd = openSync(lock, "wx", 0o600);
  }
  try {
    writeFileSync(fd, String(process.pid));
    const state = readFeatures(), result = change(state);
    featureStateSchema.parse(state);
    const temp = path.join(dir, `features-${randomUUID()}.tmp`);
    try { writeFileSync(temp, JSON.stringify(state), { mode: 0o600, flag: "wx" }); renameSync(temp, path.join(dir, "features.json")); }
    finally { try { unlinkSync(temp); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
    return result;
  } finally { closeSync(fd); unlinkSync(lock); }
}
function log(state: FeatureState, action: string, label: string, href: string) {
  state.activity.unshift({ id: randomUUID(), at: new Date().toISOString(), action, label, href });
  state.activity = state.activity.slice(0, 200);
}
export function toolLinks(state = readFeatures()): ToolLink[] {
  return [...FEATURES.filter(f => !f.core && state.enabled.includes(f.id)).map(f => ({ id: f.id, label: f.name, href: f.href })),
    ...state.trackers.filter(t => t.enabled).map(t => ({ id: t.id, label: t.name, href: `/trackers/${t.id}` }))];
}
export function setFeatureEnabled(id: string, enabled: boolean) {
  const feature = FEATURES.find(f => f.id === id);
  if (!feature) throw new Error("Choose an available tool.");
  return update(state => {
    if (feature.core) return { href: feature.href, label: feature.name, alreadyEnabled: true };
    const alreadyEnabled = state.enabled.includes(id);
    if (enabled !== alreadyEnabled) {
      state.enabled = enabled ? [...state.enabled, id] : state.enabled.filter(f => f !== id);
      log(state, enabled ? "enabled" : "hidden", feature.name, feature.href);
    }
    return { href: feature.href, label: feature.name, alreadyEnabled };
  });
}
export function createTracker(definition: unknown, requestId: string, templateId: string | null = null) {
  const parsed = trackerDefinitionSchema.parse(definition); z.uuid().parse(requestId);
  if (templateId && !TEMPLATES.some(t => t.id === templateId)) throw new Error("Unknown tracker template.");
  return update(state => {
    const existing = state.trackers.find(t => t.id === requestId || (templateId && t.templateId === templateId));
    if (existing) {
      if (!templateId && (existing.name !== parsed.name || existing.description !== parsed.description || JSON.stringify(existing.fields) !== JSON.stringify(parsed.fields))) throw new Error("This save ID already belongs to a different tracker. Close the builder and start a new tracker.");
      if (!existing.enabled) { existing.enabled = true; log(state, "enabled", existing.name, `/trackers/${existing.id}`); }
      return { tracker: existing, created: false };
    }
    if (state.trackers.length >= 100) throw new Error("This workspace supports up to 100 trackers.");
    if (state.trackers.some(t => t.name.toLowerCase() === parsed.name.toLowerCase())) throw new Error("A tracker already has this name. Open it in Tools, or choose a different name.");
    const tracker: Tracker = { ...parsed, id: requestId, templateId, enabled: true, records: [], createdAt: new Date().toISOString() };
    state.trackers.push(tracker); log(state, "created tracker", tracker.name, `/trackers/${tracker.id}`);
    return { tracker, created: true };
  });
}
export function enableTemplate(id: string) {
  const template = TEMPLATES.find(t => t.id === id);
  if (!template) throw new Error("Choose an available tracker template.");
  return createTracker({ name: template.name, description: template.description, fields: template.fields }, randomUUID(), template.id);
}
export function setTrackerEnabled(id: string, enabled: boolean) {
  z.uuid().parse(id);
  return update(state => {
    const t = state.trackers.find(t => t.id === id); if (!t) throw new Error("Tracker not found.");
    if (t.enabled !== enabled) { t.enabled = enabled; log(state, enabled ? "enabled" : "hidden", t.name, `/trackers/${t.id}`); }
    return t;
  });
}
export function saveRecord(trackerId: string, input: unknown) {
  z.uuid().parse(trackerId);
  const data = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), channel: channelSchema, values: z.unknown() }).strict().parse(input);
  return update(state => {
    const t = state.trackers.find(t => t.id === trackerId); if (!t) throw new Error("Tracker not found.");
    const existing = t.records.find(r => r.id === data.id), values = validateValues(t.fields, data.values);
    if (existing && data.revision !== existing.revision) {
      // Exact retried creation is idempotent; an edited/reused ID cannot overwrite.
      if (data.revision === 0 && existing.revision === 1 && existing.channel === data.channel && JSON.stringify(existing.values) === JSON.stringify(values)) return t;
      throw new Error("This record changed in another tab. Reload before saving.");
    }
    if (!existing && data.revision !== 0) throw new Error("This record no longer exists. Reload before saving.");
    const now = new Date().toISOString();
    if (existing) { existing.values = values; existing.channel = data.channel; existing.updatedAt = now; existing.revision++; }
    else {
      if (t.records.length >= 5000) throw new Error("This tracker supports up to 5,000 records. Export it before starting another tracker.");
      t.records.unshift({ ...data, values, revision: 1, archived: false, createdAt: now, updatedAt: now });
    }
    log(state, existing ? "updated record" : "added record", t.name, `/trackers/${t.id}`); return t;
  });
}
export function archiveRecord(trackerId: string, recordId: string, revision: number, archived: boolean) {
  z.uuid().parse(trackerId); z.uuid().parse(recordId); z.number().int().positive().parse(revision);
  return update(state => {
    const t = state.trackers.find(t => t.id === trackerId), r = t?.records.find(r => r.id === recordId);
    if (!t || !r) throw new Error("Record not found.");
    if (revision !== r.revision) throw new Error("This record changed in another tab. Reload before saving.");
    r.archived = archived; r.revision++; r.updatedAt = new Date().toISOString();
    log(state, archived ? "archived record" : "restored record", t.name, `/trackers/${t.id}`); return t;
  });
}
