import { z } from "zod";
import { signInCustomer, signOutCustomer, CUSTOMER_TTL } from "../customer-access/accounts";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount, driverAvailable } from "../rideshare-driver/policy";
import { SecureTaxError } from "./manifest";
import { requireSecureBrowserOrigin, secureRequestToken, secureJson, secureResponse, secureFailure } from "./http";

export async function secureSignIn(request: Request) {
  try {
    requireSecureBrowserOrigin(request);
    if (!driverAvailable()) throw new SecureTaxError(404, "Client access is not enabled. Contact your firm.");
    const input = z.object({ email: z.email().max(160), password: z.string().min(1).max(200) }).strict().parse(await secureJson(request, 4096));
    let token: string;
    try { token = signInCustomer(input.email, input.password); }
    catch { throw new SecureTaxError(401, "Sign-in failed. Check your account details or try again later."); }
    try {
      const account = workspaceDatabase(db => driverAccount(db, token));
      return secureResponse(request, { apiVersion: 1, token, expiresAt: new Date(Date.now() + CUSTOMER_TTL * 1000).toISOString(), identity: { accountId: account.id, clientId: account.clientId } });
    } catch (error) { signOutCustomer(token); throw error; }
  } catch (error) { return secureFailure(request, error); }
}
export async function secureSignOut(request: Request) {
  try {
    requireSecureBrowserOrigin(request);
    signOutCustomer(secureRequestToken(request, true));
    return secureResponse(request, { ok: true });
  } catch (error) { return secureFailure(request, error); }
}
