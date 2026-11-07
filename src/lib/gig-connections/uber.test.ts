// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { importBusinessTemplate } from "../branding/templates";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { openSecret, sealSecret } from "../connections/vault";
import { createLinkedCustomer, saveCustomerSettings, customerView } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled, signOutCustomer } from "../customer-access/accounts";
import { saveDriverRecord, readDriverRecords } from "../rideshare-driver/store";
import { authorizeUber, completeUberAuthorization, syncUber, disconnectUber, uberConnectionSummary, uberRecordPage, staffUberConnections, staffUberRecordPage, uberSyncPeriod } from "./uber";
import { UBER_DRIVER_SCOPES } from "./uber-provider";
import { POST as authorize } from "@/app/api/website/customer/connections/uber/authorize/route";
import { GET as callback } from "@/app/api/website/customer/connections/uber/callback/route";
import { GET as summary } from "@/app/api/website/customer/connections/uber/route";
import { GET as records } from "@/app/api/website/customer/connections/uber/records/route";
import { POST as synchronize } from "@/app/api/website/customer/connections/uber/sync/route";
import { POST as disconnect } from "@/app/api/website/customer/connections/uber/disconnect/route";

let directory: string;
let alpha: { id: string; clientId: string; token: string };
let beta: typeof alpha;
let providerDriverId = "uber-alpha-driver";
let paymentAmount = 5.20;
let unauthorized = false;
let emptyPage = false;
let grantedScopes: string;
let afterProfile: (() => void) | undefined;
const base = "https://workspace.example.com";
const endpoint = `${base}/api/website/customer/connections/uber`;
const day = "2026-10-01";
const timestamp = Date.parse(day + "T12:00:00Z") / 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const headers = (token = alpha.token) => ({ Cookie: `shuug_customer=${token}`, Origin: base, Accept: "application/json" });
function linkRow() { return workspaceDatabase(db => db.prepare("SELECT * FROM gig_uber_links WHERE accountId=?").get(alpha.id)) as { secrets: string; generation: string; status: string; leaseId: string | null }; }
async function connect(token = alpha.token, code = "synthetic-code") { const flow = authorizeUber(token), state = new URL(flow.authorizationUrl).searchParams.get("state")!; await completeUberAuthorization(token, state, code); return state; }
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "gig-uber-driver-"));
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, DATABASE_URL: "", DEMO_DATA: "false", APP_BASE_URL: base, UBER_DRIVER_CLIENT_ID: "synthetic-client-id", UBER_DRIVER_CLIENT_SECRET: "synthetic-app-secret", UBER_DRIVER_APPROVED: "true" })) vi.stubEnv(key, value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), "Synthetic-client-password");
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, "Synthetic-client-password") };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
  providerDriverId = "uber-alpha-driver"; paymentAmount = 5.20; unauthorized = false; emptyPage = false; afterProfile = undefined; grantedScopes = UBER_DRIVER_SCOPES.join(" ");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.href === "https://auth.uber.com/oauth/v2/token") {
      const body = new URLSearchParams(String(init?.body)); expect(body.get("client_id")).toBe("synthetic-client-id"); expect(body.get("client_secret")).toBe("synthetic-app-secret");
      return json({ access_token: body.get("grant_type") === "refresh_token" ? "renewed-access-secret" : "synthetic-access-secret", refresh_token: "synthetic-refresh-secret", expires_in: 3600, token_type: "Bearer", scope: grantedScopes });
    }
    if (url.href === "https://auth.uber.com/oauth/revoke") return new Response("", { status: 200 });
    if (url.origin !== "https://api.uber.com") throw new Error("Unexpected provider host.");
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer (synthetic|renewed)-access-secret$/);
    if (unauthorized) return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/v1/partners/me") { afterProfile?.(); return json({ driver_id: providerDriverId, first_name: "Uber", last_name: "Driver", activation_status: "active", phone_number: "PRIVATE-PHONE", date_of_birth: "PRIVATE-DATE" }); }
    const offset = Number(url.searchParams.get("offset"));
    expect(Number(url.searchParams.get("to_time")) - Number(url.searchParams.get("from_time"))).toBeLessThanOrEqual(10 * 86400);
    if (url.pathname === "/v1/partners/trips") {
      const trips = Array.from({ length: 51 }, (_, i) => ({ trip_id: `trip-${i}`, driver_id: providerDriverId, status: i === 50 ? "driver_canceled" : "completed", pickup: { timestamp: i === 50 ? null : timestamp }, dropoff: { timestamp: i === 50 ? null : timestamp + 600 }, distance: i === 50 ? null : 2.5, fare: i === 50 ? 0 : 7.50, currency_code: "USD" }));
      return json({ count: 51, offset, trips: emptyPage ? [] : trips.slice(offset, offset + 50) });
    }
    if (url.pathname === "/v1/partners/payments") return json({ count: 3, offset, payments: [
      { payment_id: "payment-1", driver_id: providerDriverId, event_time: timestamp, amount: paymentAmount, currency_code: "USD", category: "fare", trip_id: "trip-0" },
      { payment_id: "payment-fee", driver_id: providerDriverId, event_time: timestamp, amount: -1, currency_code: "USD", category: "device_subscription", trip_id: null },
      { payment_id: "payment-other", driver_id: providerDriverId, event_time: timestamp, amount: 2, currency_code: "EUR", category: "fare", trip_id: null },
    ] });
    throw new Error("Unexpected provider path.");
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });

