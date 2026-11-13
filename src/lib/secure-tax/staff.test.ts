// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { gigTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { createLinkedCustomer, saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer } from "../customer-access/accounts";
import { configureOwnerPassword, signInOwner } from "../auth/owner-session";
import { createEmployeeAccount, acceptEmployeeInvitation, issueEmployeeInvitation, signInEmployee, setEmployeeEnabled } from "../auth/employees";
import { MfaChallengeError } from "../auth/mfa/model";
import { completeLoginFactor, loginFactorView } from "../auth/mfa/store";
import { totp } from "../auth/mfa/crypto";
import { addMember } from "../team/store";
import { assignRole, setPermission } from "../permissions/store";
import { canonicalManifest, type SecureTaxEnvelope, type SignedRecipientManifest } from "./envelope";
import { enrollSecureTaxAccount, writeSecureTaxObject, deleteSecureTaxObject, readSecureTaxObject } from "./store";
import { secureStaffStatus, secureStaffSignIn, secureStaffSignOut } from "./staff-session";
import { publishStaffGrant, publishStaffCapsule, withdrawStaffGrant, listStaffGrants, listStaffChanges, readStaffObject } from "./staff-store";
import { staffGrantDigest, staffEnvelopeDigest, type StaffGrant, type StaffCapsule } from "./staff-model";
import { canonicalStaffGrant, canonicalStaffCapsule } from "../../../packages/secure-tax-client/staff-contract.mjs";
import { GET as listGrantRoute, POST as publishGrantRoute } from "@/app/api/website/customer/secure/staff/grants/route";
import { GET as readObjectRoute } from "@/app/api/website/customer/secure/staff/objects/[id]/route";
import { POST as publishEditRoute } from "@/app/api/website/customer/secure/staff/return-edits/route";
import { canonicalReturnEditApproval } from "../../../packages/secure-tax-client/return-edit-contract.mjs";
import type { ReturnEditApproval } from "./return-edits";
import { GET as readScopeRoute } from "@/app/api/website/customer/secure/staff/scope/route";
import { POST as publishCreationRoute } from "@/app/api/website/customer/secure/staff/return-creations/route";
import { canonicalReturnCreationApproval } from "../../../packages/secure-tax-client/return-create-contract.mjs";
import type { ReturnCreationApproval } from "./return-creations";
import { POST as publishCaseRoute } from "@/app/api/website/customer/secure/staff/cases/route";
import { canonicalCaseApproval } from "../../../packages/secure-tax-client/case-contract.mjs";
import type { CaseApproval } from "./cases";

import {secureAccount} from "./account-scope";
// Restore a historical enrolled fixture directly; new legacy activation is blocked.
function seedHistoricalEnrollment(token:string,raw:unknown){return workspaceDatabase(db=>enrollSecureTaxAccount(db,secureAccount(db,token),raw),true);}

