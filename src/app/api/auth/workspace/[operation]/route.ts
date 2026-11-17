import { claimSocialResult, startWorkspaceSignIn } from "@/lib/auth/social/store";
import { requireWorkspacePortal, socialFailure, socialJson, socialOptions, socialResponse, workspacePortalOrigin } from "@/lib/auth/social/http";
import { workspaceRoleSession } from "@/lib/auth/social/workspace-access";
import { acceptWorkspacePasswordInvitation, signInWorkspacePassword } from "@/lib/auth/social/workspace-password";
import { SocialSignInError } from "@/lib/auth/social/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { socialOptions as OPTIONS };

export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const { operation } = await context.params;
    if (operation === "session") {
      workspacePortalOrigin();
      if (["origin", "sec-fetch-site", "cookie"].some(header => request.headers.has(header))) throw new SocialSignInError("Continue from your assigned workspace.", 403);
      return socialResponse(request, workspaceRoleSession(await socialJson(request)));
    }
    requireWorkspacePortal(request);
    if (operation === "start") return socialResponse(request, startWorkspaceSignIn(await socialJson(request)));
    if (operation === "result") return socialResponse(request, claimSocialResult(await socialJson(request), undefined, true));
    if (operation === "password") return socialResponse(request, signInWorkspacePassword(await socialJson(request)));
    if (operation === "set-password") return socialResponse(request, acceptWorkspacePasswordInvitation(await socialJson(request)));
    throw new SocialSignInError("Sign-in operation unavailable.", 404);
  } catch (error) { return socialFailure(request, error); }
}
