// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { gigTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { createLinkedCustomer, customerSettings, saveCustomerSettings } from "./service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled, CUSTOMER_PATH } from "./accounts";
import { GET, PATCH } from "@/app/api/website/customer/driver/profile/route";
import { POST as portalPost } from "@/app/api/website/customer/route";
import { POST as nativeLogin } from "@/app/api/website/customer/driver/session/route";

const base = "https://workspace.example.com", password = "Synthetic-profile-client-password";
const route = CUSTOMER_PATH + "/driver/profile";
let directory: string;
let alpha: { id: string; token: string; clientId: string; email: string };
let beta: typeof alpha;
const request = (token?: string, input?: unknown, origin?: string) => new Request(base + route, { method: input === undefined ? "GET" : "PATCH", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(input !== undefined ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}) }, body: input === undefined ? undefined : JSON.stringify(input) });

beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-driver-profile-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  importBusinessTemplate(gigTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const email = `${name.toLowerCase()}@example.com`;
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email } }, "owner");
    const account = await createLinkedCustomer({ name, email, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(account.id), password);
    return { id: account.id, clientId: client.id, email, token: signInCustomer(email, password) };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("projects the authenticated client identity for native and browser sessions without exposing business bindings", async () => {
  const response = await GET(request(alpha.token));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const data = await response.json();
  expect(data).toMatchObject({ apiVersion: 1, account: { id: alpha.id, name: "Alpha", email: alpha.email }, branding: { name: "Gig Tax Pros" } });
  for (const field of ["token", "passwordHash", "clientId", "customerId", "expiresAt"]) expect(data.account).not.toHaveProperty(field);
  const cookie = await GET(new Request(`${base}${route}?accountId=${beta.id}`, { headers: { Cookie: `shuug_customer=${alpha.token}` } }));
  expect((await cookie.json()).account.id).toBe(alpha.id);
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request("forged"))).status).toBe(401);
});

it("changes only the caller's display name across portal and native sign-in while retaining the session deadline", async () => {
  const expires = () => workspaceDatabase(db => db.prepare("SELECT expires FROM customer_sessions WHERE accountId=? ORDER BY expires").all(alpha.id));
  const before = expires();
  const form = new URLSearchParams({ action: "profile", name: "  Alpha <Driver>  " });
  const updated = await portalPost(new Request(base + CUSTOMER_PATH, { method: "POST", headers: { Origin: base, Cookie: `shuug_customer=${alpha.token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form }));
  expect(updated.status).toBe(200);
  expect(await updated.text()).toContain("Alpha &lt;Driver&gt;");
  expect((await (await GET(request(alpha.token))).json()).account).toEqual({ id: alpha.id, name: "Alpha <Driver>", email: alpha.email });
  expect((await (await GET(request(beta.token))).json()).account.name).toBe("Beta");
  expect(expires()).toEqual(before);
  const native = await PATCH(request(alpha.token, { name: "Alpha in app" }));
  expect(native.status).toBe(200); expect((await native.json()).account.name).toBe("Alpha in app");
  expect(expires()).toEqual(before);
  const signedIn = await nativeLogin(new Request(base + CUSTOMER_PATH + "/driver/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: alpha.email, password }) }));
  expect((await signedIn.json()).account.name).toBe("Alpha in app");
});

it("rejects foreign account selectors, email/link changes, invalid names and cookie-only native mutations", async () => {
  for (const input of [{ name: "Forged", accountId: beta.id }, { name: "Forged", clientId: beta.clientId }, { name: "Forged", email: beta.email }, { name: "" }, { name: "x".repeat(101) }, { name: "Name\u0000Control" }]) {
    expect((await PATCH(request(alpha.token, input))).status).toBe(400);
  }
  expect((await PATCH(request(alpha.token, { name: "Forged" }, "https://other.example.com"))).status).toBe(403);
  expect((await PATCH(new Request(base + route, { method: "PATCH", headers: { Cookie: `shuug_customer=${alpha.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Forged" }) }))).status).toBe(401);
  const forged = new URLSearchParams({ action: "profile", name: "Forged", email: beta.email });
  expect((await portalPost(new Request(base + CUSTOMER_PATH, { method: "POST", headers: { Origin: base, Cookie: `shuug_customer=${alpha.token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: forged }))).status).toBe(400);
  expect((await (await GET(request(alpha.token))).json()).account).toEqual({ id: alpha.id, name: "Alpha", email: alpha.email });
  expect((await PATCH(request(alpha.token, { name: "x".repeat(40000) }))).status).toBe(413);
});

it("rechecks revocation, expiration and tax service visibility for profile reads and writes", async () => {
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": false } });
  expect((await GET(request(alpha.token))).status).toBe(404); expect((await PATCH(request(alpha.token, { name: "Hidden" }))).status).toBe(404);
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": true } });
  saveCustomerSettings({ ...customerSettings(), servicePortal: false });
  expect((await GET(request(alpha.token))).status).toBe(404);
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  workspaceDatabase(db => { db.prepare("UPDATE customer_sessions SET expires=? WHERE accountId=?").run(Date.now() - 1, alpha.id); }, true);
  expect((await GET(request(alpha.token))).status).toBe(401); expect((await PATCH(request(alpha.token, { name: "Expired" }))).status).toBe(401);
  setCustomerEnabled(beta.id, false);
  expect((await GET(request(beta.token))).status).toBe(401);
});

it("invalidates old profile access when the firm reissues a recovery invitation", async () => {
  const invite = issueCustomerInvitation(alpha.id);
  expect((await GET(request(alpha.token))).status).toBe(401);
  expect((await PATCH(request(alpha.token, { name: "Old session" }))).status).toBe(401);
  acceptCustomerInvitation(invite, password);
  const token = signInCustomer(alpha.email, password);
  expect((await (await GET(request(token))).json()).account.id).toBe(alpha.id);
});
