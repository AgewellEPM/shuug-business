import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { secureAccount } from "./account-scope";
import { canonicalManifest, secureTaxEnvelope, secureTaxId, type SignedRecipientManifest } from "./envelope";
import { SecureTaxError, verifyRecipientManifest, validateEnvelopePins } from "./manifest";
import { trustedPublicPins } from "./manifest";
import { secureTaxRequired } from "./policy";
import { legacySecureTaxData } from "./legacy";
import { CASE_OBJECT_PREFIX } from "../../../packages/secure-tax-client/case-contract.mjs";

const ACCOUNT_CIPHERTEXT_BYTES = 512 * 1024 * 1024, WORKSPACE_CIPHERTEXT_BYTES = 2 * 1024 * 1024 * 1024;
// The final live envelope remains deletable. A content-free tombstone can use
// one additional revision and can never be replaced by a valid encrypted write.
const MAX_ENCRYPTED_REVISION = 1_000_000_000;
const mutationInput = z.object({ mutationId: secureTaxId, expectedRevision: z.number().int().min(0).max(999_999_999), envelope: secureTaxEnvelope }).strict();
export const deletionInput = z.object({ expectedRevision: z.number().int().min(1).max(MAX_ENCRYPTED_REVISION + 1) }).strict();
type Enrollment = { accountId: string; clientId: string; workspaceId: string; manifestId: string; epoch: number; clientRecipientId: string; firmRecipientId: string; manifest: string; enrolledAt: string; status: string };
type ObjectRow = { accountId: string; id: string; clientId: string; revision: number; sequence: number; deleted: number; body: string | null; ciphertextBytes: number };
type Mutation = { objectId: string; requestDigest: string; revision: number; sequence: number };
function init(db: DatabaseSync) {
  db.exec(`PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS secure_tax_enrollments (
      accountId TEXT PRIMARY KEY,clientId TEXT NOT NULL,workspaceId TEXT NOT NULL,manifestId TEXT NOT NULL,epoch INTEGER NOT NULL,
      clientRecipientId TEXT NOT NULL,firmRecipientId TEXT NOT NULL,manifest TEXT NOT NULL,enrolledAt TEXT NOT NULL,status TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS secure_tax_enrollments_client ON secure_tax_enrollments(clientId,status);
    CREATE TABLE IF NOT EXISTS secure_tax_objects (
      accountId TEXT NOT NULL,id TEXT NOT NULL,clientId TEXT NOT NULL,revision INTEGER NOT NULL,sequence INTEGER NOT NULL,
      deleted INTEGER NOT NULL CHECK(deleted IN(0,1)),body TEXT,ciphertextBytes INTEGER NOT NULL,
      PRIMARY KEY(accountId,id),UNIQUE(accountId,sequence),CHECK((deleted=0 AND body IS NOT NULL) OR (deleted=1 AND body IS NULL AND ciphertextBytes=0)));
    CREATE TABLE IF NOT EXISTS secure_tax_clock (accountId TEXT PRIMARY KEY,sequence INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_mutations (
      accountId TEXT NOT NULL,id TEXT NOT NULL,objectId TEXT NOT NULL,requestDigest TEXT NOT NULL,revision INTEGER NOT NULL,sequence INTEGER NOT NULL,
      PRIMARY KEY(accountId,id));
    CREATE INDEX IF NOT EXISTS secure_tax_mutations_object ON secure_tax_mutations(accountId,objectId);`);
}
export function secureTaxEnrollment(db: DatabaseSync, accountId: string) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='secure_tax_enrollments'").get()) return null;
  return db.prepare("SELECT * FROM secure_tax_enrollments WHERE accountId=? AND status='active'").get(accountId) as Enrollment | undefined ?? null;
}
function scoped(db: DatabaseSync, token: string | undefined) {
  const account = secureAccount(db, token); init(db);
  const enrollment = secureTaxEnrollment(db, account.id);
  if (!enrollment || enrollment.clientId !== account.clientId) throw new SecureTaxError(409, "Enroll this client account with a trusted signed key manifest before using encrypted storage.");
  const manifest = verifyRecipientManifest(JSON.parse(enrollment.manifest), account);
  if (manifest.manifestId !== enrollment.manifestId || manifest.epoch !== enrollment.epoch || manifest.workspaceId !== enrollment.workspaceId || manifest.client.keyId !== enrollment.clientRecipientId || manifest.firmRecovery.keyId !== enrollment.firmRecipientId) throw new SecureTaxError(409, "The trusted key enrollment needs review.");
  return { account, manifest };
}
function nextSequence(db: DatabaseSync, accountId: string) {
  db.prepare("INSERT OR IGNORE INTO secure_tax_clock VALUES(?,0)").run(accountId);
  db.prepare("UPDATE secure_tax_clock SET sequence=sequence+1 WHERE accountId=?").run(accountId);
  return Number((db.prepare("SELECT sequence FROM secure_tax_clock WHERE accountId=?").get(accountId) as { sequence: number }).sequence);
}
const receipt = (row: Pick<ObjectRow, "id" | "revision" | "sequence" | "deleted">) => ({ objectId: row.id, revision: row.revision, sequence: row.sequence, deleted: row.deleted === 1 });

