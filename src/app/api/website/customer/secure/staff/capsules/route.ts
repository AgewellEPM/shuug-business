import { publishStaffCapsule } from "@/lib/secure-tax/staff-store";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureJson, secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { const token = staffApiToken(request, true); return secureResponse(request, publishStaffCapsule(token, await secureJson(request, 16384))); }
  catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
