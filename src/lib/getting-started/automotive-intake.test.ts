// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveForm, acceptSubmission, setupState } from "./store";
import { automotiveSmsConsentText, automotiveSmsConsentVersion } from "./model";
import { listBusinessRecords, saveBusinessRecord } from "../workspace/store";
import { addRecord, listRecords } from "../sdk/records";
import { moduleById } from "../sdk/registry";
import { listEmails } from "../email/store";
import { communicationSnapshot, messageInDatabase, providerSmsPreferenceInDatabase } from "../communications/store";
import { workspaceDatabase } from "../workspace/database";
import { saveShopSettings } from "../shop-automation/settings";
import { saveSecrets } from "../connections/vault";
import { GET, POST } from "@/app/api/website/forms/[id]/route";

const fault = vi.hoisted(() => ({ queue: false }));
vi.mock("../communications/store", async importOriginal => {
  const actual = await importOriginal<typeof import("../communications/store")>();
  return { ...actual, queueMessageInDatabase: (...args: Parameters<typeof actual.queueMessageInDatabase>) => { if (fault.queue) throw new Error("Simulated local outbox failure"); return actual.queueMessageInDatabase(...args); } };
});
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-auto-intake-")); fault.queue = false;
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("DEMO_DATA", "false"); vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("APP_BASE_URL", "https://shop.example.invalid"); vi.stubEnv("SHOP_AUTOMATION_ENABLED", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external provider operation is authorized."); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
const visitor = () => ({ requestId: randomUUID(), name: "DEMO Alex Sample", email: "alex.sample@example.invalid", phone: "(860) 555-0101", message: "DEMO brake squeal; please review availability.", consent: true,
  vehicle: { year: 2018, make: "Toyota", model: "Camry", plate: "DEMO-01", odometer: 84500, vin: "1HGCM82633A004352" }, requestedDate: "2026-12-15", smsConsent: true, smsConsentVersion: automotiveSmsConsentVersion });
const form = () => saveForm({ title: "Request service", kind: "auto-repair", origins: ["https://www.example.invalid"], enabled: true });
const enableAutomation = () => saveShopSettings({ revision: 0, reviewed: true, enabled: true, bookingConfirmations: true, appointmentReminders: true, jobUpdates: true, reminderHours: 24, timeZone: "America/New_York" }, "Fixture owner");

it("commits a recoverable native repair intake, unverified vehicle and owner inbox together and retries once", () => {
  vi.stubEnv("SHOP_AUTOMATION_ENABLED", "true"); // A stale vault/environment switch cannot replace reviewed database settings.
  const f = form(), input = visitor(), result = acceptSubmission(f.id, input);
  expect(result.receipt).toMatchObject({ id: result.id, formRevision: 1, status: "received", smsAcknowledgment: "automation_disabled" });
  expect(acceptSubmission(f.id, input)).toEqual({ ...result, duplicate: true });
  expect(setupState().submissions).toHaveLength(1);
  const clients = listBusinessRecords(["client"]), inquiries = listBusinessRecords(["inquiry"]), vehicles = listRecords("vehicles"), emails = listEmails();
  expect(clients).toHaveLength(1); expect(inquiries).toHaveLength(1); expect(vehicles).toHaveLength(1); expect(emails).toHaveLength(1);
  expect(clients[0].fields.phone).toBe("+18605550101"); expect(inquiries[0].fields.client).toBe(clients[0].id);
  expect(inquiries[0].fields.scope).toContain("not a confirmed appointment"); expect(vehicles[0].values.customer_id).toBe(clients[0].id);
  expect(vehicles[0].vinReviews).toBeUndefined(); expect(vehicles[0].values.notes).toContain("have not been verified");
  expect(emails[0]).toMatchObject({ id: result.receipt!.ownerInboxId, status: "new", suggestedRole: "Owner", autoHandle: false });
  expect(emails[0].body).toContain(result.id); expect(emails[0].body).toContain("does not confirm an appointment");
  expect(communicationSnapshot().consents[0].evidence).toContain(automotiveSmsConsentText);
  expect(communicationSnapshot().messages).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
});

it("queues one acknowledgment per permitted channel with enabled automation", () => {
  enableAutomation(); const f = form(), input = visitor();
  const first = acceptSubmission(f.id, input); acceptSubmission(f.id, input);
  const snapshot = communicationSnapshot(); expect(snapshot.messages).toHaveLength(2);
  expect(snapshot.messages.find(message => message.channel === "sms")).toMatchObject({ id: first.receipt!.messageId, to: "+18605550101", status: "queued", purpose: "service-request-acknowledgment" });
  expect(snapshot.messages.find(message => message.channel === "email")).toMatchObject({ id: first.receipt!.emailMessageId, to: "alex.sample@example.invalid", status: "queued", source: "website-intake" });
  expect(snapshot.consents[0]).toMatchObject({ granted: true, providerStopped: false, policyVersion: automotiveSmsConsentVersion });
  expect(first.receipt!.smsAcknowledgment).toBe("queued"); expect(fetch).not.toHaveBeenCalled();
});

it("queues an email acknowledgment without SMS permission or complete vehicle identity", () => {
  enableAutomation(); const f = form(), input = { ...visitor(), smsConsent: false, vehicle: { make: "Toyota", model: "Camry" } };
  const result = acceptSubmission(f.id, input);
  expect(result.receipt!.smsAcknowledgment).toBe("not_requested"); expect(listRecords("vehicles")).toHaveLength(0);
  expect(listBusinessRecords(["inquiry"])).toHaveLength(1); expect(communicationSnapshot().consents).toHaveLength(0);
  expect(communicationSnapshot().messages).toHaveLength(1); expect(communicationSnapshot().messages[0]).toMatchObject({ channel: "email", status: "queued", customerId: listBusinessRecords(["client"])[0].id });
  const email = workspaceDatabase(db => messageInDatabase(db, result.receipt!.emailMessageId!))!;
  expect(email.body).toContain(result.id); expect(email.body).toContain("does not confirm an appointment"); expect(email.body).not.toContain("https://"); expect(email.recordId).toBeUndefined();
  expect(result.receipt!.emailAcknowledgment).toBe("queued"); expect(fetch).not.toHaveBeenCalled();
});

it("preserves a provider STOP when a later service form requests texts", () => {
  enableAutomation(); workspaceDatabase(db => providerSmsPreferenceInDatabase(db, "+18605550101", "STOP", "DEMO-provider-stop"), true);
  const result = acceptSubmission(form().id, visitor());
  expect(result.receipt!.smsAcknowledgment).toBe("blocked"); expect(communicationSnapshot().consents[0].providerStopped).toBe(true);
  expect(communicationSnapshot().messages.find(message => message.channel === "sms")?.status).toBe("blocked"); expect(fetch).not.toHaveBeenCalled();
});

it("does not associate a self-reported known VIN with another customer's vehicle", () => {
  const previous = saveBusinessRecord({ kind: "client", title: "Existing private customer", fields: { email: "existing@example.invalid" } }, "Fixture");
  const existingVehicle = addRecord("vehicles", moduleById("vehicles")!.fields, { customer_id: previous.id, vin: visitor().vehicle.vin, make: "Honda", model: "Accord", year: 2003 });
  const result = acceptSubmission(form().id, visitor()), stored = setupState().submissions.find(s => s.id === result.id)!;
  expect(listRecords("vehicles")).toHaveLength(1); expect(listRecords("vehicles")[0]).toEqual(existingVehicle);
  expect(stored.records?.some(record => record.kind === "vehicle")).toBe(false);
  expect(listBusinessRecords(["inquiry"])[0].fields.client).not.toBe(previous.id); expect(listEmails()[0].body).not.toContain("existing@example.invalid");
});

it("rolls back business records, native vehicle, consent and inbox when a late outbox reservation fails", () => {
  enableAutomation(); const f = form(), input = visitor(); fault.queue = true;
  expect(() => acceptSubmission(f.id, input)).toThrow("outbox failure");
  expect(setupState().submissions).toHaveLength(0); expect(listBusinessRecords()).toHaveLength(0); expect(listRecords("vehicles")).toHaveLength(0);
  expect(listEmails()).toHaveLength(0); expect(communicationSnapshot().consents).toHaveLength(0); expect(communicationSnapshot().messages).toHaveLength(0);
  fault.queue = false; expect(acceptSubmission(f.id, input).duplicate).toBe(false); expect(listRecords("vehicles")).toHaveLength(1);
});

it("holds acknowledgments when the vault switch is off despite enabled database settings", () => {
  enableAutomation(); saveSecrets({ SHOP_AUTOMATION_ENABLED: "false" });
  const result = acceptSubmission(form().id, visitor()); expect(result.receipt!.smsAcknowledgment).toBe("automation_disabled");
  expect(communicationSnapshot().consents[0].granted).toBe(true); expect(communicationSnapshot().messages).toHaveLength(0);
});

it("rejects missing phone, changed consent wording and conflicting exact retries before extra records are written", () => {
  const f = form(), input = visitor();
  expect(() => acceptSubmission(f.id, { ...input, phone: "" })).toThrow();
  expect(() => acceptSubmission(f.id, { ...input, smsConsentVersion: "old-or-forged" })).toThrow();
  expect(listBusinessRecords()).toHaveLength(0); acceptSubmission(f.id, input);
  expect(() => acceptSubmission(f.id, { ...input, requestedDate: "2026-12-16" })).toThrow("already used"); expect(listEmails()).toHaveLength(1);
});

it("renders optional fields, binds posted details to the sealed current form and retains an acceptance receipt", async () => {
  const f = form(), context = { params: Promise.resolve({ id: f.id }) }, url = `https://shop.example.invalid/api/website/forms/${f.id}`;
  const html = await (await GET(new Request(url), context)).text();
  expect(html).toContain('name="vehicleYear"'); expect(html).toContain('name="phone"'); expect(html).toContain('name="smsConsent" value="yes"');
  expect(html).toContain("Consent is optional"); expect(html).not.toContain('name="smsConsent" value="yes" required');
  const proof = html.match(/name="proof" value="([^"]+)"/)![1];
  const body = { proof, name: "DEMO Alex Sample", email: "alex.sample@example.invalid", message: "DEMO repair request", phone: "860-555-0101", vehicleYear: "2018", vehicleMake: "Toyota", vehicleModel: "Camry", vehicleOdometer: "", requestedDate: "2026-12-15", consent: "yes", smsConsent: "yes", smsConsentVersion: automotiveSmsConsentVersion, website: "" };
  const request = (fields = body, origin = "https://shop.example.invalid") => new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
  expect((await POST(request(body, "https://attacker.example.invalid"), context)).status).toBe(403);
  expect((await POST(request({ ...body, vehicleYear: "2018.5" }), context)).status).toBe(400);
  const response = await POST(request(), context); expect(response.status).toBe(201); expect(await response.text()).toContain("Keep this reference");
  expect((await POST(request(), context)).status).toBe(200); const stored = setupState().submissions[0]; expect(stored.vehicle?.odometer).toBeUndefined(); expect(stored.intakeReceipt?.id).toBe(stored.id);
  const nextHtml = await (await GET(new Request(url), context)).text(), unusedProof = nextHtml.match(/name="proof" value="([^"]+)"/)![1];
  saveForm({ id: f.id, kind: f.kind, origins: f.origins, enabled: true, title: "Changed service form", revision: f.revision });
  expect((await POST(request({ ...body, proof: unusedProof }), context)).status).toBe(400);
  expect((await POST(request(), context)).status).toBe(200); expect(setupState().submissions).toHaveLength(1);
});
