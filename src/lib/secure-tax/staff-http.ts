import { workspaceDatabase } from "../workspace/database";
import { SecureTaxError } from "./manifest";
import { secureStaffIdentity, secureStaffToken } from "./staff-session";
/** Validate owner authority before reading a public grant/capsule upload. The
 * store repeats its checks inside the mutation transaction. */
export function staffApiToken(request: Request, owner = false) {
  const token = secureStaffToken(request);
  workspaceDatabase(db => {
    const { user } = secureStaffIdentity(db, token);
    if (owner && !user.isOwner) throw new SecureTaxError(403, "Only the verified owner can manage encrypted read assignments.");
  });
  return token;
}
