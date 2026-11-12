// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { saveSecrets } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { queueMessage, queueMessageInDatabase, communicationSnapshot, recordSmsConsent, messageInDatabase, saveMessageInDatabase } from "./store";
import { dispatchQueuedMessages } from "./service";
import { acceptTwilioInbound, acceptTwilioStatus, acceptMailgunEvent, twilioSignature, twilioParameters } from "./webhooks";
import { communicationConnectionStatus } from "./provider";
import { saveShopSettings } from "../shop-automation/settings";

let directory: string;
const account = `AC${"1".repeat(32)}`, auth = "synthetic-private-twilio-token-only", sid = `SM${"2".repeat(32)}`;
const from = "+18605550100", to = "+18605550101", base = "https://shop.example.invalid";
const emailConnection = { MAILGUN_API_KEY: "synthetic-private-mailgun-key", MAILGUN_DOMAIN: "shop.example.invalid", MAILGUN_FROM_EMAIL: "service@shop.example.invalid", MAILGUN_REGION: "US", MAILGUN_MODE: "live", MAILGUN_WEBHOOK_SIGNING_KEY: "synthetic-private-mailgun-signing-key" };
const allowSms = () => recordSmsConsent({ phone: to, granted: true, source: "synthetic-form", evidence: "Fictional affirmative service SMS consent.", policyVersion: "synthetic-v1" });
const queue = (eventKey = randomUUID()) => queueMessage({ eventKey, channel: "sms", to, body: "Your fictional repair appointment is confirmed.", purpose: "service_updates" });
const accepted = () => Response.json({ sid }, { status: 201 });
function signed(pathname: string, values: Record<string, string>, query = "") {
  const url = `${base}${pathname}${query}`;
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilioSignature(auth, url, values) }, body: new URLSearchParams(values) });
}
function inbound(body: string, messageSid = `SM${"3".repeat(32)}`) {
  const values = { AccountSid: account, MessageSid: messageSid, From: to, To: from, Body: body };
  return { values, request: signed("/api/communications/twilio/inbound", values) };
}
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "shuug-comms-"));
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("APP_BASE_URL", base); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DEMO_DATA", "false");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No real network is permitted in this fixture."); }));
  saveSecrets({ TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: auth, TWILIO_FROM_NUMBER: from, TWILIO_MODE: "live", COMMUNICATIONS_SEND_ENABLED: "true", ...emailConnection });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("queues inside the caller's transaction, binds event content and seals private links", () => {
  const eventKey = randomUUID(), body = `${base}/api/shop-invoicing/invoice/synthetic-bearer-token-do-not-persist-plaintext`;
  const input = { eventKey, channel: "email" as const, to: "sample@example.invalid", subject: "Private invoice", body, purpose: "invoice" };
  expect(() => workspaceDatabase(db => { queueMessageInDatabase(db, input); throw new Error("Synthetic intake rollback"); }, true)).toThrow(/rollback/);
  expect(communicationSnapshot().messages).toHaveLength(0);
  const first = queueMessage(input); expect(queueMessage(input).id).toBe(first.id);
  expect(() => queueMessage({ ...input, to: "different@example.invalid" })).toThrow(/different/);
  const saved = workspaceDatabase(db => JSON.stringify(db.prepare("SELECT * FROM documents UNION ALL SELECT record_id,action,snapshot FROM audit").all()));
  expect(saved).not.toContain(body); expect(saved).not.toContain("Private invoice");
  expect(JSON.stringify(first)).not.toContain(body); expect(JSON.stringify(communicationSnapshot())).not.toContain(body);
  expect(workspaceDatabase(db => messageInDatabase(db, first.id))?.body).toBe(body);
});

it("blocks dispatch by default and rechecks current consent before a reserved send", async () => {
  saveSecrets({ COMMUNICATIONS_SEND_ENABLED: "false" }); allowSms(); const message = queue();
  expect((await dispatchQueuedMessages())[0].status).toBe("blocked"); expect(fetch).not.toHaveBeenCalled();
  saveSecrets({ COMMUNICATIONS_SEND_ENABLED: "true" });
  recordSmsConsent({ phone: to, granted: false, source: "synthetic-revoke", evidence: "Fictional customer withdrew consent.", policyVersion: "v1" });
  expect((await dispatchQueuedMessages())[0].status).toBe("blocked"); expect(fetch).not.toHaveBeenCalled();
  allowSms(); const provider = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(communicationSnapshot().messages.find(m => m.id === message.id)?.status).toBe("sending");
    const fields = init!.body as URLSearchParams;
    expect(fields.get("To")).toBe(to); expect(fields.get("Body")).toContain("Reply STOP to opt out.");
    expect(fields.get("StatusCallback")).toContain(message.id); return accepted();
  });
  expect((await dispatchQueuedMessages(20, { fetcher: provider }))[0].status).toBe("accepted"); expect(provider).toHaveBeenCalledOnce();
  await dispatchQueuedMessages(20, { fetcher: provider }); expect(provider).toHaveBeenCalledOnce();
});

