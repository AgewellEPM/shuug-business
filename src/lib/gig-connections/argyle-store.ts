import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount, driverAvailable } from "../rideshare-driver/policy";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";
import { sealSecret, openSecret } from "../connections/vault";
import { ArgyleError, argyleConfiguration, type SourceRecord, type SourceItem, type SourceAccount, type ResourceKind } from "./argyle-provider";

export type CloudUser = { accountId: string; clientId: string; providerUser: string | null; fingerprint: string; environment: string;
  generation: string; status: string; lastSyncAt: string | null; lastError: string | null; leaseId: string | null; leaseUntil: number };
export type CloudJob = { accountId: string; generation: string; version: number; attempts: number; receivedAt: string; leaseId: string };
export function initArgyle(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS gig_cloud_users(accountId TEXT PRIMARY KEY,clientId TEXT NOT NULL,providerUser TEXT UNIQUE,fingerprint TEXT NOT NULL,
    environment TEXT NOT NULL,generation TEXT NOT NULL,status TEXT NOT NULL,lastSyncAt TEXT,lastError TEXT,leaseId TEXT,leaseUntil INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS gig_cloud_accounts(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,clientId TEXT NOT NULL,item TEXT NOT NULL,body TEXT NOT NULL,observedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gig_cloud_records(accountId TEXT NOT NULL,clientId TEXT NOT NULL,providerAccount TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,
      body TEXT NOT NULL,sourceUpdatedAt TEXT,receivedAt TEXT NOT NULL,observedAt TEXT NOT NULL,PRIMARY KEY(accountId,providerAccount,kind,id));
    CREATE TABLE IF NOT EXISTS gig_cloud_jobs(accountId TEXT PRIMARY KEY,generation TEXT NOT NULL,version INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
      receivedAt TEXT NOT NULL,runAfter INTEGER NOT NULL,leaseId TEXT,leaseUntil INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS gig_cloud_handoffs(hash TEXT PRIMARY KEY,accountId TEXT NOT NULL,proof TEXT NOT NULL,expires INTEGER NOT NULL);`);
  if (!(db.prepare("PRAGMA table_info(gig_cloud_records)").all() as {name:string}[]).some(row=>row.name==="removedAt")) db.exec("ALTER TABLE gig_cloud_records ADD COLUMN removedAt TEXT");
  db.exec("CREATE TABLE IF NOT EXISTS gig_cloud_worker(id INTEGER PRIMARY KEY CHECK(id=1),lastSeenAt TEXT NOT NULL)");
}
export function cloudUser(db: DatabaseSync, accountId: string) { initArgyle(db); return db.prepare("SELECT * FROM gig_cloud_users WHERE accountId=?").get(accountId) as CloudUser | undefined; }
export function scopedArgyle(db: DatabaseSync, token: string | undefined) {
  const account = driverAccount(db, token), link = cloudUser(db, account.id);
  if (link && account.clientId !== link.clientId) throw new ArgyleError(409, "Your client profile changed. Ask the firm to review this connection.");
  return { account, link };
}
export function currentCloudUser(db: DatabaseSync, id: string, generation?: string) {
  const user = cloudUser(db,id), c = argyleConfiguration();
  if (!user || (generation && user.generation !== generation) || !["active","creating"].includes(user.status) || user.fingerprint !== c.fingerprint || !driverAvailable(db)) throw new ArgyleError(409, "The account connection changed or was stopped.");
  const account = db.prepare("SELECT clientId,status FROM customer_accounts WHERE id=?").get(id) as {clientId:string;status:string}|undefined;
  const client = account ? db.prepare("SELECT body FROM records WHERE kind='client' AND id=?").get(account.clientId) as {body:string}|undefined : undefined;
  if (!account || account.status !== "active" || account.clientId !== user.clientId || !client || ["inactive","archived","cancelled"].includes(JSON.parse(client.body).status)) throw new ArgyleError(403,"This client account is no longer active.");
  assertPlaintextTaxAllowed(user,db);
  return user;
}
export function enqueueCloud(db: DatabaseSync, user: CloudUser) {
  const received = new Date().toISOString();
  db.prepare(`INSERT INTO gig_cloud_jobs(accountId,generation,version,receivedAt,runAfter) VALUES(?,?,1,?,?)
    ON CONFLICT(accountId) DO UPDATE SET generation=excluded.generation,version=version+1,receivedAt=excluded.receivedAt,
    runAfter=MIN(runAfter,excluded.runAfter)`).run(user.accountId,user.generation,received,Date.now());
}
export function claimCloudJob(): CloudJob | undefined {
  return workspaceDatabase(db => {
    initArgyle(db); const now = Date.now();
    const row = db.prepare("SELECT * FROM gig_cloud_jobs WHERE runAfter<=? AND leaseUntil<=? ORDER BY runAfter LIMIT 1").get(now,now) as CloudJob|undefined;
    if (!row) return;
    row.leaseId = randomUUID();
    db.prepare("UPDATE gig_cloud_jobs SET leaseId=?,leaseUntil=? WHERE accountId=?").run(row.leaseId,now+600_000,row.accountId);
    return row;
  },true);
}
export function retryCloudJob(job: CloudJob, message: string) {
  workspaceDatabase(db => {
    const user = cloudUser(db,job.accountId);
    if (!user || user.generation !== job.generation) { db.prepare("DELETE FROM gig_cloud_jobs WHERE accountId=? AND leaseId=?").run(job.accountId,job.leaseId);return; }
    db.prepare("UPDATE gig_cloud_users SET lastError=? WHERE accountId=?").run(message.slice(0,300),job.accountId);
    db.prepare("UPDATE gig_cloud_jobs SET attempts=attempts+1,runAfter=?,leaseId=NULL,leaseUntil=0 WHERE accountId=? AND leaseId=?")
      .run(Date.now()+Math.min(3600_000,30_000*2**Math.min(job.attempts,7)),job.accountId,job.leaseId);
  },true);
}
export type CloudWindow = {account:string;kind:ResourceKind;from?:string};
export function markCloudAccountsStopped(db:DatabaseSync, accountId:string, active = new Set<string>()) {
  const rows=db.prepare("SELECT id,body FROM gig_cloud_accounts WHERE accountId=?").all(accountId) as {id:string;body:string}[];
  for(const row of rows) if(!active.has(row.id)) {
    const saved=JSON.parse(openSecret(row.body)); saved.account.connection={status:"disconnected"};
    db.prepare("UPDATE gig_cloud_accounts SET body=? WHERE id=? AND accountId=?").run(sealSecret(JSON.stringify(saved)),row.id,accountId);
  }
}
export function saveCloudSnapshot(job: CloudJob, accounts: { account:SourceAccount; item:SourceItem }[], records: {kind:ResourceKind; record:SourceRecord}[], windows:CloudWindow[] = []) {
  workspaceDatabase(db => {
    const user=currentCloudUser(db,job.accountId,job.generation), lease=db.prepare("SELECT leaseId FROM gig_cloud_jobs WHERE accountId=?").get(job.accountId) as {leaseId:string}|undefined;
    if (lease?.leaseId !== job.leaseId) throw new ArgyleError(409,"A newer update owns this connection.");
    const now=new Date().toISOString(), allowed=new Set(accounts.map(row=>row.account.id));
    markCloudAccountsStopped(db,user.accountId,allowed);
    for (const {account,item} of accounts) {
      if (account.user !== user.providerUser) throw new ArgyleError(409,"The provider returned a different client account.");
      const existing=db.prepare("SELECT accountId FROM gig_cloud_accounts WHERE id=?").get(account.id) as {accountId:string}|undefined;
      if (existing && existing.accountId !== user.accountId) throw new ArgyleError(409,"This provider account belongs to another client profile.");
      db.prepare(`INSERT INTO gig_cloud_accounts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET item=excluded.item,body=excluded.body,observedAt=excluded.observedAt`)
        .run(account.id,user.accountId,user.clientId,item.id,sealSecret(JSON.stringify({account,item})),now);
    }
    for (const {kind,record} of records) {
      if (!allowed.has(record.account)) throw new ArgyleError(409,"The provider returned records outside this client account.");
      const prior=db.prepare("SELECT sourceUpdatedAt,body FROM gig_cloud_records WHERE accountId=? AND providerAccount=? AND kind=? AND id=?").get(user.accountId,record.account,kind,record.id) as {sourceUpdatedAt:string|null;body:string}|undefined;
      if (prior?.sourceUpdatedAt && record.updated_at && Date.parse(prior.sourceUpdatedAt)>Date.parse(record.updated_at)) continue;
      if(prior && openSecret(prior.body)===JSON.stringify(record)) {
        db.prepare("UPDATE gig_cloud_records SET removedAt=NULL WHERE accountId=? AND providerAccount=? AND kind=? AND id=?").run(user.accountId,record.account,kind,record.id);
        continue;
      }
      db.prepare(`INSERT INTO gig_cloud_records(accountId,clientId,providerAccount,kind,id,body,sourceUpdatedAt,receivedAt,observedAt) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(accountId,providerAccount,kind,id) DO UPDATE SET
        body=excluded.body,sourceUpdatedAt=excluded.sourceUpdatedAt,receivedAt=excluded.receivedAt,observedAt=excluded.observedAt,removedAt=NULL`)
        .run(user.accountId,user.clientId,record.account,kind,record.id,sealSecret(JSON.stringify(record)),record.updated_at??null,job.receivedAt,now);
    }
    // Reconcile only fully retrieved windows. Keep removed evidence visibly marked.
    for(const window of windows) {
      const present=new Set(records.filter(r=>r.kind===window.kind&&r.record.account===window.account).map(r=>r.record.id));
      const prior=db.prepare("SELECT id,body,removedAt FROM gig_cloud_records WHERE accountId=? AND providerAccount=? AND kind=?").all(user.accountId,window.account,window.kind) as {id:string;body:string;removedAt:string|null}[];
      for(const row of prior) {
        const source=JSON.parse(openSecret(row.body)) as SourceRecord;
        if(!row.removedAt&&!present.has(row.id)&&(!window.from||(source.start_datetime&&source.start_datetime>=window.from)))
          db.prepare("UPDATE gig_cloud_records SET removedAt=? WHERE accountId=? AND providerAccount=? AND kind=? AND id=?").run(now,user.accountId,window.account,window.kind,row.id);
      }
    }
    db.prepare("UPDATE gig_cloud_users SET lastSyncAt=?,lastError=NULL WHERE accountId=?").run(now,user.accountId);
    db.prepare("DELETE FROM gig_cloud_jobs WHERE accountId=? AND leaseId=? AND version=?").run(job.accountId,job.leaseId,job.version);
    db.prepare("UPDATE gig_cloud_jobs SET leaseId=NULL,leaseUntil=0,attempts=0 WHERE accountId=? AND leaseId=?").run(job.accountId,job.leaseId);
  },true);
}
export function cloudRows(db:DatabaseSync, user:CloudUser) {
  const accounts=db.prepare("SELECT id,body,observedAt FROM gig_cloud_accounts WHERE accountId=? AND clientId=?").all(user.accountId,user.clientId) as unknown as {id:string;body:string;observedAt:string}[];
  const records=db.prepare("SELECT kind,id,body,receivedAt,observedAt,sourceUpdatedAt,removedAt FROM gig_cloud_records WHERE accountId=? AND clientId=? ORDER BY observedAt DESC,id LIMIT 1000").all(user.accountId,user.clientId) as unknown as {kind:ResourceKind;id:string;body:string;receivedAt:string;observedAt:string;sourceUpdatedAt:string|null;removedAt:string|null}[];
  return {accounts:accounts.map(row=>({...row,...JSON.parse(openSecret(row.body)),body:undefined})),records:records.map(row=>({...row,record:JSON.parse(openSecret(row.body)) as SourceRecord,body:undefined}))};
}
