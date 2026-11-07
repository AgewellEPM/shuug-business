import { readDriverProfile, updateDriverProfile } from "@/lib/customer-access/driver-profile";
import { checkDriverOrigin, driverFailure, driverJson, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount } from "@/lib/rideshare-driver/policy";
import { assertPlaintextTaxAllowed } from "@/lib/secure-tax/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { checkDriverOrigin(request); return Response.json(readDriverProfile(driverToken(request, true)), { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    checkDriverOrigin(request);
    const token = driverToken(request);
    workspaceDatabase(db => { const account = driverAccount(db, token); assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); });
    const input = await driverJson(request);
    return Response.json(updateDriverProfile(token, input), { headers: privateHeaders });
  }
  catch (error) { return driverFailure(error); }
}
