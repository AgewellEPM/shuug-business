import { bindWorkspaceEmail } from "@/lib/auth/social/workspace-password";
import { requireWorkspacePortal, socialFailure, socialJson, socialOptions, socialResponse } from "@/lib/auth/social/http";
import { SocialSignInError } from "@/lib/auth/social/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { socialOptions as OPTIONS };

export async function POST(request: Request) {
  try {
    requireWorkspacePortal(request);
    const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) throw new SocialSignInError("Sign in and verify your authenticator first.", 401);
    return socialResponse(request, bindWorkspaceEmail(token, await socialJson(request)));
  } catch (error) { return socialFailure(request, error); }
}
