// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../../branding/templates";
import { gigTaxProsTemplate } from "../../industry/rideshare-tax-pros";
import { saveCustomerSettings } from "../../customer-access/service";
import { workspaceDatabase } from "../../workspace/database";
import { backupWorkspace, restoreWorkspace } from "../../workspace/backup";
import { configureOwnerPassword, signInOwner } from "../../auth/owner-session";
import { MfaChallengeError } from "../../auth/mfa/model";
import { completeLoginFactor, loginFactorView } from "../../auth/mfa/store";
import { totp } from "../../auth/mfa/crypto";
import { hashPassword } from "../../auth/passwords";
import { secureTaxEnrollment, enrollSecureTaxAccount } from "../store";
import { secureTaxRequired, assertPlaintextTaxAllowed } from "../policy";
import { requestClientKeyRecovery } from "../client-key-recovery";
import { setPrivateAccountAccess } from "../account-access";
import { privateTaxAccount } from "../private-accounts";
import { generateRecipientKeyPair, publicKeyId, encode64 } from "../../../../packages/secure-tax-client/envelope.mjs";
import { sealClientOnlyEnvelope, openClientOnlyEnvelope } from "../../../../packages/secure-tax-client/client-only.mjs";
import { openClientOnlyActivationChallenge } from "../../../../packages/secure-tax-client/client-only-activation-proof.mjs";
import { PROFILE, canonicalClientOnlyManifest, type ClientOnlyManifest } from "./model";
import { hasClientOnlyBinding } from "./guard";
import { issueClientOnlyInvitation, clientOnlyActivationChallenge, activateClientOnlyAccount } from "./activation";
import { establishClientOnlyBinding, enrollClientOnly, clientOnlyStatus, writeClientOnlyObject, readClientOnlyObject, deleteClientOnlyObject, listClientOnlyChanges } from "./store";
import * as handlers from "./handlers";
import { POST as login } from "@/app/api/website/customer/client-only/session/route";
import { POST as legacyLogin } from "@/app/api/website/customer/secure/session/route";
import { POST as legacyActivation } from "@/app/api/website/customer/secure/activation/route";
import { GET as legacyStatus } from "@/app/api/website/customer/secure/status/route";
import { POST as ownerSocialStart } from "@/app/api/auth/social/start/route";
import { POST as ownerInvite } from "@/app/api/website/customer/client-only/staff/client-invitations/route";
import { POST as ownerAccess } from "@/app/api/website/customer/client-only/staff/client-access/route";

