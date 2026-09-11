import { appBaseUrl } from "@/lib/connections/vault";
/**
 * QuickBooks OAuth callback. Verifies the CSRF state, exchanges the code +
 * realmId for tokens, stores them, and returns to the settings screen.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeQboCode } from "@/lib/integrations/quickbooks";

function settingsUrl(query: string): URL {
  const base = appBaseUrl();
  return new URL(`/settings?${query}`, base);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get("qbo_oauth_state")?.value;
  jar.delete("qbo_oauth_state");

  if (!code || !realmId) {
    return NextResponse.redirect(settingsUrl("error=qbo_missing_params"));
  }
  if (!state || state !== expectedState) {
    return NextResponse.redirect(settingsUrl("error=qbo_state_mismatch"));
  }

  try {
    await exchangeQboCode(code, realmId);
    return NextResponse.redirect(settingsUrl("connected=quickbooks"));
  } catch {
    const message = "qbo_exchange_failed";
    return NextResponse.redirect(settingsUrl(`error=${encodeURIComponent(message)}`));
  }
}