it("requires the owner's real approval gate and authenticates the individual client without any provider call", async () => {
  vi.stubEnv("UBER_DRIVER_APPROVED", "false");
  expect(uberConnectionSummary(alpha.token)).toMatchObject({ ready: false, connected: false, trips: 0, payments: 0 });
  expect(() => authorizeUber(alpha.token)).toThrow("approved");
  expect((await authorize(new Request(endpoint + "/authorize", { method: "POST", headers: headers() }))).status).toBe(503);
  expect((await summary(new Request(endpoint))).status).toBe(401);
  expect((await authorize(new Request(endpoint + "/authorize", { method: "POST", headers: { ...headers(), Origin: "https://attacker.example" } }))).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("binds OAuth state to the initiating account/session and consumes it once before saving encrypted tokens", async () => {
  const flow = authorizeUber(alpha.token), authorization = new URL(flow.authorizationUrl), state = authorization.searchParams.get("state")!;
  expect(authorization.origin + authorization.pathname).toBe("https://auth.uber.com/oauth/v2/authorize");
  expect(authorization.searchParams.get("scope")).toBe(UBER_DRIVER_SCOPES.join(" "));
  expect(authorization.searchParams.get("redirect_uri")).toBe(endpoint + "/callback");
  expect(authorization.searchParams.has("client_secret")).toBe(false);
  await expect(completeUberAuthorization(beta.token, state, "code")).rejects.toThrow("signed-in account changed");
  await completeUberAuthorization(alpha.token, state, "code");
  await expect(completeUberAuthorization(alpha.token, state, "code")).rejects.toThrow("expired");
  expect(uberConnectionSummary(alpha.token)).toMatchObject({ connected: true, profile: { name: "Uber Driver", activationStatus: "active" }, lastSyncAt: null });
  expect(uberConnectionSummary(beta.token).profile).toBeNull();
  expect(linkRow().secrets).not.toContain("synthetic-access-secret");
  expect(readFileSync(path.join(directory, "workspace.sqlite")).includes(Buffer.from("synthetic-access-secret"))).toBe(false);
  expect(JSON.stringify((await customerView(alpha.token)).uber)).not.toContain("PRIVATE-");
});
it("supports an explicitly native-initiated callback while still requiring its original live client session", async () => {
  const response = await authorize(new Request(endpoint + "/authorize", { method: "POST", headers: { Authorization: `Bearer ${alpha.token}`, Accept: "application/json" } }));
  const { authorizationUrl } = await response.json(), state = new URL(authorizationUrl).searchParams.get("state");
  expect((await callback(new Request(`${endpoint}/callback?state=${state}&code=native-code`))).status).toBe(303);
  const second = authorizeUber(beta.token, true), another = new URL(second.authorizationUrl).searchParams.get("state")!;
  signOutCustomer(beta.token);
  expect((await callback(new Request(`${endpoint}/callback?state=${another}&code=revoked-code`))).status).toBe(401);
});
it("paginates and idempotently updates source facts without duplicating bank or tax-journal income", async () => {
  await connect();
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { id: randomUUID(), kind: "income", revision: 0, deleted: false, body: { date: day, platform: "uber", description: "Reviewed platform income", amountCents: 10000, currency: "USD", notes: "" } } });
  const first = await syncUber(alpha.token, day, day); expect(first).toMatchObject({ tripsReceived: 51, paymentsReceived: 3, journalRecordsPosted: 0 });
  expect(uberConnectionSummary(alpha.token)).toMatchObject({ trips: 51, payments: 3, usdPaymentAmountCents: 420, otherCurrencyPayments: 1 });
  paymentAmount = 6.20; await syncUber(alpha.token, day, day);
  expect(uberConnectionSummary(alpha.token)).toMatchObject({ trips: 51, payments: 3, usdPaymentAmountCents: 520 });
  expect(readDriverRecords(alpha.token).records).toHaveLength(1);
  expect(uberRecordPage(alpha.token, "trips", 2)).toMatchObject({ count: 51, page: 2, pages: 3, records: expect.any(Array) });
  const forged = await records(new Request(endpoint + `/records?kind=payments&account=${alpha.id}`, { headers: headers(beta.token) }));
  expect(await forged.json()).toMatchObject({ count: 0, records: [] });
  expect(uberRecordPage(beta.token, "payments").count).toBe(0);
  expect(staffUberConnections()[0]).toMatchObject({ accountId: alpha.id, payments: 3 });
  expect(staffUberRecordPage(alpha.id, "payments").records).toHaveLength(3);
});
it("never imports incomplete pagination and keeps the last successful snapshot unchanged", async () => {
  await connect(); emptyPage = true;
  await expect(syncUber(alpha.token, day, day)).rejects.toThrow("incomplete page");
  expect(uberConnectionSummary(alpha.token)).toMatchObject({ trips: 0, payments: 0, lastSyncAt: null });
  expect(linkRow().leaseId).toBeNull();
  expect(() => uberSyncPeriod("2026-99-99", day)).toThrow("valid");
  expect(() => uberSyncPeriod("2026-01-01", "2026-03-01")).toThrow("31 days");
});
it("refreshes expiring tokens and handles provider revocation without retaining usable credentials", async () => {
  await connect(); const row = linkRow(), tokens = JSON.parse(openSecret(row.secrets)); tokens.expiresAt = Date.now() - 1;
  workspaceDatabase(db => db.prepare("UPDATE gig_uber_links SET secrets=? WHERE accountId=?").run(sealSecret(JSON.stringify(tokens)), alpha.id), true);
  await syncUber(alpha.token, day, day);
  expect(JSON.parse(openSecret(linkRow().secrets)).accessToken).toBe("renewed-access-secret");
  unauthorized = true;
  await expect(syncUber(alpha.token, day, day)).rejects.toThrow("authorization needs");
  expect(linkRow()).toMatchObject({ status: "reauthorize", secrets: null, leaseId: null });
  expect(uberConnectionSummary(alpha.token).payments).toBe(3);
});
it("honors revocation during an in-flight provider request and prevents cross-client Uber identity reuse", async () => {
  await connect();
  await expect(connect(beta.token)).rejects.toThrow("already linked to another");
  expect(uberConnectionSummary(beta.token).connected).toBe(false);
  afterProfile = () => setCustomerEnabled(alpha.id, false);
  await expect(syncUber(alpha.token, day, day)).rejects.toThrow("Sign in");
  expect(workspaceDatabase(db => (db.prepare("SELECT count(*) AS n FROM gig_uber_facts").get() as { n: number }).n)).toBe(0);
  expect((await summary(new Request(endpoint, { headers: headers() }))).status).toBe(401);
});
it("lets a user disconnect after provider approval is paused and preserves separate review records", async () => {
  await connect(); await syncUber(alpha.token, day, day); vi.stubEnv("UBER_DRIVER_APPROVED", "false");
  const response = await disconnect(new Request(endpoint + "/disconnect", { method: "POST", headers: headers() }));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ connected: false, providerRevoked: true });
  expect(linkRow().secrets).toBeNull(); expect(uberConnectionSummary(alpha.token)).toMatchObject({ connected: false, trips: 51, payments: 3 });
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === "https://auth.uber.com/oauth/revoke")).toBe(true);
});
it("rejects incomplete OAuth permissions and same-origin API violations without publishing secrets", async () => {
  grantedScopes = "partner.accounts";
  await expect(connect()).rejects.toThrow("all requested read-only permissions");
  expect(uberConnectionSummary(alpha.token).connected).toBe(false);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === "https://auth.uber.com/oauth/revoke")).toBe(true);
  const response = await synchronize(new Request(endpoint + "/sync", { method: "POST", headers: { ...headers(), "Content-Type": "application/json", Origin: "https://attacker.example" }, body: "{}" }));
  expect(response.status).toBe(403); expect(await response.text()).not.toContain("synthetic-app-secret");
});
