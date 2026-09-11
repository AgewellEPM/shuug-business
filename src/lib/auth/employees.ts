import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { hashPassword, verifyPassword } from "./passwords";
import { SESSION_TTL_SECONDS } from "./config";

export interface EmployeeAccount { id: string; memberId: string; name: string; email: string; status: "invited" | "active" | "disabled"; createdAt: string; lastLogin: string | null }
type StoredAccount = EmployeeAccount & { passwordHash: string | null };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const passwordSchema = z.string().min(14, "Use at least 14 characters.").max(200);
const emailSchema = z.email().max(160).transform(s => s.toLowerCase());
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS employee_accounts (id TEXT PRIMARY KEY, memberId TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL, passwordHash TEXT, createdAt TEXT NOT NULL, lastLogin TEXT);
    CREATE TABLE IF NOT EXISTS employee_sessions (tokenHash TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES employee_accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS employee_invitations (tokenHash TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES employee_accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS employee_attempts (bucket TEXT PRIMARY KEY, failures INTEGER NOT NULL, resetAt INTEGER NOT NULL);`);
}
function publicAccount(row: StoredAccount): EmployeeAccount {
  return { id: row.id, memberId: row.memberId, name: row.name, email: row.email, status: row.status, createdAt: row.createdAt, lastLogin: row.lastLogin };
}
function revoke(db: DatabaseSync, id: string) { db.prepare("DELETE FROM employee_sessions WHERE accountId=?").run(id); db.prepare("DELETE FROM employee_invitations WHERE accountId=?").run(id); }
export function listEmployeeAccounts(): EmployeeAccount[] {
  return workspaceDatabase(db => { init(db); return (db.prepare("SELECT * FROM employee_accounts ORDER BY name").all() as unknown as StoredAccount[]).map(publicAccount); });
}
export function createEmployeeAccount(input: { memberId: string; name: string; email: string }): EmployeeAccount {
  const v = z.object({ memberId: z.string().min(1).max(100).refine(id => id !== "owner", "The owner already has a sign-in."), name: z.string().trim().min(1).max(100), email: emailSchema }).strict().parse({ ...input, email: input.email.trim() });
  return workspaceDatabase(db => { init(db);
    if (db.prepare("SELECT id FROM employee_accounts WHERE email=? OR memberId=?").get(v.email, v.memberId)) throw new Error("An account already uses this email or team member.");
    const account: EmployeeAccount = { ...v, id: randomUUID(), status: "invited", createdAt: new Date().toISOString(), lastLogin: null };
    db.prepare("INSERT INTO employee_accounts VALUES(?,?,?,?,?,NULL,?,NULL)").run(account.id, account.memberId, account.name, account.email, account.status, account.createdAt);
    return account;
  }, true);
}
/** Reset links replace older links and revoke every existing session immediately. */
export function issueEmployeeInvitation(id: string): string {
  return workspaceDatabase(db => { init(db);
    const account = db.prepare("SELECT * FROM employee_accounts WHERE id=?").get(id) as StoredAccount | undefined;
    if (!account || account.status === "disabled") throw new Error("Enable this employee before creating an invitation.");
    revoke(db, id);
    db.prepare("UPDATE employee_accounts SET status='invited',passwordHash=NULL WHERE id=?").run(id);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO employee_invitations VALUES(?,?,?)").run(hash(token), id, Date.now() + 48 * 3600000);
    return token;
  }, true);
}
export function acceptEmployeeInvitation(token: string, password: string): void {
  passwordSchema.parse(password);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invitation expired or unavailable. Ask the owner for a new link.");
  workspaceDatabase(db => { init(db);
    const invite = db.prepare("SELECT a.id FROM employee_invitations i JOIN employee_accounts a ON a.id=i.accountId WHERE i.tokenHash=? AND i.expires>? AND a.status='invited'").get(hash(token), Date.now()) as { id: string } | undefined;
    if (!invite) throw new Error("Invitation expired or unavailable. Ask the owner for a new link.");
    revoke(db, invite.id);
    db.prepare("UPDATE employee_accounts SET passwordHash=?,status='active' WHERE id=?").run(hashPassword(password), invite.id);
    const account = db.prepare("SELECT email FROM employee_accounts WHERE id=?").get(invite.id) as { email: string };
    db.prepare("DELETE FROM employee_attempts WHERE bucket=?").run(hash(account.email));
  }, true);
}
export function setEmployeeEnabled(id: string, enabled: boolean) {
  workspaceDatabase(db => { init(db);
    if (!db.prepare("SELECT id FROM employee_accounts WHERE id=?").get(id)) throw new Error("Employee account unavailable.");
    revoke(db, id);
    db.prepare("UPDATE employee_accounts SET status=? ,passwordHash=NULL WHERE id=?").run(enabled ? "invited" : "disabled", id);
  }, true);
}
export function disableMemberAccount(memberId: string) {
  const account = listEmployeeAccounts().find(a => a.memberId === memberId); if (account) setEmployeeEnabled(account.id, false);
}
export function updateEmployeeAccount(id: string, name: string, email: string) {
  const nextName = z.string().trim().min(1).max(100).parse(name), nextEmail = emailSchema.parse(email.trim());
  workspaceDatabase(db => { init(db);
    const current = db.prepare("SELECT * FROM employee_accounts WHERE id=?").get(id) as StoredAccount | undefined;
    if (!current) throw new Error("Employee unavailable.");
    if (db.prepare("SELECT id FROM employee_accounts WHERE email=? AND id<>?").get(nextEmail, id)) throw new Error("This email already has an account.");
    if (current.email !== nextEmail) {
      revoke(db, id);
      db.prepare("UPDATE employee_accounts SET passwordHash=NULL,status=? WHERE id=?").run(current.status === "disabled" ? "disabled" : "invited", id);
    }
    db.prepare("UPDATE employee_accounts SET name=?,email=? WHERE id=?").run(nextName, nextEmail, id);
  }, true);
}
const dummyHash = hashPassword("not-a-real-account-password");
export function signInEmployee(email: string, password: string): string {
  const normalized = email.trim().toLowerCase().slice(0, 200);
  const result = workspaceDatabase(db => { init(db); const now = Date.now();
    db.prepare("DELETE FROM employee_sessions WHERE expires<=?").run(now);
    db.prepare("DELETE FROM employee_attempts WHERE resetAt<=?").run(now);
    const bucket = hash(normalized), rate = db.prepare("SELECT failures FROM employee_attempts WHERE bucket=?").get(bucket) as { failures: number } | undefined;
    if (rate && rate.failures >= 8) return { error: "Too many sign-in attempts. Try again in 15 minutes." };
    const account = db.prepare("SELECT * FROM employee_accounts WHERE email=?").get(normalized) as StoredAccount | undefined;
    const valid = verifyPassword(password.length <= 200 ? password : "", account?.passwordHash ?? dummyHash);
    if (!account || account.status !== "active" || !valid) {
      db.prepare("INSERT INTO employee_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET failures=failures+1").run(bucket, now + 900000);
      return { error: "Email or password is incorrect, or your account is unavailable." };
    }
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO employee_sessions VALUES(?,?,?)").run(hash(token), account.id, now + SESSION_TTL_SECONDS * 1000);
    db.prepare("UPDATE employee_accounts SET lastLogin=? WHERE id=?").run(new Date(now).toISOString(), account.id);
    db.prepare("DELETE FROM employee_attempts WHERE bucket=?").run(bucket);
    return { token };
  }, true);
  if (result.error) throw new Error(result.error); return result.token!;
}
export function employeeSession(token: string | undefined): EmployeeAccount | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return workspaceDatabase(db => { init(db);
    const row = db.prepare("SELECT a.* FROM employee_sessions s JOIN employee_accounts a ON a.id=s.accountId WHERE s.tokenHash=? AND s.expires>? AND a.status='active'").get(hash(token), Date.now()) as StoredAccount | undefined;
    return row ? publicAccount(row) : null;
  });
}
export function signOutEmployee(token: string | undefined) {
  if (!token) return;
  workspaceDatabase(db => { init(db); db.prepare("DELETE FROM employee_sessions WHERE tokenHash=?").run(hash(token)); }, true);
}
export function changeEmployeePassword(id: string, currentPassword: string, password: string) {
  passwordSchema.parse(password);
  workspaceDatabase(db => { init(db);
    const row = db.prepare("SELECT * FROM employee_accounts WHERE id=? AND status='active'").get(id) as StoredAccount | undefined;
    if (!row?.passwordHash || currentPassword.length > 200 || !verifyPassword(currentPassword, row.passwordHash)) throw new Error("Current password is incorrect.");
    revoke(db, id);
    db.prepare("UPDATE employee_accounts SET passwordHash=? WHERE id=?").run(hashPassword(password), id);
  }, true);
}
