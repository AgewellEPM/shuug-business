import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "../connections/vault";

/** One private database per client deployment. No process-local business state. */
export function workspaceDatabase<T>(work: (db: DatabaseSync) => T, write = false): T {
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "workspace.sqlite");
  const db = new DatabaseSync(file);
  try {
    chmodSync(file, 0o600);
    db.exec(`PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL,
        body TEXT NOT NULL CHECK(json_valid(body)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_kind ON records(kind, updated_at);
      CREATE TABLE IF NOT EXISTS audit (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL,
        actor TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, snapshot TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL);
      PRAGMA user_version=1;`);
    if (write) db.exec("BEGIN IMMEDIATE");
    try { const result = work(db); if (write) db.exec("COMMIT"); return result; }
    catch (error) { if (write) db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}
