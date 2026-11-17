import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../../workspace/database";
import { SecureTaxError } from "../manifest";

export const CLIENT_ONLY_PATH = "/api/website/customer/client-only";
export function hasClientOnlyBinding(db: DatabaseSync, scope: { accountId?: string | null; clientId?: string | null }) {
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='secure_tax_client_only_bindings'").get()) return false;
  return !!db.prepare("SELECT 1 FROM secure_tax_client_only_bindings WHERE accountId=? OR clientId=?").get(scope.accountId ?? null, scope.clientId ?? null);
}
export function assertLegacyAccountAllowed(db: DatabaseSync, scope: { accountId?: string | null; clientId?: string | null }) {
  if (hasClientOnlyBinding(db, scope)) throw new SecureTaxError(409, "This account uses client-owned encryption. Legacy firm access, recovery and enrollment are unavailable.");
}
export function assertLegacyRouteAllowed(request: Request) {
  const path = new URL(request.url).pathname, legacy = "/api/website/customer/secure";
  if (process.env.GIGTAX_REQUIRE_CLIENT_ONLY === "true" && (path === legacy || path.startsWith(legacy + "/"))) throw new SecureTaxError(409, "Update to the client-owned private workspace. Legacy private routes are disabled.");
}
/** Authentication does not authorize changing the immutable encryption profile. */
export function assertSessionProfile(request: Request, input: { accountCode?: string; challengeToken?: string }) {
  assertLegacyRouteAllowed(request);
  const path = new URL(request.url).pathname, clientOnly = path === CLIENT_ONLY_PATH || path.startsWith(CLIENT_ONLY_PATH + "/");
  workspaceDatabase(db => {
    let accountId = input.accountCode;
    if (!accountId && input.challengeToken && db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='mfa_challenges'").get()) {
      const row = db.prepare("SELECT id FROM mfa_challenges WHERE token_hash=? AND kind='secure-customer'").get(createHash("sha256").update(input.challengeToken).digest("hex")) as { id: string } | undefined;
      accountId = row?.id;
    }
    if (clientOnly) {
      if (!accountId || !hasClientOnlyBinding(db, { accountId })) throw new SecureTaxError(409, "Activate the client-owned account before signing in through this namespace.");
    } else if (accountId) assertLegacyAccountAllowed(db, { accountId });
  });
}
