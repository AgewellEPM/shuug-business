/**
 * Local encrypted database — an on-device store where every record is written to
 * a single AES-256-GCM encrypted file. Opt-in: set LOCAL_DB_PASSPHRASE to turn
 * it on (and LOCAL_DB_PATH to choose where; defaults to ~/.shuug/data.enc). With
 * no passphrase it's off and nothing is written to disk. The file is ciphertext,
 * so it can't be read from the outside without your passphrase.
 *
 * (This is the encryption + persistence layer; wiring each app store to it is a
 * drop-in — call saveCollection/loadCollection. A SQLite-backed variant via
 * better-sqlite3-multiple-ciphers is a future swap with the same interface.)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { encrypt, decrypt } from "./crypto";

function passphrase(): string | null {
  const p = process.env.LOCAL_DB_PASSPHRASE?.trim();
  return p ? p : null;
}

export function localDbEnabled(): boolean {
  return passphrase() !== null;
}

function dbPath(): string {
  return process.env.LOCAL_DB_PATH?.trim() || join(homedir(), ".shuug", "data.enc");
}

type Db = Record<string, unknown[]>;

function readDb(): Db {
  const pass = passphrase();
  if (!pass) return {};
  const path = dbPath();
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(decrypt(readFileSync(path, "utf8"), pass));
    return parsed && typeof parsed === "object" ? (parsed as Db) : {};
  } catch (err) {
    throw new Error(
      `Local database could not be decrypted — wrong passphrase or corrupt file. ${err instanceof Error ? err.message : ""}`,
    );
  }
}

function writeDb(db: Db): void {
  const pass = passphrase();
  if (!pass) throw new Error("Local encrypted database is off — set LOCAL_DB_PASSPHRASE to enable it.");
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encrypt(JSON.stringify(db), pass), "utf8");
}

/** Persist a collection of records (encrypted). No-op semantics if disabled: throws. */
export function saveCollection<T>(name: string, records: T[]): void {
  const db = readDb();
  db[name] = records as unknown[];
  writeDb(db);
}

/** Load a collection (empty if the DB is off or the collection doesn't exist). */
export function loadCollection<T>(name: string): T[] {
  return (readDb()[name] as T[] | undefined) ?? [];
}

export interface LocalDbStatus {
  enabled: boolean;
  path: string | null;
  exists: boolean;
}

export function localDbStatus(): LocalDbStatus {
  const enabled = localDbEnabled();
  const path = enabled ? dbPath() : null;
  return { enabled, path, exists: !!path && existsSync(path) };
}