/** Transaction primitive used only after authenticated or invitation authority. */
export function enrollSecureTaxAccount(db:DatabaseSync,account:{id:string;clientId:string},raw:unknown){
    const manifest=verifyRecipientManifest(raw,account);init(db);
    const previous = secureTaxEnrollment(db, account.id);
    if (previous && previous.clientId !== account.clientId) throw new SecureTaxError(409, "The secure client's business link changed. Ask the firm to review key enrollment.");
    if (previous && previous.workspaceId !== manifest.workspaceId) throw new SecureTaxError(409, "This account already belongs to another encrypted workspace. A trusted migration is required.");
    if (previous && manifest.epoch < previous.epoch) throw new SecureTaxError(409, "An older key manifest cannot replace the current enrollment.");
    if (previous && manifest.epoch === previous.epoch && canonicalManifest(JSON.parse(previous.manifest) as SignedRecipientManifest) !== canonicalManifest(manifest)) throw new SecureTaxError(409, "A changed key manifest must use a higher epoch.");
    if (previous && (manifest.client.keyId !== previous.clientRecipientId || manifest.firmRecovery.keyId !== previous.firmRecipientId)
      && db.prepare("SELECT 1 FROM secure_tax_objects WHERE accountId=? AND deleted=0 LIMIT 1").get(account.id)) {
      throw new SecureTaxError(409, "Recipient key rotation requires a verified rewrap or migration of existing encrypted objects. Keep the current keys while live objects remain.");
    }
    if (!previous || manifest.epoch > previous.epoch) {
      db.prepare(`INSERT INTO secure_tax_enrollments VALUES(?,?,?,?,?,?,?,?,?,'active')
        ON CONFLICT(accountId) DO UPDATE SET manifestId=excluded.manifestId,epoch=excluded.epoch,
        clientRecipientId=excluded.clientRecipientId,firmRecipientId=excluded.firmRecipientId,manifest=excluded.manifest,status='active'`)
        .run(account.id, account.clientId, manifest.workspaceId, manifest.manifestId, manifest.epoch, manifest.client.keyId, manifest.firmRecovery.keyId, JSON.stringify(manifest), new Date().toISOString());
    }
    return { enrolled: true, identity: { accountId: account.id, clientId: account.clientId }, manifest, ...legacySecureTaxData(db, account) };
}
export function enrollSecureTax(token:string|undefined,raw:unknown){
  return workspaceDatabase(db=>{
    const account=secureAccount(db,token),manifest=verifyRecipientManifest(raw,account);
    if(!secureTaxEnrollment(db,account.id)&&legacySecureTaxData(db,account).legacyMigrationRequired)throw new SecureTaxError(409,"Existing plaintext accounts require verified migration before first encrypted enrollment.");
    return enrollSecureTaxAccount(db,account,manifest);
  },true);
}
export function secureTaxStatus(token: string | undefined) {
  return workspaceDatabase(db => {
    const account = secureAccount(db, token); init(db);
    const required = secureTaxRequired({ accountId: account.id, clientId: account.clientId }, db);
    const enrollment = secureTaxEnrollment(db, account.id);
    if (!enrollment) {
      let keyProvisioningEnabled = false;
      try { trustedPublicPins(); keyProvisioningEnabled = true; } catch { /* No enrollment or private-key fallback is created. */ }
      return { enrolled: false, identity: { accountId: account.id, clientId: account.clientId }, secureRequired: required, keyProvisioningEnabled, ...legacySecureTaxData(db, account) };
    }
    const { manifest } = scoped(db, token);
    return { enrolled: true, identity: { accountId: account.id, clientId: account.clientId }, secureRequired: true, keyProvisioningEnabled: true, manifest, ...legacySecureTaxData(db, account) };
  });
}
export function writeSecureTaxObject(token: string | undefined, rawId: string, raw: unknown) {
  const id = secureTaxId.parse(rawId), input = mutationInput.parse(raw);
  return workspaceDatabase(db => {
    const { account, manifest } = scoped(db, token);
    return commitSecureTaxEnvelope(db, account, manifest, id, input);
  }, true);
}
/** Internal transaction primitive. Callers establish live account/owner authority
 * and signed enrollment before reaching this shared CAS/capacity boundary. */
