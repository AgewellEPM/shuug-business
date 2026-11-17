import { requireWorkspacePortal, socialFailure } from "@/lib/auth/social/http";
import { listWorkspaceAssignments, manageWorkspaceAssignment } from "@/lib/auth/social/workspace-access";
import { staffApiToken } from "@/lib/secure-tax/staff-http";
import { secureJson, secureOptions, secureResponse } from "@/lib/secure-tax/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { secureOptions as OPTIONS };

export function GET(request: Request) {
  try {
    requireWorkspacePortal(request);
    return secureResponse(request, listWorkspaceAssignments(staffApiToken(request, true)));
  } catch (error) { return socialFailure(request, error); }
}
export async function POST(request: Request) {
  try {
    requireWorkspacePortal(request);
    const token = staffApiToken(request, true);
    return secureResponse(request, manageWorkspaceAssignment(token, await secureJson(request, 2048)));
  } catch (error) { return socialFailure(request, error); }
}
