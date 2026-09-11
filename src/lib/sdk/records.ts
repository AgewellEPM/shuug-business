/**
 * Module records store — durable SQLite (legacy module-records.json imports once), keyed by module id. Reuses
 * the no-code tracker field validation (validateValues) so dev modules and UI-built
 * trackers enforce identical data rules. Isolated here so node:fs never reaches the
 * edge graph. Atomic transactions; every server worker reads current state.
 */
import { readFileSync } from "node:fs";
import { persistentState } from "../workspace/state";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { validateValues, type Field } from "../features/model";
import type { ModuleRecord } from "./types";

type Store = Record<string, ModuleRecord[]>;
const file = () => path.join(dataDirectory(), "module-records.json");
const MAX_PER_MODULE = 5000;

function loadFromDisk(): Store {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); if (!v || typeof v !== "object" || Array.isArray(v) || Object.values(v).some(rows => !Array.isArray(rows))) throw new Error("Invalid module records"); return v; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw new Error("Module records could not be migrated. Restore module-records.json before continuing."); }
}
const durable = persistentState<Store>("module-records", loadFromDisk);
/** Domain extensions share this aggregate transaction, so review receipts and record changes commit together. */
export function changeModuleRecords<T>(moduleId: string, mutate: (records: ModuleRecord[]) => T): T { return durable.change(store => mutate(store[moduleId] ??= [])); }

export function listRecords(moduleId: string): ModuleRecord[] {
  return (durable.read()[moduleId] ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({ ...r, values: { ...r.values } }));
}

export function addRecord(moduleId: string, fields: Field[], input: unknown): ModuleRecord {
  return durable.change(store => {
  const existing = store[moduleId] ?? [];
  if (existing.length >= MAX_PER_MODULE) throw new Error("This module has reached its record limit.");
  const now = new Date().toISOString();
  const rec: ModuleRecord = { id: randomUUID(), values: validateValues(fields, input), archived: false, createdAt: now, updatedAt: now };
  store[moduleId] = [...existing, rec];
  return rec;
  });
}

export function updateRecord(moduleId: string, id: string, fields: Field[], input: unknown): ModuleRecord {
  return durable.change(store => {
  const list = store[moduleId] ?? [];
  const rec = list.find((r) => r.id === id);
  if (!rec) throw new Error("Record not found.");
  const next: ModuleRecord = { ...rec, values: validateValues(fields, input), updatedAt: new Date(Math.max(Date.now(), Date.parse(rec.updatedAt) + 1)).toISOString() };
  store[moduleId] = list.map((r) => (r.id === id ? next : r));
  return next;
  });
}

export function setArchived(moduleId: string, id: string, archived: boolean): void {
  return durable.change(store => {
  const list = store[moduleId] ?? [];
  if (!list.some((r) => r.id === id)) throw new Error("Record not found.");
  store[moduleId] = list.map((r) => (r.id === id ? { ...r, archived, updatedAt: new Date(Math.max(Date.now(), Date.parse(r.updatedAt) + 1)).toISOString() } : r));
  });
}

export function removeRecord(moduleId: string, id: string): void {
  return durable.change(store => {
  const list = store[moduleId] ?? [];
  if (list.find(r => r.id === id)?.vinReviews?.length) throw new Error("Archive vehicles with reviewed VIN evidence to preserve their history.");
  store[moduleId] = list.filter((r) => r.id !== id);
  });
}
