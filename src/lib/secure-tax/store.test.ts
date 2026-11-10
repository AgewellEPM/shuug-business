// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { gigTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { createLinkedCustomer, saveCustomerSettings } from "../customer-access/service";
import { saveDriverRecord } from "../rideshare-driver/store";
import { addRecord } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled, CUSTOMER_PATH } from "../customer-access/accounts";
import { enrollSecureTax, secureTaxStatus, writeSecureTaxObject, readSecureTaxObject, deleteSecureTaxObject, listSecureTaxChanges } from "./store";
import { canonicalManifest, SECURE_TAX_DOMAINS, type SignedRecipientManifest, type SecureTaxEnvelope } from "./envelope";
import { POST as enroll } from "@/app/api/website/customer/secure/enroll/route";
import { GET as status } from "@/app/api/website/customer/secure/status/route";
import { GET, PUT, DELETE, OPTIONS } from "@/app/api/website/customer/secure/objects/[id]/route";

const base = "https://workspace.example.com", trustedOrigin = "https://trusted.example.net", password = "Synthetic-vault-client-password";
const keyPair = () => {
  // Synthetic RAM-only test keys; production storage never generates or receives private keys.
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  return { publicKey, keyId: createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest("base64url"), privateKey: pair.privateKey };
};
const nativeProof = "/private/tmp/native-secure-tax-envelope-proof";
let directory: string, signer: ReturnType<typeof keyPair>, recovery: ReturnType<typeof keyPair>;
let alpha: { id: string; token: string; clientId: string; key: ReturnType<typeof keyPair> }, beta: typeof alpha;
function manifest(account = alpha, epoch = 1, changes: Partial<SignedRecipientManifest> = {}): SignedRecipientManifest {
  const value: SignedRecipientManifest = { version: 1, manifestId: `manifest-${account.id}-${epoch}`, workspaceId: "synthetic-workspace", accountId: account.id, clientId: account.clientId, epoch,
    client: { keyId: account.key.keyId, publicKey: account.key.publicKey }, firmRecovery: { keyId: recovery.keyId, publicKey: recovery.publicKey }, issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    signature: { algorithm: "ES256-P1363", signerKeyId: signer.keyId, value: "" }, ...changes };
  value.signature.value = sign("sha256", Buffer.from(canonicalManifest(value)), { key: signer.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return value;
}
function envelope(account = alpha, id = "opaque-object", revision = 1, domain: SecureTaxEnvelope["context"]["domain"] = "driver-record"): SecureTaxEnvelope {
  // Framing fixture, deliberately not an encryption proof. Native/browser crypto
  // tests independently establish HPKE+AEAD confidentiality and interoperability.
  return { version: 2, suite: "HPKE-P256-SHA256-A256GCM", contentAlgorithm: "AES-256-GCM", hpkeMode: "auth", author: { role: "client", keyId: account.key.keyId }, context: { workspaceId: "synthetic-workspace", accountId: account.id, objectId: id, revision, domain }, nonce: randomBytes(12).toString("base64url"), ciphertext: randomBytes(48).toString("base64url"),
    recipients: [ { role: "client", keyId: account.key.keyId, publicKey: account.key.publicKey, encapsulatedKey: account.key.publicKey, wrappedKey: randomBytes(48).toString("base64url") }, { role: "firm-recovery", keyId: recovery.keyId, publicKey: recovery.publicKey, encapsulatedKey: recovery.publicKey, wrappedKey: randomBytes(48).toString("base64url") } ] };
}
const ctx = (id = "opaque-object") => ({ params: Promise.resolve({ id }) });
const http = (method = "GET", body?: unknown, token = alpha.token, origin?: string) => new Request(`${base}${CUSTOMER_PATH}/secure/objects/opaque-object`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(origin ? { Origin: origin } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-opaque-vault-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  signer = keyPair(); recovery = keyPair();
  vi.stubEnv("SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY", signer.publicKey); vi.stubEnv("SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY", recovery.publicKey); vi.stubEnv("SHUUG_SECURE_TAX_WORKSPACE_ID", "synthetic-workspace"); vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN", trustedOrigin);
  importBusinessTemplate(gigTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), password);
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, password), key: keyPair() };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("requires explicit signed enrollment and configured offhost public pins without generating host keys", async () => {
  expect(secureTaxStatus(alpha.token)).toMatchObject({ enrolled: false, identity: { accountId: alpha.id, clientId: alpha.clientId }, secureRequired: false, keyProvisioningEnabled: true });
  expect(secureTaxStatus(beta.token)).toMatchObject({ identity: { accountId: beta.id, clientId: beta.clientId } });
  expect(() => writeSecureTaxObject(alpha.token, "opaque-object", { mutationId: "write-1", expectedRevision: 0, envelope: envelope() })).toThrow("Enroll");
  const signed = manifest(); vi.stubEnv("SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY", "");
  expect((await enroll(http("POST", signed))).status).toBe(503);
  expect(secureTaxStatus(alpha.token)).toMatchObject({ enrolled: false, keyProvisioningEnabled: false });
  vi.stubEnv("SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY", signer.publicKey);
  const response = await enroll(http("POST", signed)); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ enrolled: true, plaintextMigrationPerformed: false });
  const row = workspaceDatabase(db => db.prepare("SELECT * FROM secure_tax_enrollments WHERE accountId=?").get(alpha.id));
  expect(JSON.stringify(row)).not.toMatch(/privateKey|password|ssn/i);
});