it("allows one concurrent dispatch and never resends uncertain or interrupted attempts", async () => {
  allowSms(); queue(); let release!: (response: Response) => void, started!: () => void;
  const gate = new Promise<void>(resolve => { started = resolve; });
  const response = new Promise<Response>(resolve => { release = resolve; });
  const provider = vi.fn(async () => { started(); return response; });
  const first = dispatchQueuedMessages(20, { fetcher: provider }); await gate;
  expect(await dispatchQueuedMessages(20, { fetcher: provider })).toEqual([]);
  release(new Response("Unknown provider outcome", { status: 500 }));
  expect((await first)[0].status).toBe("uncertain");
  expect(await dispatchQueuedMessages(20, { fetcher: provider })).toEqual([]); expect(provider).toHaveBeenCalledOnce();
  const interrupted = queue();
  workspaceDatabase(db => { const message = messageInDatabase(db, interrupted.id)!; message.status = "sending"; message.attemptId = randomUUID(); message.attemptedAt = new Date(Date.now() - 120000).toISOString(); saveMessageInDatabase(db, message); }, true);
  expect(await dispatchQueuedMessages(20, { fetcher: provider })).toEqual([]);
  expect(communicationSnapshot().messages.find(m => m.id === interrupted.id)?.status).toBe("uncertain"); expect(provider).toHaveBeenCalledOnce();
});

it("keeps SMS test mode local and never calls the provider", async () => {
  allowSms(); saveSecrets({ TWILIO_MODE: "test" }); queue();
  const result = await dispatchQueuedMessages(); expect(result[0].status).toBe("simulated"); expect(fetch).not.toHaveBeenCalled();
  expect(communicationConnectionStatus().sms.detail).toContain("simulation");
});

it("verifies Twilio signatures against its documented independent test vector", () => {
  // Independent published vector: https://www.twilio.com/docs/usage/security
  expect(twilioSignature("12345", "https://example.com/myapp.php?foo=1&bar=2", {
    CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212",
  })).toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
});

it("atomically records signed STOP once, preserves suppression against web consent, then accepts signed START", async () => {
  allowSms(); const message = queue(), stop = inbound("STOP");
  expect(acceptTwilioInbound(stop.request, stop.values).duplicate).toBe(false);
  expect(acceptTwilioInbound(stop.request, stop.values).duplicate).toBe(true);
  expect(acceptTwilioInbound(stop.request, Object.fromEntries(Object.entries(stop.values).reverse())).duplicate).toBe(true);
  allowSms(); expect(communicationSnapshot().consents[0]).toMatchObject({ granted: true, providerStopped: true });
  expect((await dispatchQueuedMessages())[0].status).toBe("blocked"); expect(fetch).not.toHaveBeenCalled();
  const start = inbound("START", `SM${"4".repeat(32)}`); acceptTwilioInbound(start.request, start.values);
  const provider = vi.fn(async () => accepted()); await dispatchQueuedMessages(20, { fetcher: provider });
  expect(communicationSnapshot().messages.find(m => m.id === message.id)?.status).toBe("accepted");
  expect(communicationSnapshot().inbound).toHaveLength(2);
  const forged = inbound("STOP", `SM${"5".repeat(32)}`); forged.request.headers.set("X-Twilio-Signature", "forged");
  expect(() => acceptTwilioInbound(forged.request, forged.values)).toThrow(/authentication/);
  expect(communicationSnapshot().consents[0].providerStopped).toBe(false);
});

it("binds callback attempt and recipient and never downgrades a delivered SMS", async () => {
  allowSms(); const queued = queue(); await dispatchQueuedMessages(20, { fetcher: vi.fn(async () => accepted()) });
  const message = communicationSnapshot().messages.find(m => m.id === queued.id)!;
  const query = `?message=${message.id}&attempt=${message.attemptId}`;
  const values = { AccountSid: account, MessageSid: sid, From: from, To: to, MessageStatus: "delivered" };
  const request = signed("/api/communications/twilio/status", values, query);
  expect(acceptTwilioStatus(request, values).duplicate).toBe(false); expect(acceptTwilioStatus(request, values).duplicate).toBe(true);
  const earlier = { ...values, MessageStatus: "sent" }; acceptTwilioStatus(signed("/api/communications/twilio/status", earlier, query), earlier);
  expect(communicationSnapshot().messages[0].status).toBe("delivered");
  const wrong = { ...values, To: "+18605550109" };
  expect(() => acceptTwilioStatus(signed("/api/communications/twilio/status", wrong, query), wrong)).toThrow(/another message/);
});

