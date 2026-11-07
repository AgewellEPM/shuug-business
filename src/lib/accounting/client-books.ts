import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import type { WorkspaceUser } from "../auth/identity";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";
import { bookIdInput } from "./book-scope";
export interface ClientBook { id: string; clientId: string; name: string; revision: number; currency: "USD"; grants: { accountId: string; level: "view" | "edit" }[]; createdAt: string }
const saveInput = z.object({ id: z.uuid().optional(), revision: z.number().int().nonnegative(), clientId: z.uuid(), name: z.string().trim().min(1).max(140), grants: z.array(z.object({ accountId: z.uuid(), level: z.enum(["view", "edit"]) }).strict()).max(100), reviewed: z.literal(true) }).strict();
export function clientBooks(user: WorkspaceUser): ClientBook[] {
  return workspaceDatabase(db => (db.prepare("SELECT body FROM documents WHERE kind='client-book' ORDER BY id").all() as { body: string }[]).map(r => JSON.parse(r.body) as ClientBook).filter(b => user.isOwner || b.grants.some(g => g.accountId === user.id)));
}
export function checkBook(db: DatabaseSync, bookId: string, user: WorkspaceUser, edit = false): ClientBook | null {
  bookIdInput.parse(bookId);
  if (bookId === "office") return null; // Caller separately enforces Money section permission.
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='client-book'").get(`client-book:${bookId}`) as { body: string } | undefined;
  const book: ClientBook | undefined = row && JSON.parse(row.body);
  if (!book || (!user.isOwner && !book.grants.some(g => g.accountId === user.id && (!edit || g.level === "edit")))) throw new Error("Client book access required.");
  assertPlaintextTaxAllowed({ clientId: book.clientId }, db);
  const client = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(book.clientId) as { body: string } | undefined;
  if (!client || ["archived", "inactive"].includes(JSON.parse(client.body).status)) throw new Error("The linked client is unavailable.");
  return book;
}
export function requireBook(bookId: string, user: WorkspaceUser, edit = false) { return workspaceDatabase(db => checkBook(db, bookId, user, edit)); }
export function saveClientBook(raw: unknown, user: WorkspaceUser) {
  if (!user.isOwner) throw new Error("Only the owner can create client books or change access.");
  const v = saveInput.parse(raw);
  return workspaceDatabase(db => {
    const client = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(v.clientId) as { body: string } | undefined;
    if (!client || ["archived", "inactive"].includes(JSON.parse(client.body).status)) throw new Error("Choose an active service client.");
    assertPlaintextTaxAllowed({ clientId: v.clientId }, db);
    const old = v.id ? checkBook(db, v.id, user, true) : null;
    if ((old?.revision ?? 0) !== v.revision) throw new Error("Client book changed. Reload before saving.");
    if (old && old.clientId !== v.clientId) throw new Error("A client's accounting history cannot be reassigned.");
    if (new Set(v.grants.map(g => g.accountId)).size !== v.grants.length) throw new Error("Each employee can have only one access grant.");
    for (const grant of v.grants) {
      if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='employee_accounts'").get() || !db.prepare("SELECT id FROM employee_accounts WHERE id=? AND status='active'").get(grant.accountId)) throw new Error("Choose an active employee account.");
    }
    const all = (db.prepare("SELECT body FROM documents WHERE kind='client-book'").all() as { body: string }[]).map(r => JSON.parse(r.body) as ClientBook);
    if (all.some(b => b.id !== v.id && b.clientId === v.clientId)) throw new Error("This client already has books. Open their existing book.");
    const book: ClientBook = { id: old?.id ?? randomUUID(), clientId: v.clientId, name: v.name, grants: v.grants, revision: v.revision + 1, currency: "USD", createdAt: old?.createdAt ?? new Date().toISOString() };
    db.prepare("INSERT INTO documents VALUES(?,'client-book',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(`client-book:${book.id}`, JSON.stringify(book));
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(book.id, user.id, old ? "book.access.update" : "book.create", new Date().toISOString(), JSON.stringify(book));
    return book;
  }, true);
}