it("rejects manifest substitution, forged signatures, wrong clients, expiry and epoch downgrade", () => {
  const attacker = keyPair();
  expect(() => enrollSecureTax(alpha.token, manifest(alpha, 1, { firmRecovery: { keyId: attacker.keyId, publicKey: attacker.publicKey } }))).toThrow("public pins");
  const forged = manifest(); forged.signature.value = randomBytes(64).toString("base64url");
  expect(() => enrollSecureTax(alpha.token, forged)).toThrow("signature");
  expect(() => enrollSecureTax(alpha.token, manifest(beta))).toThrow("does not belong");
  expect(() => enrollSecureTax(alpha.token, manifest(alpha, 1, { expiresAt: new Date(Date.now() - 1).toISOString() }))).toThrow("expired");
  const first = manifest(), second = manifest(alpha, 2);
  enrollSecureTax(alpha.token, first); enrollSecureTax(alpha.token, second);
  expect(() => enrollSecureTax(alpha.token, first)).toThrow("older");
  expect(() => enrollSecureTax(alpha.token, manifest(alpha, 2, { manifestId: "changed-same-epoch" }))).toThrow("higher epoch");
  expect(enrollSecureTax(alpha.token, second).enrolled).toBe(true);
});

it("renews existing keys but refuses to orphan live objects by rotating either recipient", () => {
  enrollSecureTax(alpha.token, manifest());
  writeSecureTaxObject(alpha.token, "opaque-object", { mutationId: "create", expectedRevision: 0, envelope: envelope() });
  const nextClient = { ...alpha, key: keyPair() };
  expect(() => enrollSecureTax(alpha.token, manifest(nextClient, 2))).toThrow("rewrap or migration");
  expect(enrollSecureTax(alpha.token, manifest(alpha, 2))).toMatchObject({ enrolled: true, manifest: { epoch: 2 } });
  expect(readSecureTaxObject(alpha.token, "opaque-object")).toHaveProperty("envelope");
  const previousRecovery = recovery;
  recovery = keyPair(); vi.stubEnv("SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY", recovery.publicKey);
  expect(() => enrollSecureTax(alpha.token, manifest(alpha, 3))).toThrow("rewrap or migration");
  recovery = previousRecovery; vi.stubEnv("SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY", recovery.publicKey);
  expect(secureTaxStatus(alpha.token)).toMatchObject({ manifest: { epoch: 2, client: { keyId: alpha.key.keyId }, firmRecovery: { keyId: recovery.keyId } } });
  deleteSecureTaxObject(alpha.token, "opaque-object", { expectedRevision: 1 });
  expect(enrollSecureTax(alpha.token, manifest(nextClient, 3))).toMatchObject({ enrolled: true, manifest: { epoch: 3, client: { keyId: nextClient.key.keyId } } });
});

it("stores opaque envelopes for every supported feature domain and returns metadata-only sync pages", () => {
  enrollSecureTax(alpha.token, manifest());
  for (const [index, domain] of SECURE_TAX_DOMAINS.entries()) {
    writeSecureTaxObject(alpha.token, `object-${index}`, { mutationId: `write-${index}`, expectedRevision: 0, envelope: envelope(alpha, `object-${index}`, 1, domain) });
  }
  const page = listSecureTaxChanges(alpha.token, 0, 2);
  expect(page.changes).toHaveLength(2); expect(page.hasMore).toBe(true);
  expect(Object.keys(page.changes[0]).sort()).toEqual(["deleted", "objectId", "revision", "sequence"]);
  expect(JSON.stringify(page)).not.toMatch(/ciphertext|publicKey|domain/);
  expect(listSecureTaxChanges(alpha.token, page.cursor, 200).changes).toHaveLength(SECURE_TAX_DOMAINS.length - 2);
  expect(readSecureTaxObject(alpha.token, "object-0")).toHaveProperty("envelope.context.domain", SECURE_TAX_DOMAINS[0]);
});

