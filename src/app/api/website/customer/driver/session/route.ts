import { z } from "zod";
import { signInCustomer, signOutCustomer, CUSTOMER_TTL } from "@/lib/customer-access/accounts";
import { getBranding } from "@/lib/branding/store";
import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount, driverAvailable } from "@/lib/rideshare-driver/policy";
import { DriverError } from "@/lib/rideshare-driver/model";
import { driverFailure, driverJson, driverToken, checkDriverOrigin, privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await driverJson(request);
    if (!driverAvailable()) throw new DriverError(404, "Driver access is not enabled. Contact the firm.");
    const input = z.object({ email: z.email().max(160), password: z.string().min(1).max(200) }).strict().parse(body);
    let token: string;
    try { token = signInCustomer(input.email, input.password); } catch (error) { throw new DriverError(401, error instanceof Error ? error.message : "Sign-in failed."); }
    try {
      const account = workspaceDatabase(db => driverAccount(db, token)), brand = getBranding();
      return Response.json({ apiVersion: 1, token, expiresAt: new Date(Date.now() + CUSTOMER_TTL * 1000).toISOString(), account: { id: account.id, name: account.name, email: account.email }, branding: { name: brand.businessName, primaryColor: brand.primaryColor, accentColor: brand.accentColor } }, { headers: privateHeaders });
    } catch (error) { signOutCustomer(token); throw error; }
  } catch (error) { return driverFailure(error); }
}
export async function DELETE(request: Request) {
  try { checkDriverOrigin(request); signOutCustomer(driverToken(request)); return Response.json({ ok: true }, { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
