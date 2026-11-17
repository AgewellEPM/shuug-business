import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../../workspace/database";
import { openSecret, sealSecret } from "../../connections/vault";
import { privateTaxSession } from "../../secure-tax/private-accounts";
import { secureStaffIdentity } from "../../secure-tax/staff-session";
import { hasClientOnlyBinding } from "../../secure-tax/client-only/guard";
import { beginFederatedLoginFactor, loginFactorView } from "../mfa/store";
import { authorizationUrl, exchangeAuthorizationCode, providerName, revokeAppleAuthorization, SocialSignInError, type SocialProvider } from "./providers";
import { acceptWorkspaceInvitation, issueWorkspaceTicket, workspaceSecret, workspaceSecretDigest } from "./workspace-access";

const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const socialStartInput = z.object({ provider: z.enum(["google", "apple"]), audience: z.enum(["owner", "secure-customer"]), purpose: z.enum(["login", "link"]), challenge: proof }).strict();
export const socialResultInput = z.object({ requestId: z.uuid(), verifier: proof }).strict();
type Audience = "owner" | "secure-customer";
type Flow = { id: string; provider: SocialProvider; audience: Audience | "workspace"; purpose: "login" | "link"; accountId: string | null; challenge: string; stateHash: string; nonce: string; providerVerifier: string; status: string; identityDigest: string | null; refreshToken: string | null; expires: number };
const workspaceStartInput = z.object({ provider: z.enum(["google", "apple"]), challenge: proof, invitation: workspaceSecret.optional() }).strict();
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS social_login_flows(id TEXT PRIMARY KEY,provider TEXT NOT NULL,audience TEXT NOT NULL,purpose TEXT NOT NULL,accountId TEXT,challenge TEXT NOT NULL,stateHash TEXT UNIQUE NOT NULL,nonce TEXT NOT NULL,providerVerifier TEXT NOT NULL,status TEXT NOT NULL,identityDigest TEXT,refreshToken TEXT,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS social_identities(provider TEXT NOT NULL,identityDigest TEXT NOT NULL,audience TEXT NOT NULL,accountId TEXT NOT NULL,refreshToken TEXT,createdAt TEXT NOT NULL,PRIMARY KEY(provider,identityDigest,audience),UNIQUE(provider,audience,accountId));
    CREATE TABLE IF NOT EXISTS social_login_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
}
function authorizeLink(db: DatabaseSync, audience: Audience, token?: string) {
  if (audience === "owner") { const { user } = secureStaffIdentity(db, token); if (user.isOwner) return user.id; }
  else { const account = privateTaxSession(db, token); if (account) return account.id; }
  throw new SocialSignInError("Sign in to the account before connecting Google or Apple.", 401);
}
export function startSocialSignIn(raw: unknown, token?: string) {
  const input = socialStartInput.parse(raw);
  return createSocialFlow(input, db => input.purpose === "link" ? authorizeLink(db, input.audience, token) : null);
}
export function startWorkspaceSignIn(raw: unknown) {
  const { provider, challenge, invitation } = workspaceStartInput.parse(raw);
  return createSocialFlow({ provider, challenge, audience: "workspace", purpose: "login" }, () => invitation ? workspaceSecretDigest(invitation) : null);
}
function createSocialFlow(input: Pick<Flow, "provider" | "challenge" | "audience" | "purpose">, account: (db: DatabaseSync) => string | null) {
  const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url"), id = randomUUID(), expires = Date.now() + 10 * 60000;
  const url = authorizationUrl(input.provider, state, nonce, hash(verifier));
  workspaceDatabase(db => {
    init(db); const now = Date.now(); db.prepare("DELETE FROM social_login_flows WHERE expires<=?").run(now); db.prepare("DELETE FROM social_login_limits WHERE expires<=?").run(now);
    const count = db.prepare("SELECT count FROM social_login_limits WHERE bucket='start'").get() as { count: number } | undefined;
    if ((count?.count ?? 0) >= 200 || Number((db.prepare("SELECT count(*) AS n FROM social_login_flows").get() as { n: number }).n) >= 1000) throw new SocialSignInError("Sign-in is busy. Wait a minute before retrying.", 429);
    db.prepare("INSERT INTO social_login_limits VALUES('start',1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(now + 60000);
    const accountId = account(db);
    db.prepare("INSERT INTO social_login_flows VALUES(?,?,?,?,?,?,?,?,?,'pending',NULL,NULL,?)").run(id, input.provider, input.audience, input.purpose, accountId, input.challenge, hash(state), nonce, sealSecret(verifier), expires);
  }, true);
  return { apiVersion: 1, requestId: id, authorizationUrl: url, expiresAt: new Date(expires).toISOString() };
}
export async function finishSocialCallback(provider: SocialProvider, state: string, code: string) {
  providerName(provider); if (!proof.safeParse(state).success) throw new SocialSignInError();
  const flow = workspaceDatabase(db => {
    init(db); const row = db.prepare("SELECT * FROM social_login_flows WHERE stateHash=? AND provider=? AND status='pending' AND expires>?").get(hash(state), provider, Date.now()) as Flow | undefined;
    if (!row) throw new SocialSignInError();
    db.prepare("UPDATE social_login_flows SET status='processing' WHERE id=?").run(row.id); return row;
  }, true);
  try {
    const identity = await exchangeAuthorizationCode(provider, code, flow.nonce, openSecret(flow.providerVerifier));
    const identityDigest = hash(JSON.stringify([provider, identity.issuer, identity.subject]));
    workspaceDatabase(db => {
      const result = db.prepare("UPDATE social_login_flows SET status='complete',identityDigest=?,refreshToken=?,providerVerifier='' WHERE id=? AND status='processing' AND expires>?").run(identityDigest, identity.refreshToken ? sealSecret(identity.refreshToken) : null, flow.id, Date.now());
      if (!result.changes) throw new SocialSignInError();
    }, true);
  } catch {
    workspaceDatabase(db => db.prepare("UPDATE social_login_flows SET status='failed',providerVerifier='',refreshToken=NULL WHERE id=?").run(flow.id), true);
    if (flow.audience !== "workspace") throw new SocialSignInError();
  }
  return flow.audience;
}
export function cancelSocialCallback(provider:SocialProvider,state:string) {
  providerName(provider);if(!proof.safeParse(state).success)throw new SocialSignInError();
  return workspaceDatabase(db=>{
    init(db);
    const row=db.prepare("UPDATE social_login_flows SET status='failed',providerVerifier='',refreshToken=NULL WHERE provider=? AND stateHash=? AND status='pending' AND expires>? RETURNING audience").get(provider,hash(state),Date.now());
    return row?.audience;
  },true);
}
type LinkedIdentity = { audience: Audience | "workspace-member"; accountId: string };
function claimWorkspaceIdentity(db: DatabaseSync, row: Flow) {
  const identities = db.prepare("SELECT audience,accountId FROM social_identities WHERE provider=? AND identityDigest=?")
    .all(row.provider, row.identityDigest) as LinkedIdentity[];
  if (identities.length > 1) throw new SocialSignInError("This sign-in is connected to more than one account. Review the connected accounts with the owner.", 409);
  let identity = identities[0];
  if (row.accountId) {
    if (identity) throw new SocialSignInError("This sign-in is already connected. Use a different Google or Apple account for the invitation.", 409);
    const accountId = acceptWorkspaceInvitation(db, row.accountId);
    if (db.prepare("SELECT 1 FROM social_identities WHERE audience='workspace-member' AND provider=? AND accountId=?").get(row.provider, accountId)) {
      throw new SocialSignInError("This assignment already has a sign-in for that provider.", 409);
    }
    identity = { audience: "workspace-member", accountId };
    db.prepare("INSERT INTO social_identities VALUES(?,?,?,?,?,?)").run(row.provider, row.identityDigest, identity.audience, accountId, row.refreshToken, new Date().toISOString());
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)")
      .run(accountId, accountId, "auth.workspace.connected", new Date().toISOString(), JSON.stringify({ provider: row.provider }));
  }
  if (!identity) throw new SocialSignInError("This sign-in is not connected. Use your account code or open your workspace invitation first.", 409);
  if (identity.audience === "secure-customer" && !hasClientOnlyBinding(db, { accountId: identity.accountId })) {
    throw new SocialSignInError("Activate your client-owned account before using the shared sign-in.", 409);
  }
  return identity;
}
export function claimSocialResult(raw: unknown, token?: string, workspace = false) {
  const input = socialResultInput.parse(raw);
  const result = workspaceDatabase(db => {
    init(db); const row = db.prepare("SELECT * FROM social_login_flows WHERE id=? AND expires>?").get(input.requestId, Date.now()) as Flow | undefined;
    const actual = Buffer.from(hash(input.verifier)), expected = Buffer.from(row?.challenge ?? "");
    if (!row || (row.audience === "workspace") !== workspace || actual.length !== expected.length || !timingSafeEqual(actual, expected) || row.status === "consumed") throw new SocialSignInError();
    if (row.status === "pending" || row.status === "processing") return { apiVersion: 1, pending: true } as const;
    if (row.status !== "complete" || !row.identityDigest) throw new SocialSignInError();
    if (row.purpose === "link" && row.audience !== "workspace") {
      const accountId = authorizeLink(db, row.audience, token);
      if (accountId !== row.accountId) throw new SocialSignInError("Your account changed. Connect the provider again.", 409);
      const existing = db.prepare("SELECT accountId FROM social_identities WHERE provider=? AND identityDigest=? AND audience=?").get(row.provider, row.identityDigest, row.audience) as { accountId: string } | undefined;
      const other = db.prepare("SELECT identityDigest FROM social_identities WHERE provider=? AND audience=? AND accountId=?").get(row.provider, row.audience, accountId) as { identityDigest: string } | undefined;
      if (existing && existing.accountId !== accountId || other && other.identityDigest !== row.identityDigest) throw new SocialSignInError("This provider is connected to a different account. Review it before replacing any sign-in.", 409);
      if (process.env.GIGTAX_REQUIRE_CLIENT_ONLY === "true" && db.prepare("SELECT 1 FROM social_identities WHERE provider=? AND identityDigest=? AND audience<>?").get(row.provider, row.identityDigest, row.audience)) {
        throw new SocialSignInError("This provider is connected to a different workspace account.", 409);
      }
      db.prepare("INSERT INTO social_identities VALUES(?,?,?,?,?,?) ON CONFLICT(provider,identityDigest,audience) DO UPDATE SET refreshToken=COALESCE(excluded.refreshToken,social_identities.refreshToken)").run(row.provider, row.identityDigest, row.audience, accountId, row.refreshToken, new Date().toISOString());
      db.prepare("UPDATE social_login_flows SET status='consumed',refreshToken=NULL WHERE id=?").run(row.id);
      db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(accountId,accountId,"auth.social.linked",new Date().toISOString(),JSON.stringify({provider:row.provider,audience:row.audience}));
      return { apiVersion: 1, linked: true, provider: row.provider } as const;
    }
    const identity = row.audience === "workspace" ? claimWorkspaceIdentity(db, row) : db.prepare("SELECT audience,accountId FROM social_identities WHERE provider=? AND identityDigest=? AND audience=?")
      .get(row.provider, row.identityDigest, row.audience) as LinkedIdentity | undefined;
    if (!identity) throw new SocialSignInError("This Google or Apple account is not connected yet. Sign in using your existing account and connect it first.", 409);
    if(row.refreshToken)db.prepare("UPDATE social_identities SET refreshToken=? WHERE provider=? AND identityDigest=? AND audience=?").run(row.refreshToken,row.provider,row.identityDigest,identity.audience);
    db.prepare("UPDATE social_login_flows SET status='consumed',refreshToken=NULL WHERE id=?").run(row.id);
    if (identity.audience === "workspace-member") return { apiVersion: 1, ...issueWorkspaceTicket(db, identity.accountId) } as const;
    const challenge = beginFederatedLoginFactor(db, { kind: identity.audience, id: identity.accountId });
    return { apiVersion: 1, mfaRequired: true, audience: identity.audience, ...challenge } as const;
  }, true);
  if ("mfaRequired" in result) return { ...result, ...loginFactorView(result.challengeToken, result.audience === "owner" ? "staff" : "secure-customer") };
  return result;
}
export const socialConnectionInput=z.object({provider:z.enum(["google","apple"]),audience:z.enum(["owner","secure-customer"])}).strict();
export function linkedSocialProviders(audience:Audience,token?:string) {
  return workspaceDatabase(db=>{init(db);const accountId=authorizeLink(db,audience,token);return db.prepare("SELECT provider FROM social_identities WHERE audience=? AND accountId=? ORDER BY provider").all(audience,accountId).map(row=>String(row.provider));});
}
export async function unlinkSocialProvider(raw:unknown,token?:string) {
  const input=socialConnectionInput.parse(raw);
  const original=workspaceDatabase(db=>{
    init(db);const accountId=authorizeLink(db,input.audience,token);
    const row=db.prepare("SELECT * FROM social_identities WHERE provider=? AND audience=? AND accountId=?").get(input.provider,input.audience,accountId) as {identityDigest:string;refreshToken:string|null}|undefined;
    return row?{...row,accountId}:null;
  });
  if(!original)return {disconnected:true,provider:input.provider};
  if(input.provider==="apple") {
    if(!original.refreshToken)throw new SocialSignInError("This Apple connection needs its authorization reviewed before revocation.",409);
    await revokeAppleAuthorization(openSecret(original.refreshToken));
  }
  workspaceDatabase(db=>{
    const accountId=authorizeLink(db,input.audience,token);if(accountId!==original.accountId)throw new SocialSignInError("Your account changed. Reopen sign-in settings.",409);
    const deleted=db.prepare("DELETE FROM social_identities WHERE provider=? AND audience=? AND accountId=? AND identityDigest=? AND refreshToken IS ?").run(input.provider,input.audience,accountId,original.identityDigest,original.refreshToken);
    if(!deleted.changes)throw new SocialSignInError("This connection changed during revocation. Check sign-in settings again.",409);
    db.prepare("UPDATE social_login_flows SET status='failed',refreshToken=NULL,providerVerifier='' WHERE provider=? AND audience=? AND (accountId=? OR identityDigest=?)").run(input.provider,input.audience,accountId,original.identityDigest);
    db.prepare("DELETE FROM mfa_challenges WHERE kind=? AND id=?").run(input.audience,accountId);
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(accountId,accountId,"auth.social.unlinked",new Date().toISOString(),JSON.stringify(input));
  },true);
  return {disconnected:true,provider:input.provider};
}
