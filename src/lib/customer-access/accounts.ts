import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { hashPassword, verifyPassword } from "../auth/passwords";

// Customer identities never enter the employee/owner session or role tables.
export const CUSTOMER_COOKIE = "shuug_customer";
export const CUSTOMER_PATH = "/api/website/customer";
export const CUSTOMER_TTL = 12 * 3600;
export interface CustomerAccount { id: string; name: string; email: string; customerId: string | null; clientId: string | null; status: "invited" | "active" | "disabled"; createdAt: string; lastLogin: string | null }
type Stored = CustomerAccount & { passwordHash: string | null };
export const customerInput = z.object({ name: z.string().trim().min(1).max(100), email: z.email().max(160).transform(s => s.toLowerCase()), customerId: z.string().min(1).max(100).nullable(), clientId: z.uuid().nullable() }).strict().refine(v => v.customerId || v.clientId, "Link a product customer or service client.");
const passwordSchema = z.string().min(14, "Use at least 14 characters.").max(200);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS customer_accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, customerId TEXT, clientId TEXT, status TEXT NOT NULL, passwordHash TEXT, createdAt TEXT NOT NULL, lastLogin TEXT);
    CREATE TABLE IF NOT EXISTS customer_sessions (tokenHash TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES customer_accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_invitations (tokenHash TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES customer_accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
}
const publicAccount = (r: Stored): CustomerAccount => ({ id: r.id, name: r.name, email: r.email, customerId: r.customerId, clientId: r.clientId, status: r.status, createdAt: r.createdAt, lastLogin: r.lastLogin });
function revoke(db: DatabaseSync, id: string) { db.prepare("DELETE FROM customer_sessions WHERE accountId=?").run(id); db.prepare("DELETE FROM customer_invitations WHERE accountId=?").run(id); }
export function listCustomerAccounts() { return workspaceDatabase(db => { init(db); return (db.prepare("SELECT * FROM customer_accounts ORDER BY name").all() as unknown as Stored[]).map(publicAccount); }); }
/** Call after validating both business references. Bindings cannot be changed by customers. */
export function createCustomerAccount(raw: unknown) {
  const input = customerInput.parse(raw);
  return workspaceDatabase(db => {
    init(db);
    if (db.prepare("SELECT id FROM customer_accounts WHERE email=?").get(input.email)) throw new Error("A customer account already uses this email.");
    const account: CustomerAccount = { ...input, id: randomUUID(), status: "invited", createdAt: new Date().toISOString(), lastLogin: null };
    db.prepare("INSERT INTO customer_accounts VALUES(?,?,?,?,?,'invited',NULL,?,NULL)").run(account.id, account.name, account.email, account.customerId, account.clientId, account.createdAt);
    return account;
  }, true);
}
export function issueCustomerInvitation(id: string) {
  return workspaceDatabase(db => {
    init(db); const account = db.prepare("SELECT * FROM customer_accounts WHERE id=?").get(id) as Stored | undefined;
    if (!account || account.status === "disabled") throw new Error("Enable this customer account before creating a setup link.");
    revoke(db, id); db.prepare("UPDATE customer_accounts SET status='invited',passwordHash=NULL WHERE id=?").run(id);
    const token = randomBytes(32).toString("hex"); db.prepare("INSERT INTO customer_invitations VALUES(?,?,?)").run(hash(token), id, Date.now() + 48 * 3600000); return token;
  }, true);
}
export function acceptCustomerInvitation(token: string, password: string) {
  passwordSchema.parse(password);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Setup link expired or unavailable. Ask the organization for a new link.");
  workspaceDatabase(db => {
    init(db); const row = db.prepare("SELECT a.id,a.email FROM customer_invitations i JOIN customer_accounts a ON a.id=i.accountId WHERE i.tokenHash=? AND i.expires>? AND a.status='invited'").get(hash(token), Date.now()) as { id: string; email: string } | undefined;
    if (!row) throw new Error("Setup link expired or unavailable. Ask the organization for a new link.");
    revoke(db, row.id); db.prepare("UPDATE customer_accounts SET status='active',passwordHash=? WHERE id=?").run(hashPassword(password), row.id);
    db.prepare("DELETE FROM customer_attempts WHERE bucket=?").run(`login:${hash(row.email)}`);
  }, true);
}
export function setCustomerEnabled(id: string, enabled: boolean) {
  workspaceDatabase(db => { init(db); if (!db.prepare("SELECT id FROM customer_accounts WHERE id=?").get(id)) throw new Error("Customer account unavailable."); revoke(db, id); db.prepare("UPDATE customer_accounts SET status=?,passwordHash=NULL WHERE id=?").run(enabled ? "invited" : "disabled", id); }, true);
}
function permit(db: DatabaseSync, bucket: string, max: number) {
  const rate = db.prepare("SELECT count FROM customer_attempts WHERE bucket=?").get(bucket) as { count: number } | undefined;
  if ((rate?.count ?? 0) >= max) return false;
  db.prepare("INSERT INTO customer_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(bucket, Date.now() + 900000); return true;
}
const dummy = hashPassword("customer-dummy-no-account");
export function signInCustomer(email: string, password: string) {
  const normalized = email.trim().toLowerCase().slice(0, 200);
  const result = workspaceDatabase(db => {
    init(db); const now = Date.now(); db.prepare("DELETE FROM customer_attempts WHERE expires<=?").run(now); db.prepare("DELETE FROM customer_sessions WHERE expires<=?").run(now);
    if (!permit(db, "login:all", 300) || !permit(db, `login:${hash(normalized)}`, 8)) return { error: "Too many sign-in attempts. Try again in 15 minutes." };
    const row = db.prepare("SELECT * FROM customer_accounts WHERE email=?").get(normalized) as Stored | undefined;
    const valid = verifyPassword(password.length <= 200 ? password : "", row?.passwordHash ?? dummy);
    if (!row || row.status !== "active" || !valid) return { error: "Email or password is incorrect, or this account is unavailable." };
    // Bound each account's active sessions without weakening revocation.
    db.prepare("DELETE FROM customer_sessions WHERE accountId=? AND tokenHash NOT IN (SELECT tokenHash FROM customer_sessions WHERE accountId=? ORDER BY expires DESC LIMIT 9)").run(row.id, row.id);
    const token = randomBytes(32).toString("hex"); db.prepare("INSERT INTO customer_sessions VALUES(?,?,?)").run(hash(token), row.id, now + CUSTOMER_TTL * 1000);
    db.prepare("UPDATE customer_accounts SET lastLogin=? WHERE id=?").run(new Date(now).toISOString(), row.id);
    db.prepare("DELETE FROM customer_attempts WHERE bucket=?").run(`login:${hash(normalized)}`); return { token };
  }, true);
  if (result.error) throw new Error(result.error); return result.token!;
}
export function customerFromDatabase(db: DatabaseSync, token: string | undefined): CustomerAccount | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  init(db); const row = db.prepare("SELECT a.* FROM customer_sessions s JOIN customer_accounts a ON a.id=s.accountId WHERE s.tokenHash=? AND s.expires>? AND a.status='active'").get(hash(token), Date.now()) as Stored | undefined;
  return row ? publicAccount(row) : null;
}
export function customerSession(token: string | undefined) { return workspaceDatabase(db => customerFromDatabase(db, token)); }
export function signOutCustomer(token: string | undefined) { if (token) workspaceDatabase(db => { init(db); db.prepare("DELETE FROM customer_sessions WHERE tokenHash=?").run(hash(token)); }, true); }
export function changeCustomerPassword(token: string, current: string, password: string) {
  passwordSchema.parse(password);
  const result = workspaceDatabase(db => {
    const account = customerFromDatabase(db, token); if (!account) return "Sign in again.";
    db.prepare("DELETE FROM customer_attempts WHERE expires<=?").run(Date.now());
    if (!permit(db, `password:${account.id}`, 8)) return "Too many attempts. Try again in 15 minutes.";
    const row = db.prepare("SELECT passwordHash FROM customer_accounts WHERE id=?").get(account.id) as { passwordHash: string };
    if (current.length > 200 || !verifyPassword(current, row.passwordHash)) return "Current password is incorrect.";
    revoke(db, account.id); db.prepare("UPDATE customer_accounts SET passwordHash=? WHERE id=?").run(hashPassword(password), account.id); return null;
  }, true);
  if (result) throw new Error(result);
}
export function customerToken(request: Request) { const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${CUSTOMER_COOKIE}=`)); return values.length === 1 ? values[0].slice(CUSTOMER_COOKIE.length + 1) : undefined; }
export function customerCookie(token: string, secure: boolean) { return `${CUSTOMER_COOKIE}=${token}; Path=${CUSTOMER_PATH}; HttpOnly; SameSite=Lax; Max-Age=${token ? CUSTOMER_TTL : 0}${secure ? "; Secure" : ""}`; }
