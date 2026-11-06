import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount } from "./policy";
import { driverMutation, driverRecord, DriverError, type DriverRecord } from "./model";
import { validateBankReference } from "./bank-store";

export function initDriver(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS driver_records (
    accountId TEXT NOT NULL, id TEXT NOT NULL, clientId TEXT NOT NULL, revision INTEGER NOT NULL,
    body TEXT NOT NULL CHECK(json_valid(body)), sequence INTEGER NOT NULL UNIQUE, updatedAt TEXT NOT NULL,
    PRIMARY KEY(accountId,id));
    CREATE INDEX IF NOT EXISTS driver_records_client ON driver_records(clientId, sequence);
    CREATE TABLE IF NOT EXISTS driver_clock (id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL);
    INSERT OR IGNORE INTO driver_clock VALUES(1,0);
    CREATE TABLE IF NOT EXISTS driver_mutations (accountId TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(accountId,id));
    CREATE TABLE IF NOT EXISTS driver_receipts (accountId TEXT NOT NULL, id TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(accountId,id));`);
}
export type DriverRow = { record: DriverRecord; updatedAt: string; sequence: number };
type Stored = { body: string; updatedAt: string; sequence: number; clientId: string; accountId: string };
const project = (row: Stored): DriverRow => ({ record: driverRecord.parse(JSON.parse(row.body)), updatedAt: row.updatedAt, sequence: row.sequence });
export function readDriverRecords(token: string | undefined, after = 0, limit = 200) {
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500) throw new DriverError(400, "Invalid sync cursor.");
  return workspaceDatabase(db => {
    const account = driverAccount(db, token); initDriver(db);
    const rows = db.prepare("SELECT * FROM driver_records WHERE accountId=? AND clientId=? AND sequence>? ORDER BY sequence LIMIT ?").all(account.id, account.clientId, after, limit + 1) as unknown as Stored[];
    const records = rows.slice(0, limit).map(project);
    return { records, cursor: records.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
  });
}
export function saveDriverRecord(token: string | undefined, raw: unknown): DriverRow {
  const input = driverMutation.parse(raw), digest = createHash("sha256").update(JSON.stringify(input.record)).digest("hex");
  const result = workspaceDatabase(db => {
    const account = driverAccount(db, token); initDriver(db);
    const prior = db.prepare("SELECT digest,result FROM driver_mutations WHERE accountId=? AND id=?").get(account.id, input.mutationId) as { digest: string; result: string } | undefined;
    if (prior) {
      if (prior.digest !== digest) throw new DriverError(409, "This sync operation was already used for different data.");
      return { value: JSON.parse(prior.result) as DriverRow };
    }
    const existing = db.prepare("SELECT * FROM driver_records WHERE accountId=? AND id=?").get(account.id, input.record.id) as Stored | undefined;
    if (existing && existing.clientId !== account.clientId) throw new DriverError(403, "The client link for this record changed. Contact the firm.");
    if ((existing ? driverRecord.parse(JSON.parse(existing.body)).revision : 0) !== input.record.revision) return { conflict: existing ? project(existing) : null };
    if (!existing) {
      const count = db.prepare("SELECT count(*) AS n FROM driver_records WHERE accountId=?").get(account.id) as { n: number };
      if (count.n >= 100_000) throw new DriverError(413, "This journal needs a records-capacity review.");
    }
    if (input.record.kind === "expense" && input.record.body.receiptId && !db.prepare("SELECT id FROM driver_receipts WHERE accountId=? AND id=?").get(account.id, input.record.body.receiptId)) throw new DriverError(422, "Upload this receipt before syncing its expense.");
    if (input.record.kind !== "trip" && !input.record.deleted && input.record.body.bankReference) {
      if (input.record.body.bankReference.provider === "plaid") {
        const previous = existing ? driverRecord.parse(JSON.parse(existing.body)) : undefined;
        validateBankReference(db, account.id, account.clientId, input.record.body.bankReference.transactionId,
          previous?.kind !== "trip" && previous?.body.bankReference?.transactionId === input.record.body.bankReference.transactionId);
      }
      const duplicate = db.prepare("SELECT id FROM driver_records WHERE accountId=? AND id<>? AND json_extract(body,'$.deleted')=0 AND json_extract(body,'$.body.bankReference.transactionId')=? LIMIT 1")
        .get(account.id, input.record.id, input.record.body.bankReference.transactionId);
      if (duplicate) throw new DriverError(409, "This bank transaction is already linked to another journal record. Review that record before syncing another copy.");
    }
    const record = { ...input.record, revision: input.record.revision + 1 } as DriverRecord;
    db.prepare("UPDATE driver_clock SET sequence=sequence+1 WHERE id=1").run();
    const sequence = (db.prepare("SELECT sequence FROM driver_clock WHERE id=1").get() as { sequence: number }).sequence;
    const updatedAt = new Date().toISOString(), value = { record, sequence, updatedAt };
    db.prepare(`INSERT INTO driver_records VALUES(?,?,?,?,?,?,?) ON CONFLICT(accountId,id) DO UPDATE SET revision=excluded.revision,body=excluded.body,sequence=excluded.sequence,updatedAt=excluded.updatedAt`).run(account.id, record.id, account.clientId, record.revision, JSON.stringify(record), sequence, updatedAt);
    db.prepare("INSERT INTO driver_mutations VALUES(?,?,?,?,?)").run(account.id, input.mutationId, digest, JSON.stringify(value), Date.now());
    db.prepare("DELETE FROM driver_mutations WHERE at<?").run(Date.now() - 90 * 86400000);
    return { value };
  }, true);
  if ("conflict" in result) throw new DriverConflict(result.conflict ?? null);
  return result.value!;
}
export class DriverConflict extends DriverError {
  constructor(public current: DriverRow | null) { super(409, "This record changed in another session. Review both versions before syncing."); }
}
/** Staff-only projection. Call only behind the Money permission and Tax Firm visibility guards. */
export function staffDriverRecords(clientId?: string) {
  return workspaceDatabase(db => {
    initDriver(db);
    const rows = (clientId ? db.prepare("SELECT * FROM driver_records WHERE clientId=? ORDER BY sequence DESC").all(clientId) : db.prepare("SELECT * FROM driver_records ORDER BY sequence DESC").all()) as unknown as Stored[];
    return rows.map(row => ({ ...project(row), clientId: row.clientId, accountId: row.accountId })).filter(row => !row.record.deleted);
  });
}
