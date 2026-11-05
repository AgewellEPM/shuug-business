// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { createLinkedCustomer, customerSettings, saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled } from "../customer-access/accounts";
import { readDriverRecords, saveDriverRecord, staffDriverRecords, DriverConflict } from "./store";
import { saveDriverReceipt, driverReceipt, staffDriverReceipt } from "./receipts";
import { POST as login } from "@/app/api/website/customer/driver/session/route";
import { POST, GET } from "@/app/api/website/customer/driver/records/route";
import { PUT as upload } from "@/app/api/website/customer/driver/receipts/[id]/route";
import { sectionForPath } from "../permissions/model";

let directory: string;
let alpha: { id: string; token: string; clientId: string };
let beta: typeof alpha;
const base = "https://workspace.example.com", password = "Synthetic-driver-password-only";
const trip = () => ({ id: randomUUID(), revision: 0, deleted: false, kind: "trip" as const, body: { startedAt: "2026-11-04T12:00:00Z", endedAt: "2026-11-04T12:30:00Z", distanceMeters: 16093.44, classification: "business" as const, purpose: "Driver shift", notes: "", source: "gps" as const, hasGaps: false, sampleCount: 200 } });
const mutation = (record = trip()) => ({ mutationId: randomUUID(), record });
const request = (route: string, token: string | undefined, body?: unknown, origin?: string) => new Request(base + route, { method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-driver-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("DATABASE_URL", "");
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), password);
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, password) };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("uses invited client sign-in, never owner identity, and returns the actual workspace brand", async () => {
  const result = await login(request("/api/website/customer/driver/session", undefined, { email: "Alpha@example.com", password }));
  expect(result.status).toBe(200); const data = await result.json();
  expect(data).toMatchObject({ apiVersion: 1, account: { id: alpha.id }, branding: { name: "Rideshare Tax Pros" } });
  expect(data.token).toMatch(/^[a-f0-9]{64}$/); expect(data.account).not.toHaveProperty("clientId");
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect((await login(request("/session", undefined, { email: "Alpha@example.com", password: "wrong" }))).status).toBe(401);
  expect((await login(request("/session", undefined, { email: "Alpha@example.com", password }, "https://unrelated.example"))).status).toBe(403);
});
it("persists and projects only the caller's records, and binds staff review to the real service client", () => {
  const input = mutation(); const first = saveDriverRecord(alpha.token, input);
  const other = saveDriverRecord(beta.token, { mutationId: randomUUID(), record: { ...input.record, body: { ...input.record.body, purpose: "BETA PRIVATE" } } });
  expect(first.record.revision).toBe(1); expect(other.record.revision).toBe(1);
  expect(readDriverRecords(alpha.token).records).toHaveLength(1);
  expect(JSON.stringify(readDriverRecords(alpha.token))).not.toContain("BETA PRIVATE");
  expect(staffDriverRecords(alpha.clientId)).toMatchObject([{ clientId: alpha.clientId, accountId: alpha.id }]);
  expect(sectionForPath("/rideshare")).toBe("money");
  expect(() => readDriverRecords("forged")).toThrow("Sign in");
});
it("makes retry idempotent, refuses stale overwrites, and delivers edits and deletions through the incremental cursor", () => {
  const input = mutation(), first = saveDriverRecord(alpha.token, input);
  expect(saveDriverRecord(alpha.token, input)).toEqual(first);
  expect(() => saveDriverRecord(alpha.token, { ...input, record: { ...input.record, body: { ...input.record.body, purpose: "Changed" } } })).toThrow("different data");
  expect(() => saveDriverRecord(alpha.token, mutation(input.record))).toThrow(DriverConflict);
  const edited = saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...first.record, deleted: true } });
  const delta = readDriverRecords(alpha.token, first.sequence);
  expect(delta.records).toEqual([edited]); expect(delta.cursor).toBe(edited.sequence);
  expect(staffDriverRecords(alpha.clientId)).toEqual([]);
  expect(() => readDriverRecords(alpha.token, NaN)).toThrow("cursor");
});
it("retains a late-night trip's recorded local date and time zone while accepting legacy trips", () => {
  const record = trip();
  const body = { ...record.body, startedAt: "2026-11-05T02:30:00Z", endedAt: "2026-11-05T03:00:00Z", localDate: "2026-11-04", timeZoneId: "America/New_York" };
  const saved = saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...record, body } });
  expect(saved.record.body).toMatchObject({ localDate: "2026-11-04", timeZoneId: "America/New_York" });
  expect(readDriverRecords(alpha.token).records[0]).toEqual(saved);
  expect(saveDriverRecord(alpha.token, mutation()).record.body).not.toHaveProperty("localDate");
  expect(() => saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...trip(), body: { ...body, localDate: "2026-02-31" } } })).toThrow();
});
it("honors disabled accounts, service settings and hidden rideshare modules on every operation", () => {
  saveDriverRecord(alpha.token, mutation());
  saveCustomerSettings({ ...customerSettings(), servicePortal: false }); expect(() => readDriverRecords(alpha.token)).toThrow("not enabled");
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": false } }); expect(() => saveDriverRecord(alpha.token, mutation())).toThrow("not enabled");
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": true } });
  setCustomerEnabled(alpha.id, false); expect(() => readDriverRecords(alpha.token)).toThrow("Sign in");
});
it("keeps receipts private and immutable, requires an uploaded receipt for an expense, and supplies it to the linked staff record", () => {
  const id = randomUUID(), bytes = Buffer.from("ffd8ffe000104a4649460001", "hex");
  const expense = { id: randomUUID(), revision: 0, deleted: false, kind: "expense", body: { date: "2026-11-04", merchant: "Synthetic Fuel", category: "fuel", amountCents: 4235, currency: "USD", classification: "business", notes: "Review", receiptId: id } };
  expect(() => saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: expense })).toThrow("Upload this receipt");
  expect(saveDriverReceipt(alpha.token, id, bytes)).toMatchObject({ id, mime: "image/jpeg" });
  expect(driverReceipt(alpha.token, id).bytes).toEqual(bytes);
  expect(() => driverReceipt(beta.token, id)).toThrow("unavailable");
  expect(() => saveDriverReceipt(alpha.token, id, Buffer.concat([bytes, Buffer.from("different")]))).toThrow("different file");
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: expense });
  expect(staffDriverReceipt(alpha.id, id).bytes).toEqual(bytes);
  expect(() => saveDriverReceipt(alpha.token, randomUUID(), Buffer.from("<html>bad</html>"))).toThrow("JPEG");
});
it("enforces JSON and origin restrictions on the real handlers and refuses unauthenticated receipt uploads", async () => {
  const route = "/api/website/customer/driver/records";
  expect((await POST(request(route, alpha.token, mutation(), "https://unrelated.example"))).status).toBe(403);
  expect((await POST(request(route, alpha.token, { ...mutation(), clientId: beta.clientId }))).status).toBe(400);
  expect((await POST(request(route, alpha.token, mutation()))).status).toBe(200);
  expect((await GET(request(route, beta.token))).status).toBe(200);
  expect((await (await GET(request(route, beta.token))).json()).records).toEqual([]);
  const response = await upload(new Request(base + "/receipt", { method: "PUT", body: "fake" }), { params: Promise.resolve({ id: randomUUID() }) });
  expect(response.status).toBe(401);
});
