import { sharedInspectionsForClient } from "../auto-repair/inspection-state";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "./database";
import { listBusinessRecords } from "./store";
import { paymentTotal } from "./model";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function schema(db: DatabaseSync) { db.exec("CREATE TABLE IF NOT EXISTS portal_grants(id TEXT PRIMARY KEY, client_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)"); }
export function createPortalGrant(clientId: string) {
  if (!listBusinessRecords(["client"]).some(r => r.id === clientId)) throw new Error("Select a service client.");
  const id = randomUUID(), token = randomBytes(32).toString("hex"), expires = Date.now() + 7 * 86400000;
  workspaceDatabase(db => { schema(db); db.prepare("INSERT INTO portal_grants VALUES(?,?,?,?,0)").run(id, clientId, hash(token), expires); }, true);
  return { id, token, clientId, expires };
}
export function listPortalGrants() {
  return workspaceDatabase(db => { schema(db); return db.prepare("SELECT id,client_id AS clientId,expires,revoked FROM portal_grants ORDER BY expires DESC").all() as { id: string; clientId: string; expires: number; revoked: number }[]; });
}
export function revokePortalGrant(id: string) { workspaceDatabase(db => { schema(db); db.prepare("UPDATE portal_grants SET revoked=1 WHERE id=?").run(id); }, true); }
export function portalClient(db: DatabaseSync, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Portal link unavailable or expired.");
  schema(db); const grant = db.prepare("SELECT client_id FROM portal_grants WHERE token_hash=? AND expires>? AND revoked=0").get(hash(token), Date.now()) as { client_id: string } | undefined;
  if (!grant) throw new Error("Portal link unavailable or expired."); return grant.client_id;
}
export function portalView(token: string) {
  const clientId = workspaceDatabase(db => portalClient(db, token)), all = listBusinessRecords();
  const client = all.find(r => r.id === clientId && r.kind === "client");
  if (!client) throw new Error("Portal link unavailable.");
  const jobs = all.filter(r => r.kind === "job" && r.fields.client === clientId && r.status !== "draft");
  return { inspections: workspaceDatabase(db => sharedInspectionsForClient(db, client.id)), client: { id: client.id, title: client.title },
    proposals: all.filter(r => r.kind === "proposal" && r.fields.client === clientId && r.status !== "draft").map(r => ({ id: r.id, revision: r.revision, title: r.title, status: r.status, currency: r.currency, scope: r.fields.scope, exclusions: r.fields.exclusions, amount: r.fields.amount, expires: r.fields.expires })),
    jobs: jobs.map(r => ({ id: r.id, revision: r.revision, title: r.title, status: r.status, due: r.fields.due ?? "" })),
    appointments: all.filter(r => r.kind === "booking" && jobs.some(j => j.id === r.fields.job) && ["scheduled", "completed"].includes(r.status)).map(r => ({ title: r.title, start: r.fields.start, end: r.fields.end, status: r.status })),
    invoices: all.filter(r => r.kind === "invoice" && jobs.some(j => j.id === r.fields.job) && r.status === "issued").map(r => ({ title: r.title, amount: r.fields.amount, due: r.fields.due ?? "", currency: r.currency, description: r.fields.description, paid: paymentTotal(all, "service_payment", "invoice", r.id) })) };
}
