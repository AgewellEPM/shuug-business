import { createHash, randomBytes } from "node:crypto";
import { workspaceDatabase } from "../workspace/database";
import { setting, saveSecrets } from "../connections/vault";
import { hashPassword, verifyPassword } from "./passwords";
import { SESSION_TTL_SECONDS } from "./config";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function initialize(db: import("node:sqlite").DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS owner_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS owner_login_attempts (bucket TEXT PRIMARY KEY, failures INTEGER NOT NULL, reset_at INTEGER NOT NULL);");
}
export function configureOwnerPassword(password: string, replace = false) {
  if (password.length < 14 || password.length > 200) throw new Error("Use an owner password between 14 and 200 characters.");
  if (setting("WORKSPACE_OWNER_PASSWORD_HASH") && !replace) throw new Error("Owner sign-in is already configured. Use --reset-password to rotate it.");
  saveSecrets({ WORKSPACE_OWNER_PASSWORD_HASH: hashPassword(password) });
  workspaceDatabase(db => { initialize(db); db.exec("DELETE FROM owner_sessions; DELETE FROM owner_login_attempts;"); }, true);
}
export function ownerSessionValid(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  return workspaceDatabase(db => { initialize(db); return Boolean(db.prepare("SELECT 1 FROM owner_sessions WHERE token_hash=? AND expires>?").get(digest(token), Date.now())); });
}
export function signInOwner(password: string): string {
  const hash = setting("WORKSPACE_OWNER_PASSWORD_HASH");
  if (!hash) throw new Error("Owner sign-in needs setup. Run npm run workspace:setup on the server.");
  const result = workspaceDatabase(db => {
    initialize(db); const now = Date.now();
    db.prepare("DELETE FROM owner_sessions WHERE expires<=?").run(now);
    const rate = db.prepare("SELECT failures,reset_at FROM owner_login_attempts WHERE bucket='owner'").get() as { failures: number; reset_at: number } | undefined;
    if (rate && rate.reset_at > now && rate.failures >= 8) return { error: "Too many sign-in attempts. Try again in 15 minutes." };
    if (password.length > 200 || !verifyPassword(password, hash)) {
      const failures = rate && rate.reset_at > now ? rate.failures + 1 : 1, reset = rate && rate.reset_at > now ? rate.reset_at : now + 900000;
      db.prepare("INSERT INTO owner_login_attempts VALUES('owner',?,?) ON CONFLICT(bucket) DO UPDATE SET failures=excluded.failures,reset_at=excluded.reset_at").run(failures, reset);
      return { error: "Incorrect password." };
    }
    db.exec("DELETE FROM owner_login_attempts WHERE bucket='owner'");
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO owner_sessions VALUES(?,?)").run(digest(token), now + SESSION_TTL_SECONDS * 1000); return { token };
  }, true);
  if (result.error) throw new Error(result.error); return result.token!;
}
export function signOutOwner(token: string | undefined) {
  if (!token) return;
  workspaceDatabase(db => { initialize(db); db.prepare("DELETE FROM owner_sessions WHERE token_hash=?").run(digest(token)); }, true);
}
