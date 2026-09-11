import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { securityHeaders } from "@/lib/security/headers";
import { canAccessPath, sectionForPath } from "@/lib/permissions/model";
import { getMatrix } from "@/lib/permissions/store";
import { sessionIdentity, loginRequired } from "@/lib/auth/identity";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { setting } from "@/lib/connections/vault";
export function proxy(req: NextRequest): NextResponse {
  const user = sessionIdentity(req.cookies.get(SESSION_COOKIE)?.value);
  const secret = setting("WORKSPACE_ACCESS_TOKEN") || setting("PPC_WORKSPACE_ACCESS_TOKEN");
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const gateway = Boolean(secret && expected.length === supplied.length && timingSafeEqual(expected, supplied));
  let destination: string | null = null;
  const path = req.nextUrl.pathname;
  // Public marketing + documentation site — served without authentication.
  const isPublic = ["/welcome", "/docs", "/tour", "/site"].some(p => path === p || path.startsWith(`${p}/`));
  if (isPublic) {
    // no gating
  } else if (loginRequired() && !user && !gateway) destination = "/api/auth/login";
  else if (user && !user.isOwner) {
    if (["/", "/today", "/calendar"].includes(path)) destination = "/me";
    else if (path === "/copilot" && req.nextUrl.searchParams.get("tab") !== "roadmap") destination = "/copilot?tab=roadmap";
    else if (sectionForPath(path) === "admin" || !canAccessPath(path, user.role, getMatrix())) destination = "/me";
  } else if (!canAccessPath(path, req.cookies.get("dd_active_role")?.value ?? "Owner", getMatrix())) destination = "/";
  const response = destination ? NextResponse.redirect(new URL(destination, req.url)) : NextResponse.next();
  for (const [k, v] of Object.entries(securityHeaders(process.env.NODE_ENV === "production"))) response.headers.set(k, v);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.[\\w]+$).*)"] };
