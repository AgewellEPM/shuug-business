import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { WorkspaceUser } from "../auth/identity";
import { ownerIdentity } from "../auth/identity";
import { signInOwner, signOutOwner } from "../auth/owner-session";
import { signInEmployee, signOutEmployee } from "../auth/employees";
import { MfaChallengeError } from "../auth/mfa/model";
import { completeLoginFactor, loginFactorView, mfaSessionVerified } from "../auth/mfa/store";
import { roleForMember } from "../permissions/store";
import { getMember } from "../team/store";
import { workspaceDatabase } from "../workspace/database";
import { SecureTaxError } from "./manifest";
import { requireSecureBrowserOrigin, secureFailure, secureJson, secureResponse } from "./http";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const hasTable = (db: DatabaseSync, name: string) => !!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name);
export function secureStaffToken(request: Request): string {
  requireSecureBrowserOrigin(request);
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new SecureTaxError(401, "Sign in to the trusted staff vault with your authenticator.");
  return token;
}

/** No cookies, development owner fallback, arbitrary identity context or service
 * token is accepted. Recheck the real account and completed factor each time. */
export function secureStaffIdentity(db: DatabaseSync, token: string | undefined): { user: WorkspaceUser; expiresAt: string } {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new SecureTaxError(401, "Staff verification is required.");
  const digest = tokenHash(token), now = Date.now();
  if (hasTable(db, "owner_sessions")) {
    const session = db.prepare("SELECT expires FROM owner_sessions WHERE token_hash=? AND expires>?").get(digest, now) as { expires: number } | undefined;
    if (session && mfaSessionVerified(db, { kind: "owner", id: "workspace-owner" }, digest)) return { user: ownerIdentity(), expiresAt: new Date(session.expires).toISOString() };
  }
  if (hasTable(db, "employee_sessions") && hasTable(db, "employee_accounts")) {
    const account = db.prepare("SELECT a.id,a.memberId,a.name,a.email,s.expires FROM employee_sessions s JOIN employee_accounts a ON a.id=s.accountId WHERE s.tokenHash=? AND s.expires>? AND a.status='active'").get(digest, now) as { id: string; memberId: string; name: string; email: string; expires: number } | undefined;
    if (account && getMember(account.memberId) && mfaSessionVerified(db, { kind: "employee", id: account.id }, digest)) {
      const role = roleForMember(account.memberId);
      return { user: { id: account.id, memberId: account.memberId, name: account.name, email: account.email, role: role === "Owner" ? "Employee" : role, isOwner: false }, expiresAt: new Date(account.expires).toISOString() };
    }
  }
  throw new SecureTaxError(401, "Staff verification expired or was revoked. Sign in again.");
}

export function secureStaffStatus(token: string) {
  return workspaceDatabase(db => {
    const identity = secureStaffIdentity(db, token);
    return { apiVersion: 1, identity: { staffAccountId: identity.user.id }, expiresAt: identity.expiresAt, mfaVerified: true };
  });
}

export async function secureStaffSignIn(request: Request) {
  try {
    requireSecureBrowserOrigin(request);
    const input = z.union([
      z.object({ email: z.union([z.email().max(160), z.literal("")]), password: z.string().min(1).max(200) }).strict(),
      z.object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(40) }).strict(),
    ]).parse(await secureJson(request, 4096));
    let token: string, recoveryCodes: string[] = [];
    try {
      if ("challengeToken" in input) { const result = completeLoginFactor(input.challengeToken, input.code, "staff"); token = result.token; recoveryCodes = result.recoveryCodes; }
      else token = input.email ? signInEmployee(input.email, input.password, true) : signInOwner(input.password, true);
    } catch (error) {
      if (error instanceof MfaChallengeError) return secureResponse(request, { apiVersion: 1, mfaRequired: true, ...error.challenge, ...loginFactorView(error.challenge.challengeToken, "staff") }, 428);
      throw new SecureTaxError(401, "Staff sign-in failed. Check your account details and verification code.");
    }
    try { return secureResponse(request, { ...secureStaffStatus(token), token, ...(recoveryCodes.length ? { recoveryCodes } : {}) }); }
    catch (error) { signOutOwner(token); signOutEmployee(token); throw error; }
  } catch (error) { return secureFailure(request, error); }
}

export async function secureStaffSignOut(request: Request) {
  try {
    const token = secureStaffToken(request);
    signOutOwner(token); signOutEmployee(token);
    return secureResponse(request, { ok: true });
  } catch (error) { return secureFailure(request, error); }
}
