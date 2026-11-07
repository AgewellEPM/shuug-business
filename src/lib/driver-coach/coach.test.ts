// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
import { importBusinessTemplate } from "../branding/templates";
import { saveBranding } from "../branding/store";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { createLinkedCustomer, saveCustomerSettings, customerSettings } from "../customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation, setCustomerEnabled, signInCustomer } from "../customer-access/accounts";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { saveDriverRecord } from "../rideshare-driver/store";
import { addRecord } from "../sdk/records";
import { taxFirmModules } from "../../modules/tax-firm";
import { GET, POST } from "@/app/api/website/customer/driver/coach/route";
import { GET as portal } from "@/app/api/website/customer/route";
import { POST as saveNativeRecord, GET as receivedRecords } from "@/app/api/website/customer/driver/records/route";
import { initCoach, readCoach, staffCoachThreads, updateCoach } from "./store";

const peel = vi.hoisted(() => ({ available: false, attest: vi.fn() }));
vi.mock("./peel", () => ({ peelCoachAvailable: () => peel.available, attestFinancialFacts: peel.attest }));
let directory: string, alpha: { id: string; clientId: string; token: string }, beta: typeof alpha;
const base = "https://workspace.example.com", path = "/api/website/customer/driver/coach";
const dates = { from: "2026-11-01", through: "2026-11-30" };
const question = (text = "Where am I losing money, on which jobs, and which jobs make the most?") => ({ action: "message", mutationId: randomUUID(), messageId: randomUUID(), text, ...dates, preferences: { vehicleCostCentsPerMile: 50 } });
const request = (token?: string, body?: unknown, browser = false, origin?: string) => new Request(base + path + (body ? "" : "?from=2026-11-01&through=2026-11-30"), {
  method: body ? "POST" : "GET", headers: { ...(token ? browser ? { Cookie: `shuug_customer=${token}` } : { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
const job = (purpose = "My best recorded job") => ({ id: randomUUID(), revision: 0, deleted: false, kind: "trip", body: {
  startedAt: "2026-11-06T12:00:00Z", endedAt: "2026-11-06T12:30:00Z", localDate: "2026-11-06", timeZoneId: "America/New_York",
  classification: "business", purpose, distanceMeters: 16093.44, source: "gps", hasGaps: false, sampleCount: 20, notes: "",
  earningsCents: 3000, platformFeesCents: 500, platform: "Uber", workArea: "Downtown", rideRole: "ride",
} });
beforeEach(async () => {
  directory = mkdtempSync(`${tmpdir()}/shuug-coach-`);
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, APP_BASE_URL: base, DATABASE_URL: "", DEMO_DATA: "false" })) vi.stubEnv(key, value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({ enabled: true, pricing: false, ordering: false, orderStatus: false, servicePortal: true, booking: false });
  async function account(name: string) {
    const client = saveBusinessRecord({ kind: "client", title: name, fields: { email: `${name}@example.com` } }, "owner");
    const user = await createLinkedCustomer({ name, email: `${name}@example.com`, clientId: client.id, customerId: null });
    acceptCustomerInvitation(issueCustomerInvitation(user.id), "Synthetic-coach-password-only");
    return { id: user.id, clientId: client.id, token: signInCustomer(user.email, "Synthetic-coach-password-only") };
  }
  alpha = await account("Alpha"); beta = await account("Beta"); peel.available = false; peel.attest.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("persists one grounded conversation across native bearer, browser cookie, portal and staff projections with idempotent retries", async () => {
  const own = saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: job("ALPHA <job>") });
  saveDriverRecord(beta.token, { mutationId: randomUUID(), record: job("BETA PRIVATE") });
  const command = question(), first = await POST(request(alpha.token, command));
  expect(first.status).toBe(200); const state = await first.json();
  expect(state.messages).toHaveLength(2); expect(state.messages[1].text).toContain("ALPHA <job>");
  expect(state.messages[1].recordIds).toContain(own.record.id); expect(JSON.stringify(state)).not.toContain("BETA PRIVATE");
  expect(state.engine).toEqual({ mode: "record-rules", peelAvailable: false, llmAvailable: false });
  expect(await (await POST(request(alpha.token, command))).json()).toEqual(state);
  expect(await (await GET(request(alpha.token, undefined, true))).json()).toEqual(state);
  expect((await (await GET(request(beta.token))).json()).messages).toEqual([]);
  expect((await POST(request(alpha.token, { ...command, text: "Changed retry" }))).status).toBe(409);
  expect((await POST(request(alpha.token, { ...command, mutationId: randomUUID() }))).status).toBe(409);
  expect(staffCoachThreads().find(row => row.accountId === alpha.id)?.messages).toEqual(state.messages);
  const html = await (await portal(new Request(base + "/api/website/customer?year=2026", { headers: { Cookie: `shuug_customer=${alpha.token}` } }))).text();
  expect(html).toContain('id="tax-goals"'); expect(html).toContain("ALPHA &lt;job&gt;"); expect(html).not.toContain("BETA PRIVATE");
  const dom = new JSDOM(html); try { expect(dom.window.document.querySelectorAll("script")).toHaveLength(0); expect(dom.window.document.querySelector('form[action="' + path + '"]')).not.toBeNull(); } finally { dom.window.close(); }
  expect(peel.attest).not.toHaveBeenCalled();
});
it("round-trips a zero-mile completed shopping job through record sync and prices its actual work without a driving-cost setting", async () => {
  const original = job("Manual store job"), record = { ...original, body: { ...original.body, rideRole: "shopping", source: "manual",
    distanceMeters: 0, endedAt: "2026-11-06T13:00:00Z", earningsCents: 1800, platformFeesCents: 200 } };
  const saved = await saveNativeRecord(new Request(base + "/api/website/customer/driver/records", { method: "POST", headers: {
    Authorization: `Bearer ${alpha.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ mutationId: randomUUID(), record }) }));
  expect(saved.status).toBe(200);
  const received = await (await receivedRecords(new Request(base + "/api/website/customer/driver/records", { headers: { Authorization: `Bearer ${alpha.token}` } }))).json();
  expect(received.records[0].record.body).toMatchObject({ rideRole: "shopping", source: "manual", distanceMeters: 0, earningsCents: 1800, platformFeesCents: 200 });
  const state = await (await POST(request(alpha.token, { ...question(), preferences: {} }))).json();
  expect(state.messages.at(-1).text).toContain("$16.00 estimated net");
  expect(state.messages.at(-1).text).toContain("1 of 1 completed business jobs");
  expect(state.messages.at(-1).recordIds).toContain(record.id);
});
it("requires explicit confirmed nonsensitive intake and does not extract facts or change staff-reviewed tax work from chat", async () => {
  await updateCoach(alpha.token, question("My tax year is 2025 and business is a corporation"));
  expect(readCoach(alpha.token, dates).intake).toEqual({});
  const input = { action: "intake", mutationId: randomUUID(), confirmed: true, answers: { taxYear: 2026, jurisdiction: "New York", businessType: "sole-proprietor" }, ...dates };
  const state = await updateCoach(alpha.token, input); expect(state.intake).toEqual(input.answers);
  expect(state.milestones.find(row => row.id === "tax-context")?.status).toBe("done");
  expect(await updateCoach(alpha.token, input)).toEqual(state);
  expect((await POST(request(alpha.token, { ...input, mutationId: randomUUID(), confirmed: false }))).status).toBe(400);
  expect((await POST(request(alpha.token, { ...input, mutationId: randomUUID(), answers: { jurisdiction: "123-45-6789" } }))).status).toBe(400);
  expect((await POST(request(alpha.token, { ...input, mutationId: randomUUID(), answers: { taxYear: 2026, taxpayerId: "forbidden" } }))).status).toBe(400);
  expect(readCoach(beta.token, dates).intake).toEqual({});
});
it("replaces confirmed intake snapshots so omitted fields clear prior facts across native and browser reads", async () => {
  await updateCoach(alpha.token, { action: "intake", mutationId: randomUUID(), confirmed: true,
    answers: { taxYear: 2026, jurisdiction: "New York", businessType: "sole-proprietor" }, ...dates });
  const clear = { action: "intake", mutationId: randomUUID(), confirmed: true, answers: { businessType: "unsure" }, ...dates };
  const saved = await POST(request(alpha.token, clear)); expect(saved.status).toBe(200);
  const state = await saved.json(); expect(state.intake).toEqual({ businessType: "unsure" });
  expect(state.milestones.find((row: { id: string }) => row.id === "tax-context").status).toBe("todo");
  expect((await (await GET(request(alpha.token, undefined, true))).json()).intake).toEqual({ businessType: "unsure" });
  expect(await (await POST(request(alpha.token, clear))).json()).toEqual(state);
  const empty = { action: "intake", mutationId: randomUUID(), confirmed: true, answers: {}, ...dates };
  expect((await (await POST(request(alpha.token, empty, true, base))).json()).intake).toEqual({});
  expect(readCoach(alpha.token, dates).intake).toEqual({}); expect(readCoach(beta.token, dates).intake).toEqual({});
});
it("grounds tax milestones only in explicitly shared own-client work and links curated IRS sources", async () => {
  const module = (id: string) => taxFirmModules.find(row => row.id === id)!;
  const engagement = addRecord("tax-engagements", module("tax-engagements").fields, { name: "My shared engagement", client_id: alpha.clientId, tax_year: 2026, stage: "Awaiting documents", client_visible: true, notes: "STAFF PRIVATE NOTE" });
  addRecord("tax-document-requests", module("tax-document-requests").fields, { name: "Own requested statement", client_id: alpha.clientId, engagement_id: engagement.id, status: "Requested", client_visible: true, secure_reference: "PRIVATE VAULT" });
  addRecord("tax-engagements", module("tax-engagements").fields, { name: "BETA PRIVATE ENGAGEMENT", client_id: beta.clientId, tax_year: 2026, stage: "Preparation", client_visible: true });
  const state = await updateCoach(alpha.token, question("What tax documents and vehicle deductions do I need?"));
  expect(state.messages.at(-1)?.text).toContain("My shared engagement");
  expect(state.milestones.some(row => row.title === "Own requested statement" && row.status === "todo")).toBe(true);
  expect(JSON.stringify(state)).not.toMatch(/BETA PRIVATE|STAFF PRIVATE|PRIVATE VAULT/);
  expect(state.messages.at(-1)?.sources).toContainEqual(expect.objectContaining({ id: "irs-business-car", url: "https://www.irs.gov/taxtopics/tc510" }));
  expect(state.messages.at(-1)?.text).toContain("no deduction or mileage rate is inferred");
});
it("enforces authentication, same-origin browser writes, hidden modules, service access and live account revocation", async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request(alpha.token, question(), false, "https://attacker.example"))).status).toBe(403);
  expect((await POST(request(alpha.token, question(), true))).status).toBe(403);
  expect((await POST(request(alpha.token, question(), true, base))).status).toBe(200);
  saveCustomerSettings({ ...customerSettings(), servicePortal: false }); expect((await GET(request(alpha.token))).status).toBe(404);
  saveCustomerSettings({ ...customerSettings(), servicePortal: true });
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": false } }); expect((await GET(request(alpha.token))).status).toBe(404);
  saveBranding({ featureVisibility: { "module:rideshare-tax-records": true } });
  setCustomerEnabled(alpha.id, false); expect((await GET(request(alpha.token))).status).toBe(401);
});
it("rechecks scope after optional symbolic work and never commits a reply for a revoked account", async () => {
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: job() }); peel.available = true;
  peel.attest.mockImplementation(async () => { setCustomerEnabled(alpha.id, false); return { available: false, verified: false }; });
  await expect(updateCoach(alpha.token, question())).rejects.toThrow("Sign in");
  expect(workspaceDatabase(db => (db.prepare("SELECT count(*) AS n FROM driver_coach_messages WHERE accountId=?").get(alpha.id) as { n: number }).n)).toBe(0);
});
it("attaches successful symbolic arithmetic to its reply without claiming a fresh availability check on later GETs", async () => {
  saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: job() }); peel.available = true;
  peel.attest.mockResolvedValue({ available: true, verified: true, totals: { grossCents: 3000, feesCents: 500, vehicleCents: 500, netCents: 2000, pricedCount: 1 } });
  const state = await updateCoach(alpha.token, question()); expect(state.engine.peelAvailable).toBe(true);
  expect(state.messages.at(-1)?.engine).toBe("record-rules · Peel-verified arithmetic");
  const later = readCoach(alpha.token, dates); expect(later.engine.peelAvailable).toBe(false);
  expect(later.messages.at(-1)?.engine).toBe("record-rules · Peel-verified arithmetic");
  peel.attest.mockResolvedValue({ available: true, verified: true, totals: { grossCents: 3000, feesCents: 500, vehicleCents: 500, netCents: 9999, pricedCount: 1 } });
  expect((await updateCoach(alpha.token, question())).messages.at(-1)?.engine).toBe("record-rules");
});
it("refuses stale asynchronous grounding and prevents a changed service-client binding from inheriting prior history", async () => {
  const saved = saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: job() }); peel.available = true;
  peel.attest.mockImplementation(async () => { saveDriverRecord(alpha.token, { mutationId: randomUUID(), record: { ...saved.record, deleted: true } }); return { available: false, verified: false }; });
  await expect(updateCoach(alpha.token, question())).rejects.toThrow("records changed");
  peel.available = false; await updateCoach(alpha.token, question());
  workspaceDatabase(db => db.prepare("UPDATE customer_accounts SET clientId=? WHERE id=?").run(beta.clientId, alpha.id), true);
  expect(readCoach(alpha.token, dates).messages).toEqual([]);
});
it("preserves older history at capacity and limits reads without silently pruning records", async () => {
  workspaceDatabase(db => {
    initCoach(db);
    db.prepare(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<2000)
      INSERT INTO driver_coach_messages(accountId,clientId,id,body)
      SELECT ?,?,printf('00000000-0000-4000-8000-%012d',value),json_object('id',printf('00000000-0000-4000-8000-%012d',value),'role','user','text','Saved historical message','createdAt','2026-11-01T00:00:00.000Z') FROM n`).run(alpha.id, alpha.clientId);
  }, true);
  expect(readCoach(alpha.token, dates).messages).toHaveLength(100);
  expect((await POST(request(alpha.token, question()))).status).toBe(413);
  expect(workspaceDatabase(db => (db.prepare("SELECT count(*) AS n FROM driver_coach_messages WHERE accountId=?").get(alpha.id) as { n: number }).n)).toBe(2000);
});