const origin = "https://trusted.example.net", base = "https://workspace.example.com", password = "Synthetic-staff-vault-password";
const pair = () => {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), jwk = keys.publicKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  return { publicKey, keyId: createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest("base64url"), privateKey: keys.privateKey };
};
let directory: string, signer: ReturnType<typeof pair>, recovery: ReturnType<typeof pair>, clientKey: ReturnType<typeof pair>, staffKey: ReturnType<typeof pair>;
let account: { id: string; clientId: string; token: string }, staff: { id: string; memberId: string; email: string };
let ownerToken: string, staffToken: string, passwordOnlyOwner: string, passwordOnlyStaff: string, staffRecovery: string[], manifest: SignedRecipientManifest;
function complete(login: () => string) {
  let token = "";
  try { login(); throw new Error("MFA was bypassed."); } catch (error) { expect(error).toBeInstanceOf(MfaChallengeError); token = (error as MfaChallengeError).challenge.challengeToken; }
  const view = loginFactorView(token, "staff");
  return completeLoginFactor(token, totp(view.secret!, Math.floor(Date.now() / 30000)), "staff");
}
function signed<T extends { signature: StaffGrant["signature"] }>(value: T, canonical: (v: T) => string): T {
  value.signature = { algorithm: "ES256-P1363", signerKeyId: signer.keyId, value: "" };
  value.signature.value = sign("sha256", Buffer.from(canonical(value)), { key: signer.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return value;
}
function enrollment(epoch = 1): SignedRecipientManifest {
  return signed({ version: 1, manifestId: `manifest-${epoch}`, workspaceId: "synthetic-workspace", accountId: account.id, clientId: account.clientId, epoch,
    client: { keyId: clientKey.keyId, publicKey: clientKey.publicKey }, firmRecovery: { keyId: recovery.keyId, publicKey: recovery.publicKey }, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), signature: {} as StaffGrant["signature"] } as SignedRecipientManifest, canonicalManifest);
}
function grant(changes: Partial<StaffGrant> = {}): StaffGrant {
  return signed({ version: 1, type: "shuug-secure-tax-staff-grant", grantId: randomUUID(), workspaceId: "synthetic-workspace", accountId: account.id, clientId: account.clientId,
    staffAccountId: staff.id, epoch: 1, status: "active", staff: { keyId: staffKey.keyId, publicKey: staffKey.publicKey }, domains: ["driver-record"], rights: "read",
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), signature: {} as StaffGrant["signature"], ...changes }, canonicalStaffGrant);
}
function envelope(revision = 1, objectId = "opaque-object", domain: SecureTaxEnvelope["context"]["domain"] = "driver-record"): SecureTaxEnvelope {
  // Framing-only server fixture. Real HPKE encryption/decryption is exercised by
  // the separate client crypto suite and compiled staff pilot.
  return { version: 2, suite: "HPKE-P256-SHA256-A256GCM", contentAlgorithm: "AES-256-GCM", hpkeMode: "auth", author: { role: "client", keyId: clientKey.keyId },
    context: { workspaceId: "synthetic-workspace", accountId: account.id, objectId, revision, domain }, nonce: randomBytes(12).toString("base64url"), ciphertext: randomBytes(48).toString("base64url"),
    recipients: [{ role: "client", keyId: clientKey.keyId, publicKey: clientKey.publicKey, encapsulatedKey: clientKey.publicKey, wrappedKey: randomBytes(48).toString("base64url") },
      { role: "firm-recovery", keyId: recovery.keyId, publicKey: recovery.publicKey, encapsulatedKey: recovery.publicKey, wrappedKey: randomBytes(48).toString("base64url") }] };
}
function capsule(g: StaffGrant, e: SecureTaxEnvelope, changes: Partial<StaffCapsule> = {}): StaffCapsule {
  return signed({ version: 1, type: "shuug-secure-tax-staff-capsule", capsuleId: randomUUID(), grantId: g.grantId, grantEpoch: g.epoch, grantDigest: staffGrantDigest(g), manifestId: manifest.manifestId, manifestEpoch: manifest.epoch,
    context: { ...e.context }, envelopeDigest: staffEnvelopeDigest(e), staffKeyId: g.staff.keyId,
    wrap: { suite: "HPKE-P256-SHA256-A256GCM", mode: "auth", encapsulatedKey: recovery.publicKey, wrappedKey: randomBytes(48).toString("base64url") },
    issuedAt: new Date().toISOString(), expiresAt: g.expiresAt, signature: {} as StaffGrant["signature"], ...changes }, canonicalStaffCapsule);
}
function approvedEdit(g: StaffGrant, original: SecureTaxEnvelope) {
  // Server-framing fixture only; independent crypto and the compiled journey
  // exercise actual staff proposal authentication and firm re-encryption.
  const next = envelope(original.context.revision + 1, original.context.objectId, "tax-document"); next.author = { role: "firm-recovery", keyId: recovery.keyId };
  const approval = signed({ version: 1, type: "shuug-secure-tax-return-edit-approval", approvalId: randomUUID(), proposalId: randomUUID(),
    workspaceId: g.workspaceId, accountId: g.accountId, clientId: g.clientId, objectId: original.context.objectId, sourceRevision: original.context.revision,
    sourceEnvelopeDigest: staffEnvelopeDigest(original), manifestId: manifest.manifestId, manifestEpoch: manifest.epoch, grantId: g.grantId, grantEpoch: g.epoch,
    grantDigest: staffGrantDigest(g), staffAccountId: g.staffAccountId, staffKeyId: g.staff.keyId, proposalDigest: randomBytes(32).toString("base64url"),
    reviewCommitment: randomBytes(32).toString("base64url"), newEnvelopeDigest: staffEnvelopeDigest(next), reviewReference: "synthetic-reviewed-case",
    issuedAt: new Date().toISOString(), expiresAt: g.expiresAt, signature: {} as StaffGrant["signature"] } as ReturnEditApproval, canonicalReturnEditApproval);
  return { approval, envelope: next, capsule: capsule(g, next) };
}
function approvedCreation(g: StaffGrant, objectId = "preparer-created-return") {
  const first = envelope(1, objectId, "tax-document"); first.author = { role: "firm-recovery", keyId: recovery.keyId };
  const approval = signed({ version: 1, type: "shuug-secure-tax-return-create-approval", approvalId: randomUUID(), proposalId: randomUUID(),
    workspaceId: g.workspaceId, accountId: g.accountId, clientId: g.clientId, objectId,
    manifestId: manifest.manifestId, manifestEpoch: manifest.epoch, grantId: g.grantId, grantEpoch: g.epoch,
    grantDigest: staffGrantDigest(g), staffAccountId: g.staffAccountId, staffKeyId: g.staff.keyId,
    proposalDigest: randomBytes(32).toString("base64url"), reviewCommitment: randomBytes(32).toString("base64url"), newEnvelopeDigest: staffEnvelopeDigest(first),
    reviewReference: "synthetic-reviewed-initial-return", issuedAt: new Date().toISOString(), expiresAt: g.expiresAt,
    signature: {} as StaffGrant["signature"] } as ReturnCreationApproval, canonicalReturnCreationApproval);
  return { approval, envelope: first, capsule: capsule(g, first) };
}
function approvedCase(g: StaffGrant, source?: SecureTaxEnvelope, objectId = source?.context.objectId ?? "shuug-case:encrypted-case") {
  // Header/signature fixture. Separate crypto/HTTP tests verify private case
  // transition semantics and content certificates with real encryption.
  const next = envelope((source?.context.revision ?? 0) + 1, objectId, "tax-document"); next.author = { role: "firm-recovery", keyId: recovery.keyId };
  const approval = signed({ version: 1, type: "shuug-secure-tax-case-approval", approvalId: randomUUID(), proposalId: randomUUID(),
    workspaceId: g.workspaceId, accountId: g.accountId, clientId: g.clientId, objectId, sourceRevision: source?.context.revision ?? 0, sourceEnvelopeDigest: source ? staffEnvelopeDigest(source) : null,
    manifestId: manifest.manifestId, manifestEpoch: manifest.epoch, grantId: g.grantId, grantEpoch: g.epoch, grantDigest: staffGrantDigest(g),
    staffAccountId: g.staffAccountId, staffKeyId: g.staff.keyId, proposalDigest: randomBytes(32).toString("base64url"), reviewCommitment: randomBytes(32).toString("base64url"),
    newEnvelopeDigest: staffEnvelopeDigest(next), reviewReference: "synthetic-reviewed-case-transition", issuedAt: new Date().toISOString(), expiresAt: g.expiresAt,
    signature: {} as StaffGrant["signature"] } as CaseApproval, canonicalCaseApproval);
  return { approval, envelope: next, capsule: capsule(g, next) };
}
const request = (path: string, token?: string, body?: unknown, from = origin, method = body ? "POST" : "GET") => new Request(base + "/api/website/customer/secure/staff" + path, {
  method, headers: { Origin: from, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-secure-staff-`); vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN", origin); vi.stubEnv("SHUUG_REQUIRE_MFA", "false");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T03:00:00Z"));
  signer = pair(); recovery = pair(); clientKey = pair(); staffKey = pair();
  vi.stubEnv("SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY", signer.publicKey); vi.stubEnv("SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY", recovery.publicKey); vi.stubEnv("SHUUG_SECURE_TAX_WORKSPACE_ID", "synthetic-workspace");
  importBusinessTemplate(gigTaxProsTemplate); saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  const client = saveBusinessRecord({ kind: "client", title: "Synthetic client", fields: { email: "client@example.invalid" } }, "owner");
  const linked = await createLinkedCustomer({ name: "Synthetic client", email: "client@example.invalid", clientId: client.id, customerId: null });
  acceptCustomerInvitation(issueCustomerInvitation(linked.id), password); account = { id: linked.id, clientId: client.id, token: signInCustomer(linked.email, password) };
  configureOwnerPassword(password); passwordOnlyOwner = signInOwner(password); ownerToken = complete(() => signInOwner(password, true)).token;
  const member = addMember({ name: "Synthetic staff", email: "staff@example.invalid", role: "Manager" }); assignRole(member.id, "Manager");
  staff = createEmployeeAccount({ memberId: member.id, name: member.name, email: member.email }); acceptEmployeeInvitation(issueEmployeeInvitation(staff.id), password);
  passwordOnlyStaff = signInEmployee(staff.email, password); const factor = complete(() => signInEmployee(staff.email, password, true)); staffToken = factor.token; staffRecovery = factor.recoveryCodes;
  manifest = enrollment(); seedHistoricalEnrollment(account.token, manifest);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("requires completed MFA despite the ordinary switch being off, isolates sessions, and restricts origin", async () => {
  for (const token of [passwordOnlyOwner, passwordOnlyStaff, account.token]) expect(() => secureStaffStatus(token)).toThrow(/verification/i);
  expect(secureStaffStatus(staffToken)).toMatchObject({ identity: { staffAccountId: staff.id }, mfaVerified: true });
  expect((await secureStaffSignIn(request("/session", undefined, { email: staff.email, password }, "https://evil.invalid"))).status).toBe(403);
  const challenge = await secureStaffSignIn(request("/session", undefined, { email: staff.email, password })); expect(challenge.status).toBe(428);
  const body = await challenge.json(); expect(body.secret).toBeNull(); expect(body.token).toBeUndefined();
  const response = await secureStaffSignIn(request("/session", undefined, { challengeToken: body.challengeToken, code: staffRecovery[0] })); expect(response.status).toBe(200);
  const session = await response.json(); expect(session.identity).toEqual({ staffAccountId: staff.id }); expect(session.name).toBeUndefined(); expect(session.email).toBeUndefined();
  expect(() => secureStaffStatus(staffToken)).toThrow(/revoked/);
  expect((await secureStaffSignOut(request("/session", session.token, undefined, origin, "DELETE"))).status).toBe(200);
  expect(() => secureStaffStatus(session.token)).toThrow(/revoked/);
});
it("supports a fresh encrypted client without creating plaintext books and requires signed AND owner-approved access", async () => {
  const g = grant(); expect(listStaffGrants(staffToken).grants).toEqual([]);
  expect(() => readStaffObject(staffToken, g.grantId, "opaque-object")).toThrow(/unavailable/);
  expect((await publishGrantRoute(request("/grants", staffToken, g))).status).toBe(403);
  expect(publishStaffGrant(ownerToken, g)).toMatchObject({ approved: true, duplicate: false });
  expect(publishStaffGrant(ownerToken, g)).toMatchObject({ approved: true, duplicate: true });
  expect(listStaffGrants(staffToken).grants.map(g => g.grantId)).toEqual([g.grantId]);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM documents WHERE kind='client-book'").get())).toMatchObject({ n: 0 });
});
it("rejects forged, mismatched, expanded, private-field and stale grants", () => {
  const g = grant(); const forged = structuredClone(g); forged.signature.value = randomBytes(64).toString("base64url");
  for (const bad of [forged, { ...g, privateKey: "never accepted" }, grant({ workspaceId: "wrong-workspace" }), grant({ clientId: randomUUID() }), grant({ staff: { keyId: clientKey.keyId, publicKey: clientKey.publicKey } })]) expect(() => publishStaffGrant(ownerToken, bad)).toThrow();
  publishStaffGrant(ownerToken, g);
  expect(() => publishStaffGrant(ownerToken, grant({ grantId: g.grantId, domains: ["tax-document"] }))).toThrow(/newer signed epoch/);
  expect(() => publishStaffGrant(ownerToken, grant({ grantId: g.grantId, epoch: 2, staff: pair() }))).toThrow();
});
it("requires fresh exact-revision capsules and does not expose other domains or clients", async () => {
  const g = grant(), first = envelope(); publishStaffGrant(ownerToken, g);
  writeSecureTaxObject(account.token, first.context.objectId, { mutationId: "write-one", expectedRevision: 0, envelope: first });
  expect(listStaffChanges(staffToken, g.grantId).changes).toMatchObject([{ objectId: first.context.objectId, available: false }]);
  expect(() => readStaffObject(staffToken, g.grantId, first.context.objectId)).toThrow(/fresh offhost/);
  const shared = capsule(g, first); publishStaffCapsule(ownerToken, shared);
  expect(readStaffObject(staffToken, g.grantId, first.context.objectId)).toMatchObject({ envelope: first, capsule: shared, manifest });
  const second = envelope(2); writeSecureTaxObject(account.token, second.context.objectId, { mutationId: "write-two", expectedRevision: 1, envelope: second });
  expect(() => readStaffObject(staffToken, g.grantId, first.context.objectId)).toThrow(/fresh offhost/);
  expect(() => publishStaffCapsule(ownerToken, shared)).toThrow(/exact grant/);
  expect(() => publishStaffCapsule(ownerToken, capsule(g, second, { staffKeyId: clientKey.keyId }))).toThrow();
  expect(() => publishStaffCapsule(ownerToken, capsule(g, second, { issuedAt: new Date(Date.parse(manifest.issuedAt) - 1000).toISOString() }))).toThrow();
  publishStaffCapsule(ownerToken, capsule(g, second));
  const hidden = envelope(1, "other-domain", "tax-identity"); writeSecureTaxObject(account.token, hidden.context.objectId, { mutationId: "other-domain", expectedRevision: 0, envelope: hidden });
  expect(() => readStaffObject(staffToken, g.grantId, hidden.context.objectId)).toThrow(/outside/);
  expect(listStaffChanges(staffToken, g.grantId).changes.map(row => row.objectId)).not.toContain(hidden.context.objectId);
  deleteSecureTaxObject(account.token, second.context.objectId, { expectedRevision: 2 });
  expect(readStaffObject(staffToken, g.grantId, second.context.objectId)).toMatchObject({ deleted: true });
  expect(await (await readObjectRoute(request(`/objects/${second.context.objectId}?grantId=${g.grantId}`, staffToken), { params: Promise.resolve({ id: second.context.objectId }) })).json()).not.toHaveProperty("capsule");
});
it("withdraws immediately, rejects same-epoch replay and only accepts a fresh signed regrant", () => {
  const g = grant(), e = envelope(); publishStaffGrant(ownerToken, g); writeSecureTaxObject(account.token, e.context.objectId, { mutationId: "first", expectedRevision: 0, envelope: e }); publishStaffCapsule(ownerToken, capsule(g, e));
  withdrawStaffGrant(ownerToken, { grantId: g.grantId, expectedEpoch: 1 });
  expect(listStaffGrants(staffToken).grants).toEqual([]); expect(() => readStaffObject(staffToken, g.grantId, e.context.objectId)).toThrow(/revoked/);
  expect(() => publishStaffGrant(ownerToken, g)).toThrow(/newer signed grant/);
  const next = grant({ grantId: g.grantId, epoch: 2 }); publishStaffGrant(ownerToken, next);
  expect(() => publishStaffCapsule(ownerToken, capsule(g, e))).toThrow(/exact grant/);
  expect(() => readStaffObject(staffToken, next.grantId, e.context.objectId)).toThrow(/fresh offhost/);
  publishStaffCapsule(ownerToken, capsule(next, e)); expect(readStaffObject(staffToken, next.grantId, e.context.objectId)).toHaveProperty("envelope");
  publishStaffGrant(ownerToken, grant({ grantId: g.grantId, epoch: 3, status: "revoked" }));
  expect(() => readStaffObject(staffToken, g.grantId, e.context.objectId)).toThrow(/revoked/);
  expect(() => publishStaffGrant(ownerToken, next)).toThrow(/older signed grant/);
});
it("publishes one firm-approved correction with owner MFA, exact CAS, audit and idempotent retry", async () => {
  const g = grant({ domains: ["tax-document"] }), original = envelope(1, "tax-return", "tax-document"); publishStaffGrant(ownerToken, g);
  writeSecureTaxObject(account.token, original.context.objectId, { mutationId: "return-create", expectedRevision: 0, envelope: original }); publishStaffCapsule(ownerToken, capsule(g, original));
  const packet = approvedEdit(g, original), response = await publishEditRoute(request("/return-edits", ownerToken, packet)); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ revision: 2, duplicate: false, staffAccountId: staff.id });
  expect((readSecureTaxObject(account.token, original.context.objectId) as { envelope: unknown }).envelope).toEqual(packet.envelope);
  expect(await (await publishEditRoute(request("/return-edits", ownerToken, packet))).json()).toMatchObject({ revision: 2, duplicate: true });
  expect(readStaffObject(staffToken, g.grantId, original.context.objectId)).toMatchObject({ envelope: packet.envelope, capsule: packet.capsule });
  const rows = workspaceDatabase(db => db.prepare("SELECT snapshot FROM audit WHERE action='secure-tax.return-edit.approved'").all()) as { snapshot: string }[]; expect(rows).toHaveLength(1); expect(JSON.parse(rows[0].snapshot)).toEqual({ approval: packet.approval, sharingCapsuleId: packet.capsule.capsuleId });
  expect(listStaffGrants(staffToken).grants[0].rights).toBe("read");
  const latest = envelope(3, original.context.objectId, "tax-document"); writeSecureTaxObject(account.token, original.context.objectId, { mutationId: "later-client-change", expectedRevision: 2, envelope: latest }); const latestCapsule = capsule(g, latest); publishStaffCapsule(ownerToken, latestCapsule);
  expect(await (await publishEditRoute(request("/return-edits", ownerToken, packet))).json()).toMatchObject({ revision: 2, duplicate: true });
  expect(readStaffObject(staffToken, g.grantId, original.context.objectId)).toMatchObject({ envelope: latest, capsule: latestCapsule });
});
it("refuses correction uploads before consuming bodies without owner MFA", async () => {
  for (const token of [undefined, staffToken, account.token, passwordOnlyOwner, passwordOnlyStaff]) {
    const input = request("/return-edits", token, { unsupported: "must not be read" }), response = await publishEditRoute(input); expect(response.status).toBe(token === staffToken ? 403 : 401); expect(input.bodyUsed).toBe(false);
  }
});
it("rejects forged approvals, changed ciphertext, stale sources and withdrawn assignments without mutation", async () => {
  const g = grant({ domains: ["tax-document"] }), original = envelope(1, "tax-return", "tax-document"); publishStaffGrant(ownerToken, g); writeSecureTaxObject(account.token, original.context.objectId, { mutationId: "return-create", expectedRevision: 0, envelope: original });
  const packet = approvedEdit(g, original), changed = structuredClone(packet); changed.envelope.ciphertext = randomBytes(48).toString("base64url");
  expect((await publishEditRoute(request("/return-edits", ownerToken, changed))).status).toBe(403);
  const forged = structuredClone(packet); forged.approval.signature.value = randomBytes(64).toString("base64url"); expect((await publishEditRoute(request("/return-edits", ownerToken, forged))).status).toBe(403);
  withdrawStaffGrant(ownerToken, { grantId: g.grantId, expectedEpoch: g.epoch }); expect((await publishEditRoute(request("/return-edits", ownerToken, packet))).status).toBe(403);
  const nextGrant = grant({ grantId: g.grantId, epoch: 2, domains: ["tax-document"] }); publishStaffGrant(ownerToken, nextGrant); const stale = approvedEdit(nextGrant, original);
  writeSecureTaxObject(account.token, original.context.objectId, { mutationId: "return-client-change", expectedRevision: 1, envelope: envelope(2, original.context.objectId, "tax-document") });
  expect((await publishEditRoute(request("/return-edits", ownerToken, stale))).status).toBe(409);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM audit WHERE action='secure-tax.return-edit.approved'").get())).toMatchObject({ n: 0 });
});
it("exposes only the signed-in preparer's current signed enrollment scope before any client object exists", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g);
  const response = await readScopeRoute(request(`/scope?grantId=${g.grantId}`, staffToken)); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ grant: g, manifest });
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_objects").get())).toMatchObject({ n: 0 });
  expect((await readScopeRoute(request(`/scope?grantId=${g.grantId}`, ownerToken))).status).toBe(403);
  expect((await readScopeRoute(request(`/scope?grantId=${g.grantId}`, passwordOnlyStaff))).status).toBe(401);
  expect((await readScopeRoute(request(`/scope?grantId=${g.grantId}`, staffToken, undefined, "https://foreign.example"))).status).toBe(403);
  for (const query of [`grantId=${g.grantId}&grantId=${g.grantId}`, `grantId=${g.grantId}&extra=true`, ""]) expect((await readScopeRoute(request(`/scope?${query}`, staffToken))).status).toBe(400);
  withdrawStaffGrant(ownerToken, { grantId: g.grantId, expectedEpoch: 1 }); expect((await readScopeRoute(request(`/scope?grantId=${g.grantId}`, staffToken))).status).toBe(403);
});
it("publishes the firm's initial return and read capsule atomically, retaining later client data on retry", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const packet = approvedCreation(g);
  const response = await publishCreationRoute(request("/return-creations", ownerToken, packet)); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revision: 1, duplicate: false, staffAccountId: staff.id });
  expect(readSecureTaxObject(account.token, packet.approval.objectId)).toMatchObject({ envelope: packet.envelope });
  expect(readStaffObject(staffToken, g.grantId, packet.approval.objectId)).toMatchObject({ envelope: packet.envelope, capsule: packet.capsule });
  expect((await (await publishCreationRoute(request("/return-creations", ownerToken, packet))).json())).toMatchObject({ revision: 1, duplicate: true });
  const latest = envelope(2, packet.approval.objectId, "tax-document"); writeSecureTaxObject(account.token, latest.context.objectId, { mutationId: "later-client-change", expectedRevision: 1, envelope: latest }); const shared = capsule(g, latest); publishStaffCapsule(ownerToken, shared);
  expect((await (await publishCreationRoute(request("/return-creations", ownerToken, packet))).json())).toMatchObject({ revision: 1, duplicate: true });
  expect(readStaffObject(staffToken, g.grantId, latest.context.objectId)).toMatchObject({ envelope: latest, capsule: shared });
  const audit = workspaceDatabase(db => db.prepare("SELECT actor,snapshot FROM audit WHERE action='secure-tax.return-create.approved'").all()) as { actor: string; snapshot: string }[];
  expect(audit).toHaveLength(1); expect(audit[0].actor).toBe("workspace-owner"); expect(JSON.parse(audit[0].snapshot)).toEqual({ approval: packet.approval, sharingCapsuleId: packet.capsule.capsuleId });
  deleteSecureTaxObject(account.token, latest.context.objectId, { expectedRevision: 2 }); expect((await publishCreationRoute(request("/return-creations", ownerToken, packet))).status).toBe(409);
});
it("requires owner MFA before reading initial-return uploads and refuses private review kits", async () => {
  for (const token of [undefined, staffToken, account.token, passwordOnlyOwner, passwordOnlyStaff]) {
    const input = request("/return-creations", token, { unsupported: "must not be read" }), response = await publishCreationRoute(input);
    expect(response.status).toBe(token === staffToken ? 403 : 401); expect(input.bodyUsed).toBe(false);
  }
  expect((await publishCreationRoute(request("/return-creations", ownerToken, { version: 1, type: "shuug-private-return-creation-kit", privateReview: { after: "synthetic private input" } }))).status).toBe(400);
});
it("refuses initial return ID reuse, invalid capsules and changed signatures without partial publication", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const packet = approvedCreation(g);
  const badCapsule = structuredClone(packet); badCapsule.capsule.signature.value = randomBytes(64).toString("base64url"); expect((await publishCreationRoute(request("/return-creations", ownerToken, badCapsule))).status).toBe(403);
  const forged = structuredClone(packet); forged.approval.signature.value = randomBytes(64).toString("base64url"); expect((await publishCreationRoute(request("/return-creations", ownerToken, forged))).status).toBe(403);
  const changed = structuredClone(packet); changed.envelope.ciphertext = randomBytes(48).toString("base64url"); expect((await publishCreationRoute(request("/return-creations", ownerToken, changed))).status).toBe(403);
  expect((await publishCreationRoute(request("/return-creations", ownerToken, approvedEdit(g, envelope(1, "correction-only", "tax-document"))))).status).toBe(400);
  expect((await publishEditRoute(request("/return-edits", ownerToken, packet))).status).toBe(400);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_objects").get())).toMatchObject({ n: 0 });
  expect((await publishCreationRoute(request("/return-creations", ownerToken, packet))).status).toBe(200);
  const collision = approvedCreation(g, packet.approval.objectId); expect((await publishCreationRoute(request("/return-creations", ownerToken, collision))).status).toBe(409);
  const audit = workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM audit WHERE action='secure-tax.return-create.approved'").get()); expect(audit).toMatchObject({ n: 1 });
});
it("rechecks current initial-return grant, enrollment, roles and signed expiry at owner publication", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const packet = approvedCreation(g);
  setPermission("Manager", "services", "none"); expect((await publishCreationRoute(request("/return-creations", ownerToken, packet))).status).toBe(403); setPermission("Manager", "services", "view");
  withdrawStaffGrant(ownerToken, { grantId: g.grantId, expectedEpoch: 1 }); expect((await publishCreationRoute(request("/return-creations", ownerToken, packet))).status).toBe(403);
  const renewed = grant({ grantId: g.grantId, epoch: 2, domains: ["tax-document"] }); publishStaffGrant(ownerToken, renewed); expect((await publishCreationRoute(request("/return-creations", ownerToken, packet))).status).toBe(409);
  const current = approvedCreation(renewed); manifest = enrollment(2); seedHistoricalEnrollment(account.token, manifest); expect((await publishCreationRoute(request("/return-creations", ownerToken, current))).status).toBe(409);
  const expired = approvedCreation(renewed); vi.advanceTimersByTime(600001); expect((await publishCreationRoute(request("/return-creations", ownerToken, expired))).status).toBe(409);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_objects").get())).toMatchObject({ n: 0 });
});
it("publishes approved case creation/updates atomically and preserves newer approved history on old retries", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const first = approvedCase(g);
  expect(() => writeSecureTaxObject(account.token, first.approval.objectId, { mutationId: "unpublished-firm-case", expectedRevision: 0, envelope: first.envelope })).toThrow(/Firm-managed/);
  expect(() => writeSecureTaxObject(account.token, first.approval.objectId, { mutationId: "unpublished-client-reencryption", expectedRevision: 0, envelope: envelope(1, first.approval.objectId, "tax-document") })).toThrow(/Firm-managed/);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_objects").get())).toMatchObject({ n: 0 });
  expect(await (await publishCaseRoute(request("/cases", ownerToken, first))).json()).toMatchObject({ revision: 1, duplicate: false });
  expect(readStaffObject(staffToken, g.grantId, first.approval.objectId)).toMatchObject({ envelope: first.envelope, capsule: first.capsule });
  const next = approvedCase(g, first.envelope); expect(await (await publishCaseRoute(request("/cases", ownerToken, next))).json()).toMatchObject({ revision: 2, duplicate: false });
  expect(readSecureTaxObject(account.token, first.approval.objectId)).toMatchObject({ envelope: next.envelope });
  const later = approvedCase(g, next.envelope); expect((await publishCaseRoute(request("/cases", ownerToken, later))).status).toBe(200);
  expect(() => writeSecureTaxObject(account.token, first.approval.objectId, { mutationId: "ordinary-client-overwrite", expectedRevision: 3, envelope: envelope(4, first.approval.objectId, "tax-document") })).toThrow(/Firm-managed/);
  expect(() => deleteSecureTaxObject(account.token, first.approval.objectId, { expectedRevision: 3 })).toThrow(/Firm-managed/);
  expect((await publishEditRoute(request("/return-edits", ownerToken, approvedEdit(g, later.envelope)))).status).toBe(403);
  for (const packet of [first, next]) expect(await (await publishCaseRoute(request("/cases", ownerToken, packet))).json()).toMatchObject({ revision: packet.envelope.context.revision, duplicate: true });
  expect(readStaffObject(staffToken, g.grantId, first.approval.objectId)).toMatchObject({ envelope: later.envelope, capsule: later.capsule });
  const rows = workspaceDatabase(db => db.prepare("SELECT actor,snapshot FROM audit WHERE action='secure-tax.case.approved'").all()) as { actor: string; snapshot: string }[];
  expect(rows).toHaveLength(3); for (const [index, row] of rows.entries()) { expect(row.actor).toBe("workspace-owner"); const packet = [first, next, later][index]; expect(JSON.parse(row.snapshot)).toEqual({ approval: packet.approval, sharingCapsuleId: packet.capsule.capsuleId }); }
  const removed = envelope(1, "prior-deleted-target", "tax-document"); writeSecureTaxObject(account.token, removed.context.objectId, { mutationId: "unmanaged-create", expectedRevision: 0, envelope: removed }); deleteSecureTaxObject(account.token, removed.context.objectId, { expectedRevision: 1 });
  const archivedId = "shuug-case:prior-deleted-target"; workspaceDatabase(db => db.prepare("UPDATE secure_tax_objects SET id=? WHERE accountId=? AND id=?").run(archivedId, account.id, removed.context.objectId), true);
  expect((await publishCaseRoute(request("/cases", ownerToken, approvedCase(g, undefined, archivedId)))).status).toBe(409);
});
it("requires owner MFA before consuming case uploads and excludes private action/review fields", async () => {
  for (const token of [undefined, staffToken, account.token, passwordOnlyOwner, passwordOnlyStaff]) {
    const input = request("/cases", token, { unsupported: "must not be read" }), response = await publishCaseRoute(input); expect(response.status).toBe(token === staffToken ? 403 : 401); expect(input.bodyUsed).toBe(false);
  }
  expect((await publishCaseRoute(request("/cases", ownerToken, { version: 1, type: "shuug-private-case-review-kit", privateReview: { title: "private" } }))).status).toBe(400);
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const packet = approvedCase(g);
  expect((await publishCaseRoute(request("/cases", ownerToken, { ...packet, command: { type: "document.review" } }))).status).toBe(400);
  expect((await publishCaseRoute(request("/cases", ownerToken, approvedCreation(g)))).status).toBe(400);
  expect((await publishCreationRoute(request("/return-creations", ownerToken, packet))).status).toBe(400);
});
it("refuses case ID collisions and forged or wrong source/capsule approvals without partial writes", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const packet = approvedCase(g);
  const forged = structuredClone(packet); forged.approval.signature.value = randomBytes(64).toString("base64url"); expect((await publishCaseRoute(request("/cases", ownerToken, forged))).status).toBe(403);
  const badCapsule = structuredClone(packet); badCapsule.capsule.signature.value = randomBytes(64).toString("base64url"); expect((await publishCaseRoute(request("/cases", ownerToken, badCapsule))).status).toBe(403);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_objects").get())).toMatchObject({ n: 0 });
  expect((await publishCaseRoute(request("/cases", ownerToken, packet))).status).toBe(200);
  expect((await publishCaseRoute(request("/cases", ownerToken, approvedCase(g)))).status).toBe(409);
  const wrongSource = approvedCase(g, packet.envelope); wrongSource.approval.sourceEnvelopeDigest = randomBytes(32).toString("base64url"); signed(wrongSource.approval, canonicalCaseApproval);
  expect((await publishCaseRoute(request("/cases", ownerToken, wrongSource))).status).toBe(409);
  const stale = approvedCase(g, packet.envelope), next = approvedCase(g, packet.envelope); expect((await publishCaseRoute(request("/cases", ownerToken, next))).status).toBe(200); expect((await publishCaseRoute(request("/cases", ownerToken, stale))).status).toBe(409);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM audit WHERE action='secure-tax.case.approved'").get())).toMatchObject({ n: 2 });
});
it("rechecks current case assignment, enrollment, client links, active staff and publication expiry", async () => {
  const g = grant({ domains: ["tax-document"] }); publishStaffGrant(ownerToken, g); const packet = approvedCase(g);
  workspaceDatabase(db => db.prepare("UPDATE customer_accounts SET clientId=? WHERE id=?").run(randomUUID(), account.id), true); expect((await publishCaseRoute(request("/cases", ownerToken, packet))).status).toBe(403);
  workspaceDatabase(db => db.prepare("UPDATE customer_accounts SET clientId=? WHERE id=?").run(account.clientId, account.id), true);
  setEmployeeEnabled(staff.id, false); expect((await publishCaseRoute(request("/cases", ownerToken, packet))).status).toBe(403); setEmployeeEnabled(staff.id, true); acceptEmployeeInvitation(issueEmployeeInvitation(staff.id), password);
  withdrawStaffGrant(ownerToken, { grantId: g.grantId, expectedEpoch: 1 }); expect((await publishCaseRoute(request("/cases", ownerToken, packet))).status).toBe(403);
  const renewed = grant({ grantId: g.grantId, epoch: 2, domains: ["tax-document"] }); publishStaffGrant(ownerToken, renewed); expect((await publishCaseRoute(request("/cases", ownerToken, packet))).status).toBe(409);
  const current = approvedCase(renewed); manifest = enrollment(2); seedHistoricalEnrollment(account.token, manifest); expect((await publishCaseRoute(request("/cases", ownerToken, current))).status).toBe(409);
  const expired = approvedCase(renewed); vi.advanceTimersByTime(600001); expect((await publishCaseRoute(request("/cases", ownerToken, expired))).status).toBe(409);
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_objects").get())).toMatchObject({ n: 0 });
});
it("rechecks active real staff, current role and client links on every access", () => {
  const g = grant(); publishStaffGrant(ownerToken, g);
  setPermission("Manager", "services", "none"); expect(listStaffGrants(staffToken).grants).toEqual([]);
  setPermission("Manager", "services", "view"); expect(listStaffGrants(staffToken).grants).toHaveLength(1);
  workspaceDatabase(db => db.prepare("UPDATE customer_accounts SET clientId=? WHERE id=?").run(randomUUID(), account.id), true);
  expect(listStaffGrants(staffToken).grants).toEqual([]);
  workspaceDatabase(db => db.prepare("UPDATE customer_accounts SET clientId=? WHERE id=?").run(account.clientId, account.id), true);
  expect(listStaffGrants(staffToken).grants).toHaveLength(1);
  setEmployeeEnabled(staff.id, false); expect(() => listStaffGrants(staffToken)).toThrow(/revoked/);
});
it("allows higher-epoch renewal or revocation after an active grant expires, without permitting expired access", () => {
  const g = grant({ expiresAt: new Date(Date.now() + 1000).toISOString() }); publishStaffGrant(ownerToken, g); vi.advanceTimersByTime(2000);
  expect(listStaffGrants(staffToken).grants).toEqual([]);
  const renewed = grant({ grantId: g.grantId, epoch: 2, expiresAt: new Date(Date.now() + 1000).toISOString() });
  expect(publishStaffGrant(ownerToken, renewed)).toMatchObject({ approved: true }); vi.advanceTimersByTime(2000);
  expect(publishStaffGrant(ownerToken, grant({ grantId: g.grantId, epoch: 3, status: "revoked" }))).toMatchObject({ approved: false });
});
it("returns only the signed-in staff member's genuine signed revocation notices, including expired notices", () => {
  const active = grant(); publishStaffGrant(ownerToken, active); withdrawStaffGrant(ownerToken, { grantId: active.grantId, expectedEpoch: active.epoch });
  expect(listStaffGrants(staffToken)).toEqual({ grants: [], revocations: [] });
  const times = { issuedAt: new Date(Date.now() - 120000).toISOString(), expiresAt: new Date(Date.now() - 60000).toISOString() };
  const own = grant({ grantId: active.grantId, epoch: 2, status: "revoked", ...times }); publishStaffGrant(ownerToken, own);
  const member = addMember({ name: "Other staff", email: "other-staff@example.invalid", role: "Manager" });
  const other = createEmployeeAccount({ memberId: member.id, name: member.name, email: member.email }); acceptEmployeeInvitation(issueEmployeeInvitation(other.id), password);
  publishStaffGrant(ownerToken, grant({ grantId: "other-revocation", staffAccountId: other.id, epoch: 2, status: "revoked", ...times }));
  expect(listStaffGrants(staffToken)).toEqual({ grants: [], revocations: [own] });
  expect(() => readStaffObject(staffToken, own.grantId, "opaque-object")).toThrow(/revoked/);
});
it("pages a signed staff history larger than one response and rejects changed or ambiguous continuations", async () => {
  for (let index = 0; index < 130; index++) publishStaffGrant(ownerToken, grant({ grantId: `paged-${String(index).padStart(3, "0")}`, status: index < 3 ? "revoked" : "active" }));
  expect(Buffer.byteLength(JSON.stringify(listStaffGrants(staffToken)))).toBeGreaterThan(65536);
  const headers = { Origin: origin, Authorization: `Bearer ${staffToken}` };
  let after = "", snapshot = "", pages = 0; const ids: string[] = [];
  do {
    const query = new URLSearchParams({ limit: "25", ...(after ? { after, snapshot } : {}) });
    const response = await listGrantRoute(new Request(`${base}/api/website/customer/secure/staff/grants?${query}`, { headers }));
    expect(response.status).toBe(200); const body = await response.text(); expect(Buffer.byteLength(body)).toBeLessThan(65536);
    const page = JSON.parse(body); if (snapshot) expect(page.snapshot).toBe(snapshot); snapshot = page.snapshot;
    ids.push(...page.grants.map((value: StaffGrant) => value.grantId), ...page.revocations.map((value: StaffGrant) => value.grantId));
    after = page.nextCursor; pages++;
  } while (after);
  expect(pages).toBe(6); expect(new Set(ids).size).toBe(130);
  expect(listStaffGrants(ownerToken, { limit: 25 })).toMatchObject({ grants: [], revocations: [], nextCursor: null });
  for (const query of ["limit=26", "limit=1&limit=2", "after=paged-024", "unexpected=true"]) {
    const response = await listGrantRoute(new Request(`${base}/api/website/customer/secure/staff/grants?${query}`, { headers })); expect(response.status).toBe(400);
  }
  withdrawStaffGrant(ownerToken, { grantId: "paged-129", expectedEpoch: 1 });
  expect(() => listStaffGrants(staffToken, { after: "paged-024", snapshot, limit: 25 })).toThrow(/changed during pagination/);
});
