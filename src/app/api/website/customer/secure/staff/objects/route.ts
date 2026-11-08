import { listStaffChanges } from "@/lib/secure-tax/staff-store";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    return secureResponse(request, listStaffChanges(staffApiToken(request), query.get("grantId") ?? "", Number(query.get("after") ?? 0), Number(query.get("limit") ?? 100)));
  } catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