const base = "https://workspace.example.test", origin = "https://portal.example.test", prefix = "/api/website/customer/client-only";
const password = "Synthetic client-only account password", plaintext = "Synthetic private profile never available to the operator";
let directory: string, owner: string, signer: ReturnType<typeof generateKeyPairSync>, signerPublic: string, signerId: string, client: any;
const req = (path: string, body?: unknown, token?: string, method = "POST", root = prefix) => new Request(base + root + path, { method, headers: { Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/gigtax-client-only-backend-`);
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory + "/data", DATABASE_URL: "", DEMO_DATA: "false", APP_BASE_URL: base, SHUUG_SECURE_TAX_TRUSTED_ORIGIN: origin, SHUUG_REQUIRE_MFA: "true", GIGTAX_REQUIRE_CLIENT_ONLY: "true", GIGTAX_REQUIRE_PROTECTED_CLIENTS: "false", SHUUG_SECURE_TAX_WORKSPACE_ID: "synthetic-client-owned", SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY: "" })) vi.stubEnv(key, value);
  importBusinessTemplate(gigTaxProsTemplate); saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  configureOwnerPassword(password);
  try { signInOwner(password, true); } catch (error) { const challenge = (error as MfaChallengeError).challenge; owner = completeLoginFactor(challenge.challengeToken, totp(loginFactorView(challenge.challengeToken, "staff").secret!, Math.floor(Date.now() / 30000)), "staff").token; }
  signer = generateKeyPairSync("ec", { namedCurve: "prime256v1" }); const jwk = signer.publicKey.export({ format: "jwk" });
  signerPublic = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url"); signerId = await publicKeyId(signerPublic);
  vi.stubEnv("SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY", signerPublic); client = await generateRecipientKeyPair(); client.keyId = await publicKeyId(client.publicKey);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
function manifest(invitation: { accountId: string; clientId: string }, changes: Partial<ClientOnlyManifest> = {}): ClientOnlyManifest {
  const m: ClientOnlyManifest = { version: 2, profile: PROFILE, manifestId: randomUUID(), workspaceId: "synthetic-client-owned", accountId: invitation.accountId, clientId: invitation.clientId, epoch: 1,
    client: { keyId: client.keyId, publicKey: client.publicKey }, issuedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), signature: { algorithm: "ES256-P1363", signerKeyId: signerId, value: "" }, ...changes };
  m.signature.value = sign("sha256", Buffer.from(canonicalClientOnlyManifest(m)), { key: signer.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"); return m;
}
const pins = () => ({ version: 2, profile: PROFILE, workspaceId: "synthetic-client-owned", signerPublicKey: signerPublic });
async function prepared() {
  const invitation = issueClientOnlyInvitation(owner), m = manifest(invitation), objectId = randomUUID();
  const context = { workspaceId: m.workspaceId, accountId: m.accountId, objectId, revision: 1, domain: "tax-identity" };
  const envelope = await sealClientOnlyEnvelope(new TextEncoder().encode(plaintext), context, { clientPublicKey: client.publicKey }, "client", client.privateKey);
  const challenge = await clientOnlyActivationChallenge({ token: invitation.token, manifest: m });
  const answer = await openClientOnlyActivationChallenge(challenge, m, { accountId: m.accountId, clientId: m.clientId }, pins(), client.privateKey);
  return { invitation, m, objectId, envelope, activation: { token: invitation.token, manifest: m, challengeId: challenge.challengeId, answer, password, profile: { mutationId: randomUUID(), expectedRevision: 0, envelope } } };
}
async function activated() {
  const p = await prepared(); await activateClientOnlyAccount(p.activation);
  const factor = await login(req("/session", { accountCode: p.invitation.accountId, password })); expect(factor.status).toBe(428);
  const pending = await factor.json();
  const completed = await login(req("/session", { challengeToken: pending.challengeToken, privateAccount: true, code: totp(pending.secret, Math.floor(Date.now() / 30000)) })); expect(completed.status).toBe(200);
  const session = await completed.json(); return { ...p, token: session.token as string };
}

it("atomically activates an opaque account with real single-recipient ciphertext and mandatory MFA", async () => {
  const p = await activated(); expect(p.invitation).toMatchObject({ version: 2, profile: PROFILE, type: "gigtax-client-only-invitation" });
  expect(clientOnlyStatus(p.token)).toMatchObject({ profile: PROFILE, enrolled: true, identity: { accountId: p.m.accountId, clientId: p.m.clientId } });
  const read = readClientOnlyObject(p.token, p.objectId); expect(read).toHaveProperty("envelope.version", 3);
  expect(new TextDecoder().decode(await openClientOnlyEnvelope((read as any).envelope, p.envelope.context, { clientPublicKey: client.publicKey }, "client", client.privateKey))).toBe(plaintext);
  workspaceDatabase(db => {
    expect(db.prepare("SELECT 1 FROM records WHERE id=?").get(p.m.clientId)).toBeUndefined();
    expect(JSON.stringify(db.prepare("SELECT * FROM secure_tax_client_only_objects").all())).not.toContain(plaintext);
    expect(JSON.stringify(db.prepare("SELECT * FROM secure_tax_client_only_bindings").all())).not.toMatch(/privateKey|firmRecovery/);
  });
  expect(readFileSync(directory + "/data/workspace.sqlite").includes(Buffer.from(plaintext))).toBe(false);
});

it("consumes a wrong possession proof and rolls back account/anchor/ciphertext when activation validation fails", async () => {
  const p = await prepared(), wrong = encode64(new Uint8Array(32));
  await expect(activateClientOnlyAccount({ ...p.activation, answer: wrong })).rejects.toThrow();
  await expect(activateClientOnlyAccount(p.activation)).rejects.toThrow();
  expect(workspaceDatabase(db => privateTaxAccount(db, p.m.accountId))).toBeUndefined();
  const again = await clientOnlyActivationChallenge({ token: p.invitation.token, manifest: p.m });
  const answer = await openClientOnlyActivationChallenge(again, p.m, { accountId: p.m.accountId, clientId: p.m.clientId }, pins(), client.privateKey);
  const bad = { ...p.activation, challengeId: again.challengeId, answer, profile: { ...p.activation.profile, envelope: { ...p.envelope, context: { ...p.envelope.context, accountId: randomUUID() } } } };
  await expect(activateClientOnlyAccount(bad)).rejects.toThrow();
  expect(workspaceDatabase(db => privateTaxAccount(db, p.m.accountId))).toBeUndefined();
  expect(workspaceDatabase(db => hasClientOnlyBinding(db, { accountId: p.m.accountId }))).toBe(false);
  await expect(activateClientOnlyAccount({ ...p.activation, challengeId: again.challengeId, answer })).rejects.toThrow();
});

it("rejects injected recovery recipients, firm authors, wrong scope and old envelopes without changing stored objects", async () => {
  const p = await activated(), id = randomUUID(), context = { ...p.envelope.context, objectId: id };
  const envelope = await sealClientOnlyEnvelope(new TextEncoder().encode("Synthetic second item"), context, { clientPublicKey: client.publicKey }, "client", client.privateKey);
  for (const bad of [ { ...envelope, recipients: [...envelope.recipients, { ...envelope.recipients[0], role: "firm-recovery" }] }, { ...envelope, author: { ...envelope.author, role: "firm-recovery" } }, { ...envelope, context: { ...context, accountId: randomUUID() } }, { ...envelope, version: 2 }, { ...envelope, profile: "firm-recovery" }, { ...envelope, firmRecovery: envelope.recipients[0] } ]) {
    const result = await handlers.putObject(req(`/objects/${id}`, { mutationId: randomUUID(), expectedRevision: 0, envelope: bad }, p.token, "PUT"), { params: Promise.resolve({ id }) });
    expect([400, 403]).toContain(result.status);
  }
  expect(listClientOnlyChanges(p.token).changes).toHaveLength(1);
  expect(() => readClientOnlyObject(owner, p.objectId)).toThrow();
});

it("keeps CAS/idempotency, bounded feeds and irreversible content-free deletion", async () => {
  const p = await activated(), id = randomUUID(), context = { ...p.envelope.context, objectId: id, domain: "driver-record" };
  const envelope = await sealClientOnlyEnvelope(new TextEncoder().encode("Synthetic ledger"), context, { clientPublicKey: client.publicKey }, "client", client.privateKey), mutation = { mutationId: randomUUID(), expectedRevision: 0, envelope };
  const first = writeClientOnlyObject(p.token, id, mutation); expect(writeClientOnlyObject(p.token, id, mutation)).toMatchObject({ ...first, duplicate: true });
  expect(() => writeClientOnlyObject(p.token, id, { ...mutation, mutationId: randomUUID() })).toThrow("changed");
  expect(() => writeClientOnlyObject(p.token, id, { ...mutation, envelope: { ...envelope, nonce: encode64(new Uint8Array(12)) } })).toThrow("already used");
  const page = listClientOnlyChanges(p.token, 0, 1); expect(page.hasMore).toBe(true); expect(Object.keys(page.changes[0]).sort()).toEqual(["deleted", "objectId", "revision", "sequence"]);
  expect(() => listClientOnlyChanges(p.token, 0, 201)).toThrow();
  expect(deleteClientOnlyObject(p.token, id, { expectedRevision: 1 })).toMatchObject({ deleted: true, revision: 2 });
  expect(deleteClientOnlyObject(p.token, id, { expectedRevision: 1 })).toMatchObject({ deleted: true, revision: 2 });
  expect(readClientOnlyObject(p.token, id)).not.toHaveProperty("envelope");
  expect(() => writeClientOnlyObject(p.token, id, mutation)).toThrow("deleted");
  workspaceDatabase(db => expect(db.prepare("SELECT body,ciphertextBytes FROM secure_tax_client_only_objects WHERE accountId=? AND id=?").get(p.m.accountId, id)).toMatchObject({ body: null, ciphertextBytes: 0 }));
});

it("permanently rejects owner-signed key replacement with zero objects and preserves same-key renewal", async () => {
  const invitation = issueClientOnlyInvitation(owner), m = manifest(invitation);
  workspaceDatabase(db => { db.prepare("INSERT INTO secure_tax_accounts VALUES(?,?,'active',?,?,NULL)").run(m.accountId, m.clientId, hashPassword(password), new Date().toISOString()); establishClientOnlyBinding(db, { id: m.accountId, clientId: m.clientId }, m); }, true);
  // The owner can issue a valid signature; that never grants key-replacement authority.
  const replacement = await generateRecipientKeyPair(), key = { keyId: await publicKeyId(replacement.publicKey), publicKey: replacement.publicKey };
  const response = await login(req("/session", { accountCode: m.accountId, password })), factor = await response.json();
  const token = (await (await login(req("/session", { challengeToken: factor.challengeToken, privateAccount: true, code: totp(factor.secret, Math.floor(Date.now() / 30000)) }))).json()).token;
  expect(() => enrollClientOnly(token, manifest(invitation, { epoch: 2, client: key }))).toThrow("immutable");
  expect(enrollClientOnly(token, manifest(invitation, { epoch: 2 }))).toMatchObject({ renewed: true, manifest: { epoch: 2 } });
  workspaceDatabase(db => { expect(() => db.prepare("DELETE FROM secure_tax_client_only_bindings WHERE accountId=?").run(m.accountId)).toThrow("permanent"); expect(() => db.prepare("UPDATE secure_tax_client_only_bindings SET clientKeyId=? WHERE accountId=?").run(key.keyId, m.accountId)).toThrow("immutable"); });
});

it("keeps anchors through tombstones, expiry, disable/re-enable and complete backup restore, denying legacy recovery without env flags", async () => {
  const p = await activated(); deleteClientOnlyObject(p.token, p.objectId, { expectedRevision: 1 });
  const replacement = await generateRecipientKeyPair(), key = { keyId: await publicKeyId(replacement.publicKey), publicKey: replacement.publicKey };
  vi.stubEnv("GIGTAX_REQUIRE_CLIENT_ONLY", "false");
  expect(secureTaxRequired({ accountId: p.m.accountId })).toBe(true);
  expect(secureTaxRequired({ clientId: p.m.clientId })).toBe(true);
  expect(() => workspaceDatabase(db => assertPlaintextTaxAllowed({ clientId: p.m.clientId }, db))).toThrow();
  expect(() => workspaceDatabase(db => secureTaxEnrollment(db, p.m.accountId))).toThrow("client-owned");
  expect(() => workspaceDatabase(db => enrollSecureTaxAccount(db, { id: p.m.accountId, clientId: p.m.clientId }, {}), true)).toThrow("client-owned");
  expect(() => requestClientKeyRecovery(p.token, { client: key })).toThrow("client-owned");
  const legacy = await legacyLogin(req("/session", { accountCode: p.m.accountId, password }, undefined, "POST", "/api/website/customer/secure")); expect(legacy.status).toBe(409);
  backupWorkspace(directory + "/data", directory + "/backup"); restoreWorkspace(directory + "/backup", directory + "/restored"); vi.stubEnv("DEALDESK_DATA_DIR", directory + "/restored");
  expect(() => enrollClientOnly(p.token, manifest(p.invitation, { epoch: 2, client: key }))).toThrow("immutable");
  setPrivateAccountAccess(owner, { accountCode: p.m.accountId, enabled: false }); setPrivateAccountAccess(owner, { accountCode: p.m.accountId, enabled: true });
  expect(workspaceDatabase(db => secureTaxRequired({ accountId: p.m.accountId }, db))).toBe(true);
  expect(() => workspaceDatabase(db => secureTaxEnrollment(db, p.m.accountId))).toThrow("client-owned");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 7200000);
  expect(() => workspaceDatabase(db => secureTaxEnrollment(db, p.m.accountId))).toThrow("client-owned");
});

it("renews expired enrollment only with the same client key, rejecting a valid owner-signed replacement", async () => {
  const p = await activated(), replacement = await generateRecipientKeyPair(), key = { keyId: await publicKeyId(replacement.publicKey), publicKey: replacement.publicKey };
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 7200000);
  expect(clientOnlyStatus(p.token).renewalRequired).toBe(true);
  expect(() => readClientOnlyObject(p.token, p.objectId)).toThrow("expired");
  expect(() => enrollClientOnly(p.token, manifest(p.invitation, { epoch: 2, client: key }))).toThrow("immutable");
  expect(enrollClientOnly(p.token, manifest(p.invitation, { epoch: 2 }))).toMatchObject({ renewed: true });
  expect(readClientOnlyObject(p.token, p.objectId)).toHaveProperty("envelope.version", 3);
});

it("blocks old activation/data/auth paths before reading bodies while owner provider management remains available", async () => {
  const old = "/api/website/customer/secure", malformed = () => new Request(base + old + "/activation", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "not JSON" });
  const request = malformed(); expect((await legacyActivation(request)).status).toBe(409); expect(request.bodyUsed).toBe(false);
  const auth = new Request(base + old + "/session", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "not JSON" }); expect((await legacyLogin(auth)).status).toBe(409); expect(auth.bodyUsed).toBe(false);
  expect((await legacyStatus(req("/status", undefined, "a".repeat(64), "GET", old))).status).toBe(409);
  const ownerResult = await ownerSocialStart(new Request(base + "/api/auth/social/start", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google", audience: "owner", purpose: "login", challenge: "x".repeat(43) }) }));
  expect(ownerResult.status).not.toBe(409);
});

it("owner aliases issue only profile invitations and scope availability changes to anchored accounts", async () => {
  const invited = await ownerInvite(req("/staff/client-invitations", {}, owner)); expect(invited.status).toBe(200);
  expect(await invited.json()).toMatchObject({ version: 2, profile: PROFILE, type: "gigtax-client-only-invitation" });
  expect((await ownerAccess(req("/staff/client-access", { accountCode: randomUUID(), enabled: false }, owner))).status).toBe(409);
  const p = await activated();
  expect((await ownerAccess(req("/staff/client-access", { accountCode: p.m.accountId, enabled: false }, owner))).status).toBe(200);
  expect(() => clientOnlyStatus(p.token)).toThrow();
  expect(workspaceDatabase(db => hasClientOnlyBinding(db, { accountId: p.m.accountId }))).toBe(true);
});
