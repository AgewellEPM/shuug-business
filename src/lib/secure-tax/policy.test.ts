// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { secureTaxRequired, assertPlaintextTaxAllowed, SecureTaxRequiredError } from "./policy";
import { workspaceDatabase } from "../workspace/database";
import { saveBusinessRecord } from "../workspace/store";
import { importBusinessTemplate } from "../branding/templates";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { createLinkedCustomer, saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer } from "../customer-access/accounts";
import { addRecord, changeModuleRecords, listRecords, updateRecord } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { saveDriverRecord, readDriverRecords } from "../rideshare-driver/store";
import { saveDriverReceipt } from "../rideshare-driver/receipts";
import { submitTaxDocument } from "../customer-access/tax-documents";
import { bankFeed, bankStatus, cancelBankLink, createBankLink, disconnectBank, exchangeBankLink, syncBankItem } from "../rideshare-driver/bank-store";
import { authorizeUber, completeUberAuthorization, disconnectUber, syncUber, uberConnectionSummary } from "../gig-connections/uber";
import { beginUberState, connectUberScope, consumeUberState, initUber } from "../gig-connections/uber-store";
import { UBER_DRIVER_SCOPES } from "../gig-connections/uber-provider";
import { POST as recordPost } from "@/app/api/website/customer/driver/records/route";
import { PUT as receiptPut } from "@/app/api/website/customer/driver/receipts/[id]/route";
import { POST as documentPost } from "@/app/api/website/customer/documents/route";
import { PATCH as profilePatch } from "@/app/api/website/customer/driver/profile/route";

type Account = { id: string; clientId: string; token: string };
let directory: string, alpha: Account, beta: Account;
const base = "https://workspace.example.com";
const png = Buffer.from("89504e470d0a1a0a01020304", "hex");
const enrollmentSchema = `CREATE TABLE IF NOT EXISTS secure_tax_enrollments(
  accountId TEXT PRIMARY KEY, clientId TEXT NOT NULL, manifestId TEXT NOT NULL,
  workspaceId TEXT NOT NULL, epoch INTEGER NOT NULL, clientRecipientId TEXT NOT NULL,
  firmRecipientId TEXT NOT NULL, manifest TEXT NOT NULL, enrolledAt TEXT NOT NULL, status TEXT NOT NULL)`;
function enroll(account = alpha) {
  // The enrollment API's signed-manifest/key proof is tested by secure-tax/store;
  // this policy fixture inserts explicit state, never exercises auto-enrollment.
  workspaceDatabase(db => {
    db.exec(enrollmentSchema);
    db.prepare("INSERT INTO secure_tax_enrollments VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(account.id, account.clientId, "fixture-manifest", "fixture-workspace", 1, "client-public-recipient", "firm-public-recipient", "{}", new Date().toISOString(), "active");
  }, true);
}
async function account(name: string, clientId?: string): Promise<Account> {
  clientId ??= saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner").id;
  const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId, customerId: null });
  acceptCustomerInvitation(issueCustomerInvitation(user.id), "Fixture-policy-password");
  return { id: user.id, clientId, token: signInCustomer(user.email, "Fixture-policy-password") };
}
const income = () => ({ mutationId: randomUUID(), record: { id: randomUUID(), revision: 0, deleted: false, kind: "income", body: { date: "2026-11-01", platform: "uber", description: "Synthetic earnings", amountCents: 1234, currency: "USD", notes: "Synthetic private tax note" } } });
const add = (moduleId: string, values: Record<string, string | number | boolean>) => addRecord(moduleId, moduleById(moduleId)!.fields, values);
const headers = () => ({ Authorization: `Bearer ${alpha.token}`, "Content-Type": "application/json", Accept: "application/json" });
const tokens = () => ({ accessToken: "fixture-uber-access", refreshToken: "fixture-uber-refresh", expiresAt: Date.now() + 3600_000, clientId: "fixture-uber-client" });
const profile = { driver_id: "fixture-driver", first_name: "Synthetic", last_name: "Driver" };
function connectedUber() {
  const state = beginUberState(alpha.token, "fixture-uber-client", false);
  connectUberScope(consumeUberState(state, alpha.token, "fixture-uber-client"), profile, tokens());
}
async function connectedBank() {
  const session = await createBankLink(alpha.token, {});
  return exchangeBankLink(alpha.token, { sessionId: session.sessionId, publicToken: "fixture-public-token" });
}
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "gig-secure-policy-"));
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, DATABASE_URL: "", DEMO_DATA: "false", APP_BASE_URL: base,
    UBER_DRIVER_CLIENT_ID: "fixture-uber-client", UBER_DRIVER_CLIENT_SECRET: "fixture-uber-secret", UBER_DRIVER_APPROVED: "true",
    PLAID_ENV: "sandbox", PLAID_CLIENT_ID: "fixture-plaid-client", PLAID_SECRET: "fixture-plaid-secret", PLAID_IOS_REDIRECT_URI: base + "/plaid/callback" })) vi.stubEnv(key, value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  alpha = await account("Alpha"); beta = await account("Beta");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.href === "https://auth.uber.com/oauth/revoke") return new Response("", { status: 200 });
    if (url.origin !== "https://sandbox.plaid.com") throw new Error("Unexpected provider call in policy test");
    if (url.pathname === "/link/token/create") return Response.json({ link_token: "fixture-link-token", expiration: "2026-11-08T00:00:00Z" });
    if (url.pathname === "/item/public_token/exchange") return Response.json({ access_token: "fixture-bank-access", item_id: "fixture-bank-item" });
    if (url.pathname === "/item/remove") return Response.json({});
    throw new Error("Unexpected provider path in policy test");
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });

