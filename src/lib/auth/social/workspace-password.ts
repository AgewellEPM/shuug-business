import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { privateLookupDigest, setting } from "../../connections/vault";
import { hasClientOnlyBinding } from "../../secure-tax/client-only/guard";
import { privateAccountPassword, privateTaxAccount, privateTaxSession } from "../../secure-tax/private-accounts";
import { verifiedOwnerSession } from "../../secure-tax/staff-session";
import { workspaceDatabase } from "../../workspace/database";
import { beginLoginFactor, loginFactorView } from "../mfa/store";
import { hashPassword, verifyPassword } from "../passwords";
import { SocialSignInError } from "./providers";
import { acceptWorkspaceInvitation, issueWorkspaceTicket, workspaceSecret, workspaceSecretDigest } from "./workspace-access";

const email = z.string().trim().toLowerCase().max(240).pipe(z.email());
const password = z.string().min(1).max(200);
const signInInput = z.object({ email, password }).strict();
const inviteInput = z.object({ email, password: privateAccountPassword, invitation: workspaceSecret }).strict();
const bindInput = z.object({ email, currentPassword: password }).strict();
const emailDigest = (address: string) => privateLookupDigest("gigtax-email-sign-in-v1", address);
const dummyPassword = hashPassword("nonexistent-gigtax-workspace-password");

type Account = { kind: "owner" | "secure-customer" | "workspace-member"; id: string };
type Credential = Account & { passwordHash: string | null };

function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_password_credentials (
    kind TEXT NOT NULL CHECK(kind IN ('owner','secure-customer','workspace-member')),
    id TEXT NOT NULL, emailDigest TEXT NOT NULL UNIQUE, passwordHash TEXT,
    PRIMARY KEY(kind,id), CHECK ((kind='workspace-member') = (passwordHash IS NOT NULL))
  );
  CREATE TABLE IF NOT EXISTS workspace_password_attempts (
    bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
  );`);
}

function saveCredential(db: DatabaseSync, account: Account, digest: string, passwordHash: string | null = null) {
  if (db.prepare("SELECT 1 FROM workspace_password_credentials WHERE emailDigest=? AND (kind<>? OR id<>?)").get(digest, account.kind, account.id)) {
    throw new SocialSignInError("This sign-in email is already in use. Choose another email or use your current sign-in.", 409);
  }
  db.prepare(`INSERT INTO workspace_password_credentials VALUES(?,?,?,?) ON CONFLICT(kind,id)
    DO UPDATE SET emailDigest=excluded.emailDigest,passwordHash=excluded.passwordHash`).run(account.kind, account.id, digest, passwordHash);
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)")
    .run(account.id, account.id, "auth.workspace.email-configured", new Date().toISOString(), "{}");
}

export function bindWorkspaceEmail(token: string, raw: unknown) {
  const input = bindInput.parse(raw);
  return workspaceDatabase(db => {
    const client = privateTaxSession(db, token);
    const account: Account | undefined = client && hasClientOnlyBinding(db, { accountId: client.id }) ? { kind: "secure-customer", id: client.id } :
      verifiedOwnerSession(db, workspaceSecretDigest(token)) ? { kind: "owner", id: "workspace-owner" } : undefined;
    if (!account) throw new SocialSignInError("Sign in and verify your authenticator first.", 401);
    const current = account.kind === "owner" ? setting("WORKSPACE_OWNER_PASSWORD_HASH") : client?.passwordHash;
    if (!current || !verifyPassword(input.currentPassword, current)) throw new SocialSignInError("Check your current password and try again.", 400);
    init(db);
    saveCredential(db, account, emailDigest(input.email));
    return { emailConfigured: true };
  }, true);
}

export function acceptWorkspacePasswordInvitation(raw: unknown) {
  const input = inviteInput.parse(raw);
  return workspaceDatabase(db => {
    const id = acceptWorkspaceInvitation(db, workspaceSecretDigest(input.invitation));
    init(db);
    saveCredential(db, { kind: "workspace-member", id }, emailDigest(input.email), hashPassword(input.password));
    db.prepare("DELETE FROM workspace_role_sessions WHERE assignmentId=?").run(id);
    return { apiVersion: 1, ...issueWorkspaceTicket(db, id) };
  }, true);
}

function takeAttempt(db: DatabaseSync, bucket: string, now: number, lifetime: number, limit: number) {
  return !!db.prepare(`INSERT INTO workspace_password_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE
    SET count=count+1 WHERE count<? RETURNING count`).get(bucket, now + lifetime, limit);
}

export function signInWorkspacePassword(raw: unknown) {
  const input = signInInput.parse(raw), digest = emailDigest(input.email);
  const result = workspaceDatabase(db => {
    init(db);
    const now = Date.now();
    db.prepare("DELETE FROM workspace_password_attempts WHERE expires<=?").run(now);
    if (!takeAttempt(db, "global", now, 60000, 200) || !takeAttempt(db, digest, now, 15 * 60000, 8)) return null;
    const account = db.prepare("SELECT kind,id,passwordHash FROM workspace_password_credentials WHERE emailDigest=?").get(digest) as Credential | undefined;
    let current = account?.passwordHash;
    if (account?.kind === "owner") current = setting("WORKSPACE_OWNER_PASSWORD_HASH");
    if (account?.kind === "secure-customer") {
      const client = privateTaxAccount(db, account.id);
      current = client?.status === "active" && hasClientOnlyBinding(db, { accountId: client.id }) ? client.passwordHash : null;
    }
    if (!verifyPassword(input.password, current || dummyPassword) || !account || !current) return null;
    db.prepare("DELETE FROM workspace_password_attempts WHERE bucket=?").run(digest);
    if (account.kind === "workspace-member") return { apiVersion: 1, ...issueWorkspaceTicket(db, account.id) };
    const challenge = beginLoginFactor(db, { kind: account.kind, id: account.id }, current, true)!;
    return { apiVersion: 1, mfaRequired: true, audience: account.kind, ...challenge } as const;
  }, true);
  if (!result) throw new SocialSignInError("Check your email and password or try again later.", 401);
  if ("mfaRequired" in result) return { ...result, ...loginFactorView(result.challengeToken, result.audience === "owner" ? "staff" : "secure-customer") };
  return result;
}
