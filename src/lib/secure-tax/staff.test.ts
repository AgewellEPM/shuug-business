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
import { enrollSecureTax, writeSecureTaxObject, deleteSecureTaxObject } from "./store";
import { secureStaffStatus, secureStaffSignIn, secureStaffSignOut } from "./staff-session";
import { publishStaffGrant, publishStaffCapsule, withdrawStaffGrant, listStaffGrants, listStaffChanges, readStaffObject } from "./staff-store";
import { staffGrantDigest, staffEnvelopeDigest, type StaffGrant, type StaffCapsule } from "./staff-model";
import { canonicalStaffGrant, canonicalStaffCapsule } from "../../../packages/secure-tax-client/staff-contract.mjs";
import { POST as publishGrantRoute } from "@/app/api/website/customer/secure/staff/grants/route";
import { GET as readObjectRoute } from "@/app/api/website/customer/secure/staff/objects/[id]/route";

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
  manifest = enrollment(); enrollSecureTax(account.token, manifest);
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
