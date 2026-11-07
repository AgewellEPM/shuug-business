// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { saveDriverRecord, staffDriverRecords } from "../rideshare-driver/store";
import { saveDriverReceipt } from "../rideshare-driver/receipts";
import { acceptCustomerInvitation, issueCustomerInvitation, signInCustomer, customerSession, CUSTOMER_PATH, setCustomerEnabled } from "./accounts";
import { createLinkedCustomer, customerView, customerSettings, saveCustomerSettings } from "./service";
import { GET, POST } from "@/app/api/website/customer/route";
import { POST as saveNativeRecord } from "@/app/api/website/customer/driver/records/route";
import { GET as receiptDownload } from "@/app/api/website/customer/driver/receipts/[id]/route";

const base = "https://workspace.example.com", password = "Synthetic-portal-client-password";
let directory: string;
let alpha: { id: string; token: string; clientId: string; email: string };
let beta: typeof alpha;
const income = (description = "Platform payout", date = "2026-11-06") => ({ id: randomUUID(), revision: 0, deleted: false, kind: "income", body: { date, platform: "uber", description, amountCents: 10000, currency: "USD", notes: "" } });
const trip = () => ({ id: randomUUID(), revision: 0, deleted: false, kind: "trip", body: { startedAt: "2026-11-06T12:00:00Z", endedAt: "2026-11-06T13:00:00Z", distanceMeters: 16093.44, classification: "business", purpose: "My recorded drive", notes: "", source: "gps", hasGaps: false, sampleCount: 20, earningsCents: 10000, platformFeesCents: 1200 } });
const request = (token = alpha.token, query = "") => new Request(base + CUSTOMER_PATH + query, { headers: { Cookie: `shuug_customer=${token}` } });

beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-driver-portal-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const email = `${name}@example.com`;
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email } }, "owner");
    const user = await createLinkedCustomer({ name, email, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), password);
    return { id: user.id, clientId: client.id, email, token: signInCustomer(email, password) };
  }
  alpha = await account("Alpha"); beta = await account("Beta");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("shows native submissions in the same client's portal and staff review without combining duplicate earning representations", async () => {
  const body = { mutationId: randomUUID(), record: income("Native <payout>") };
  const saved = await saveNativeRecord(new Request(base + CUSTOMER_PATH + "/driver/records", { method: "POST", headers: { Authorization: `Bearer ${alpha.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  expect(saved.status).toBe(200);
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: trip() });
  saveDriverRecord(beta.token, { mutationId: randomUUID(), record: { ...body.record, body: { ...body.record.body, description: "BETA PRIVATE PAYOUT" } } });
  const view = (await customerView(alpha.token, { year: 2026 })).driver!;
  expect(view.totals).toMatchObject({ incomeCents: 10000, tripEarningsCents: 10000, tripFeesCents: 1200, businessMeters: 16093.44, trips: 1, incomeEntries: 1 });
  expect(staffDriverRecords(alpha.clientId)).toHaveLength(2);
  const response = await GET(request(alpha.token, "?year=2026"));
  const html = await response.text();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(html).toContain("Native &lt;payout&gt;"); expect(html).toContain("My recorded drive"); expect(html).not.toContain("BETA PRIVATE");
  expect(html).toContain("shown separately from income entries");
  const dom = new JSDOM(html);
  try {
    expect(dom.window.document.querySelector('#your-records')).not.toBeNull();
    expect(dom.window.document.querySelectorAll('script')).toHaveLength(0);
    expect(dom.window.document.querySelector('select[name="year"]')?.getAttribute('id')).toBe('driver-year');
  } finally { dom.window.close(); }
});

it("groups by saved local trip date, pages every received record, and removes native deletion markers from totals", async () => {
  const late = trip();
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...late, body: { ...late.body, startedAt: "2027-01-01T02:00:00Z", endedAt: "2027-01-01T02:30:00Z", localDate: "2026-12-31", timeZoneId: "America/New_York" } } });
  const deleted = saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: income("Deleted payout") });
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...deleted.record, deleted: true } });
  for (let i = 0; i < 26; i++) saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: income(`Entry ${i}`) });
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: income("Prior year payout", "2025-12-31") });
  const page1 = (await customerView(alpha.token, { year: 2026 })).driver!;
  const page2 = (await customerView(alpha.token, { year: 2026, page: 2 })).driver!;
  expect(page1.count).toBe(27); expect(page1.pages).toBe(2); expect(page1.rows).toHaveLength(25); expect(page2.rows).toHaveLength(2);
  expect(page1.totals.incomeCents).toBe(260000);
  expect(page2.rows.find(row => row.record.kind === "trip")?.date).toBe("2026-12-31");
  expect(page1.years).toEqual([2026, 2025]);
  const prior = await (await GET(request(alpha.token, "?year=2025"))).text();
  expect(prior).toContain("Prior year payout"); expect(prior).not.toContain("Entry 25");
  expect((await customerView(alpha.token, { year: 2026, page: 999 })).driver!.page).toBe(2);
});

it("uses owned browser-session receipt downloads and denies other clients and revoked sessions", async () => {
  const id = randomUUID(), bytes = Buffer.from("ffd8ffe000104a4649460001", "hex");
  saveDriverReceipt(alpha.token, id, bytes);
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { id: randomUUID(), revision: 0, deleted: false, kind: "expense", body: { date: "2026-11-06", merchant: "My fuel receipt", category: "fuel", amountCents: 4321, currency: "USD", classification: "business", notes: "", receiptId: id } } });
  const response = await GET(request(alpha.token, "?year=2026")), html = await response.text();
  expect(html).toContain(`${CUSTOMER_PATH}/driver/receipts/${id}`);
  const download = (token?: string) => receiptDownload(new Request(base + CUSTOMER_PATH + `/driver/receipts/${id}`, { headers: token ? { Cookie: `shuug_customer=${token}` } : {} }), { params: Promise.resolve({ id }) });
  const own = await download(alpha.token);
  expect(own.status).toBe(200); expect(own.headers.get("cache-control")).toBe("private, no-store");
  expect(Buffer.from(await own.arrayBuffer())).toEqual(bytes);
  expect((await download(beta.token)).status).toBe(404); expect((await download()).status).toBe(401);
  setCustomerEnabled(alpha.id, false);
  expect((await download(alpha.token)).status).toBe(401);
  expect(await (await GET(request())).text()).not.toContain('id="your-records"');
});

it("shows review prompts grounded in recorded fields and obeys feature visibility and service access", async () => {
  const open = trip();
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...open, body: { ...open.body, endedAt: null, classification: "unclassified", hasGaps: true } } });
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { id: randomUUID(), revision: 0, deleted: false, kind: "expense", body: { date: "2026-11-06", merchant: "Meal", category: "meals", amountCents: 2500, currency: "USD", classification: "business", notes: "" } } });
  expect((await customerView(alpha.token, { year: 2026 })).driver!.review).toEqual({ unclassified: 1, incompleteTrips: 1, tripsWithGaps: 1, expensesWithoutReceipt: 1, businessExpensesWithoutPurpose: 1 });
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": false } });
  expect((await customerView(alpha.token)).driver).toBeNull();
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": true } });
  saveCustomerSettings({ ...customerSettings(), servicePortal: false });
  expect((await customerView(alpha.token)).driver).toBeNull();
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  saveBranding({ industrySetup: null });
  expect((await customerView(alpha.token)).driver).toBeNull();
});

it("activates an invited account and opens its portal using the same identity immediately", async () => {
  const invite = issueCustomerInvitation(alpha.id);
  const form = new URLSearchParams({ action: "activate", invite, password, confirmation: password });
  const response = await POST(new Request(base + CUSTOMER_PATH, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: form }));
  expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(base + CUSTOMER_PATH);
  const token = response.headers.get("set-cookie")?.match(/^shuug_customer=([a-f0-9]{64});/)?.[1];
  expect(token).toBeDefined(); expect(customerSession(token)?.id).toBe(alpha.id);
  const page = await (await GET(request(token!))).text();
  expect(page).toContain(alpha.email.toLowerCase()); expect(page).toContain('id="your-records"');
  expect(customerSession(alpha.token)).toBeNull();
});
