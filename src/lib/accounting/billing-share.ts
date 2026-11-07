import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { checkBook } from "./client-books";
import { journalStateName } from "./book-scope";
import type { BillingState } from "./billing-store";
import type { WorkspaceUser } from "../auth/identity";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";
import { appBaseUrl } from "../connections/vault";
export const tokenHash = (s: string) => createHash("sha256").update(s).digest("hex");
interface Share { id: string; bookId: string; documentId: string; hash: string; expiresAt: string; revoked: boolean; createdBy: string }
export function billingStateInDatabase(db: DatabaseSync, bookId: string): BillingState {
  if (bookId !== "office") {
    const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='client-book'").get(`client-book:${bookId}`) as { body: string } | undefined;
    if (!row) throw new Error("Client book unavailable.");
    const book = JSON.parse(row.body);
    assertPlaintextTaxAllowed({ clientId: book.clientId }, db);
    const client = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(book.clientId) as {body:string}|undefined;
    if (!client || ["archived", "inactive"].includes(JSON.parse(client.body).status)) throw new Error("Client book unavailable.");
  }
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='state'").get(`state:${journalStateName(bookId)}`) as { body: string } | undefined;
  if (!row) throw new Error("Accounting history unavailable.");
  return JSON.parse(row.body);
}
export function sharedBillingDocument(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invoice link unavailable.");
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='billing-share'").get(`billing-share:${tokenHash(token)}`) as {body:string}|undefined;
  const share: Share | null = row ? JSON.parse(row.body) : null;
  if (!share || share.revoked || share.expiresAt <= new Date().toISOString()) throw new Error("Invoice link expired or revoked. Ask the sender for a new link.");
  const state = billingStateInDatabase(db, share.bookId), doc = state.billing?.find(d => d.id === share.documentId && d.kind === "invoice" && d.status !== "draft");
  if (!doc) throw new Error("Invoice unavailable.");
  return { share, doc };
}
export function executeBillingShare(bookId: string, raw: unknown, user: WorkspaceUser) {
  const v = z.object({ requestId: z.uuid(), action: z.enum(["billing.share", "billing.share.revoke"]), input: z.object({ id: z.uuid(), revision: z.number().int().positive(), days: z.number().int().min(1).max(90).default(30), reviewed: z.literal(true) }).strict() }).strict().parse(raw);
  return workspaceDatabase(db => {
    checkBook(db, bookId, user, true);
    const doc = billingStateInDatabase(db, bookId).billing?.find(d => d.id === v.input.id);
    if (!doc || doc.kind !== "invoice" || doc.status !== "posted" || doc.revision !== v.input.revision) throw new Error("Choose the current posted invoice before sharing.");
    const request = JSON.stringify({ ...v, bookId, actor: user.id });
    const prior = db.prepare("SELECT request,result FROM commands WHERE id=?").get(v.requestId) as {request:string;result:string}|undefined;
    if (prior) { if(prior.request !== request) throw new Error("Request ID belongs to another action."); return JSON.parse(prior.result) as {url?:string;expiresAt?:string}; }
    const shares = (db.prepare("SELECT id,body FROM documents WHERE kind='billing-share'").all() as {id:string;body:string}[]).map(r => ({ key:r.id, share:JSON.parse(r.body) as Share }));
    for (const s of shares.filter(s => s.share.bookId === bookId && s.share.documentId === doc.id)) {
      s.share.revoked = true; db.prepare("UPDATE documents SET body=? WHERE id=?").run(JSON.stringify(s.share),s.key);
    }
    let result: {url?:string;expiresAt?:string} = {};
    if (v.action === "billing.share") {
      const token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now()+v.input.days*86400000).toISOString();
      const share:Share = {id:randomUUID(),bookId,documentId:doc.id,hash:tokenHash(token),expiresAt,revoked:false,createdBy:user.id};
      db.prepare("INSERT INTO documents VALUES(?,'billing-share',?)").run(`billing-share:${share.hash}`,JSON.stringify(share));
      result = {url:new URL(`/api/accounting/share/${token}`,appBaseUrl()).href,expiresAt};
    }
    db.prepare("INSERT INTO commands VALUES(?,?,?)").run(v.requestId,request,JSON.stringify(result));
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(doc.id,user.id,v.action,new Date().toISOString(),JSON.stringify({bookId,documentId:doc.id,expiresAt:result.expiresAt}));
    return result;
  },true);
}
