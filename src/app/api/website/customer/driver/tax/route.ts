import { clientTaxSummary } from "@/lib/customer-access/tax";
import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount } from "@/lib/rideshare-driver/policy";
import { checkDriverOrigin, driverFailure, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    checkDriverOrigin(request);
    const token = driverToken(request), account = workspaceDatabase(db => driverAccount(db, token));
    const tax = clientTaxSummary(account.clientId, token);
    workspaceDatabase(db => driverAccount(db, token));
    return Response.json({ apiVersion: 1, tax }, { headers: privateHeaders });
  } catch (error) { return driverFailure(error); }
}
