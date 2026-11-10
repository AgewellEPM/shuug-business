import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkspaceUser } from "../auth/identity";
import { ownerIdentity } from "../auth/identity";
import { getMember } from "../team/store";
import { can } from "../permissions/model";
import { getMatrix, roleForMember } from "../permissions/store";
import { workspaceDatabase } from "../workspace/database";
import { secureTaxEnvelope, secureTaxId, type SecureTaxEnvelope, type SignedRecipientManifest } from "./envelope";
import { SecureTaxError, verifyRecipientManifest, validateEnvelopePins } from "./manifest";
import { secureStaffIdentity } from "./staff-session";
import { canonicalStaffGrant } from "../../../packages/secure-tax-client/staff-contract.mjs";
import { verifyStaffGrantDocument, verifyStaffCapsuleDocument, parseStaffCapsule, type StaffGrant, type StaffCapsule } from "./staff-model";
import { staffGrantDigest, staffEnvelopeDigest } from "./staff-model";
import { verifyReturnEditPacket } from "./return-edits";
import { commitSecureTaxEnvelope } from "./store";

type GrantRow = { grantId: string; accountId: string; clientId: string; staffAccountId: string; epoch: number; approved: number; deniedEpoch: number; body: string };
type ObjectRow = { accountId: string; id: string; clientId: string; revision: number; sequence: number; deleted: number; body: string | null };
const hasTable = (db: DatabaseSync, name: string) => !!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name);
function must(value: unknown, message: string, status = 403): asserts value { if (!value) throw new SecureTaxError(status, message); }
function init(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS secure_tax_staff_grants (
    grantId TEXT PRIMARY KEY,accountId TEXT NOT NULL,clientId TEXT NOT NULL,staffAccountId TEXT NOT NULL,
    epoch INTEGER NOT NULL,approved INTEGER NOT NULL CHECK(approved IN(0,1)),deniedEpoch INTEGER NOT NULL,
    body TEXT NOT NULL,approvedAt TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS secure_tax_staff_grants_staff ON secure_tax_staff_grants(staffAccountId);
    CREATE TABLE IF NOT EXISTS secure_tax_staff_capsules (
      grantId TEXT NOT NULL,objectId TEXT NOT NULL,capsuleId TEXT NOT NULL UNIQUE,body TEXT NOT NULL,
      PRIMARY KEY(grantId,objectId));`);
}
function roleAccess(user: WorkspaceUser, grant: StaffGrant) {
  const matrix = getMatrix();
  must(can(matrix, user.role, "services", "view"), "Your current role cannot read protected tax work.");
  if (grant.domains.some(domain => !["tax-document", "tax-identity"].includes(domain))) must(can(matrix, user.role, "money", "view"), "Your current role cannot read this financial collection.");
}
function targetStaff(db: DatabaseSync, id: string): WorkspaceUser {
  if (id === "workspace-owner") return ownerIdentity();
  must(hasTable(db, "employee_accounts"), "The staff account is unavailable.");
  const row = db.prepare("SELECT id,memberId,name,email FROM employee_accounts WHERE id=? AND status='active'").get(id) as { id: string; memberId: string; name: string; email: string } | undefined;
  must(row && getMember(row.memberId), "Choose a real active staff account.");
  const role = roleForMember(row.memberId);
  return { ...row, role: role === "Owner" ? "Employee" : role, isOwner: false };
}
function sourceScope(db: DatabaseSync, grant: StaffGrant): SignedRecipientManifest {
  must(hasTable(db, "customer_accounts") && hasTable(db, "secure_tax_enrollments"), "The encrypted client enrollment is unavailable.");
  const account = db.prepare("SELECT id,clientId FROM customer_accounts WHERE id=? AND status='active'").get(grant.accountId) as { id: string; clientId: string } | undefined;
  must(account && account.clientId === grant.clientId, "The encrypted account's client link changed or is unavailable.");
  const client = db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(grant.clientId) as { body: string } | undefined;
  must(client && !["archived", "inactive", "cancelled"].includes(JSON.parse(client.body).status), "The linked service client is unavailable.");
  const enrollment = db.prepare("SELECT * FROM secure_tax_enrollments WHERE accountId=? AND status='active'").get(grant.accountId) as { clientId: string; workspaceId: string; epoch: number; manifestId: string; clientRecipientId: string; firmRecipientId: string; manifest: string } | undefined;
  must(enrollment && enrollment.clientId === grant.clientId && enrollment.workspaceId === grant.workspaceId, "The signed grant belongs to another enrollment.");
  const manifest = verifyRecipientManifest(JSON.parse(enrollment.manifest), account);
  must(manifest.epoch === enrollment.epoch && manifest.manifestId === enrollment.manifestId
    && manifest.client.keyId === enrollment.clientRecipientId && manifest.firmRecovery.keyId === enrollment.firmRecipientId,
  "The encrypted enrollment needs review.");
  must(grant.staff.keyId !== manifest.client.keyId, "A staff device must use its own key rather than a client's private key.");
  return manifest;
}
function scopedGrant(db: DatabaseSync, id: string, user: WorkspaceUser) {
  const row = db.prepare("SELECT * FROM secure_tax_staff_grants WHERE grantId=?").get(secureTaxId.parse(id)) as GrantRow | undefined;
  must(row && row.staffAccountId === user.id, "This encrypted staff grant is unavailable.");
  const grant = verifyStaffGrantDocument(JSON.parse(row.body));
  must(grant.grantId === row.grantId && grant.accountId === row.accountId && grant.clientId === row.clientId
    && grant.staffAccountId === user.id && grant.epoch === row.epoch && grant.status === "active"
    && row.approved === 1 && row.deniedEpoch < row.epoch, "This encrypted read assignment expired or was revoked.");
  roleAccess(user, grant);
  const manifest = sourceScope(db, grant);
  return { grant, manifest };
}
function audit(db: DatabaseSync, user: WorkspaceUser, grant: StaffGrant, action: string) {
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)")
    .run(grant.grantId, user.id, action, new Date().toISOString(), JSON.stringify({ grantId: grant.grantId, epoch: grant.epoch, staffAccountId: grant.staffAccountId, accountId: grant.accountId, clientId: grant.clientId, status: grant.status }));
}
/** A valid offhost signature AND a current owner-MFA publication establish the
 * normal read assignment. No plaintext book must be created for encrypted clients. */
export function publishStaffGrant(token: string, raw: unknown) {
  const grant = verifyStaffGrantDocument(raw);
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token); must(user.isOwner, "Only the verified owner can approve encrypted read assignments.");
    const prior = db.prepare("SELECT * FROM secure_tax_staff_grants WHERE grantId=?").get(grant.grantId) as GrantRow | undefined;
    if (prior) {
      const old = verifyStaffGrantDocument(JSON.parse(prior.body), true);
      must([old.workspaceId, old.accountId, old.clientId, old.staffAccountId, old.staff.keyId, old.staff.publicKey].join("|")
        === [grant.workspaceId, grant.accountId, grant.clientId, grant.staffAccountId, grant.staff.keyId, grant.staff.publicKey].join("|"),
      "A grant ID cannot be reassigned to a different client, staff account or device.", 409);
      must(grant.epoch >= prior.epoch, "An older signed grant cannot replace the recorded epoch.", 409);
      if (grant.epoch === prior.epoch) {
        must(canonicalStaffGrant(old) === canonicalStaffGrant(grant), "Changed grant contents require a newer signed epoch.", 409);
        must(grant.status === "revoked" || (prior.approved === 1 && prior.deniedEpoch < grant.epoch), "Obtain a newer signed grant after an owner withdrawal.", 409);
        return { grant: old, approved: prior.approved === 1, duplicate: true };
      }
    } else must(Number((db.prepare("SELECT count(*) AS n FROM secure_tax_staff_grants").get() as { n: number }).n) < 10000, "Encrypted staff grant capacity needs review.", 413);
    if (grant.status === "active") { roleAccess(targetStaff(db, grant.staffAccountId), grant); sourceScope(db, grant); }
    const approved = grant.status === "active" ? 1 : 0, deniedEpoch = grant.status === "revoked" ? grant.epoch : prior?.deniedEpoch ?? 0;
    db.prepare("INSERT INTO secure_tax_staff_grants VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(grantId) DO UPDATE SET epoch=excluded.epoch,approved=excluded.approved,deniedEpoch=excluded.deniedEpoch,body=excluded.body,approvedAt=excluded.approvedAt")
      .run(grant.grantId, grant.accountId, grant.clientId, grant.staffAccountId, grant.epoch, approved, deniedEpoch, JSON.stringify(grant), new Date().toISOString());
    db.prepare("DELETE FROM secure_tax_staff_capsules WHERE grantId=?").run(grant.grantId);
    audit(db, user, grant, approved ? "secure-staff.assignment.approved" : "secure-staff.grant.revoked");
    return { grant, approved: approved === 1, duplicate: false };
  }, true);
}
export function withdrawStaffGrant(token: string, raw: unknown) {
  const input = z.object({ grantId: secureTaxId, expectedEpoch: z.number().int().positive().max(1e9) }).strict().parse(raw);
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token); must(user.isOwner, "Only the verified owner can withdraw encrypted read assignments.");
    const row = db.prepare("SELECT * FROM secure_tax_staff_grants WHERE grantId=?").get(input.grantId) as GrantRow | undefined;
    must(row && row.epoch === input.expectedEpoch, "The encrypted read assignment changed. Refresh before withdrawing it.", 409);
    db.prepare("UPDATE secure_tax_staff_grants SET approved=0,deniedEpoch=max(deniedEpoch,epoch) WHERE grantId=?").run(row.grantId);
    db.prepare("DELETE FROM secure_tax_staff_capsules WHERE grantId=?").run(row.grantId);
    audit(db, user, JSON.parse(row.body), "secure-staff.assignment.withdrawn");
    return { grantId: row.grantId, epoch: row.epoch, approved: false };
  }, true);
}
/** Owner MFA publishes one exact offhost-signed revision. The preparer's grant
 * remains read-only; no staff token is accepted as a client object writer. */
export function publishApprovedReturnEdit(token: string, raw: unknown) {
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token); must(user.isOwner, "Only the verified owner can publish a separately approved return correction.");
    const { approval, envelope, capsule: rawCapsule } = verifyReturnEditPacket(raw), { grant, manifest } = scopedGrant(db, approval.grantId, targetStaff(db, approval.staffAccountId));
    must(grant.workspaceId === approval.workspaceId && grant.accountId === approval.accountId && grant.clientId === approval.clientId
      && grant.epoch === approval.grantEpoch && grant.staff.keyId === approval.staffKeyId && staffGrantDigest(grant) === approval.grantDigest
      && grant.domains.includes("tax-document") && manifest.manifestId === approval.manifestId && manifest.epoch === approval.manifestEpoch,
    "The return correction's staff assignment or enrollment changed. Obtain a new reviewed approval.", 409);
    must(Date.parse(approval.issuedAt) >= Math.max(Date.parse(grant.issuedAt), Date.parse(manifest.issuedAt)) && Date.parse(approval.expiresAt) <= Math.min(Date.parse(grant.expiresAt), Date.parse(manifest.expiresAt)), "The return correction outlives its signed authorization.", 409);
    const current = sourceObject(db, grant, approval.objectId);
    must(!current.deleted, "A deleted encrypted return cannot be restored under its old ID.", 409);
    const previous = db.prepare("SELECT 1 FROM secure_tax_mutations WHERE accountId=? AND id=?").get(grant.accountId, approval.approvalId);
    if (!previous) {
      const original = originalEnvelope(current, manifest);
      must(original.context.domain === "tax-document" && current.revision === approval.sourceRevision && staffEnvelopeDigest(original) === approval.sourceEnvelopeDigest,
      "The encrypted return changed after review. Reopen and review the current revision.", 409);
    }
    const capsule = verifyStaffCapsuleDocument(rawCapsule, grant, manifest, envelope);
    const priorCapsule = db.prepare("SELECT grantId,objectId FROM secure_tax_staff_capsules WHERE capsuleId=?").get(capsule.capsuleId) as { grantId: string; objectId: string } | undefined;
    must(!priorCapsule || (priorCapsule.grantId === grant.grantId && priorCapsule.objectId === approval.objectId), "The signed sharing capsule ID is already used for another scope.", 409);
    const receipt = commitSecureTaxEnvelope(db, { id: grant.accountId, clientId: grant.clientId }, manifest, approval.objectId,
      { mutationId: approval.approvalId, expectedRevision: approval.sourceRevision, envelope });
    if (!receipt.duplicate) {
      db.prepare("INSERT INTO secure_tax_staff_capsules VALUES(?,?,?,?) ON CONFLICT(grantId,objectId) DO UPDATE SET capsuleId=excluded.capsuleId,body=excluded.body").run(grant.grantId, approval.objectId, capsule.capsuleId, JSON.stringify(capsule));
      db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(approval.objectId, user.id, "secure-tax.return-edit.approved", new Date().toISOString(), JSON.stringify({ approval, sharingCapsuleId: capsule.capsuleId }));
    }
    return { ...receipt, approvedBy: user.id, staffAccountId: grant.staffAccountId };
  }, true);
}
const grantPage = z.object({ limit: z.coerce.number().int().min(1).max(25).default(25), after: secureTaxId.optional(), snapshot: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export function listStaffGrants(token: string, rawPage?: unknown) {
  const page = rawPage === undefined ? null : grantPage.parse(rawPage);
  if (page?.after && !page.snapshot) throw new SecureTaxError(400, "A staff-list continuation requires its original snapshot.");
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token);
    const rows = db.prepare("SELECT * FROM secure_tax_staff_grants WHERE staffAccountId=? ORDER BY grantId").all(user.id) as GrantRow[];
    const snapshot = createHash("sha256").update(JSON.stringify([user.id, rows.map(row => [row.grantId, row.epoch, row.approved, row.deniedEpoch, row.body])])).digest("hex");
    if (page?.snapshot && page.snapshot !== snapshot) throw new SecureTaxError(409, "Staff access changed during pagination. Refresh the complete list.");
    if (page?.after && !rows.some(row => row.grantId === page.after)) throw new SecureTaxError(409, "The staff-list continuation is unavailable. Refresh the complete list.");
    const remaining = page ? rows.filter(row => !page.after || row.grantId > page.after) : rows;
    const selected = page ? remaining.slice(0, page.limit) : remaining;
    const grants: StaffGrant[] = [], revocations: StaffGrant[] = [];
    for (const row of selected) try {
      const document = verifyStaffGrantDocument(JSON.parse(row.body));
      if (document.status === "revoked") {
        // Expired signed revocation notices remain useful monotonic evidence.
        // An unsigned owner withdrawal never becomes a fabricated signed notice.
        if (document.grantId === row.grantId && document.epoch === row.epoch && document.staffAccountId === user.id
          && document.accountId === row.accountId && document.clientId === row.clientId) revocations.push(document);
      } else grants.push(scopedGrant(db, row.grantId, user).grant);
    } catch { /* A malformed or inaccessible record never grants access. */ }
    return page ? { grants, revocations, snapshot, nextCursor: remaining.length > selected.length ? selected.at(-1)!.grantId : null } : { grants, revocations };
  });
}
function sourceObject(db: DatabaseSync, grant: StaffGrant, objectId: string) {
  must(hasTable(db, "secure_tax_objects"), "The encrypted object is unavailable.", 404);
  const row = db.prepare("SELECT * FROM secure_tax_objects WHERE accountId=? AND clientId=? AND id=?").get(grant.accountId, grant.clientId, objectId) as ObjectRow | undefined;
  must(row, "The encrypted object is unavailable.", 404); return row;
}
function originalEnvelope(row: ObjectRow, manifest: SignedRecipientManifest) {
  const envelope = secureTaxEnvelope.parse(JSON.parse(row.body!)); validateEnvelopePins(envelope, manifest);
  must(envelope.context.objectId === row.id && envelope.context.revision === row.revision, "The stored encrypted object needs review.", 409);
  return envelope;
}
export function publishStaffCapsule(token: string, raw: unknown) {
  const capsule = parseStaffCapsule(raw);
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token); must(user.isOwner, "Only the verified owner can publish signed staff capsules.");
    const grantRow = db.prepare("SELECT staffAccountId FROM secure_tax_staff_grants WHERE grantId=?").get(capsule.grantId) as { staffAccountId: string } | undefined;
    must(grantRow, "Approve the signed encrypted read assignment first.", 409);
    const { grant, manifest } = scopedGrant(db, capsule.grantId, targetStaff(db, grantRow.staffAccountId));
    const row = sourceObject(db, grant, capsule.context.objectId); must(!row.deleted, "A deleted encrypted object cannot be shared.", 409);
    const verified = verifyStaffCapsuleDocument(capsule, grant, manifest, originalEnvelope(row, manifest));
    const collision = db.prepare("SELECT grantId,objectId FROM secure_tax_staff_capsules WHERE capsuleId=?").get(verified.capsuleId) as { grantId: string; objectId: string } | undefined;
    must(!collision || (collision.grantId === verified.grantId && collision.objectId === row.id), "This signed capsule ID belongs to another object.", 409);
    db.prepare("INSERT INTO secure_tax_staff_capsules VALUES(?,?,?,?) ON CONFLICT(grantId,objectId) DO UPDATE SET capsuleId=excluded.capsuleId,body=excluded.body")
      .run(grant.grantId, row.id, verified.capsuleId, JSON.stringify(verified));
    return { capsuleId: verified.capsuleId, grantId: grant.grantId, objectId: row.id, revision: row.revision, stored: true };
  }, true);
}
const receipt = (row: ObjectRow) => ({ objectId: row.id, revision: row.revision, sequence: row.sequence, deleted: !!row.deleted });
function storedCapsule(db: DatabaseSync, grant: StaffGrant, row: ObjectRow, manifest: SignedRecipientManifest, envelope: SecureTaxEnvelope): StaffCapsule | null {
  const stored = db.prepare("SELECT body FROM secure_tax_staff_capsules WHERE grantId=? AND objectId=?").get(grant.grantId, row.id) as { body: string } | undefined;
  if (!stored) return null;
  try { return verifyStaffCapsuleDocument(JSON.parse(stored.body), grant, manifest, envelope); } catch { return null; }
}
export function readStaffObject(token: string, grantId: string, rawId: string) {
  const id = secureTaxId.parse(rawId);
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token), { grant, manifest } = scopedGrant(db, grantId, user), row = sourceObject(db, grant, id);
    if (row.deleted) {
      must(db.prepare("SELECT 1 FROM secure_tax_staff_capsules WHERE grantId=? AND objectId=?").get(grant.grantId, id), "The encrypted object is unavailable.", 404);
      return receipt(row);
    }
    const envelope = originalEnvelope(row, manifest); must(grant.domains.includes(envelope.context.domain), "This collection is outside the signed staff grant.");
    const capsule = storedCapsule(db, grant, row, manifest, envelope);
    must(capsule, "This revision is waiting for a fresh offhost staff sharing capsule.", 409);
    return { ...receipt(row), envelope, manifest, capsule, grant };
  });
}
export function listStaffChanges(token: string, grantId: string, after = 0, limit = 100) {
  must(Number.isSafeInteger(after) && after >= 0 && Number.isInteger(limit) && limit > 0 && limit <= 200, "Choose a valid encrypted sync cursor and page size.", 400);
  return workspaceDatabase(db => {
    init(db); const { user } = secureStaffIdentity(db, token), { grant, manifest } = scopedGrant(db, grantId, user);
    if (!hasTable(db, "secure_tax_objects")) return { changes: [], cursor: after, hasMore: false };
    const rows = db.prepare("SELECT * FROM secure_tax_objects WHERE accountId=? AND clientId=? AND sequence>? ORDER BY sequence LIMIT ?").all(grant.accountId, grant.clientId, after, limit + 1) as ObjectRow[];
    const selected = rows.slice(0, limit), changes = selected.flatMap(row => {
      const old = db.prepare("SELECT body FROM secure_tax_staff_capsules WHERE grantId=? AND objectId=?").get(grant.grantId, row.id) as { body: string } | undefined;
      if (row.deleted) return old ? [{ ...receipt(row), available: false }] : [];
      const envelope = originalEnvelope(row, manifest);
      if (!grant.domains.includes(envelope.context.domain)) return old ? [{ ...receipt(row), deleted: true, available: false }] : [];
      return [{ ...receipt(row), available: !!storedCapsule(db, grant, row, manifest, envelope) }];
    });
    return { changes, cursor: selected.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
  });
}
