import type { WorkspaceUser } from "../auth/identity";
import { assertTaxClientAccess } from "../tax-office/access";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { dataDirectory, sealSecret, openSecret } from "../connections/vault";
import { getBranding } from "../branding/store";
import { catalogWithTools, visibleItems } from "../navigation/catalog";
import { workspaceDatabase } from "../workspace/database";
import { listRecords } from "../sdk/records";
import type { ModuleRecord } from "../sdk/types";
import { customerFromDatabase } from "./accounts";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";

export const MAX_TAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const TAX_DOCUMENT_ACCOUNT_BYTES = 200 * 1024 * 1024;
const WORKSPACE_BYTES = 2 * 1024 * 1024 * 1024;
const uuid = z.uuid().transform(value => value.toLowerCase());
const statuses = ["received", "reviewed", "replacement_requested"] as const;
export type TaxDocumentStatus = typeof statuses[number];
export type TaxDocument = { id: string; accountId: string; clientId: string; requestId: string; engagementId: string; name: string; mime: string; size: number; digest: string; createdAt: string; status: TaxDocumentStatus; reviewedAt: string | null; reviewedBy: string | null };
export type ClientTaxDocument = Pick<TaxDocument, "id" | "name" | "mime" | "size" | "createdAt" | "status" | "reviewedAt">;
export class TaxDocumentError extends Error { constructor(public status: number, message: string) { super(message); } }
const unavailable = () => new TaxDocumentError(404, "This document or request is unavailable. Return to your client workspace.");
const project = (row: TaxDocument): ClientTaxDocument => ({ id: row.id, name: row.name, mime: row.mime, size: row.size, createdAt: row.createdAt, status: row.status, reviewedAt: row.reviewedAt });

