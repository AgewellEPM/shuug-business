// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { moduleById } from "../sdk/registry";
import { addRecord, setArchived, updateRecord } from "../sdk/records";
import { saveBusinessRecord } from "../workspace/store";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, setCustomerEnabled, CUSTOMER_PATH } from "./accounts";
import { createLinkedCustomer, customerSettings, customerView, saveCustomerSettings } from "./service";
import { GET } from "@/app/api/website/customer/route";
import type { ModuleRecord } from "../sdk/types";

let directory: string;
let alpha: { id: string; clientId: string; token: string };
let beta: typeof alpha;
const base = "https://workspace.example.com";
const password = "Synthetic-customer-test-password";
const add = (moduleId: string, values: Record<string, string | number | boolean>) => addRecord(moduleId, moduleById(moduleId)!.fields, values);
const change = (moduleId: string, row: ModuleRecord, patch: Record<string, string | number | boolean>) => updateRecord(moduleId, row.id, moduleById(moduleId)!.fields, { ...row.values, ...patch });
const engagement = (clientId: string, shared = true, name = "Shared preparation") => add("tax-engagements", { name, client_id: clientId, tax_year: 2025, stage: "Awaiting documents", client_visible: shared, client_message: "Please gather the requested records.", notes: "INTERNAL-NOTES", accountant: "INTERNAL-ASSIGNEE", due: "2026-12-01", agreement_id: "INTERNAL-AGREEMENT", invoice_id: "INTERNAL-INVOICE" });
const document = (clientId: string, parent: string, shared = true, name = "Annual driver summary") => add("tax-document-requests", { name, client_id: clientId, engagement_id: parent, status: "Requested", due: "2026-12-02", client_visible: shared, secure_reference: "PRIVATE-VAULT-REFERENCE", notes: "PRIVATE-DOCUMENT-NOTES", reviewer: "PRIVATE-REVIEWER" });

beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-tax-client-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory);vi.stubEnv("DATABASE_URL", "");vi.stubEnv("DEMO_DATA", "false");vi.stubEnv("APP_BASE_URL", base);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), password);
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, password) };
  }
  alpha = await account("Alpha");beta = await account("Beta");
});
afterEach(() => { vi.unstubAllEnvs();rmSync(directory, { recursive: true, force: true }); });

it("shares only the authenticated client's explicit safe projection", async () => {
  const own = engagement(alpha.clientId), other = engagement(beta.clientId, true, "BETA-PRIVATE-WORK");
  document(alpha.clientId, own.id);document(beta.clientId, other.id, true, "BETA-PRIVATE-DOCUMENT");
  add("rideshare-tax-records", { name: "Platform records", client_id: alpha.clientId, engagement_id: own.id, tax_year: 2025, platform: "Multiple platforms", income_records: "Staff reviewed", mileage_records: "Requested", expense_records: "Received externally", client_visible: true, accountant: "PRIVATE-RECORDS-ASSIGNEE", notes: "PRIVATE-RECORDS-NOTES" });
  add("tax-quarterly-reviews", { name: "Upcoming review", client_id: alpha.clientId, tax_year: 2026, quarter: "Q4", due: "2026-12-03", status: "Scheduled", client_visible: true, notes: "PRIVATE-QUARTERLY-NOTES", advice_reference: "PRIVATE-ADVICE-REF" });
  const view = (await customerView(alpha.token)).tax!;
  expect(view.engagements).toHaveLength(1);expect(view.engagements[0]).toMatchObject({ year: 2025, stage: "Awaiting documents", documents: [{ name: "Annual driver summary", requestedBy: "2026-12-02" }], records: [{ platform: "Multiple platforms", income: "Staff reviewed", mileage: "Requested" }] });
  expect(view.quarterly[0]).toMatchObject({ quarter: "Q4", reviewOn: "2026-12-03", status: "Scheduled" });
  for (const hidden of ["INTERNAL-", "PRIVATE-", "BETA-", alpha.clientId, beta.clientId, own.id, "2026-12-01"]) expect(JSON.stringify(view)).not.toContain(hidden);
  await expect(customerView("forged-session")).rejects.toThrow("Sign in");
});
it("keeps legacy and unshared records private and requires the same shared parent", async () => {
  add("tax-engagements", { name: "Legacy private", client_id: alpha.clientId, tax_year: 2024, stage: "Intake" });
  const privateParent = engagement(alpha.clientId, false, "Unshared preparation");
  const own = engagement(alpha.clientId), other = engagement(beta.clientId);
  document(alpha.clientId, own.id, false, "PRIVATE-REQUEST");document(alpha.clientId, privateParent.id, true, "PRIVATE-PARENT-REQUEST");document(alpha.clientId, other.id, true, "WRONG-PARENT-REQUEST");document(beta.clientId, own.id, true, "WRONG-CLIENT-REQUEST");document(alpha.clientId, "missing-parent", true, "ORPHAN-REQUEST");
  const shared = document(alpha.clientId, own.id);
  let view = (await customerView(alpha.token)).tax!;
  expect(view.engagements).toHaveLength(1);expect(view.engagements[0].documents.map(item => item.name)).toEqual(["Annual driver summary"]);
  setArchived("tax-document-requests", shared.id, true);view = (await customerView(alpha.token)).tax!;expect(view.engagements[0].documents).toEqual([]);
  change("tax-engagements", own, { client_visible: false });expect((await customerView(alpha.token)).tax!.engagements).toEqual([]);
  change("tax-engagements", own, { client_visible: true });setArchived("tax-engagements", own.id, true);expect((await customerView(alpha.token)).tax!.engagements).toEqual([]);
});
it("honors module visibility, industry choice and service-portal controls", async () => {
  const own = engagement(alpha.clientId);document(alpha.clientId, own.id);
  saveBranding({ featureVisibility: { "module:tax-document-requests": false } });expect((await customerView(alpha.token)).tax!.engagements[0].documents).toEqual([]);
  saveBranding({ featureVisibility: { "module:tax-engagements": false } });expect((await customerView(alpha.token)).tax!.engagements).toEqual([]);
  saveCustomerSettings({ ...customerSettings(), servicePortal: false });expect((await customerView(alpha.token)).tax).toBeNull();
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });saveBranding({ industrySetup: null });expect((await customerView(alpha.token)).tax).toBeNull();
});
it("renders escaped updates with private response headers and immediately respects revocation", async () => {
  const own = engagement(alpha.clientId, true, '<img src=x onerror="alert(1)">');document(alpha.clientId, own.id);
  change("tax-engagements", own, { client_message: '<script>privateContent()</script>' });
  const request = () => new Request(base + CUSTOMER_PATH, { headers: { Cookie: `shuug_customer=${alpha.token}` } });
  const response = await GET(request()), html = await response.text();
  expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  const dom = new JSDOM(html);
  try { const d=dom.window.document;expect(d.querySelector('#tax-work')).not.toBeNull();expect(d.querySelectorAll('script,img')).toHaveLength(0);expect(d.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');expect(d.querySelector('.client-message')?.textContent).toContain('<script>'); } finally { dom.window.close(); }
  expect(html).toContain("Rideshare Tax Pros");expect(html).toContain("--primary:#9425e8");expect(html).not.toContain("PRIVATE-");expect(html).not.toContain("INTERNAL-");
  setCustomerEnabled(alpha.id, false);const revoked = await (await GET(request())).text();expect(revoked).toContain("Client sign-in");expect(revoked).not.toContain('id="tax-work"');
});