it("refuses plaintext aliases, malformed framing, unknown domains and untrusted envelope recipients", async () => {
  enrollSecureTax(alpha.token, manifest());
  const original = envelope();
  for (const value of [ { ...original, plaintext: { ssn: "000-11-2222" } }, { ...original, filename: "Sensitive taxpayer.pdf" }, { ...original, recipients: [original.recipients[0]] }, { ...original, context: { ...original.context, domain: "plaintext-tax" } }, { ...original, context: { ...original.context, objectId: "opaque-object\n" } }, { ...original, version: 1 }, { ...original, hpkeMode: "base" }, { ...original, author: undefined } ]) {
    const response = await PUT(http("PUT", { mutationId: "bad", expectedRevision: 0, envelope: value }), ctx());
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("000-11-2222");
  }
  const changed = structuredClone(original); changed.recipients[1] = { ...changed.recipients[1], publicKey: beta.key.publicKey, keyId: beta.key.keyId };
  expect((await PUT(http("PUT", { mutationId: "wrong-recipient", expectedRevision: 0, envelope: changed }), ctx())).status).toBe(403);
  const wrongAuthor = { ...original, author: { role: "client", keyId: beta.key.keyId } };
  expect((await PUT(http("PUT", { mutationId: "wrong-author", expectedRevision: 0, envelope: wrongAuthor }), ctx())).status).toBe(403);
  expect(listSecureTaxChanges(alpha.token).changes).toEqual([]);
});

