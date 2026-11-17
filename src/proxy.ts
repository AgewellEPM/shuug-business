import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { securityHeaders } from "@/lib/security/headers";
import { canAccessPath, sectionForPath } from "@/lib/permissions/model";
import { getMatrix } from "@/lib/permissions/store";
import { sessionIdentity, loginRequired } from "@/lib/auth/identity";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { setting } from "@/lib/connections/vault";
function secured(response: NextResponse) {
  for (const [k, v] of Object.entries(securityHeaders(process.env.NODE_ENV === "production"))) response.headers.set(k, v);
  response.headers.set("Cache-Control", "private, no-store"); return response;
}
export function proxy(req: NextRequest): NextResponse {
  const path = req.nextUrl.pathname, customer = "/api/website/customer", clientOnly = customer + "/client-only";
  if (path === customer || path.startsWith(customer + "/")) {
    const allowed = path === clientOnly || path.startsWith(clientOnly + "/")
      || path === customer + "/driver/health" && ["GET", "HEAD"].includes(req.method);
    if (process.env.GIGTAX_REQUIRE_CLIENT_ONLY === "true" && !allowed) return secured(NextResponse.json({ error: "Use the client-owned private workspace. Legacy customer routes are disabled." }, { status: 409 }));
    // These APIs establish their own client/owner bearer authorization. Adding
    // them to the matcher must not impose the ordinary dashboard cookie gate.
    return secured(NextResponse.next());
  }
  const user = sessionIdentity(req.cookies.get(SESSION_COOKIE)?.value);
  const secret = setting("WORKSPACE_ACCESS_TOKEN") || setting("PPC_WORKSPACE_ACCESS_TOKEN");
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const gateway = Boolean(secret && expected.length === supplied.length && timingSafeEqual(expected, supplied));
  let destination: string | null = null;
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
  return secured(response);
}
export const config = { matcher: ["/api/website/customer/:path*", "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.[\\w]+$).*)"] };
