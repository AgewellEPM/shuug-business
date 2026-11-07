import { z } from "zod";
import { getBranding } from "../branding/store";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount } from "../rideshare-driver/policy";
import type { CustomerAccount } from "./accounts";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";

const profileInput = z.object({ name: z.string().trim().min(1).max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use a display name without control characters.") }).strict();
function project(account: CustomerAccount) {
  const branding = getBranding();
  return { apiVersion: 1, account: { id: account.id, name: account.name, email: account.email },
    branding: { name: branding.businessName, primaryColor: branding.primaryColor, accentColor: branding.accentColor } };
}
/** A client can change only their own display name. Identity and business links
 * stay under the firm's existing account administration. */
export function readDriverProfile(token: string | undefined) {
  return workspaceDatabase(db => { const account = driverAccount(db, token); assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db); return project(account); });
}
export function updateDriverProfile(token: string | undefined, raw: unknown) {
  const input = profileInput.parse(raw);
  return workspaceDatabase(db => {
    const account = driverAccount(db, token);
    assertPlaintextTaxAllowed({ accountId: account.id, clientId: account.clientId }, db);
    db.prepare("UPDATE customer_accounts SET name=? WHERE id=?").run(input.name, account.id);
    return project({ ...account, name: input.name });
  }, true);
}
