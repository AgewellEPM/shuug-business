import { z } from "zod";
import { signInCustomer, signOutCustomer, CUSTOMER_TTL } from "@/lib/customer-access/accounts";
import { getBranding } from "@/lib/branding/store";
import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount, driverAvailable } from "@/lib/rideshare-driver/policy";
import { DriverError } from "@/lib/rideshare-driver/model";
import { driverFailure, driverJson, driverToken, checkDriverOrigin, privateHeaders } from "@/lib/rideshare-driver/http";
import { MfaChallengeError } from "@/lib/auth/mfa/model";
import { completeLoginFactor, loginFactorView } from "@/lib/auth/mfa/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await driverJson(request);
    if (!driverAvailable()) throw new DriverError(404, "Driver access is not enabled. Contact the firm.");
    const input = z.union([
      z.object({ email: z.email().max(160), password: z.string().min(1).max(200) }).strict(),
      z.object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(40) }).strict(),
    ]).parse(body);
    let token: string;
    let recoveryCodes: string[] = [];
    try {
      if ("challengeToken" in input) { const result = completeLoginFactor(input.challengeToken, input.code, "customer"); token = result.token; recoveryCodes = result.recoveryCodes; }
      else token = signInCustomer(input.email, input.password);
    } catch (error) {
      if (error instanceof MfaChallengeError) return Response.json({ apiVersion: 1, mfaRequired: true, ...error.challenge, ...loginFactorView(error.challenge.challengeToken, "customer") }, { status: 428, headers: privateHeaders });
      throw new DriverError(401, error instanceof Error ? error.message : "Sign-in failed.");
    }
    try {
      const account = workspaceDatabase(db => driverAccount(db, token)), brand = getBranding();
      return Response.json({ apiVersion: 1, token, expiresAt: new Date(Date.now() + CUSTOMER_TTL * 1000).toISOString(), account: { id: account.id, name: account.name, email: account.email }, branding: { name: brand.businessName, primaryColor: brand.primaryColor, accentColor: brand.accentColor }, ...(recoveryCodes.length ? { recoveryCodes } : {}) }, { headers: privateHeaders });
    } catch (error) { signOutCustomer(token); throw error; }
  } catch (error) { return driverFailure(error); }
}
export async function DELETE(request: Request) {
  try { checkDriverOrigin(request); signOutCustomer(driverToken(request)); return Response.json({ ok: true }, { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
