import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { ConnectorError, shopSchema, type Job, type Resource, type ResourceKind } from "./model";

/** One private, durable SQLite volume per client workspace. Transactions also
 * coordinate the web process and the independently supervised sync worker. */
export class ShopifyStore {
  readonly db: DatabaseSync;
  constructor(file = path.join(dataDirectory(), "shopify.sqlite")) {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    if (file !== ":memory:") chmodSync(file, 0o600);
    this.db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS resources (shop TEXT,kind TEXT,id TEXT,data TEXT NOT NULL,updated_at TEXT NOT NULL,observed_at TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(shop,kind,id));
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,shop TEXT NOT NULL,dedupe TEXT NOT NULL,kind TEXT NOT NULL,topic TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,error TEXT,result TEXT,UNIQUE(shop,dedupe));
      CREATE TABLE IF NOT EXISTS cursors (shop TEXT,kind TEXT,cursor TEXT,cycle TEXT NOT NULL,completed_at TEXT,PRIMARY KEY(shop,kind));
      CREATE TABLE IF NOT EXISTS worker_lock (shop TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blocked_customers (shop TEXT,id TEXT,PRIMARY KEY(shop,id));
      CREATE TABLE IF NOT EXISTS disconnected (shop TEXT PRIMARY KEY,at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pending_jobs ON jobs(shop,status,next_at,created_at);`);
  }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private job(row: Record<string, unknown>): Job {
    return { id: String(row.id), shop: String(row.shop), kind: row.kind as Job["kind"], topic: String(row.topic), payload: JSON.parse(String(row.payload)), status: String(row.status), attempts: Number(row.attempts), error: row.error == null ? null : String(row.error), result: row.result ? JSON.parse(String(row.result)) : null, createdAt: Number(row.created_at) };
  }
  enqueue(shop: string, dedupe: string, kind: Job["kind"], topic: string, payload: Record<string, unknown>) {
    shopSchema.parse(shop);
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM jobs WHERE shop=? AND dedupe=?").get(shop, dedupe);
      if (existing) {
        // Webhook redelivery returns the original receipt even after privacy cleanup.
        if (kind === "command" && (existing.kind !== kind || existing.payload !== JSON.stringify(payload))) throw new ConnectorError("This idempotency key belongs to a different command.", 409);
        return { job: this.job(existing), duplicate: true };
      }
      const id = randomUUID();
      this.db.prepare("INSERT INTO jobs(id,shop,dedupe,kind,topic,payload,created_at) VALUES(?,?,?,?,?,?,?)").run(id, shop, dedupe, kind, topic, JSON.stringify(payload), Date.now());
      return { job: this.getJob(shop, id)!, duplicate: false };
    });
  }
  getJob(shop: string, id: string) { const row = this.db.prepare("SELECT * FROM jobs WHERE shop=? AND id=?").get(shop, id); return row ? this.job(row) : null; }
  jobs(shop: string) { return this.db.prepare("SELECT * FROM jobs WHERE shop=? ORDER BY created_at DESC LIMIT 100").all(shop).map(row => this.job(row)); }
  acquire(shop: string, now = Date.now()) {
    const owner = randomUUID();
    const result = this.db.prepare("INSERT INTO worker_lock(shop,owner,expires_at) VALUES(?,?,?) ON CONFLICT(shop) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE worker_lock.expires_at<?").run(shop, owner, now + 120000, now);
    if (!result.changes) return null;
    // A crashed writer may already have changed Shopify: never repeat it blindly.
    this.db.prepare("UPDATE jobs SET status=CASE WHEN kind='command' THEN 'uncertain' ELSE 'pending' END,error='Worker stopped before recording completion; reconcile before retrying a write.' WHERE shop=? AND status='processing'").run(shop);
    return owner;
  }
  release(shop: string, owner: string) { this.db.prepare("DELETE FROM worker_lock WHERE shop=? AND owner=?").run(shop, owner); }
  heartbeat(shop: string, owner: string) {
    if (!this.db.prepare("UPDATE worker_lock SET expires_at=? WHERE shop=? AND owner=?").run(Date.now() + 120000, shop, owner).changes) throw new ConnectorError("Sync worker lease expired.", 409);
  }
  claim(shop: string): Job | null {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM jobs WHERE shop=? AND status='pending' AND next_at<=? AND (kind<>'command' OR NOT EXISTS (SELECT 1 FROM jobs uncertain WHERE uncertain.shop=jobs.shop AND uncertain.status='uncertain')) ORDER BY CASE WHEN topic IN ('app/uninstalled','shop/redact','customers/redact','customers/data_request','app/scopes_update') THEN 0 ELSE 1 END,created_at,id LIMIT 1").get(shop, Date.now());
      if (!row) return null;
      // An ambiguous write blocks later writes until the owner reconciles it.
      this.db.prepare("UPDATE jobs SET status='processing',attempts=attempts+1 WHERE id=?").run(String(row.id));
      return this.getJob(shop, String(row.id));
    });
  }
  finish(id: string, result: unknown) { this.db.prepare("UPDATE jobs SET status='done',error=NULL,result=? WHERE id=?").run(JSON.stringify(result), id); }
  fail(job: Job, error: unknown) {
    const e = error instanceof ConnectorError ? error : new ConnectorError("Shopify sync could not finish; inspect the connection and retry.", 502, true, job.kind === "command");
    const status = e.uncertain ? "uncertain" : e.retryable && job.attempts < 8 ? "pending" : "failed";
    this.db.prepare("UPDATE jobs SET status=?,error=?,next_at=? WHERE id=?").run(status, e.message, Date.now() + Math.min(3600000, 2000 * 2 ** job.attempts), job.id);
  }
  resolve(shop: string, id: string, note: string) {
    if (!this.db.prepare("UPDATE jobs SET status='failed',error=? WHERE shop=? AND id=? AND status='uncertain'").run(`Owner reconciled in Shopify: ${note}`, shop, id).changes) throw new ConnectorError("Choose an uncertain command.", 409);
    return this.getJob(shop, id);
  }
  upsert(shop: string, kind: ResourceKind, data: Record<string, unknown>, observedAt = new Date().toISOString()) {
    const id = String(data.id), updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : observedAt;
    if (!id.startsWith("gid://shopify/") || !Number.isFinite(Date.parse(updatedAt))) throw new ConnectorError("Shopify returned an invalid resource.", 502);
    if (this.isBlocked(shop, kind, data)) return;
    this.db.prepare(`INSERT INTO resources(shop,kind,id,data,updated_at,observed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(shop,kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,observed_at=excluded.observed_at,deleted=0 WHERE resources.deleted=0 AND resources.updated_at<=excluded.updated_at`).run(shop, kind, id, JSON.stringify(data), updatedAt, observedAt);
  }
  remove(shop: string, kind: ResourceKind, id: string) {
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO resources(shop,kind,id,data,updated_at,observed_at,deleted) VALUES(?,?,?,'{}',?,?,1) ON CONFLICT(shop,kind,id) DO UPDATE SET data='{}',deleted=1,updated_at=excluded.updated_at,observed_at=excluded.observed_at").run(shop, kind, id, now, now);
  }
  list(shop: string, kind: ResourceKind, limit = 100, after = ""): { records: Resource[]; nextCursor: string | null } {
    const rows = this.db.prepare("SELECT * FROM resources WHERE shop=? AND kind=? AND deleted=0 AND id>? ORDER BY id LIMIT ?").all(shop, kind, after, limit + 1);
    return { records: rows.slice(0, limit).map(row => ({ shop, kind, id: String(row.id), data: JSON.parse(String(row.data)), updatedAt: String(row.updated_at), observedAt: String(row.observed_at), deleted: false })), nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null };
  }
  customerOrders(shop: string, customerId: string, limit = 100) {
    return this.db.prepare("SELECT data FROM resources WHERE shop=? AND kind='orders' AND deleted=0 AND json_extract(data,'$.customer.id')=? ORDER BY updated_at DESC LIMIT ?").all(shop, customerId, limit).map(r => JSON.parse(String(r.data)) as Record<string, unknown>);
  }
  cursor(shop: string, kind: ResourceKind) { return this.db.prepare("SELECT * FROM cursors WHERE shop=? AND kind=?").get(shop, kind); }
  savePage(shop: string, kind: ResourceKind, nodes: Record<string, unknown>[], cursor: string | null, cycle: string, complete: boolean) {
    this.transaction(() => {
      for (const node of nodes) this.upsert(shop, kind, node);
      this.db.prepare("INSERT INTO cursors(shop,kind,cursor,cycle,completed_at) VALUES(?,?,?,?,?) ON CONFLICT(shop,kind) DO UPDATE SET cursor=excluded.cursor,cycle=excluded.cycle,completed_at=excluded.completed_at").run(shop, kind, cursor, cycle, complete ? new Date().toISOString() : null);
      // Shopify limits order-history visibility by scope; absence from that
      // window is not a deletion. Other complete collections can be reconciled.
      if (complete && kind !== "orders") this.db.prepare("UPDATE resources SET deleted=1,data='{}' WHERE shop=? AND kind=? AND observed_at<?").run(shop, kind, cycle);
    });
  }
  restart(shop: string) { this.db.prepare("DELETE FROM cursors WHERE shop=?").run(shop); }
  disconnected(shop: string) { return !!this.db.prepare("SELECT shop FROM disconnected WHERE shop=?").get(shop); }
  reconnect(shop: string) { this.db.prepare("DELETE FROM disconnected WHERE shop=?").run(shop); this.restart(shop); }
  disconnect(shop: string) { this.db.prepare("INSERT OR REPLACE INTO disconnected VALUES(?,?)").run(shop, new Date().toISOString()); this.db.prepare("UPDATE jobs SET status='failed',payload='{}',error='Shop disconnected' WHERE shop=? AND status='pending' AND topic NOT IN ('app/uninstalled','shop/redact','customers/redact','customers/data_request','app/scopes_update')").run(shop); }
  private isBlocked(shop: string, kind: ResourceKind, data: Record<string, unknown>) {
    const customerId = kind === "customers" ? data.id : kind === "orders" ? (data.customer as { id?: string } | null)?.id : null;
    return customerId ? !!this.db.prepare("SELECT id FROM blocked_customers WHERE shop=? AND id=?").get(shop, String(customerId)) : false;
  }
  redactCustomer(shop: string, id: string) {
    this.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO blocked_customers VALUES(?,?)").run(shop, id);
      this.remove(shop, "customers", id);
      this.db.prepare("UPDATE resources SET data='{}',deleted=1 WHERE shop=? AND kind='orders' AND json_extract(data,'$.customer.id')=?").run(shop, id);
      // Webhook payloads retain IDs only. Remove previous personal-data exports.
      this.db.prepare("UPDATE jobs SET result=NULL WHERE shop=? AND topic='customers/data_request' AND CAST(json_extract(payload,'$.customer.id') AS TEXT)=?").run(shop, id.split("/").pop()!);
    });
  }
  redactShop(shop: string) {
    this.transaction(() => { this.db.prepare("DELETE FROM resources WHERE shop=?").run(shop); this.db.prepare("UPDATE jobs SET payload='{}',result=NULL,status='done' WHERE shop=?").run(shop); this.restart(shop); this.disconnect(shop); });
  }
  status(shop: string) {
    return { counts: this.db.prepare("SELECT kind,count(*) AS count FROM resources WHERE shop=? AND deleted=0 GROUP BY kind").all(shop), queue: this.db.prepare("SELECT status,count(*) AS count FROM jobs WHERE shop=? GROUP BY status").all(shop), reconciliation: this.db.prepare("SELECT kind,completed_at AS completedAt,cycle FROM cursors WHERE shop=?").all(shop), disconnected: this.disconnected(shop) };
  }
}
