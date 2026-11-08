import { readStaffObject } from "@/lib/secure-tax/staff-store";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureResponse, secureFailure, secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return secureResponse(request, readStaffObject(staffApiToken(request), new URL(request.url).searchParams.get("grantId") ?? "", (await context.params).id)); }
  catch (error) { return secureFailure(request, error); }
}
export const OPTIONS = secureOptions;