export function commitSecureTaxEnvelope(db: DatabaseSync, account: { id: string; clientId: string }, manifest: SignedRecipientManifest, rawId: string, raw: unknown, options: { approvedCaseWrite?: boolean } = {}) {
    const id = secureTaxId.parse(rawId), input = mutationInput.parse(raw);
    const caseTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='secure_tax_case_objects'").get();
    if (!options.approvedCaseWrite && (id.startsWith(CASE_OBJECT_PREFIX) || caseTable && db.prepare("SELECT 1 FROM secure_tax_case_objects WHERE accountId=? AND id=?").get(account.id, id))) throw new SecureTaxError(403, "Firm-managed case records require a separately approved case transition.");
    const size = validateEnvelopePins(input.envelope, manifest);
    if (input.envelope.context.objectId !== id || input.envelope.context.revision !== input.expectedRevision + 1) throw new SecureTaxError(409, "The encrypted context does not match this object and revision.");
    const digest = createHash("sha256").update(JSON.stringify([id, input.expectedRevision, input.envelope])).digest("hex");
    const prior = db.prepare("SELECT objectId,requestDigest,revision,sequence FROM secure_tax_mutations WHERE accountId=? AND id=?").get(account.id, input.mutationId) as Mutation | undefined;
    if (prior) {
      if (prior.objectId !== id || prior.requestDigest !== digest) throw new SecureTaxError(409, "This encrypted mutation ID was already used for different content.");
      return { objectId: id, revision: prior.revision, sequence: prior.sequence, deleted: false, duplicate: true };
    }
    const current = db.prepare("SELECT * FROM secure_tax_objects WHERE accountId=? AND id=?").get(account.id, id) as ObjectRow | undefined;
    if (current && current.clientId !== account.clientId) throw new SecureTaxError(403, "This encrypted object belongs to another client link.");
    if ((current?.revision ?? 0) !== input.expectedRevision) throw new SecureTaxError(409, "The encrypted object changed on another device. Download the latest revision before saving.");
    if (current?.deleted) throw new SecureTaxError(409, "A deleted encrypted object cannot be restored under its old ID. Create a new item with a new ID.");
    const usage = db.prepare("SELECT count(*) AS n,coalesce(sum(ciphertextBytes),0) AS bytes FROM secure_tax_objects WHERE accountId=? AND deleted=0").get(account.id) as { n: number; bytes: number };
    const metadata = db.prepare("SELECT (SELECT count(*) FROM secure_tax_objects WHERE accountId=?) AS objects,(SELECT count(*) FROM secure_tax_mutations WHERE accountId=?) AS mutations").get(account.id, account.id) as { objects: number; mutations: number };
    const total = db.prepare("SELECT coalesce(sum(ciphertextBytes),0) AS bytes FROM secure_tax_objects WHERE deleted=0").get() as { bytes: number };
    const replaced = current?.ciphertextBytes ?? 0;
    if (((!current || current.deleted) && usage.n >= 10_000) || (!current && metadata.objects >= 100_000) || metadata.mutations >= 100_000 || usage.bytes - replaced + size > ACCOUNT_CIPHERTEXT_BYTES || total.bytes - replaced + size > WORKSPACE_CIPHERTEXT_BYTES) throw new SecureTaxError(413, "Encrypted storage capacity needs a review. Keep your local encrypted copy.");
    const sequence = nextSequence(db, account.id), revision = input.envelope.context.revision;
    db.prepare(`INSERT INTO secure_tax_objects VALUES(?,?,?,?,?,0,?,?) ON CONFLICT(accountId,id)
      DO UPDATE SET revision=excluded.revision,sequence=excluded.sequence,deleted=0,body=excluded.body,ciphertextBytes=excluded.ciphertextBytes`)
      .run(account.id, id, account.clientId, revision, sequence, JSON.stringify(input.envelope), size);
    db.prepare("INSERT INTO secure_tax_mutations VALUES(?,?,?,?,?,?)").run(account.id, input.mutationId, id, digest, revision, sequence);
    return { objectId: id, revision, sequence, deleted: false, duplicate: false };
}
export function readSecureTaxObject(token: string | undefined, rawId: string) {
  const id = secureTaxId.parse(rawId);
  return workspaceDatabase(db => {
    const { account } = scoped(db, token);
    const row = db.prepare("SELECT * FROM secure_tax_objects WHERE accountId=? AND clientId=? AND id=?").get(account.id, account.clientId, id) as ObjectRow | undefined;
    if (!row) throw new SecureTaxError(404, "Encrypted object unavailable.");
    if (row.deleted) return receipt(row);
    return { ...receipt(row), envelope: JSON.parse(row.body!) };
  });
}
export function listSecureTaxChanges(token: string | undefined, after = 0, limit = 100) {
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new SecureTaxError(400, "Choose a valid encrypted sync cursor and page size.");
  return workspaceDatabase(db => {
    const { account } = scoped(db, token);
    const rows = db.prepare("SELECT id,revision,sequence,deleted FROM secure_tax_objects WHERE accountId=? AND clientId=? AND sequence>? ORDER BY sequence LIMIT ?").all(account.id, account.clientId, after, limit + 1) as unknown as Pick<ObjectRow, "id" | "revision" | "sequence" | "deleted">[];
    const changes = rows.slice(0, limit);
    return { changes: changes.map(receipt), cursor: changes.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
  });
}
export function deleteSecureTaxObject(token: string | undefined, rawId: string, raw: unknown) {
  const id = secureTaxId.parse(rawId), input = deletionInput.parse(raw);
  return workspaceDatabase(db => {
    const { account } = scoped(db, token);
    const row = db.prepare("SELECT * FROM secure_tax_objects WHERE accountId=? AND clientId=? AND id=?").get(account.id, account.clientId, id) as ObjectRow | undefined;
    if (!row) throw new SecureTaxError(404, "Encrypted object unavailable.");
    const caseTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='secure_tax_case_objects'").get();
    if (id.startsWith(CASE_OBJECT_PREFIX) || caseTable && db.prepare("SELECT 1 FROM secure_tax_case_objects WHERE accountId=? AND id=?").get(account.id, id)) throw new SecureTaxError(403, "Firm-managed case history cannot be deleted through ordinary client object controls.");
    if (row.deleted && [row.revision, row.revision - 1].includes(input.expectedRevision)) return { ...receipt(row), liveCiphertextPurged: true, backupRetention: "Existing backups or filesystem history may retain older ciphertext; this operation does not erase those copies." };
    if (row.revision !== input.expectedRevision || row.revision > MAX_ENCRYPTED_REVISION) throw new SecureTaxError(409, "The encrypted object changed. Refresh before deleting.");
    const revision = row.revision + 1, sequence = nextSequence(db, account.id);
    // Keep only an owner-scoped, content-free tombstone. No cached response
    // retains an envelope or permits an old create retry to restore this object.
    db.prepare("DELETE FROM secure_tax_mutations WHERE accountId=? AND objectId=?").run(account.id, id);
    db.prepare("UPDATE secure_tax_objects SET revision=?,sequence=?,deleted=1,body=NULL,ciphertextBytes=0 WHERE accountId=? AND id=?").run(revision, sequence, account.id, id);
    return { objectId: id, revision, sequence, deleted: true, liveCiphertextPurged: true, backupRetention: "Existing backups or filesystem history may retain older ciphertext; this operation does not erase those copies." };
  }, true);
}
