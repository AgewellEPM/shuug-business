/**
 * Document vault store — durable (documents.json). Files are kept as data URLs
 * capped at 2MB (licenses/insurance certs are small); larger scans should move to
 * object storage (noted). Metadata always persists even when the file is omitted.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import type { DocRecord, DocCategory, SignatureStatus } from "./model";

const MAX_FILE = 2 * 1024 * 1024;
const holder = globalThis as unknown as { __docs?: DocRecord[] };
const file = () => path.join(dataDirectory(), "documents.json");

function loadFromDisk(): DocRecord[] | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function persist(list: DocRecord[]) {
  holder.__docs = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `documents-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): DocRecord[] {
  if (holder.__docs) return holder.__docs;
  holder.__docs = loadFromDisk() ?? [];
  return holder.__docs;
}

const cleanFile = (v: string | null | undefined): string | null =>
  v && /^data:.+;base64,/.test(v) && v.length <= MAX_FILE ? v : null;

export function listDocs(): DocRecord[] {
  return state().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => ({ ...d }));
}
export function getDoc(id: string): DocRecord | null {
  const d = state().find((x) => x.id === id);
  return d ? { ...d } : null;
}

export interface NewDoc {
  name: string; category: DocCategory; issuer?: string; fileDataUrl?: string | null; fileName?: string;
  expiresAt?: string | null; notes?: string; linkedType?: string | null; linkedId?: string | null;
}
export function addDoc(input: NewDoc): DocRecord {
  const doc: DocRecord = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 160) || "Untitled document",
    category: input.category,
    issuer: (input.issuer ?? "").slice(0, 160),
    fileDataUrl: cleanFile(input.fileDataUrl),
    fileName: (input.fileName ?? "").slice(0, 200),
    expiresAt: input.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt) ? input.expiresAt : null,
    signature: "none",
    signatureProvider: null,
    linkedType: input.linkedType ?? null,
    linkedId: input.linkedId ?? null,
    notes: (input.notes ?? "").slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  persist([...state(), doc]);
  return doc;
}

export function removeDoc(id: string): void {
  persist(state().filter((d) => d.id !== id));
}

export function setSignature(id: string, signature: SignatureStatus, provider: string | null): DocRecord {
  const list = state();
  const d = list.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown document ${id}`);
  const next = { ...d, signature, signatureProvider: provider };
  persist(list.map((x) => (x.id === id ? next : x)));
  return next;
}