function mailgunPayload(message: { id: string; attemptId: string | null }, event = "delivered", token = randomUUID()) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { signature: { timestamp, token, signature: createHmac("sha256", emailConnection.MAILGUN_WEBHOOK_SIGNING_KEY).update(timestamp + token).digest("hex") },
    "event-data": { event, id: randomUUID(), timestamp: Date.now() / 1000, recipient: "sample@example.invalid", message: { headers: { "message-id": "synthetic-mailgun-id@shop.example.invalid" } },
      "user-variables": { shuug_message: message.id, shuug_attempt: message.attemptId }, flags: { "is-test-mode": false } } };
}
it("records Mailgun delivery only from a valid bounded-time callback and protects token replay", async () => {
  queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Service update", body: "Fictional service update.", purpose: "service_updates" });
  const provider = vi.fn(async () => Response.json({ id: "<synthetic-mailgun-id@shop.example.invalid>" }));
  await dispatchQueuedMessages(20, { fetcher: provider });
  const message = communicationSnapshot().messages[0], payload = mailgunPayload(message);
  expect(acceptMailgunEvent(payload).duplicate).toBe(false); expect(acceptMailgunEvent(payload).duplicate).toBe(true);
  expect(acceptMailgunEvent({ ...payload, "event-data": Object.fromEntries(Object.entries(payload["event-data"]).reverse()) }).duplicate).toBe(true);
  expect(communicationSnapshot().messages[0].status).toBe("delivered");
  const changed = structuredClone(payload); changed["event-data"].id = randomUUID(); changed["event-data"].event = "permanent_fail";
  expect(() => acceptMailgunEvent(changed)).toThrow(/token/);
  const forged = mailgunPayload(message); forged.signature.signature = "0".repeat(64); expect(() => acceptMailgunEvent(forged)).toThrow(/authentication/);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 25 * 3600000); expect(() => acceptMailgunEvent(payload)).toThrow(/authentication/);
});

it("does not treat a Mailgun test-mode delivery event as recipient delivery", async () => {
  saveSecrets({ MAILGUN_MODE: "test" }); queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Test", body: "Fictional test.", purpose: "service_updates" });
  await dispatchQueuedMessages(20, { fetcher: vi.fn(async () => Response.json({ id: "<synthetic-mailgun-id@shop.example.invalid>" })) });
  const payload = mailgunPayload(communicationSnapshot().messages[0]); acceptMailgunEvent(payload);
  expect(communicationSnapshot().messages[0].status).toBe("accepted"); expect(communicationSnapshot().messages[0].detail).toContain("test");
});

it("cancels stale source/contact messages and keeps separate workspaces isolated", async () => {
  const id = randomUUID(), customer = randomUUID(), now = new Date().toISOString();
  workspaceDatabase(db => {
    const put = (recordId: string, kind: string, fields: unknown, revision: number) => db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(recordId, kind, revision, JSON.stringify({ id: recordId, kind, status: "draft", revision, fields }), now, now);
    put(id, "inquiry", {}, 2); put(customer, "client", { email: "changed@example.invalid" }, 1);
  }, true);
  queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Fictional request", body: "Sample", purpose: "service_updates", recordId: id, recordRevision: 1 });
  queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Fictional request", body: "Sample", purpose: "service_updates", customerId: customer });
  expect((await dispatchQueuedMessages()).every(message => message.status === "canceled")).toBe(true); expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("DEALDESK_DATA_DIR", path.join(directory, "other-workspace")); expect(communicationSnapshot().messages).toEqual([]);
});

it("rejects oversized and duplicate-key provider forms before parsing into events", async () => {
  const request = new Request(`${base}/api/communications/twilio/inbound`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `Body=${"a".repeat(30000)}` });
  await expect(twilioParameters(request)).rejects.toThrow(/large/);
  const duplicate = new Request(`${base}/api/communications/twilio/inbound`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "From=x&From=y" });
  await expect(twilioParameters(duplicate)).rejects.toThrow(/fields/); expect(communicationSnapshot().inbound).toEqual([]);
});

