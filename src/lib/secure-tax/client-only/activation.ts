import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../../workspace/database";
import { hashPassword } from "../../auth/passwords";
import { driverAvailable } from "../../rideshare-driver/policy";
import { secureStaffIdentity } from "../staff-session";
import { SecureTaxError } from "../manifest";
import { initPrivateAccounts, privateAccountTable, privateTaxAccount, privateTokenHash, privateAccountPassword } from "../private-accounts";
import { PROFILE, clientOnlyManifest, clientOnlyEnvelope, clientOnlyPublicPins, verifyClientOnlyManifest, canonicalClientOnlyManifest } from "./model";
import { establishClientOnlyBinding, commitClientOnlyEnvelope } from "./store";
import { sealClientOnlyActivationChallenge, clientOnlyActivationAnswerDigest } from "../../../../packages/secure-tax-client/client-only-activation-proof.mjs";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const challengeInput = z.object({ token: tokenSchema, manifest: clientOnlyManifest }).strict();
const activationInput = challengeInput.extend({ challengeId: z.uuid(), answer: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: privateAccountPassword,
  profile: z.object({ mutationId: z.uuid(), expectedRevision: z.literal(0), envelope: clientOnlyEnvelope }).strict() }).strict();
const unavailable = () => new SecureTaxError(409, "Client-owned activation expired or could not be verified. Obtain a current invitation and matching signed manifest.");
function init(db: DatabaseSync) {
  initPrivateAccounts(db);
  db.exec(`CREATE TABLE IF NOT EXISTS secure_tax_client_only_invitations(id TEXT PRIMARY KEY,accountId TEXT NOT NULL UNIQUE,clientId TEXT NOT NULL UNIQUE,workspaceId TEXT NOT NULL,profile TEXT NOT NULL CHECK(profile='client-only-v1'),tokenHash TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_client_only_activation_challenges(id TEXT PRIMARY KEY,invitationId TEXT NOT NULL,profile TEXT NOT NULL CHECK(profile='client-only-v1'),manifestDigest TEXT NOT NULL,answerDigest TEXT NOT NULL,expires INTEGER NOT NULL);`);
}
function invitation(db: DatabaseSync, token: string) {
  init(db);
  const row = db.prepare("SELECT * FROM secure_tax_client_only_invitations WHERE tokenHash=? AND profile=? AND status='pending' AND expires>?").get(privateTokenHash(token), PROFILE, Date.now()) as { id: string; accountId: string; clientId: string; workspaceId: string; profile: string } | undefined;
  if (!row || row.workspaceId !== clientOnlyPublicPins().workspaceId) throw unavailable(); return row;
}
function available() { if (!driverAvailable()) throw new SecureTaxError(404, "Client access is not enabled."); }
export function issueClientOnlyInvitation(staffToken: string) {
  available(); const pins = clientOnlyPublicPins();
  return workspaceDatabase(db => {
    const { user } = secureStaffIdentity(db, staffToken); if (!user.isOwner) throw new SecureTaxError(403, "Only the verified owner can invite a client-owned account.");
    init(db); const now = Date.now();
    db.prepare("UPDATE secure_tax_client_only_invitations SET status='expired' WHERE status='pending' AND expires<=?").run(now);
    if (Number((db.prepare("SELECT count(*) AS n FROM secure_tax_client_only_invitations WHERE status='pending'").get() as { n: number }).n) >= 1000) throw new SecureTaxError(413, "Pending invitation capacity needs review.");
    const id = randomUUID(), accountId = randomUUID(), clientId = randomUUID(), token = randomBytes(32).toString("hex"), expires = now + 48 * 3600000;
    db.prepare("INSERT INTO secure_tax_client_only_invitations VALUES(?,?,?,?,?,?,?,'pending',?)").run(id, accountId, clientId, pins.workspaceId, PROFILE, privateTokenHash(token), expires, new Date(now).toISOString());
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(id, user.id, "client-only.invitation.created", new Date(now).toISOString(), JSON.stringify({ profile: PROFILE, accountId, clientId }));
    return { version: 2, type: "gigtax-client-only-invitation", profile: PROFILE, invitationId: id, workspaceId: pins.workspaceId, accountId, clientId, token, expiresAt: new Date(expires).toISOString() };
  }, true);
}
export function revokeClientOnlyInvitation(staffToken: string, raw: unknown) {
  const input = z.object({ invitationId: z.uuid() }).strict().parse(raw);
  return workspaceDatabase(db => {
    const { user } = secureStaffIdentity(db, staffToken); if (!user.isOwner) throw new SecureTaxError(403, "Only the verified owner can revoke an invitation."); init(db);
    const result = db.prepare("UPDATE secure_tax_client_only_invitations SET status='revoked' WHERE id=? AND status='pending'").run(input.invitationId);
    db.prepare("DELETE FROM secure_tax_client_only_activation_challenges WHERE invitationId=?").run(input.invitationId);
    return { revoked: Number(result.changes) === 1 };
  }, true);
}
export async function clientOnlyActivationChallenge(raw: unknown) {
  available(); const input = challengeInput.parse(raw), invited = workspaceDatabase(db => invitation(db, input.token), true);
  const manifest = verifyClientOnlyManifest(input.manifest, { id: invited.accountId, clientId: invited.clientId }), id = randomUUID();
  const expiresAt = new Date(Math.min(Date.now() + 300000, Date.parse(manifest.expiresAt))).toISOString();
  const sealed = await sealClientOnlyActivationChallenge(manifest, { challengeId: id, expiresAt });
  return workspaceDatabase(db => {
    const current = invitation(db, input.token); if (current.id !== invited.id) throw unavailable();
    db.prepare("DELETE FROM secure_tax_client_only_activation_challenges WHERE expires<=?").run(Date.now());
    if (Number((db.prepare("SELECT count(*) AS n FROM secure_tax_client_only_activation_challenges WHERE invitationId=?").get(invited.id) as { n: number }).n) >= 3) throw new SecureTaxError(429, "Wait for the pending client-key proof to expire.");
    db.prepare("INSERT INTO secure_tax_client_only_activation_challenges VALUES(?,?,?,?,?,?)").run(id, invited.id, PROFILE, privateTokenHash(canonicalClientOnlyManifest(manifest)), sealed.answerDigest, Date.parse(expiresAt));
    return sealed.challenge;
  }, true);
}
export async function activateClientOnlyAccount(raw: unknown) {
  available(); const input = activationInput.parse(raw), answerDigest = await clientOnlyActivationAnswerDigest(input.answer);
  const proofResult = workspaceDatabase(db => {
    const invited = invitation(db, input.token), account = { id: invited.accountId, clientId: invited.clientId };
    const proof = db.prepare("SELECT * FROM secure_tax_client_only_activation_challenges WHERE id=? AND invitationId=? AND profile=? AND expires>?").get(input.challengeId, invited.id, PROFILE, Date.now()) as { manifestDigest: string; answerDigest: string } | undefined;
    if (!proof) throw unavailable();
    db.prepare("DELETE FROM secure_tax_client_only_activation_challenges WHERE id=?").run(input.challengeId);
    if (proof.manifestDigest !== privateTokenHash(canonicalClientOnlyManifest(input.manifest)) || !timingSafeEqual(Buffer.from(proof.answerDigest), Buffer.from(answerDigest))) return { invalid: true } as const;
    return { account, invitationId: invited.id } as const;
  }, true);
  if ("invalid" in proofResult) throw unavailable();
  // Proof consumption is committed even if subsequent activation validation
  // fails. Account, immutable anchor and first ciphertext still commit together.
  const manifest = verifyClientOnlyManifest(input.manifest, proofResult.account);
  return workspaceDatabase(db => {
    const invited = invitation(db, input.token), account = proofResult.account;
    if (invited.id !== proofResult.invitationId || invited.accountId !== account.id || invited.clientId !== account.clientId) throw unavailable();
    if (privateTaxAccount(db, account.id) || db.prepare("SELECT 1 FROM records WHERE id=?").get(account.clientId)
      || privateAccountTable(db, "customer_accounts") && db.prepare("SELECT 1 FROM customer_accounts WHERE id=? OR clientId=?").get(account.id, account.clientId)) throw unavailable();
    const envelope = input.profile.envelope;
    if (envelope.context.domain !== "tax-identity" || envelope.context.revision !== 1 || !z.uuid().safeParse(envelope.context.objectId).success) throw new SecureTaxError(400, "Activate with the encrypted profile prepared for this new account.");
    db.prepare("INSERT INTO secure_tax_accounts VALUES(?,?,'active',?,?,NULL)").run(account.id, account.clientId, hashPassword(input.password), new Date().toISOString());
    establishClientOnlyBinding(db, account, manifest); commitClientOnlyEnvelope(db, account, manifest, envelope.context.objectId, input.profile);
    db.prepare("UPDATE secure_tax_client_only_invitations SET status='accepted' WHERE id=?").run(invited.id);
    db.prepare("DELETE FROM secure_tax_client_only_activation_challenges WHERE invitationId=?").run(invited.id);
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(account.id, account.id, "client-only.account.activated", new Date().toISOString(), JSON.stringify({ profile: PROFILE, clientId: account.clientId, manifestId: manifest.manifestId, epoch: manifest.epoch }));
    return { activated: true, profile: PROFILE, identity: { accountId: account.id, clientId: account.clientId } } as const;
  }, true);
}