function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS tax_client_documents (
    id TEXT PRIMARY KEY, accountId TEXT NOT NULL, clientId TEXT NOT NULL, requestId TEXT NOT NULL, engagementId TEXT NOT NULL,
    name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL, createdAt TEXT NOT NULL,
    status TEXT NOT NULL, reviewedAt TEXT, reviewedBy TEXT);
    CREATE INDEX IF NOT EXISTS tax_client_documents_account ON tax_client_documents(accountId, requestId);
    CREATE TABLE IF NOT EXISTS tax_document_reviews (id TEXT PRIMARY KEY, documentId TEXT NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL);`);
}
/** Trigger any legacy module-record import before opening a write transaction. */
function prepare() { listRecords("tax-engagements"); listRecords("tax-document-requests"); }
function modulesVisible() {
  const brand = getBranding();
  if (brand.industrySetup?.industryId !== "tax-firm") throw unavailable();
  const visible = new Set(visibleItems(brand, catalogWithTools()).map(item => item.id));
  if (!["module:tax-engagements", "module:tax-document-requests"].every(id => visible.has(id))) throw unavailable();
}
function moduleRecords(db: DatabaseSync, module: string): ModuleRecord[] {
  const row = db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get() as { body: string } | undefined;
  return row ? JSON.parse(row.body)[module] ?? [] : [];
}
function linkedRequest(db: DatabaseSync, requestId: string, clientId: string, shared: boolean) {
  const request = moduleRecords(db, "tax-document-requests").find(row => row.id === requestId && !row.archived && row.values.client_id === clientId && (!shared || row.values.client_visible === true));
  const parent = request && moduleRecords(db, "tax-engagements").find(row => row.id === request.values.engagement_id && !row.archived && row.values.client_id === clientId && (!shared || row.values.client_visible === true));
  if (!request || !parent) throw unavailable();
  return { request, parent };
}
function clientScope(db: DatabaseSync, token: string | undefined, requestId: string) {
  modulesVisible();
  const settings = db.prepare("SELECT body FROM documents WHERE id='state:customer-portal-settings' AND kind='state'").get() as { body: string } | undefined;
  const portal = settings ? JSON.parse(settings.body) : {};
  if (portal.enabled !== true || portal.servicePortal !== true) throw unavailable();
  const account = customerFromDatabase(db, token);
  if (!account) throw new TaxDocumentError(401, "Sign in to your client account.");
  const client = account.clientId && db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(account.clientId) as { body: string } | undefined;
  if (!client || ["inactive", "archived", "cancelled"].includes(JSON.parse(client.body).status)) throw unavailable();
  return { account, ...linkedRequest(db, requestId, account.clientId!, true) };
}
const filename = (id: string) => path.join(dataDirectory(), "tax-documents", uuid.parse(id));
const mimeFor = (bytes: Buffer) => {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  throw new TaxDocumentError(415, "Choose a PDF, JPEG or PNG document.");
};

export function assertTaxDocumentRequest(token: string | undefined, requestId: string) {
  uuid.parse(requestId); prepare();
  workspaceDatabase(db => { const { account } = clientScope(db, token, requestId); assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); });
}
export function submitTaxDocument(token: string | undefined, requestId: string, name: string, bytes: Buffer, staff?: { user: WorkspaceUser; clientId: string }): ClientTaxDocument {
  uuid.parse(requestId);
  if (!bytes.length || bytes.length > MAX_TAX_DOCUMENT_BYTES) throw new TaxDocumentError(413, "Each document must be between 1 byte and 10 MB.");
  const mime = mimeFor(bytes), digest = createHash("sha256").update(bytes).digest("hex");
  const displayName = name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 160) || "Tax document";
  prepare(); let owned: string | undefined;
  try {
    return workspaceDatabase(db => {
      const { account, parent } = staff ? (() => {
        modulesVisible(); assertTaxClientAccess(db,staff.clientId,staff.user,true);
        const linked=linkedRequest(db,requestId,staff.clientId,false);
        return {account:{id:`staff:${staff.user.id}:${staff.clientId}`,clientId:staff.clientId},parent:linked.parent};
      })() : clientScope(db, token, requestId);
      assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
      init(db);
      const prior = db.prepare("SELECT * FROM tax_client_documents WHERE accountId=? AND requestId=? AND digest=?").get(account.id, requestId, digest) as TaxDocument | undefined;
      if (prior) {
        if (prior.clientId !== account.clientId || prior.engagementId !== parent.id) throw unavailable();
        // An identical retry repairs a lost file and does not consume another slot.
        const target = filename(prior.id), temporary = `${target}.${randomUUID()}.tmp`;
        mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        try { writeFileSync(temporary, sealSecret(bytes.toString("base64")), { mode: 0o600, flag: "wx" }); renameSync(temporary, target); }
        finally { rmSync(temporary, { force: true }); }
        return project(prior);
      }
      const usage = db.prepare("SELECT count(*) AS count, coalesce(sum(size),0) AS bytes FROM tax_client_documents WHERE accountId=?").get(account.id) as { count: number; bytes: number };
      const requestCount = db.prepare("SELECT count(*) AS count FROM tax_client_documents WHERE accountId=? AND requestId=?").get(account.id, requestId) as { count: number };
      const workspace = db.prepare("SELECT coalesce(sum(size),0) AS bytes FROM tax_client_documents").get() as { bytes: number };
      if (requestCount.count >= 20 || usage.count >= 1000 || usage.bytes + bytes.length > TAX_DOCUMENT_ACCOUNT_BYTES || workspace.bytes + bytes.length > WORKSPACE_BYTES) throw new TaxDocumentError(413, "Document storage needs a capacity review. Keep your original and contact your firm.");
      const row: TaxDocument = { id: randomUUID(), accountId: account.id, clientId: account.clientId!, requestId, engagementId: parent.id, name: displayName, mime, size: bytes.length, digest, createdAt: new Date().toISOString(), status: "received", reviewedAt: null, reviewedBy: null };
      const target = filename(row.id), temporary = `${target}.${randomUUID()}.tmp`;
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      try { writeFileSync(temporary, sealSecret(bytes.toString("base64")), { mode: 0o600, flag: "wx" }); renameSync(temporary, target); owned = target; }
      finally { rmSync(temporary, { force: true }); }
      db.prepare("INSERT INTO tax_client_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(row.id, row.accountId, row.clientId, row.requestId, row.engagementId, row.name, row.mime, row.size, row.digest, row.createdAt, row.status, row.reviewedAt, row.reviewedBy);
      return project(row);
    }, true);
  } catch (error) { if (owned) rmSync(owned, { force: true }); throw error; }
}

export function clientTaxDocuments(token: string | undefined, requestId: string) {
  uuid.parse(requestId); prepare();
  return workspaceDatabase(db => {
    const { account, parent } = clientScope(db, token, requestId); init(db);
    return (db.prepare("SELECT * FROM tax_client_documents WHERE accountId=? AND clientId=? AND requestId=? AND engagementId=? ORDER BY createdAt DESC, id LIMIT 20").all(account.id, account.clientId!, requestId, parent.id) as TaxDocument[]).map(project);
  });
}
function bytesFor(row: TaxDocument) {
  let bytes: Buffer;
  let encrypted: string;
  try { encrypted = readFileSync(filename(row.id), "utf8"); } catch { throw new TaxDocumentError(404, "The stored document is unavailable. Keep the original and contact your firm."); }
  try { bytes = Buffer.from(openSecret(encrypted), "base64"); } catch { throw new TaxDocumentError(500, "Document integrity needs staff review."); }
  if (bytes.length !== row.size || createHash("sha256").update(bytes).digest("hex") !== row.digest) throw new TaxDocumentError(500, "Document integrity needs staff review.");
  return { ...row, bytes };
}
export function clientTaxDocument(token: string | undefined, id: string) {
  uuid.parse(id); prepare();
  return workspaceDatabase(db => {
    init(db); const row = db.prepare("SELECT * FROM tax_client_documents WHERE id=?").get(id) as TaxDocument | undefined;
    if (!row) throw unavailable();
    const { account, parent } = clientScope(db, token, row.requestId);
    if (row.accountId !== account.id || row.clientId !== account.clientId || row.engagementId !== parent.id) throw unavailable();
    return bytesFor(row);
  });
}
/** Staff routes must enforce services-view/edit access before calling these functions. */
export function staffTaxDocuments(user?: WorkspaceUser) {
  prepare(); modulesVisible();
  return workspaceDatabase(db => {
    init(db);
    return (db.prepare("SELECT * FROM tax_client_documents ORDER BY createdAt DESC, id LIMIT 2000").all() as TaxDocument[]).flatMap(row => {
      try { if(user)assertTaxClientAccess(db,row.clientId,user); const { request, parent } = linkedRequest(db, row.requestId, row.clientId, false); return parent.id === row.engagementId ? [{ ...row, requestName: String(request.values.name ?? "Document request"), engagementName: String(parent.values.name ?? "Tax engagement") }] : []; }
      catch { return []; }
    });
  });
}
export function staffTaxDocument(id: string, user?: WorkspaceUser) {
  uuid.parse(id); prepare(); modulesVisible();
  return workspaceDatabase(db => {
    init(db); const row = db.prepare("SELECT * FROM tax_client_documents WHERE id=?").get(id) as TaxDocument | undefined;
    if (!row || linkedRequest(db, row.requestId, row.clientId, false).parent.id !== row.engagementId) throw unavailable();
    if(user)assertTaxClientAccess(db,row.clientId,user);
    return bytesFor(row);
  });
}
export function reviewTaxDocument(id: string, status: string, actor: string, user?: WorkspaceUser) {
  uuid.parse(id); const next = z.enum(statuses).parse(status); prepare(); modulesVisible();
  workspaceDatabase(db => {
    init(db); const row = db.prepare("SELECT * FROM tax_client_documents WHERE id=?").get(id) as TaxDocument | undefined;
    if (!row || linkedRequest(db, row.requestId, row.clientId, false).parent.id !== row.engagementId) throw unavailable();
    if(user)assertTaxClientAccess(db,row.clientId,user,true);
    const at = new Date().toISOString();
    db.prepare("UPDATE tax_client_documents SET status=?,reviewedAt=?,reviewedBy=? WHERE id=?").run(next, at, actor, id);
    db.prepare("INSERT INTO tax_document_reviews VALUES(?,?,?,?,?)").run(randomUUID(), id, next, actor, at);
  }, true);
}
export function taxDocumentResponse(file: ReturnType<typeof clientTaxDocument>) {
  const extension = file.mime === "image/png" ? "png" : file.mime === "image/jpeg" ? "jpg" : "pdf";
  return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.mime, "Content-Length": String(file.bytes.length), "Content-Disposition": `attachment; filename="tax-document-${file.id}.${extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
