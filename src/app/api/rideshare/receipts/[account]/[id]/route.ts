import { requireSectionAccess } from "@/lib/permissions/guard";
import { driverAvailable } from "@/lib/rideshare-driver/policy";
import { staffDriverReceipt, receiptResponse } from "@/lib/rideshare-driver/receipts";
import { privateHeaders } from "@/lib/rideshare-driver/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ account: string; id: string }> }) {
  try { await requireSectionAccess("money", "view"); if (!driverAvailable()) throw new Error("Unavailable"); const { account, id } = await context.params; return receiptResponse(staffDriverReceipt(account, id)); }
  catch { return new Response("Receipt unavailable.", { status: 404, headers: privateHeaders }); }
}
