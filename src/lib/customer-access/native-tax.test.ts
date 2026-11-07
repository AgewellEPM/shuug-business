// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importBusinessTemplate } from "../branding/templates";
import { gigTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBranding } from "../branding/store";
import { saveBusinessRecord } from "../workspace/store";
import { moduleById } from "../sdk/registry";
import { addRecord, updateRecord } from "../sdk/records";
import { createLinkedCustomer, customerSettings, saveCustomerSettings } from "./service";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled, CUSTOMER_PATH } from "./accounts";
import { GET } from "@/app/api/website/customer/driver/tax/route";
import { POST as upload } from "@/app/api/website/customer/documents/route";
import { GET as download } from "@/app/api/website/customer/documents/[id]/route";
import type { ModuleRecord } from "../sdk/types";

const base = "https://workspace.example.com", password = "Synthetic-native-tax-password";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==", "base64");
let directory: string, request: ModuleRecord, engagement: ModuleRecord;
let alpha: { id: string; token: string; clientId: string }, beta: typeof alpha;
const add = (module: string, values: Record<string, string | number | boolean>) => addRecord(module, moduleById(module)!.fields, values);
const taxRequest = (token?: string, extra = "") => new Request(base + CUSTOMER_PATH + "/driver/tax" + extra, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/json" });
async function account(name: string, clientId?: string) {
  const email = `${name.toLowerCase()}@example.com`;
  const linked = clientId ?? saveBusinessRecord({ kind: "client", title: name, fields: { email } }, "owner").id;
  const user = await createLinkedCustomer({ name, email, customerId: null, clientId: linked });
  acceptCustomerInvitation(issueCustomerInvitation(user.id), password);
  return { id: user.id, clientId: linked, token: signInCustomer(email, password) };
}
async function submit(token = alpha.token, id = request.id) {
  const form = new FormData(); form.set("requestId", id); form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "Native summary.png");
  return upload(new Request(base + CUSTOMER_PATH + "/documents", { method: "POST", headers: headers(token), body: form }));
}
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-native-tax-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  importBusinessTemplate(gigTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  alpha = await account("Alpha"); beta = await account("Beta");
  engagement = add("tax-engagements", { name: "Alpha shared work", client_id: alpha.clientId, tax_year: 2026, stage: "Awaiting documents", client_visible: true, notes: "PRIVATE STAFF NOTE" });
  request = add("tax-document-requests", { name: "Annual platform summary", client_id: alpha.clientId, engagement_id: engagement.id, status: "Requested", client_visible: true, secure_reference: "PRIVATE VAULT REF" });
  add("tax-engagements", { name: "Alpha private work", client_id: alpha.clientId, tax_year: 2026, stage: "Intake", client_visible: false });
  add("tax-engagements", { name: "BETA PRIVATE WORK", client_id: beta.clientId, tax_year: 2026, stage: "Intake", client_visible: true });
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("returns only the caller's explicitly shared work and rejects unauthenticated or cross-origin reads", async () => {
  const response = await GET(taxRequest(alpha.token, `?clientId=${beta.clientId}`));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const data = await response.json();
  expect(data.apiVersion).toBe(1);
  expect(data.tax.engagements).toMatchObject([{ name: "Alpha shared work", year: 2026, documents: [{ id: request.id, name: "Annual platform summary", uploadAvailable: true, submissions: [] }] }]);
  expect(data.tax.engagements).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("PRIVATE"); expect(JSON.stringify(data)).not.toContain("Alpha private work");
  expect((await GET(taxRequest())).status).toBe(401);
  expect((await GET(taxRequest("forged"))).status).toBe(401);
  expect((await GET(new Request(base + CUSTOMER_PATH + "/driver/tax", { headers: { ...headers(alpha.token), Origin: "https://unrelated.example" } }))).status).toBe(403);
});

it("round-trips native Bearer upload, receipt status and private bytes through the same request", async () => {
  const sent = await submit(); expect(sent.status).toBe(201);
  const { document } = await sent.json();
  const tax = (await (await GET(taxRequest(alpha.token))).json()).tax;
  expect(tax.engagements[0].documents[0].submissions).toMatchObject([{ id: document.id, name: "Native summary.png", status: "received", size: png.length }]);
  const file = await download(new Request(`${base}${CUSTOMER_PATH}/documents/${document.id}`, { headers: headers(alpha.token) }), { params: Promise.resolve({ id: document.id }) });
  expect(file.status).toBe(200); expect(Buffer.from(await file.arrayBuffer())).toEqual(png);
  expect((await download(new Request(`${base}${CUSTOMER_PATH}/documents/${document.id}`, { headers: headers(beta.token) }), { params: Promise.resolve({ id: document.id }) })).status).toBe(404);
  expect((await submit(beta.token)).status).toBe(404);
});

it("keeps uploaded files isolated even between two accounts linked to the same service client", async () => {
  const { document } = await (await submit()).json();
  const second = await account("Second", alpha.clientId);
  const view = (await (await GET(taxRequest(second.token))).json()).tax;
  expect(view.engagements[0].documents[0]).toMatchObject({ id: request.id, submissions: [] });
  expect((await download(new Request(`${base}${CUSTOMER_PATH}/documents/${document.id}`, { headers: headers(second.token) }), { params: Promise.resolve({ id: document.id }) })).status).toBe(404);
});

it("immediately honors withdrawn sharing, service visibility and account revocation", async () => {
  updateRecord("tax-document-requests", request.id, moduleById("tax-document-requests")!.fields, { ...request.values, client_visible: false });
  expect((await (await GET(taxRequest(alpha.token))).json()).tax.engagements[0].documents).toEqual([]);
  updateRecord("tax-engagements", engagement.id, moduleById("tax-engagements")!.fields, { ...engagement.values, client_visible: false });
  expect((await (await GET(taxRequest(alpha.token))).json()).tax.engagements).toEqual([]);
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": false } });
  expect((await GET(taxRequest(alpha.token))).status).toBe(404);
  saveBranding({ featureVisibility: {} });
  saveCustomerSettings({ ...customerSettings(), servicePortal: false });
  expect((await GET(taxRequest(alpha.token))).status).toBe(404);
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  setCustomerEnabled(alpha.id, false);
  expect((await GET(taxRequest(alpha.token))).status).toBe(401);
});