it("holds automatic messages while paused and cancels a rescheduled reminder without rejecting harmless notes", async () => {
  const id = randomUUID(), start = "2026-11-15T14:00:00Z", end = "2026-11-15T15:00:00Z", now = new Date().toISOString();
  const booking = { id, kind: "booking", status: "scheduled", revision: 2, fields: { start, end, notes: "An ordinary note edit" } };
  workspaceDatabase(db => db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(id, "booking", 2, JSON.stringify(booking), now, now), true);
  const input = { eventKey: randomUUID(), channel: "email" as const, to: "sample@example.invalid", subject: "Appointment", body: "Fictional appointment reminder.", purpose: "appointment", source: "shop-automation", recordId: id, expectedStatus: "scheduled", recordStart: start, recordEnd: end };
  queueMessage(input); const provider = vi.fn(async () => Response.json({ id: "<synthetic-mailgun-id@shop.example.invalid>" }));
  expect((await dispatchQueuedMessages(20, { fetcher: provider }))[0].status).toBe("blocked"); expect(provider).not.toHaveBeenCalled();
  saveShopSettings({ revision: 0, reviewed: true, enabled: true, bookingConfirmations: true, appointmentReminders: true, jobUpdates: true, reminderHours: 24, timeZone: "America/New_York" }, "Synthetic owner");
  expect((await dispatchQueuedMessages(20, { fetcher: provider }))[0].status).toBe("accepted"); expect(provider).toHaveBeenCalledOnce();
  queueMessage({ ...input, eventKey: randomUUID() });
  workspaceDatabase(db => db.prepare("UPDATE records SET body=? WHERE id=?").run(JSON.stringify({ ...booking, revision: 3, fields: { ...booking.fields, start: "2026-11-16T14:00:00Z" } }), id), true);
  expect((await dispatchQueuedMessages(20, { fetcher: provider }))[0].status).toBe("canceled"); expect(provider).toHaveBeenCalledOnce();
});

it("does not let future reminders starve a ready message", async () => {
  queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Tomorrow", body: "Future sample", purpose: "reminder", notBefore: new Date(Date.now() + 86400000).toISOString() });
  const ready = queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Now", body: "Ready sample", purpose: "update" });
  const result = await dispatchQueuedMessages(1, { fetcher: vi.fn(async () => Response.json({ id: "<synthetic-mailgun-id@shop.example.invalid>" })) });
  expect(result[0].id).toBe(ready.id); expect(result[0].status).toBe("accepted");
});

it("counts all history and keeps old unresolved messages visible beyond 500 newer deliveries", () => {
  const oldIds: string[] = [];
  workspaceDatabase(db => {
    for (const status of ["uncertain", "queued", "blocked"] as const) {
      const queued = queueMessageInDatabase(db, { eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Old unresolved", body: "Fictional unresolved message", purpose: "manual" });
      const message = messageInDatabase(db, queued.id)!;
      message.status = status; message.createdAt = "2000-01-01T00:00:00Z";
      saveMessageInDatabase(db, message); oldIds.push(message.id);
    }
    for (let index = 0; index < 505; index++) {
      const queued = queueMessageInDatabase(db, { eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Newer delivered", body: "Fictional completed message", purpose: "manual" });
      const message = messageInDatabase(db, queued.id)!; message.status = "delivered"; saveMessageInDatabase(db, message);
    }
  }, true);
  const snapshot = communicationSnapshot();
  expect(snapshot.messages).toHaveLength(500);
  expect(snapshot.messages.slice(0, 3).map(message => message.id).sort()).toEqual(oldIds.sort());
  expect(snapshot.counts).toMatchObject({ uncertain: 1, blocked: 1, queued: 1, delivered: 505 });
  expect(Object.values(snapshot.counts).reduce((total, count) => total + count, 0)).toBe(508);
});

it("shows readable owner history while hiding invoice and activation URLs and retaining sealed storage", () => {
  const invoiceToken = "synthetic-private-invoice-bearer-token", activationToken = "synthetic-private-activation-bearer-token";
  const body = `Your repair invoice is ready. ${base}/api/shop-invoicing/invoice/${invoiceToken}\nActivate your account at /api/auth/activate?token=${activationToken}\nPlease contact the shop with any questions.`;
  const queued = queueMessage({ eventKey: randomUUID(), channel: "email", to: "sample@example.invalid", subject: "Your repair invoice is ready", body, purpose: "invoice" });
  const visible = communicationSnapshot().messages[0];
  for (const message of [queued, visible]) {
    expect(message.subject).toBe("Your repair invoice is ready"); expect(message.body).toContain("Your repair invoice is ready.");
    expect(message.body).toContain("Please contact the shop"); expect(message.body).toContain("[private link]");
    for (const hidden of [invoiceToken, activationToken, `${base}/api/`, "/api/auth/activate"]) expect(JSON.stringify(message)).not.toContain(hidden);
  }
  const stored = workspaceDatabase(db => JSON.stringify(db.prepare("SELECT body FROM documents UNION ALL SELECT snapshot AS body FROM audit").all()));
  for (const hidden of [invoiceToken, activationToken, "Your repair invoice is ready.", "/api/auth/activate"]) expect(stored).not.toContain(hidden);
});
