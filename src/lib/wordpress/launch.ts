import { createHash, randomBytes } from "node:crypto";
import { workspaceDatabase } from "../workspace/database";
import { sessionIdentity } from "../auth/identity";
import { sealSecret, openSecret } from "../connections/vault";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function init(db: import("node:sqlite").DatabaseSync) { db.exec("CREATE TABLE IF NOT EXISTS wordpress_launch (hash TEXT PRIMARY KEY, session TEXT NOT NULL, expires INTEGER NOT NULL)"); }
export function createLaunchTicket(session: string) {
  if (!sessionIdentity(session)) throw new Error("Sign in again.");
  const ticket = randomBytes(32).toString("hex");
  workspaceDatabase(db => { init(db); db.prepare("DELETE FROM wordpress_launch WHERE expires<=?").run(Date.now()); db.prepare("INSERT INTO wordpress_launch VALUES(?,?,?)").run(hash(ticket), sealSecret(session), Date.now() + 60000); }, true);
  return ticket;
}
export function consumeLaunchTicket(ticket: string) {
  if (!/^[a-f0-9]{64}$/.test(ticket)) throw new Error("Open the application again from WordPress.");
  const encrypted = workspaceDatabase(db => { init(db); const row = db.prepare("SELECT session FROM wordpress_launch WHERE hash=? AND expires>?").get(hash(ticket), Date.now()) as { session: string } | undefined; db.prepare("DELETE FROM wordpress_launch WHERE hash=?").run(hash(ticket)); return row?.session; }, true);
  if (!encrypted) throw new Error("This launch link expired or was already used.");
  const session = openSecret(encrypted), user = sessionIdentity(session); if (!user) throw new Error("Your account is no longer signed in.");
  return { session, user };
}
export function launchIdentity(ticket: string) {
  if (!/^[a-f0-9]{64}$/.test(ticket)) return null;
  return workspaceDatabase(db => { init(db); const row = db.prepare("SELECT session FROM wordpress_launch WHERE hash=? AND expires>?").get(hash(ticket), Date.now()) as { session: string } | undefined; return row ? sessionIdentity(openSecret(row.session)) : null; });
}
