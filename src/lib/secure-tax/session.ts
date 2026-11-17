import {secureAccount} from "./account-scope";
import {signInPrivateTaxAccount,signOutPrivateTaxAccount,accountCode} from "./private-accounts";
import { z } from "zod";
import { signInCustomer, signOutCustomer, CUSTOMER_TTL } from "../customer-access/accounts";
import { workspaceDatabase } from "../workspace/database";
import { driverAvailable } from "../rideshare-driver/policy";
import { SecureTaxError } from "./manifest";
import { requireSecureBrowserOrigin, secureRequestToken, secureJson, secureResponse, secureFailure } from "./http";
import { MfaChallengeError } from "../auth/mfa/model";
import { completeLoginFactor, loginFactorView } from "../auth/mfa/store";
import { assertLegacyRouteAllowed, assertSessionProfile } from "./client-only/guard";

export async function secureSignIn(request: Request) {
  return signIn(request, false);
}

// Native applications use bearer sessions and an independently pinned HTTPS API.
// This is not a claim that an HTTP header authenticates the installed app.
// Password, mandatory MFA and the client's signed encryption keys remain required.
export async function nativeSecureSignIn(request: Request) {
  return signIn(request, true);
}
async function signIn(request: Request, native: boolean) {
  try {
    assertLegacyRouteAllowed(request);
    if (native) requireNativeRequest(request);
    else requireSecureBrowserOrigin(request);
    if (!driverAvailable()) throw new SecureTaxError(404, "Client access is not enabled. Contact your firm.");
    const input = z.union([
      z.object({ accountCode, password:z.string().min(1).max(200) }).strict(),
      z.object({ email: z.email().max(160), password: z.string().min(1).max(200) }).strict(),
      z.object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(40), privateAccount:z.boolean().optional() }).strict(),
    ]).parse(await secureJson(request, 4096));
    assertSessionProfile(request, "accountCode" in input ? { accountCode: input.accountCode } : "challengeToken" in input ? { challengeToken: input.challengeToken } : {});
    if (native && !("accountCode" in input || "challengeToken" in input && input.privateAccount === true)) {
      throw new SecureTaxError(400, "Use a private account code and authenticator verification.");
    }
    let token: string;const audience=("accountCode" in input||"privateAccount" in input&&input.privateAccount===true)?"secure-customer":"customer";
    let recoveryCodes: string[] = [];
    try {
      if ("challengeToken" in input) { const result = completeLoginFactor(input.challengeToken, input.code, audience); token = result.token; recoveryCodes = result.recoveryCodes; }
      else if("accountCode" in input)token=signInPrivateTaxAccount(input.accountCode,input.password);
      else token = signInCustomer(input.email, input.password);
    } catch (error) {
      if (error instanceof MfaChallengeError) return secureResponse(request, { apiVersion: 1, mfaRequired: true, ...error.challenge, ...loginFactorView(error.challenge.challengeToken, audience) }, 428);
      throw new SecureTaxError(401, "Sign-in failed. Check your account details or try again later.");
    }
    try {
      const account = workspaceDatabase(db => secureAccount(db, token));
      return secureResponse(request, { apiVersion: 1, token, expiresAt: new Date(Date.now() + CUSTOMER_TTL * 1000).toISOString(), identity: { accountId: account.id, clientId: account.clientId }, ...(recoveryCodes.length ? { recoveryCodes } : {}) });
    } catch (error) { signOutCustomer(token);signOutPrivateTaxAccount(token); throw error; }
  } catch (error) { return secureFailure(request, error); }
}
function requireNativeRequest(request: Request) {
  // A browser must use the origin-checked browser route, including for logout.
  if (request.headers.has("origin") || request.headers.has("sec-fetch-site") || request.headers.has("cookie")) {
    throw new SecureTaxError(403, "Use the independently trusted browser sign-in page.");
  }
}
export async function nativeSecureSignOut(request: Request) {
  try {
    requireNativeRequest(request);
    const token = secureRequestToken(request, true);
    signOutPrivateTaxAccount(token);
    return secureResponse(request, { ok: true });
  } catch (error) { return secureFailure(request, error); }
}
export async function secureSignOut(request: Request) {
  try {
    requireSecureBrowserOrigin(request);
    const token=secureRequestToken(request,true);signOutCustomer(token);signOutPrivateTaxAccount(token);
    return secureResponse(request, { ok: true });
  } catch (error) { return secureFailure(request, error); }
}
