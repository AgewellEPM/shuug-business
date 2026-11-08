import { listStaffGrants, publishStaffGrant, withdrawStaffGrant } from "@/lib/secure-tax/staff-store";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureJson, secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return secureResponse(request, listStaffGrants(staffApiToken(request))); }
  catch (error) { return secureFailure(request, error); }
}
export async function POST(request: Request) {
  try { const token = staffApiToken(request, true); return secureResponse(request, publishStaffGrant(token, await secureJson(request, 16384))); }
  catch (error) { return secureFailure(request, error); }
}
export async function DELETE(request: Request) {
  try { const token = staffApiToken(request, true); return secureResponse(request, withdrawStaffGrant(token, await secureJson(request, 1024))); }
  catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
