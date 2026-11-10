import { readStaffScope } from "@/lib/secure-tax/staff-store";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
import { SecureTaxError } from "@/lib/secure-tax/manifest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const token = staffApiToken(request), query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => query.getAll(key).length !== 1)) throw new SecureTaxError(400, "Choose one value per scope parameter.");
    return secureResponse(request, readStaffScope(token, Object.fromEntries(query)));
  } catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