it("never enrolls implicitly and reads an active account or shared-client policy in the caller's transaction", () => {
  expect(secureTaxRequired({ accountId: alpha.id, clientId: alpha.clientId })).toBe(false);
  workspaceDatabase(db => expect(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='secure_tax_enrollments'").get()).toBeUndefined());
  enroll();
  expect(secureTaxRequired({ accountId: alpha.id })).toBe(true);
  expect(secureTaxRequired({ accountId: "second-account", clientId: alpha.clientId })).toBe(true);
  expect(secureTaxRequired({ accountId: beta.id, clientId: beta.clientId })).toBe(false);
  workspaceDatabase(db => {
    expect(() => assertPlaintextTaxAllowed({ clientId: alpha.clientId }, db)).toThrow(SecureTaxRequiredError);
    // Rotation/expiry is outside the plaintext policy; active rows still block.
    db.prepare("UPDATE secure_tax_enrollments SET manifest='expired-or-rotated-public-proof'").run();
    expect(secureTaxRequired({ accountId: alpha.id }, db)).toBe(true);
  }, true);
  const malformed = new DatabaseSync(":memory:");
  try { malformed.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT)"); expect(() => secureTaxRequired({ accountId: alpha.id }, malformed)).toThrow(); }
  finally { malformed.close(); }
});

it("blocks journal idempotency retries, new writes and a second linked account while preserving legacy data", async () => {
  const mutation = income(); saveDriverRecord(alpha.token, mutation);
  const other = await account("AlphaSecond", alpha.clientId);
  enroll();
  expect(() => saveDriverRecord(alpha.token, mutation)).toThrow(SecureTaxRequiredError);
  expect(() => saveDriverRecord(alpha.token, income())).toThrow(SecureTaxRequiredError);
  expect(() => saveDriverRecord(other.token, income())).toThrow(SecureTaxRequiredError);
  expect(readDriverRecords(alpha.token).records).toHaveLength(1);
  expect(readDriverRecords(alpha.token).records[0].record.id).toBe(mutation.record.id);
  saveDriverRecord(beta.token, income()); expect(readDriverRecords(beta.token).records).toHaveLength(1);
});

it("blocks both new and identical receipt/document uploads without deleting or rewriting legacy originals", () => {
  const receipt = randomUUID(); saveDriverReceipt(alpha.token, receipt, png);
  const engagement = add("tax-engagements", { name: "Synthetic work", client_id: alpha.clientId, tax_year: 2026, stage: "Awaiting documents", client_visible: true });
  const request = add("tax-document-requests", { name: "Requested summary", client_id: alpha.clientId, engagement_id: engagement.id, status: "Requested", client_visible: true });
  const document = submitTaxDocument(alpha.token, request.id, "fixture.png", png);
  const documentPath = path.join(directory, "tax-documents", document.id), original = readFileSync(documentPath);
  enroll();
  expect(() => saveDriverReceipt(alpha.token, receipt, png)).toThrow(SecureTaxRequiredError);
  const newReceipt = randomUUID(); expect(() => saveDriverReceipt(alpha.token, newReceipt, png)).toThrow(SecureTaxRequiredError);
  expect(existsSync(path.join(directory, "driver-receipts", alpha.id, newReceipt))).toBe(false);
  expect(readFileSync(path.join(directory, "driver-receipts", alpha.id, receipt))).toEqual(png);
  expect(() => submitTaxDocument(alpha.token, request.id, "retry.png", png)).toThrow(SecureTaxRequiredError);
  expect(readFileSync(documentPath)).toEqual(original);
});

it("rejects the legacy HTTP body before parsing or reading it for an enrolled client", async () => {
  enroll();
  const recordRequest = new Request(base + "/api/website/customer/driver/records", { method: "POST", headers: headers(), body: "not JSON" });
  const recordResponse = await recordPost(recordRequest);
  expect(recordResponse.status).toBe(409); expect(recordRequest.bodyUsed).toBe(false);
  const receiptRequest = new Request(base + "/api/website/customer/driver/receipts/" + randomUUID(), { method: "PUT", headers: headers(), body: png });
  expect((await receiptPut(receiptRequest, { params: Promise.resolve({ id: randomUUID() }) })).status).toBe(409); expect(receiptRequest.bodyUsed).toBe(false);
  const documentRequest = new Request(base + "/api/website/customer/documents", { method: "POST", headers: headers(), body: "not multipart" });
  expect((await documentPost(documentRequest)).status).toBe(409); expect(documentRequest.bodyUsed).toBe(false);
  const profileRequest = new Request(base + "/api/website/customer/driver/profile", { method: "PATCH", headers: headers(), body: "not JSON" });
  expect((await profilePatch(profileRequest)).status).toBe(409); expect(profileRequest.bodyUsed).toBe(false);
  expect(recordResponse.headers.get("cache-control")).toBe("private, no-store");
});

it("blocks tax SDK creates, edits, reassignment and common domain mutations without persisting rejected values", () => {
  const module = moduleById("tax-engagements")!;
  const own = add(module.id, { name: "Existing work", client_id: alpha.clientId, tax_year: 2026, stage: "Intake" });
  const other = add(module.id, { name: "Other work", client_id: beta.clientId, tax_year: 2026, stage: "Intake" });
  enroll();
  expect(() => add(module.id, { ...own.values, name: "Forbidden plaintext" })).toThrow(SecureTaxRequiredError);
  expect(() => updateRecord(module.id, own.id, module.fields, { ...own.values, client_id: beta.clientId, notes: "Forbidden plaintext" })).toThrow(SecureTaxRequiredError);
  expect(() => updateRecord(module.id, other.id, module.fields, { ...other.values, client_id: alpha.clientId })).toThrow(SecureTaxRequiredError);
  expect(() => changeModuleRecords(module.id, rows => { rows.find(row => row.id === own.id)!.values.notes = "Forbidden plaintext"; })).toThrow(SecureTaxRequiredError);
  // A nested caller catching rejection must not retain the rejected mutation.
  changeModuleRecords(module.id, rows => {
    try { changeModuleRecords(module.id, nested => { nested.find(row => row.id === own.id)!.values.notes = "Forbidden nested plaintext"; }); } catch { /* Test aggregate rollback. */ }
    rows.find(row => row.id === other.id)!.values.notes = "Allowed other client";
  });
  expect(listRecords(module.id).find(row => row.id === own.id)?.values).toEqual(own.values);
  expect(listRecords(module.id).find(row => row.id === other.id)?.values.notes).toBe("Allowed other client");
});

it("blocks pending and new host-side Uber authorizations/sync without blocking revocation", async () => {
  connectedUber();
  const pending = authorizeUber(alpha.token), state = new URL(pending.authorizationUrl).searchParams.get("state")!;
  enroll(); vi.mocked(fetch).mockClear();
  expect(() => authorizeUber(alpha.token)).toThrow(SecureTaxRequiredError);
  await expect(completeUberAuthorization(alpha.token, state, "synthetic-code")).rejects.toThrow(SecureTaxRequiredError);
  await expect(syncUber(alpha.token, "2026-10-01", "2026-10-01")).rejects.toThrow(SecureTaxRequiredError);
  expect(fetch).not.toHaveBeenCalled();
  expect(uberConnectionSummary(alpha.token)).toMatchObject({ connected: true, ready: false, secureTaxRequired: true });
  expect(await disconnectUber(alpha.token)).toMatchObject({ connected: false, providerRevoked: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  workspaceDatabase(db => { initUber(db); expect(db.prepare("SELECT secrets FROM gig_uber_links WHERE accountId=?").get(alpha.id)).toMatchObject({ secrets: null }); });
});

it("rejects enrollment during Uber authorization before profile fetch/save, then revokes the uncommitted token", async () => {
  const state = new URL(authorizeUber(alpha.token).authorizationUrl).searchParams.get("state")!;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://auth.uber.com/oauth/v2/token") { enroll(); return Response.json({ access_token: "uncommitted-access", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer", scope: UBER_DRIVER_SCOPES.join(" ") }); }
    if (url === "https://auth.uber.com/oauth/revoke") return new Response("", { status: 200 });
    throw new Error("No profile call should occur after enrollment");
  }));
  await expect(completeUberAuthorization(alpha.token, state, "fixture-code")).rejects.toThrow(SecureTaxRequiredError);
  expect(vi.mocked(fetch).mock.calls.map(call => String(call[0]))).toEqual(["https://auth.uber.com/oauth/v2/token", "https://auth.uber.com/oauth/revoke"]);
  expect(uberConnectionSummary(alpha.token).connected).toBe(false);
});

it("blocks host bank links/exchanges/sync but allows cancel and provider disconnect", async () => {
  const { itemId } = await connectedBank(); const pending = await createBankLink(alpha.token, {});
  enroll(); vi.mocked(fetch).mockClear();
  await expect(createBankLink(alpha.token, {})).rejects.toThrow(SecureTaxRequiredError);
  await expect(exchangeBankLink(alpha.token, { sessionId: pending.sessionId, publicToken: "fixture-token" })).rejects.toThrow(SecureTaxRequiredError);
  await expect(syncBankItem(alpha.token, itemId)).rejects.toThrow(SecureTaxRequiredError);
  expect(fetch).not.toHaveBeenCalled();
  expect(bankStatus(alpha.token)).toMatchObject({ ready: false, secureTaxRequired: true });
  cancelBankLink(alpha.token, pending.sessionId);
  await disconnectBank(alpha.token, itemId);
  expect(bankStatus(alpha.token).items[0]).toMatchObject({ connected: 0 }); expect(fetch).toHaveBeenCalledTimes(1);
});

it("rolls back bank data when enrollment occurs during an in-flight provider response", async () => {
  const { itemId } = await connectedBank();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname === "/accounts/get") return Response.json({ accounts: [{ account_id: "fixture-account", name: "Checking" }] });
    if (pathname === "/transactions/sync") {
      enroll();
      return Response.json({ added: [{ transaction_id: "private-source", account_id: "fixture-account", date: "2026-11-01", name: "Synthetic private transaction", amount: 12.34, iso_currency_code: "USD", pending: false }], modified: [], removed: [], next_cursor: "private-cursor", has_more: false });
    }
    throw new Error("Unexpected provider path");
  }));
  await expect(syncBankItem(alpha.token, itemId)).rejects.toThrow(SecureTaxRequiredError);
  expect(bankFeed(alpha.token, 0).transactions).toEqual([]);
  expect(workspaceDatabase(db => db.prepare("SELECT cursor,leaseUntil FROM driver_bank_items WHERE id=?").get(itemId))).toMatchObject({ cursor: "", leaseUntil: 0 });
});
