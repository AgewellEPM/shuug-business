import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../../workspace/database";
import { driverAvailable } from "../../rideshare-driver/policy";
import { privateAccountTable, privateTaxSession } from "../private-accounts";
import { legacySecureTaxData } from "../legacy";
import { SecureTaxError } from "../manifest";
import { secureTaxId } from "../envelope";
import { PROFILE, clientOnlyEnvelope, canonicalClientOnlyManifest, verifyClientOnlyManifest, validateClientOnlyEnvelope, type ClientOnlyManifest } from "./model";

type Account = { id: string; clientId: string };
type Binding = { accountId: string; clientId: string; workspaceId: string; profile: string; clientKeyId: string; clientPublicKey: string };
type ObjectRow = { accountId: string; id: string; revision: number; sequence: number; deleted: number; body: string | null; ciphertextBytes: number };
const mutationInput = z.object({ mutationId: secureTaxId, expectedRevision: z.number().int().min(0).max(999999999), envelope: clientOnlyEnvelope }).strict();
export function initClientOnly(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS secure_tax_client_only_bindings(accountId TEXT PRIMARY KEY,clientId TEXT NOT NULL UNIQUE,workspaceId TEXT NOT NULL,profile TEXT NOT NULL CHECK(profile='client-only-v1'),clientKeyId TEXT NOT NULL,clientPublicKey TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS client_only_binding_immutable_update BEFORE UPDATE ON secure_tax_client_only_bindings BEGIN SELECT RAISE(ABORT,'Client-owned key and profile anchors are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS client_only_binding_immutable_delete BEFORE DELETE ON secure_tax_client_only_bindings BEGIN SELECT RAISE(ABORT,'Client-owned key and profile anchors are permanent'); END;
    CREATE TABLE IF NOT EXISTS secure_tax_client_only_enrollments(accountId TEXT PRIMARY KEY,epoch INTEGER NOT NULL,manifest TEXT NOT NULL,enrolledAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_client_only_objects(accountId TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,sequence INTEGER NOT NULL,deleted INTEGER NOT NULL CHECK(deleted IN(0,1)),body TEXT,ciphertextBytes INTEGER NOT NULL,PRIMARY KEY(accountId,id),UNIQUE(accountId,sequence),CHECK((deleted=0 AND body IS NOT NULL) OR (deleted=1 AND body IS NULL AND ciphertextBytes=0)));
    CREATE TABLE IF NOT EXISTS secure_tax_client_only_clock(accountId TEXT PRIMARY KEY,sequence INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_client_only_mutations(accountId TEXT NOT NULL,id TEXT NOT NULL,objectId TEXT NOT NULL,requestDigest TEXT NOT NULL,revision INTEGER NOT NULL,sequence INTEGER NOT NULL,PRIMARY KEY(accountId,id));`);
}
export function clientOnlyAccount(db: DatabaseSync, token: string | undefined) {
  if (!driverAvailable(db)) throw new SecureTaxError(404, "Client access is not enabled.");
  const account = privateTaxSession(db, token);
  if (!account) throw new SecureTaxError(401, "Sign in with your private account and authenticator.");
  initClientOnly(db);
  const binding = db.prepare("SELECT * FROM secure_tax_client_only_bindings WHERE accountId=?").get(account.id) as Binding | undefined;
  if (!binding || binding.clientId !== account.clientId || binding.profile !== PROFILE) throw new SecureTaxError(409, "This account is not activated for client-owned encryption.");
  return { account: { id: account.id, clientId: account.clientId }, binding };
}
function matchesBinding(m: ClientOnlyManifest, binding: Binding) {
  if (m.profile !== binding.profile || m.accountId !== binding.accountId || m.clientId !== binding.clientId || m.workspaceId !== binding.workspaceId
    || m.client.keyId !== binding.clientKeyId || m.client.publicKey !== binding.clientPublicKey) throw new SecureTaxError(409, "The immutable client-owned key and profile cannot be replaced, even when the account has no records.");
}
export function currentClientOnlyManifest(db: DatabaseSync, account: Account, historical = false) {
  const binding = db.prepare("SELECT * FROM secure_tax_client_only_bindings WHERE accountId=?").get(account.id) as Binding | undefined;
  const row = db.prepare("SELECT * FROM secure_tax_client_only_enrollments WHERE accountId=?").get(account.id) as { epoch: number; manifest: string } | undefined;
  if (!binding || !row) throw new SecureTaxError(409, "The client-owned enrollment is unavailable.");
  const m = verifyClientOnlyManifest(JSON.parse(row.manifest), account, historical); matchesBinding(m, binding);
  if (m.epoch !== row.epoch) throw new SecureTaxError(409, "The stored client-owned epoch needs review.");
  return m;
}
/** Activation only, inside the same transaction as account creation and first ciphertext. */
export function establishClientOnlyBinding(db: DatabaseSync, account: Account, raw: unknown) {
  initClientOnly(db); const m = verifyClientOnlyManifest(raw, account);
  if (db.prepare("SELECT 1 FROM secure_tax_client_only_bindings WHERE accountId=? OR clientId=?").get(account.id, account.clientId)) throw new SecureTaxError(409, "A permanent client-owned binding already exists.");
  if (privateAccountTable(db, "secure_tax_enrollments") && db.prepare("SELECT 1 FROM secure_tax_enrollments WHERE accountId=? OR clientId=?").get(account.id, account.clientId)
    || legacySecureTaxData(db, account).legacyMigrationRequired) throw new SecureTaxError(409, "Legacy accounts require a separately verified migration; automatic profile conversion is unavailable.");
  db.prepare("INSERT INTO secure_tax_client_only_bindings VALUES(?,?,?,?,?,?,?)").run(account.id, account.clientId, m.workspaceId, PROFILE, m.client.keyId, m.client.publicKey, new Date().toISOString());
  db.prepare("INSERT INTO secure_tax_client_only_enrollments VALUES(?,?,?,?)").run(account.id, m.epoch, JSON.stringify(m), new Date().toISOString());
  return m;
}
export function enrollClientOnly(token: string | undefined, raw: unknown) {
  return workspaceDatabase(db => {
    const { account, binding } = clientOnlyAccount(db, token), m = verifyClientOnlyManifest(raw, account), previous = currentClientOnlyManifest(db, account, true);
    matchesBinding(m, binding);
    if (m.epoch < previous.epoch || m.epoch === previous.epoch && JSON.stringify(m) !== JSON.stringify(previous)) throw new SecureTaxError(409, "Renewal must preserve the client key and advance the observed signed epoch.");
    if (m.epoch > previous.epoch) db.prepare("UPDATE secure_tax_client_only_enrollments SET epoch=?,manifest=?,enrolledAt=? WHERE accountId=?").run(m.epoch, JSON.stringify(m), new Date().toISOString(), account.id);
    return { profile: PROFILE, enrolled: true, renewed: true, identity: { accountId: account.id, clientId: account.clientId }, manifest: m };
  }, true);
}
export function clientOnlyStatus(token: string | undefined) {
  return workspaceDatabase(db => {
    const { account } = clientOnlyAccount(db, token), manifest = currentClientOnlyManifest(db, account, true);
    return { profile: PROFILE, enrolled: true, secureRequired: true, keyProvisioningEnabled: true, identity: { accountId: account.id, clientId: account.clientId }, manifest, renewalRequired: Date.parse(manifest.expiresAt) <= Date.now() };
  });
}
export function clientOnlyRenewalRequest(token: string | undefined) {
  const { identity, manifest } = clientOnlyStatus(token); return { profile: PROFILE, identity, manifest };
}
function scoped(db: DatabaseSync, token: string | undefined) {
  const { account } = clientOnlyAccount(db, token); return { account, manifest: currentClientOnlyManifest(db, account) };
}
function nextSequence(db: DatabaseSync, accountId: string) {
  db.prepare("INSERT OR IGNORE INTO secure_tax_client_only_clock VALUES(?,0)").run(accountId);
  db.prepare("UPDATE secure_tax_client_only_clock SET sequence=sequence+1 WHERE accountId=?").run(accountId);
  return Number((db.prepare("SELECT sequence FROM secure_tax_client_only_clock WHERE accountId=?").get(accountId) as { sequence: number }).sequence);
}
const receipt = (r: Pick<ObjectRow, "id" | "revision" | "sequence" | "deleted">) => ({ objectId: r.id, revision: r.revision, sequence: r.sequence, deleted: r.deleted === 1 });
export function commitClientOnlyEnvelope(db: DatabaseSync, account: Account, manifest: ClientOnlyManifest, rawId: string, raw: unknown) {
  const id = secureTaxId.parse(rawId), input = mutationInput.parse(raw), { envelope, size } = validateClientOnlyEnvelope(input.envelope, manifest);
  // Never trust a caller-supplied signed manifest instead of the permanent anchor.
  const currentManifest = currentClientOnlyManifest(db, account);
  if (canonicalClientOnlyManifest(currentManifest) !== canonicalClientOnlyManifest(manifest)) throw new SecureTaxError(409, "The client-owned enrollment changed.");
  if (envelope.context.objectId !== id || envelope.context.revision !== input.expectedRevision + 1) throw new SecureTaxError(409, "The encrypted object context or revision does not match this write.");
  const digest = createHash("sha256").update(JSON.stringify([id, input.expectedRevision, envelope])).digest("hex");
  const prior = db.prepare("SELECT * FROM secure_tax_client_only_mutations WHERE accountId=? AND id=?").get(account.id, input.mutationId) as { objectId: string; requestDigest: string; revision: number; sequence: number } | undefined;
  if (prior) {
    if (prior.objectId !== id || prior.requestDigest !== digest) throw new SecureTaxError(409, "This encrypted mutation ID was already used for different content.");
    return { objectId: id, revision: prior.revision, sequence: prior.sequence, deleted: false, duplicate: true };
  }
  const current = db.prepare("SELECT * FROM secure_tax_client_only_objects WHERE accountId=? AND id=?").get(account.id, id) as ObjectRow | undefined;
  if ((current?.revision ?? 0) !== input.expectedRevision || current?.deleted) throw new SecureTaxError(409, "The encrypted object changed or was deleted. Download the latest revision; deleted IDs cannot be restored.");
  const usage = db.prepare("SELECT count(*) AS objects,coalesce(sum(ciphertextBytes),0) AS bytes FROM secure_tax_client_only_objects WHERE accountId=?").get(account.id) as { objects: number; bytes: number };
  const mutations = Number((db.prepare("SELECT count(*) AS n FROM secure_tax_client_only_mutations WHERE accountId=?").get(account.id) as { n: number }).n);
  const live = Number((db.prepare("SELECT count(*) AS n FROM secure_tax_client_only_objects WHERE accountId=? AND deleted=0").get(account.id) as { n: number }).n);
  const total = Number((db.prepare("SELECT coalesce(sum(ciphertextBytes),0) AS bytes FROM secure_tax_client_only_objects").get() as { bytes: number }).bytes);
  if (!current && (usage.objects >= 100000 || live >= 10000) || mutations >= 100000 || usage.bytes - (current?.ciphertextBytes ?? 0) + size > 512 * 1024 * 1024 || total - (current?.ciphertextBytes ?? 0) + size > 2 * 1024 * 1024 * 1024) throw new SecureTaxError(413, "Client-owned storage capacity needs review. Keep your local encrypted copy.");
  const sequence = nextSequence(db, account.id), revision = envelope.context.revision;
  db.prepare("INSERT INTO secure_tax_client_only_objects VALUES(?,?,?,?,0,?,?) ON CONFLICT(accountId,id) DO UPDATE SET revision=excluded.revision,sequence=excluded.sequence,body=excluded.body,ciphertextBytes=excluded.ciphertextBytes").run(account.id, id, revision, sequence, JSON.stringify(envelope), size);
  db.prepare("INSERT INTO secure_tax_client_only_mutations VALUES(?,?,?,?,?,?)").run(account.id, input.mutationId, id, digest, revision, sequence);
  return { objectId: id, revision, sequence, deleted: false, duplicate: false };
}
export function writeClientOnlyObject(token: string | undefined, id: string, raw: unknown) {
  return workspaceDatabase(db => { const { account, manifest } = scoped(db, token); return commitClientOnlyEnvelope(db, account, manifest, id, raw); }, true);
}
export function readClientOnlyObject(token: string | undefined, rawId: string) {
  const id = secureTaxId.parse(rawId);
  return workspaceDatabase(db => {
    const { account } = scoped(db, token), row = db.prepare("SELECT * FROM secure_tax_client_only_objects WHERE accountId=? AND id=?").get(account.id, id) as ObjectRow | undefined;
    if (!row) throw new SecureTaxError(404, "Client-owned encrypted object unavailable.");
    return row.deleted ? receipt(row) : { ...receipt(row), envelope: JSON.parse(row.body!) };
  });
}
export function listClientOnlyChanges(token: string | undefined, after = 0, limit = 100) {
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(after); z.number().int().min(1).max(200).parse(limit);
  return workspaceDatabase(db => {
    const { account } = scoped(db, token), rows = db.prepare("SELECT id,revision,sequence,deleted FROM secure_tax_client_only_objects WHERE accountId=? AND sequence>? ORDER BY sequence LIMIT ?").all(account.id, after, limit + 1) as Pick<ObjectRow, "id" | "revision" | "sequence" | "deleted">[];
    const changes = rows.slice(0, limit); return { changes: changes.map(receipt), cursor: changes.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
  });
}
export function deleteClientOnlyObject(token: string | undefined, rawId: string, raw: unknown) {
  const id = secureTaxId.parse(rawId), input = z.object({ expectedRevision: z.number().int().min(1).max(1000000001) }).strict().parse(raw);
  return workspaceDatabase(db => {
    const { account } = scoped(db, token), row = db.prepare("SELECT * FROM secure_tax_client_only_objects WHERE accountId=? AND id=?").get(account.id, id) as ObjectRow | undefined;
    if (!row) throw new SecureTaxError(404, "Client-owned encrypted object unavailable.");
    if (row.deleted && [row.revision, row.revision - 1].includes(input.expectedRevision)) return { ...receipt(row), liveCiphertextPurged: true };
    if (row.revision !== input.expectedRevision || row.deleted) throw new SecureTaxError(409, "The encrypted item changed. Refresh before deleting.");
    const revision = row.revision + 1, sequence = nextSequence(db, account.id);
    db.prepare("DELETE FROM secure_tax_client_only_mutations WHERE accountId=? AND objectId=?").run(account.id, id);
    db.prepare("UPDATE secure_tax_client_only_objects SET revision=?,sequence=?,deleted=1,body=NULL,ciphertextBytes=0 WHERE accountId=? AND id=?").run(revision, sequence, account.id, id);
    return { objectId: id, revision, sequence, deleted: true, liveCiphertextPurged: true, backupRetention: "Prior backups may retain ciphertext; the immutable client key binding remains." };
  }, true);
}
