import { requireWorkspacePortal, socialFailure } from "@/lib/auth/social/http";
import { issueOwnerSdrTicket } from "@/lib/auth/social/workspace-access";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureOptions, secureResponse } from "@/lib/secure-tax/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { secureOptions as OPTIONS };

export function POST(request: Request) {
  try {
    requireWorkspacePortal(request);
    return secureResponse(request, issueOwnerSdrTicket(staffApiToken(request, true)));
  } catch (error) { return socialFailure(request, error); }
}
