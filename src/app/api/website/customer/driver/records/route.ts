import { readDriverRecords, saveDriverRecord } from "@/lib/rideshare-driver/store";
import { driverFailure, driverJson, driverToken, checkDriverOrigin, privateHeaders } from "@/lib/rideshare-driver/http";
import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount } from "@/lib/rideshare-driver/policy";
import { assertPlaintextTaxAllowed } from "@/lib/secure-tax/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { checkDriverOrigin(request); const url = new URL(request.url); return Response.json(readDriverRecords(driverToken(request), Number(url.searchParams.get("after") ?? 0), Number(url.searchParams.get("limit") ?? 200)), { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
export async function POST(request: Request) {
  try {
    checkDriverOrigin(request);
    const token = driverToken(request);
    workspaceDatabase(db => { const account = driverAccount(db, token); assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); });
    const body = await driverJson(request);
    return Response.json(saveDriverRecord(token, body), { headers: privateHeaders });
  }
  catch (error) { return driverFailure(error); }
}
