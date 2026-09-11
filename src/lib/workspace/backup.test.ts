import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { backupWorkspace, restoreWorkspace } from "./backup";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it("restores private data and SQLite into a new directory, and rejects damaged or live backups", () => {
  const root = mkdtempSync(`${tmpdir()}/backup-test-`); dirs.push(root); mkdirSync(`${root}/data`);
  const db = new DatabaseSync(`${root}/data/workspace.sqlite`); db.exec("CREATE TABLE proof(value TEXT); INSERT INTO proof VALUES('saved work');"); db.close();
  writeFileSync(`${root}/data/vault.key`, "synthetic-key");
  backupWorkspace(`${root}/data`, `${root}/backup`);
  restoreWorkspace(`${root}/backup`, `${root}/restored`);
  expect(readFileSync(`${root}/restored/vault.key`, "utf8")).toBe("synthetic-key");
  const restored = new DatabaseSync(`${root}/restored/workspace.sqlite`); expect(restored.prepare("SELECT value FROM proof").get()?.value).toBe("saved work"); restored.close();
  expect(() => restoreWorkspace(`${root}/backup`, `${root}/restored`)).toThrow("new directory");
  writeFileSync(`${root}/backup/vault.key`, "damaged"); expect(() => restoreWorkspace(`${root}/backup`, `${root}/bad`)).toThrow("checksum");
  writeFileSync(`${root}/data/workspace.sqlite-wal`, "live"); expect(() => backupWorkspace(`${root}/data`, `${root}/live`)).toThrow("Stop the app");
});
