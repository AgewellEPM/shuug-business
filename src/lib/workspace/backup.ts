import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync, copyFileSync, chmodSync, existsSync, rmSync, renameSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { z } from "zod";
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const safeRelative = (file: string) => !path.isAbsolute(file) && !file.split(/[\\/]/).some(p => p === ".." || p === "" || p === ".") && !file.includes("\0");
const manifestSchema = z.object({ version: z.literal(1), createdAt: z.iso.datetime(), files: z.array(z.object({ path: z.string().refine(safeRelative), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict()).max(100000) }).strict();
function filesIn(directory: string, prefix = ""): string[] {
  return readdirSync(path.join(directory, prefix)).flatMap(name => {
    const relative = path.join(prefix, name), stat = lstatSync(path.join(directory, relative));
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("Backups support ordinary files and directories only.");
    return stat.isDirectory() ? filesIn(directory, relative) : [relative];
  }).sort();
}
function verifySqlite(directory: string, files: string[]) {
  for (const file of files.filter(f => /\.(sqlite|db)$/.test(f))) {
    const db = new DatabaseSync(path.join(directory, file), { readOnly: true });
    try { const result = db.prepare("PRAGMA quick_check").all(); if (JSON.stringify(result) !== '[{"quick_check":"ok"}]') throw new Error(`Database integrity check failed: ${file}`); }
    finally { db.close(); }
  }
}
/** Stop app + workers first. Refuse live SQLite journals and never overwrite a backup. */
export function backupWorkspace(source: string, target: string) {
  source = path.resolve(source); target = path.resolve(target);
  if (target === source || target.startsWith(source + path.sep)) throw new Error("Save the backup outside the data directory.");
  if (existsSync(target)) throw new Error("Backup destination already exists.");
  const files = filesIn(source);
  if (files.some(file => /(-wal|-shm|\.lock)$/.test(file))) throw new Error("Stop the app and all workers, allowing SQLite to checkpoint, before backing up.");
  const manifest = { version: 1 as const, createdAt: new Date().toISOString(), files: files.map(file => ({ path: file, sha256: digest(path.join(source, file)), bytes: lstatSync(path.join(source, file)).size })) };
  mkdirSync(target, { recursive: true, mode: 0o700 });
  try {
    for (const file of manifest.files) {
      const destination = path.join(target, file.path); mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 }); copyFileSync(path.join(source, file.path), destination); chmodSync(destination, 0o600);
      if (digest(destination) !== file.sha256 || digest(path.join(source, file.path)) !== file.sha256) throw new Error("Data changed during backup. Stop every writer and retry.");
    }
    if (JSON.stringify(filesIn(source)) !== JSON.stringify(files)) throw new Error("Data changed during backup. Stop every writer and retry.");
    for (const file of manifest.files) if (digest(path.join(source, file.path)) !== file.sha256) throw new Error("Data changed during backup. Stop every writer and retry.");
    verifySqlite(target, files);
    writeFileSync(path.join(target, "backup-manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    return { files: files.length, target, createdAt: manifest.createdAt };
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error; }
}
export function restoreWorkspace(backup: string, target: string) {
  backup = path.resolve(backup); target = path.resolve(target);
  if (existsSync(target)) throw new Error("Restore only into a new directory. The current workspace will not be overwritten.");
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(backup, "backup-manifest.json"), "utf8")));
  if (new Set(manifest.files.map(f => f.path)).size !== manifest.files.length) throw new Error("Duplicate backup entries.");
  const actual = filesIn(backup).filter(f => f !== "backup-manifest.json");
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files.map(f => f.path).sort())) throw new Error("Backup contents do not match the manifest.");
  for (const file of manifest.files) if (digest(path.join(backup, file.path)) !== file.sha256 || lstatSync(path.join(backup, file.path)).size !== file.bytes) throw new Error(`Backup checksum failed: ${file.path}`);
  verifySqlite(backup, actual);
  const staging = `${target}.restore-${Date.now()}`;
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  try {
    for (const file of manifest.files) { const destination = path.join(staging, file.path); mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 }); copyFileSync(path.join(backup, file.path), destination); chmodSync(destination, 0o600); }
    if (existsSync(target)) throw new Error("Restore destination was created by another process.");
    renameSync(staging, target); return { files: manifest.files.length, target };
  } catch (error) { rmSync(staging, { recursive: true, force: true }); throw error; }
}
