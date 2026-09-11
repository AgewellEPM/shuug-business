import { randomUUID } from "node:crypto";
import { workspaceDatabase } from "./database";
export interface WorkspaceDocument { id: string; revision: number; createdAt: string; updatedAt: string }
export function listDocuments<T extends WorkspaceDocument>(kind: string): T[] {
  return workspaceDatabase(db => (db.prepare("SELECT body FROM documents WHERE kind=?").all(kind) as { body: string }[]).map(row => JSON.parse(row.body) as T).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}
export function saveDocument<T extends WorkspaceDocument>(kind: string, input: Omit<T, keyof WorkspaceDocument>, previous?: { id: string; revision: number }): T {
  return workspaceDatabase(db => {
    const row = previous ? db.prepare("SELECT body FROM documents WHERE kind=? AND id=?").get(kind, previous.id) as { body: string } | undefined : undefined;
    const old = row ? JSON.parse(row.body) as T : undefined;
    if (previous && (!old || old.revision !== previous.revision)) throw new Error("This item changed. Reload before saving.");
    const now = new Date().toISOString();
    const document = { ...input, id: old?.id ?? `${kind.toUpperCase()}-${randomUUID()}`, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now } as T;
    db.prepare("INSERT INTO documents VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(document.id, kind, JSON.stringify(document));
    return document;
  }, true);
}
