import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../../workspace/database";
import { openSecret, sealSecret, setting } from "../../connections/vault";
import { SESSION_TTL_SECONDS } from "../config";
import { authenticatorUri, newTotpSecret, verifyTotp } from "./crypto";
import { MfaError, type MfaAudience, type MfaChallenge, type MfaSubject } from "./model";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
interface Factor { kind: string; account_id: string; secret: string; revision: number; last_counter: number }
interface Pending extends MfaSubject { password_binding: string; secret: string | null; factor_revision: number; expires: number }
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS mfa_factors(kind TEXT NOT NULL,account_id TEXT NOT NULL,secret TEXT NOT NULL,revision INTEGER NOT NULL,last_counter INTEGER NOT NULL,PRIMARY KEY(kind,account_id));
    CREATE TABLE IF NOT EXISTS mfa_challenges(token_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,password_binding TEXT NOT NULL,secret TEXT,factor_revision INTEGER NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS mfa_challenges_account ON mfa_challenges(kind,id,created);
    CREATE TABLE IF NOT EXISTS mfa_attempts(kind TEXT NOT NULL,account_id TEXT NOT NULL,failures INTEGER NOT NULL,reset_at INTEGER NOT NULL,PRIMARY KEY(kind,account_id));
    CREATE TABLE IF NOT EXISTS mfa_recovery(kind TEXT NOT NULL,account_id TEXT NOT NULL,code_hash TEXT NOT NULL,PRIMARY KEY(kind,account_id,code_hash));
    CREATE TABLE IF NOT EXISTS mfa_session_grants(token_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,account_id TEXT NOT NULL,revision INTEGER NOT NULL,expires INTEGER NOT NULL);`);
}
export function mfaEnforced(): boolean { return process.env.SHUUG_REQUIRE_MFA === "true" || setting("WORKSPACE_REQUIRE_MFA") === "true"; }
function factor(db: DatabaseSync, subject: MfaSubject) {
  return db.prepare("SELECT * FROM mfa_factors WHERE kind=? AND account_id=?").get(subject.kind, subject.id) as Factor | undefined;
}
function allowed(db: DatabaseSync, subject: MfaSubject, now: number) {
  const rate = db.prepare("SELECT failures,reset_at FROM mfa_attempts WHERE kind=? AND account_id=?").get(subject.kind, subject.id) as { failures: number; reset_at: number } | undefined;
  return !rate || rate.reset_at <= now || rate.failures < 8;
}
/** Called only after successful password verification, within its write transaction.
 * The caller returns this result before throwing, so the challenge is committed. */
export function beginLoginFactor(db: DatabaseSync, subject: MfaSubject, passwordHash: string, required = false): MfaChallenge | null {
  init(db); const current = factor(db, subject), now = Date.now();
  if (!current && !required && !mfaEnforced()) return null;
  if (!allowed(db, subject, now)) throw new MfaError("Too many verification attempts. Try again in 15 minutes.", 429);
  db.prepare("DELETE FROM mfa_challenges WHERE expires<=?").run(now);
  db.prepare("DELETE FROM mfa_session_grants WHERE expires<=?").run(now);
  db.prepare("DELETE FROM mfa_challenges WHERE kind=? AND id=? AND token_hash NOT IN (SELECT token_hash FROM mfa_challenges WHERE kind=? AND id=? ORDER BY created DESC,rowid DESC LIMIT 2)").run(subject.kind, subject.id, subject.kind, subject.id);
  const token = randomBytes(32).toString("hex"), expires = now + 5 * 60000;
  db.prepare("INSERT INTO mfa_challenges VALUES(?,?,?,?,?,?,?,?)").run(hash(token), subject.kind, subject.id, hash(passwordHash), current ? null : sealSecret(newTotpSecret()), current?.revision ?? 0, now, expires);
  return { challengeToken: token, enrollmentRequired: !current, expiresAt: new Date(expires).toISOString() };
}
function passwordHashFor(db: DatabaseSync, subject: MfaSubject): string | null {
  if (subject.kind === "owner") return subject.id === "workspace-owner" ? setting("WORKSPACE_OWNER_PASSWORD_HASH") || null : null;
  const row = subject.kind === "employee"
    ? db.prepare("SELECT passwordHash FROM employee_accounts WHERE id=? AND status='active'").get(subject.id)
    : db.prepare("SELECT passwordHash FROM customer_accounts WHERE id=? AND status='active'").get(subject.id);
  return (row as { passwordHash: string | null } | undefined)?.passwordHash ?? null;
}
function pending(db: DatabaseSync, token: string, audience: MfaAudience): Pending {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new MfaError("Verification expired. Sign in again.", 401);
  const row = db.prepare("SELECT * FROM mfa_challenges WHERE token_hash=? AND expires>?").get(hash(token), Date.now()) as Pending | undefined;
  if (!row || (row.kind === "customer") !== (audience === "customer")) throw new MfaError("Verification expired. Sign in again.", 401);
  const passwordHash = passwordHashFor(db, row);
  if (!passwordHash || hash(passwordHash) !== row.password_binding || (factor(db, row)?.revision ?? 0) !== row.factor_revision) throw new MfaError("Your account changed. Sign in again.", 401);
  return row;
}
export function loginFactorView(token: string, audience: MfaAudience) {
  return workspaceDatabase(db => {
    init(db); const row = pending(db, token, audience);
    if (!allowed(db, row, Date.now())) throw new MfaError("Too many verification attempts. Try again in 15 minutes.", 429);
    const secret = row.secret ? openSecret(row.secret) : null;
    return { enrollmentRequired: !!secret, expiresAt: new Date(row.expires).toISOString(), secret,
      authenticatorUri: secret ? authenticatorUri(secret, `${row.kind}-${row.id}`) : null };
  });
}
export function mfaSessionAllowed(db: DatabaseSync, subject: MfaSubject, tokenHash: string): boolean {
  init(db); const current = factor(db, subject);
  if (!current) return !mfaEnforced();
  return !!db.prepare("SELECT 1 FROM mfa_session_grants WHERE token_hash=? AND kind=? AND account_id=? AND revision=? AND expires>?")
    .get(tokenHash, subject.kind, subject.id, current.revision, Date.now());
}
/** Protected device access requires an actual completed factor even when the
 * ordinary workspace's enrollment switch is off. Never grants a bypass. */
export function mfaSessionVerified(db: DatabaseSync, subject: MfaSubject, tokenHash: string): boolean {
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='mfa_factors'").get()
    || !db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='mfa_session_grants'").get()) return false;
  const current = factor(db, subject);
  return !!current && !!db.prepare("SELECT 1 FROM mfa_session_grants WHERE token_hash=? AND kind=? AND account_id=? AND revision=? AND expires>?")
    .get(tokenHash, subject.kind, subject.id, current.revision, Date.now());
}
function issueSession(db: DatabaseSync, subject: MfaSubject, token: string, now: number) {
  const expires = now + SESSION_TTL_SECONDS * 1000, digest = hash(token);
  if (subject.kind === "owner") {
    db.prepare("INSERT INTO owner_sessions VALUES(?,?)").run(digest, expires);
    db.exec("DELETE FROM owner_login_attempts WHERE bucket='owner'");
  }
  else if (subject.kind === "employee") {
    db.prepare("INSERT INTO employee_sessions VALUES(?,?,?)").run(digest, subject.id, expires);
    db.prepare("UPDATE employee_accounts SET lastLogin=? WHERE id=?").run(new Date(now).toISOString(), subject.id);
    const account = db.prepare("SELECT email FROM employee_accounts WHERE id=?").get(subject.id) as { email: string };
    db.prepare("DELETE FROM employee_attempts WHERE bucket=?").run(hash(account.email));
  } else {
    db.prepare("DELETE FROM customer_sessions WHERE accountId=? AND tokenHash NOT IN (SELECT tokenHash FROM customer_sessions WHERE accountId=? ORDER BY expires DESC LIMIT 9)").run(subject.id, subject.id);
    db.prepare("INSERT INTO customer_sessions VALUES(?,?,?)").run(digest, subject.id, expires);
    db.prepare("UPDATE customer_accounts SET lastLogin=? WHERE id=?").run(new Date(now).toISOString(), subject.id);
    const account = db.prepare("SELECT email FROM customer_accounts WHERE id=?").get(subject.id) as { email: string };
    db.prepare("DELETE FROM customer_attempts WHERE bucket=?").run(`login:${hash(account.email)}`);
  }
  db.prepare("INSERT INTO mfa_session_grants VALUES(?,?,?,?,?)").run(digest, subject.kind, subject.id, factor(db, subject)!.revision, expires);
}
/** Proof consumption, enrollment, recovery use and session issuance are atomic.
 * Incorrect-code counters commit before the public error is raised. */
export function completeLoginFactor(token: string, code: string, audience: MfaAudience) {
  const result = workspaceDatabase(db => {
    init(db); const row = pending(db, token, audience), now = Date.now();
    if (!allowed(db, row, now)) return { error: "Too many verification attempts. Try again in 15 minutes.", status: 429 };
    const current = factor(db, row), secret = openSecret(row.secret ?? current!.secret);
    const counter = verifyTotp(secret, code.trim(), now, current?.last_counter ?? -1);
    const recoveryHash = /^[A-Fa-f0-9-]{24,29}$/.test(code.trim()) ? hash(code.trim().replaceAll("-", "").toUpperCase()) : "";
    const recovery = !row.secret && recoveryHash && db.prepare("SELECT 1 FROM mfa_recovery WHERE kind=? AND account_id=? AND code_hash=?").get(row.kind, row.id, recoveryHash);
    if (counter === null && !recovery) {
      db.prepare("INSERT INTO mfa_attempts VALUES(?,?,1,?) ON CONFLICT(kind,account_id) DO UPDATE SET failures=CASE WHEN reset_at<=? THEN 1 ELSE failures+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END").run(row.kind, row.id, now + 900000, now, now);
      return { error: "Code is incorrect or already used. Wait for a fresh authenticator code, or use an unused recovery code.", status: 401 };
    }
    const recoveryCodes: string[] = [];
    if (row.secret) {
      db.prepare("INSERT INTO mfa_factors VALUES(?,?,?,?,?)").run(row.kind, row.id, row.secret, 1, counter!);
      for (let i = 0; i < 10; i++) {
        const value = randomBytes(12).toString("hex").toUpperCase();
        recoveryCodes.push(value.match(/.{6}/g)!.join("-"));
        db.prepare("INSERT INTO mfa_recovery VALUES(?,?,?)").run(row.kind, row.id, hash(value));
      }
    } else if (recovery) {
      db.prepare("DELETE FROM mfa_recovery WHERE kind=? AND account_id=? AND code_hash=?").run(row.kind, row.id, recoveryHash);
      db.prepare("DELETE FROM mfa_session_grants WHERE kind=? AND account_id=?").run(row.kind, row.id);
    } else db.prepare("UPDATE mfa_factors SET last_counter=? WHERE kind=? AND account_id=?").run(counter!, row.kind, row.id);
    db.prepare("DELETE FROM mfa_challenges WHERE token_hash=?").run(hash(token));
    db.prepare("DELETE FROM mfa_attempts WHERE kind=? AND account_id=?").run(row.kind, row.id);
    const session = randomBytes(32).toString("hex"); issueSession(db, row, session, now);
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(row.id, `${row.kind}:${row.id}`, row.secret ? "mfa.enrolled" : recovery ? "mfa.recovery.used" : "mfa.verified", new Date(now).toISOString(), JSON.stringify({ kind: row.kind }));
    return { token: session, kind: row.kind, recoveryCodes, expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString() };
  }, true);
  if (result.error) throw new MfaError(result.error, result.status);
  return result as { token: string; kind: MfaSubject["kind"]; recoveryCodes: string[]; expiresAt: string };
}
