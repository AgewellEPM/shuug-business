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
import type { DatabaseSync } from "node:sqlite";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";

type Store = Record<string, ModuleRecord[]>;
const file = () => path.join(dataDirectory(), "module-records.json");
const MAX_PER_MODULE = 5000;
const taxModules = new Set(["tax-engagements", "tax-document-requests", "tax-filing-handoffs", "rideshare-tax-records", "tax-quarterly-reviews"]);
function assertTaxRecordAllowed(moduleId: string, record: ModuleRecord, db: DatabaseSync) {
  if (taxModules.has(moduleId) && typeof record.values.client_id === "string") assertPlaintextTaxAllowed({ clientId: record.values.client_id }, db);
}

function loadFromDisk(): Store {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); if (!v || typeof v !== "object" || Array.isArray(v) || Object.values(v).some(rows => !Array.isArray(rows))) throw new Error("Invalid module records"); return v; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw new Error("Module records could not be migrated. Restore module-records.json before continuing."); }
}
const durable = persistentState<Store>("module-records", loadFromDisk);
/** Domain extensions share this aggregate transaction, so review receipts and record changes commit together. */
export function changeModuleRecords<T>(moduleId: string, mutate: (records: ModuleRecord[], db: DatabaseSync) => T): T {
  return durable.change((store, db) => {
    const records = store[moduleId] ??= [];
    if (!taxModules.has(moduleId)) return mutate(records, db);
    const before = structuredClone(records);
    try {
      const result = mutate(records, db);
      for (const row of records) {
        const previous = before.find(old => old.id === row.id);
        if (!previous || JSON.stringify(previous.values) !== JSON.stringify(row.values)) {
          if (previous) assertTaxRecordAllowed(moduleId, previous, db);
          assertTaxRecordAllowed(moduleId, row, db);
        }
      }
      return result;
    } catch (error) {
      // Nested domain transactions may catch an error; also restore the shared
      // in-memory aggregate so a later successful operation cannot persist it.
      records.splice(0, records.length, ...before);
      throw error;
    }
  });
}

export function listRecords(moduleId: string): ModuleRecord[] {
  return (durable.read()[moduleId] ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({ ...r, values: { ...r.values } }));
}

/** Read a module while an encompassing domain transaction already owns the DB.
 * Do not open a second SQLite writer when accepting a website submission. */
export function moduleRecordsInDatabase(db: DatabaseSync, moduleId: string): ModuleRecord[] {
  const row = db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get() as { body: string } | undefined;
  const store: Store = row ? JSON.parse(row.body) : loadFromDisk();
  return structuredClone(store[moduleId] ?? []);
}

/** The outer transaction commits the submission and its native module record
 * together. This uses the same validation, limits and tax guards as addRecord. */
export function addRecordInDatabase(db: DatabaseSync, moduleId: string, fields: Field[], input: unknown): ModuleRecord {
  const row = db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get() as { body: string } | undefined;
  const store: Store = row ? JSON.parse(row.body) : loadFromDisk();
  const existing = store[moduleId] ?? [];
  if (existing.length >= MAX_PER_MODULE) throw new Error("This module has reached its record limit.");
  const now = new Date().toISOString();
  const record: ModuleRecord = { id: randomUUID(), values: validateValues(fields, input), archived: false, createdAt: now, updatedAt: now };
  assertTaxRecordAllowed(moduleId, record, db);
  store[moduleId] = [...existing, record];
  db.prepare("INSERT INTO documents VALUES('state:module-records','state',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(store));
  return record;
}

export function addRecord(moduleId: string, fields: Field[], input: unknown): ModuleRecord {
  return durable.change((store, db) => {
  const existing = store[moduleId] ?? [];
  if (existing.length >= MAX_PER_MODULE) throw new Error("This module has reached its record limit.");
  const now = new Date().toISOString();
  const rec: ModuleRecord = { id: randomUUID(), values: validateValues(fields, input), archived: false, createdAt: now, updatedAt: now };
  assertTaxRecordAllowed(moduleId, rec, db);
  store[moduleId] = [...existing, rec];
  return rec;
  });
}

export function updateRecord(moduleId: string, id: string, fields: Field[], input: unknown): ModuleRecord {
  return durable.change((store, db) => {
  const list = store[moduleId] ?? [];
  const rec = list.find((r) => r.id === id);
  if (!rec) throw new Error("Record not found.");
  if (moduleId === "tax-engagements" && db.prepare("SELECT id FROM documents WHERE id=? AND kind='tax-workflow'").get(`tax-workflow:${rec.id}`)) {
    const values=validateValues(fields,input);
    if(values.client_id!==rec.values.client_id || values.tax_year!==rec.values.tax_year || values.stage!==rec.values.stage || values.accountant!==rec.values.accountant) throw new Error("Use Tax work for controlled engagement changes. Client, tax year and assignment history are preserved.");
  }
  if (moduleId === "tax-document-requests") {
    const values=validateValues(fields,input);
    if(db.prepare("SELECT id FROM documents WHERE id=? AND kind='tax-workflow'").get(`tax-workflow:${rec.values.engagement_id}`) && (values.client_id!==rec.values.client_id || values.engagement_id!==rec.values.engagement_id)) throw new Error("A managed document request cannot be reassigned to another client or engagement.");
  }
  const next: ModuleRecord = { ...rec, values: validateValues(fields, input), updatedAt: new Date(Math.max(Date.now(), Date.parse(rec.updatedAt) + 1)).toISOString() };
  assertTaxRecordAllowed(moduleId, rec, db);
  assertTaxRecordAllowed(moduleId, next, db);
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
  return durable.change((store, db) => {
  const list = store[moduleId] ?? [];
  const existing=list.find(r=>r.id===id);
  if((moduleId === "tax-engagements" && db.prepare("SELECT id FROM documents WHERE id=? AND kind='tax-workflow'").get(`tax-workflow:${id}`)) || (moduleId === "tax-document-requests" && existing && db.prepare("SELECT id FROM documents WHERE id=? AND kind='tax-workflow'").get(`tax-workflow:${existing.values.engagement_id}`))) throw new Error("Archive managed tax work to preserve document and filing history.");
  if (list.find(r => r.id === id)?.vinReviews?.length) throw new Error("Archive vehicles with reviewed VIN evidence to preserve their history.");
  store[moduleId] = list.filter((r) => r.id !== id);
  });
}
