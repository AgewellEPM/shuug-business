import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { DriverError } from "../rideshare-driver/model";

export type SecureTaxScope = { accountId?: string | null; clientId?: string | null };
export const SECURE_TAX_REQUIRED_MESSAGE = "This client uses an offhost encrypted tax vault. Use the trusted client encryption path; plaintext tax uploads and host-side provider connections are disabled.";
export class SecureTaxRequiredError extends DriverError {
  constructor() { super(409, SECURE_TAX_REQUIRED_MESSAGE); this.name = "SecureTaxRequiredError"; }
}

/** Enrollment is explicit. Reading policy never creates an enrollment or stores a
 * key. A client's other linked accounts inherit the same no-plaintext boundary.
 * Expired/rotated public manifests do not disable this boundary. */
export function secureTaxRequired(scope: SecureTaxScope, database?: DatabaseSync): boolean {
  if (!scope.accountId && !scope.clientId) return false;
  const read = (db: DatabaseSync) => {
    if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='secure_tax_enrollments'").get()) return false;
    // A malformed existing policy schema must raise an error, never silently
    // opt an already-enrolled client back into legacy plaintext writes.
    return Boolean(db.prepare("SELECT 1 FROM secure_tax_enrollments WHERE status='active' AND (accountId=? OR clientId=?) LIMIT 1")
      .get(scope.accountId ?? null, scope.clientId ?? null));
  };
  return database ? read(database) : workspaceDatabase(read);
}

export function assertPlaintextTaxAllowed(scope: SecureTaxScope, database?: DatabaseSync): void {
  if (secureTaxRequired(scope, database)) throw new SecureTaxRequiredError();
}