it("enforces account ownership, origin policy and authentication before reading encrypted mutation bodies", async () => {
  enrollSecureTax(alpha.token, manifest()); enrollSecureTax(beta.token, manifest(beta));
  const input = { mutationId: "create", expectedRevision: 0, envelope: envelope() };
  expect((await PUT(http("PUT", input), ctx())).status).toBe(200);
  expect((await GET(http("GET", undefined, beta.token), ctx())).status).toBe(404);
  expect((await PUT(http("PUT", input, beta.token), ctx())).status).toBe(403);
  expect((await DELETE(http("DELETE", { expectedRevision: 1 }, beta.token), ctx())).status).toBe(404);
  expect((await GET(http("GET", undefined, "forged"), ctx())).status).toBe(401);
  expect((await PUT(http("PUT", input, alpha.token, "https://attacker.example"), ctx())).status).toBe(403);
  const cookie = new Request(base + "/secure", { method: "PUT", headers: { Cookie: `shuug_customer=${alpha.token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  expect((await PUT(cookie, ctx())).status).toBe(403);
  const allowed = await OPTIONS(new Request(base + "/secure", { method: "OPTIONS", headers: { Origin: trustedOrigin } }));
  expect(allowed.headers.get("access-control-allow-origin")).toBe(trustedOrigin);
  expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
  vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN", base);
  expect((await PUT(http("PUT", input, alpha.token, base), ctx())).status).toBe(503);
});

it("makes retries idempotent and refuses stale revisions or rebinding authenticated context", () => {
  enrollSecureTax(alpha.token, manifest());
  const input = { mutationId: "create", expectedRevision: 0, envelope: envelope() };
  expect(writeSecureTaxObject(alpha.token, "opaque-object", input)).toMatchObject({ revision: 1, duplicate: false });
  expect(writeSecureTaxObject(alpha.token, "opaque-object", input)).toMatchObject({ revision: 1, duplicate: true });
  expect(() => writeSecureTaxObject(alpha.token, "opaque-object", { ...input, envelope: envelope() })).toThrow("different content");
  expect(() => writeSecureTaxObject(alpha.token, "opaque-object", { ...input, mutationId: "stale" })).toThrow("another device");
  expect(() => writeSecureTaxObject(alpha.token, "other-object", { ...input, mutationId: "rebound" })).toThrow("does not match");
  const update = { mutationId: "update", expectedRevision: 1, envelope: envelope(alpha, "opaque-object", 2) };
  expect(writeSecureTaxObject(alpha.token, "opaque-object", update)).toMatchObject({ revision: 2 });
  expect((readSecureTaxObject(alpha.token, "opaque-object") as { envelope: unknown }).envelope).toEqual(update.envelope);
});

it("purges live ciphertext and every object mutation cache, leaving only a content-free tombstone", async () => {
  enrollSecureTax(alpha.token, manifest());
  const input = { mutationId: "create", expectedRevision: 0, envelope: envelope() };
  writeSecureTaxObject(alpha.token, "opaque-object", input);
  writeSecureTaxObject(alpha.token, "opaque-object", { mutationId: "update", expectedRevision: 1, envelope: envelope(alpha, "opaque-object", 2) });
  const response = await DELETE(http("DELETE", { expectedRevision: 2 }), ctx());
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ deleted: true, revision: 3, liveCiphertextPurged: true, backupRetention: expect.stringContaining("backups") });
  const row = workspaceDatabase(db => db.prepare("SELECT * FROM secure_tax_objects WHERE accountId=?").get(alpha.id));
  expect(row).toMatchObject({ body: null, ciphertextBytes: 0, deleted: 1, revision: 3 });
  expect(workspaceDatabase(db => db.prepare("SELECT * FROM secure_tax_mutations WHERE accountId=?").all(alpha.id))).toEqual([]);
  const tombstone = readSecureTaxObject(alpha.token, "opaque-object");
  expect(Object.keys(tombstone).sort()).toEqual(["deleted", "objectId", "revision", "sequence"]);
  expect(() => writeSecureTaxObject(alpha.token, "opaque-object", input)).toThrow("another device");
  expect(deleteSecureTaxObject(alpha.token, "opaque-object", { expectedRevision: 2 })).toMatchObject({ deleted: true, revision: 3 });
});

it("rechecks session revocation and missing pins and never falls back to plaintext access", async () => {
  enrollSecureTax(alpha.token, manifest());
  setCustomerEnabled(alpha.id, false);
  expect((await status(http())).status).toBe(401);
  enrollSecureTax(beta.token, manifest(beta)); vi.stubEnv("SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY", "");
  expect((await GET(http("GET", undefined, beta.token), ctx())).status).toBe(503);
  expect(() => listSecureTaxChanges(beta.token)).toThrow("disabled");
});

it("rejects a fresh authenticated ciphertext that targets a deleted object's exact current revision", async () => {
  enrollSecureTax(alpha.token, manifest());
  writeSecureTaxObject(alpha.token, "opaque-object", { mutationId: "create", expectedRevision: 0, envelope: envelope() });
  deleteSecureTaxObject(alpha.token, "opaque-object", { expectedRevision: 1 });
  const before = readSecureTaxObject(alpha.token, "opaque-object");
  const response = await PUT(http("PUT", { mutationId: "new-after-delete", expectedRevision: 2, envelope: envelope(alpha, "opaque-object", 3) }), ctx());
  expect(response.status).toBe(409);
  expect(readSecureTaxObject(alpha.token, "opaque-object")).toEqual(before);
  expect(workspaceDatabase(db => db.prepare("SELECT * FROM secure_tax_mutations WHERE accountId=?").all(alpha.id))).toEqual([]);
});

it("deletes the final accepted encrypted revision into a bounded tombstone and retries without resurrection", async () => {
  enrollSecureTax(alpha.token, manifest());
  writeSecureTaxObject(alpha.token, "opaque-object", { mutationId: "create", expectedRevision: 0, envelope: envelope() });
  // Advance a synthetic fixture directly instead of making a billion writes.
  workspaceDatabase(db => db.prepare("UPDATE secure_tax_objects SET revision=?,body=? WHERE accountId=? AND id='opaque-object'")
    .run(999_999_999, JSON.stringify(envelope(alpha, "opaque-object", 999_999_999)), alpha.id), true);
  const finalWrite = { mutationId: "final-write", expectedRevision: 999_999_999, envelope: envelope(alpha, "opaque-object", 1_000_000_000) };
  expect(writeSecureTaxObject(alpha.token, "opaque-object", finalWrite)).toMatchObject({ revision: 1_000_000_000 });
  const response = await DELETE(http("DELETE", { expectedRevision: 1_000_000_000 }), ctx());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revision: 1_000_000_001, deleted: true, liveCiphertextPurged: true });
  for (const expectedRevision of [1_000_000_000, 1_000_000_001]) {
    expect(deleteSecureTaxObject(alpha.token, "opaque-object", { expectedRevision })).toMatchObject({ revision: 1_000_000_001, deleted: true });
  }
  expect(() => deleteSecureTaxObject(alpha.token, "opaque-object", { expectedRevision: 1_000_000_002 })).toThrow();
  expect(() => writeSecureTaxObject(alpha.token, "opaque-object", finalWrite)).toThrow("another device");
  expect(workspaceDatabase(db => db.prepare("SELECT body,ciphertextBytes FROM secure_tax_objects WHERE accountId=? AND id='opaque-object'").get(alpha.id))).toMatchObject({ body: null, ciphertextBytes: 0 });
  expect(workspaceDatabase(db => db.prepare("SELECT count(*) AS n FROM secure_tax_mutations WHERE accountId=? AND objectId='opaque-object'").get(alpha.id))).toMatchObject({ n: 0 });
});

it("reports enrollment separately from legacy migration and retained provider authorizations", () => {
  saveDriverRecord(alpha.token, { mutationId: "00000000-0000-4000-8000-000000000001", record: { id: "00000000-0000-4000-8000-000000000002", revision: 0, kind: "income", deleted: false, body: { date: "2026-11-07", platform: "uber", description: "Synthetic legacy income", amountCents: 1000, currency: "USD", notes: "" } } });
  addRecord("tax-engagements", moduleById("tax-engagements")!.fields, { name: "Synthetic legacy preparation", client_id: alpha.clientId, tax_year: 2026, stage: "Intake" });
  workspaceDatabase(db => {
    db.exec("CREATE TABLE driver_bank_items(id TEXT PRIMARY KEY,accountId TEXT,clientId TEXT,secret TEXT)");
    db.prepare("INSERT INTO driver_bank_items VALUES('synthetic-bank',?,?,?)").run(alpha.id, alpha.clientId, "synthetic-host-held-provider-token");
  }, true);
  const result = enrollSecureTax(alpha.token, manifest());
  expect(result).toMatchObject({ enrolled: true, plaintextMigrationPerformed: false, legacyMigrationRequired: true, legacyProviderAuthorizationPresent: true,
    migrationVerificationRequired: true, hostCompromiseProtectionVerified: false, backupAndHistoryReviewRequired: true,
    legacyCounts: { driverRecords: 1, driverMutationCaches: 1, bankProviderAuthorizations: 1, sdkTaxRecords: 1 } });
  expect(JSON.stringify(result)).not.toContain("Synthetic legacy income");
  expect(JSON.stringify(result)).not.toContain("synthetic-host-held-provider-token");
  expect(() => saveDriverRecord(alpha.token, { mutationId: "00000000-0000-4000-8000-000000000003", record: { id: "00000000-0000-4000-8000-000000000004", revision: 0, kind: "income", deleted: false, body: { date: "2026-11-07", platform: "uber", description: "New plaintext blocked", amountCents: 1000, currency: "USD", notes: "" } } })).toThrow("offhost encrypted");
});

(existsSync(nativeProof) ? it : it.skip)("round-trips a real native-sealed synthetic secret through opaque storage and both offhost recipient roles", () => {
  const context = { workspaceId: "synthetic-workspace", accountId: alpha.id, objectId: "native-encrypted-secret", revision: 1, domain: "tax-identity" };
  const plaintext = Buffer.from(JSON.stringify({ ssn: "000-12-3456", name: "Synthetic Secret Driver", document: "Synthetic W2.pdf", amountCents: 1234567 }));
  const run = (command: "seal" | "open", input: unknown) => {
    const result = spawnSync(nativeProof, [command], { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    expect(result.status).toBe(0);
    const value = JSON.parse(result.stdout); expect(value.ok).toBe(true); return value;
  };
  const common = { syntheticOnly: true, context, clientPublicKey: alpha.key.publicKey, firmRecoveryPublicKey: recovery.publicKey };
  const authorPrivateKey = alpha.key.privateKey.export({ format: "jwk" }).d!;
  const { envelope: encrypted } = run("seal", { ...common, plaintext: plaintext.toString("base64url"), authorRole: "client", authorPrivateKey });
  enrollSecureTax(alpha.token, manifest());
  writeSecureTaxObject(alpha.token, context.objectId, { mutationId: "native-write", expectedRevision: 0, envelope: encrypted });
  const stored = readSecureTaxObject(alpha.token, context.objectId) as { envelope: unknown };
  for (const [role, key] of [["client", alpha.key], ["firm-recovery", recovery]] as const) {
    const privateKey = key.privateKey.export({ format: "jwk" }).d!;
    const opened = run("open", { ...common, envelope: stored.envelope, role, privateKey });
    expect(Buffer.from(opened.plaintext, "base64url")).toEqual(plaintext);
  }
  for (const filename of readdirSync(directory).filter(name => name.startsWith("workspace.sqlite"))) {
    const disk = readFileSync(path.join(directory, filename));
    for (const secret of ["000-12-3456", "Synthetic Secret Driver", "Synthetic W2.pdf"]) expect(disk.includes(Buffer.from(secret))).toBe(false);
  }
  expect(readdirSync(directory)).not.toContain("vault.key");
});
