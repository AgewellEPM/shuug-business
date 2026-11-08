import { secureStaffStatus } from "@/lib/secure-tax/staff-session";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return secureResponse(request, secureStaffStatus(staffApiToken(request))); }
  catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
