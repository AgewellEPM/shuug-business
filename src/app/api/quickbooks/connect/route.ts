import { appBaseUrl } from "@/lib/connections/vault";
import { requireOwnerAccess } from "@/lib/auth/identity";
/**
 * Start the QuickBooks OAuth flow: set a CSRF state cookie and redirect the
 * browser to Intuit's consent screen.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { quickBooksAuthorizeUrl } from "@/lib/integrations/quickbooks";
import { getQuickBooksConfig } from "@/lib/integrations/config";

export async function GET() {
  try { await requireOwnerAccess(); } catch { return new NextResponse("Owner access required", { status: 403 }); }
  if (!getQuickBooksConfig()) {
    return NextResponse.redirect(new URL("/settings?error=qbo_not_configured", baseUrl()));
  }
  const state = randomUUID();
  const jar = await cookies();
  jar.set("qbo_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appBaseUrl().startsWith("https:"),
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(quickBooksAuthorizeUrl(state));
}

function baseUrl(): string {
  return appBaseUrl();
}
