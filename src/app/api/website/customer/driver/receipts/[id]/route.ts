import { workspaceDatabase } from "@/lib/workspace/database";
import { driverAccount } from "@/lib/rideshare-driver/policy";
import { boundedBytes, checkDriverOrigin, driverFailure, driverToken, privateHeaders } from "@/lib/rideshare-driver/http";
import { driverReceipt, saveDriverReceipt, receiptResponse, MAX_RECEIPT_BYTES } from "@/lib/rideshare-driver/receipts";
import { assertPlaintextTaxAllowed } from "@/lib/secure-tax/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try { checkDriverOrigin(request); const token = driverToken(request); workspaceDatabase(db => { const account = driverAccount(db, token); assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); }); const id = (await context.params).id; return Response.json(saveDriverReceipt(token, id, await boundedBytes(request, MAX_RECEIPT_BYTES)), { headers: privateHeaders }); }
  catch (error) { return driverFailure(error); }
}
export async function GET(request: Request, context: Context) {
  try { checkDriverOrigin(request); return receiptResponse(driverReceipt(driverToken(request, true), (await context.params).id)); }
  catch (error) { return driverFailure(error); }
}
