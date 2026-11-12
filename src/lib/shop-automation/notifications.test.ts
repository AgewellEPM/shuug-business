// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { workspaceDatabase } from "../workspace/database";
import type { BusinessRecord } from "../workspace/model";
import { communicationSnapshot } from "../communications/store";
import { dispatchQueuedMessages } from "../communications/service";
import { saveShopSettings } from "./settings";
import { queueShopRecordNotifications, reserveUpcomingShopNotifications } from "./notifications";
let directory: string;
const config = { revision: 0, reviewed: true as const, enabled: true, bookingConfirmations: true, appointmentReminders: true,
  jobUpdates: true, reminderHours: 24, timeZone: "America/New_York" };
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "shuug-shop-notify-")); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  vi.stubEnv("APP_BASE_URL", "https://shop.example.invalid");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });
function put(db: import("node:sqlite").DatabaseSync, row: BusinessRecord) {
  db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at")
    .run(row.id, row.kind, row.revision, JSON.stringify(row), row.createdAt, row.updatedAt);
}
function booking(phone?: string) {
  const now = new Date().toISOString();
  const client: BusinessRecord = { id: randomUUID(), kind: "client", title: "DEMO Customer", currency: "USD", status: "draft", revision: 1,
    createdAt: now, updatedAt: now, fields: { email: "demo@example.invalid", ...(phone ? { phone } : {}) } };
  const job: BusinessRecord = { ...client, id: randomUUID(), kind: "job", title: "DEMO agreed service", fields: { client: client.id }, status: "scheduled" };
  const row: BusinessRecord = { ...client, id: randomUUID(), kind: "booking", title: "DEMO appointment", status: "scheduled", fields: { job: job.id,
    start: new Date(Date.now() + 48 * 3600000).toISOString(), end: new Date(Date.now() + 49 * 3600000).toISOString() } };
  workspaceDatabase(db => { put(db, client); put(db, job); put(db, row); }, true);
  return row;
}
it("reserves confirmation and a timed reminder once, preserving them across harmless booking edits", async () => {
  saveShopSettings(config, "Owner"); const row = booking();
  workspaceDatabase(db => queueShopRecordNotifications(db, row), true);
  reserveUpcomingShopNotifications();
  let messages = communicationSnapshot().messages;
  expect(messages).toHaveLength(2); expect(messages.filter(message => message.notBefore)).toHaveLength(1);
  expect(messages.every(message => message.recordRevision === undefined && message.recordStart === row.fields.start)).toBe(true);
  const revised = { ...row, revision: 2, fields: { ...row.fields, notes: "Staff-only note" } };
  workspaceDatabase(db => { put(db, revised); queueShopRecordNotifications(db, revised); }, true);
  const network = vi.fn(); await dispatchQueuedMessages(20, { fetcher: network });
  messages = communicationSnapshot().messages;
  expect(messages).toHaveLength(2); expect(messages.some(message => message.status === "canceled")).toBe(false);
  expect(network).not.toHaveBeenCalled();
});
it("pauses already queued automatic messages before a provider attempt", async () => {
  saveShopSettings(config, "Owner"); const row = booking();
  workspaceDatabase(db => queueShopRecordNotifications(db, row), true);
  saveShopSettings({ ...config, revision: 1, enabled: false }, "Owner");
  const network = vi.fn(); await dispatchQueuedMessages(20, { fetcher: network });
  expect(communicationSnapshot().messages.find(message => !message.notBefore)).toMatchObject({ status: "blocked", attemptId: null });
  expect(communicationSnapshot().messages.find(message => !message.notBefore)?.detail).toContain("paused");
  expect(network).not.toHaveBeenCalled();
});
it("rolls notification reservation back with its encompassing business transaction", () => {
  saveShopSettings(config, "Owner"); const row = booking();
  expect(() => workspaceDatabase(db => { queueShopRecordNotifications(db, row); throw new Error("Domain commit failed"); }, true)).toThrow("Domain commit failed");
  expect(communicationSnapshot().messages).toHaveLength(0);
  workspaceDatabase(db => queueShopRecordNotifications(db, row), true);
  expect(communicationSnapshot().messages).toHaveLength(2);
});
it("retains an actionable review item for a malformed legacy phone instead of rolling back agreed work", () => {
  saveShopSettings(config, "Owner"); const row = booking("not-a-phone");
  expect(() => workspaceDatabase(db => queueShopRecordNotifications(db, row), true)).not.toThrow();
  const reviews = workspaceDatabase(db => db.prepare("SELECT body FROM documents WHERE kind='shop-notification' AND json_extract(body,'$.state')='review'").all());
  expect(reviews).toHaveLength(2);
  expect(communicationSnapshot().messages.every(message => message.channel === "email")).toBe(true);
  expect(workspaceDatabase(db => db.prepare("SELECT id FROM records WHERE id=?").get(row.id))).toBeTruthy();
});
it("queues one recorded-payment receipt, keeps it valid after reconciliation, and skips test payments", async () => {
  saveShopSettings(config, "Owner"); const appointment = booking();
  const now = new Date().toISOString();
  const invoice: BusinessRecord = { ...appointment, id: randomUUID(), kind: "invoice", status: "issued", title: "DEMO invoice", fields: { job: appointment.fields.job } };
  const payment: BusinessRecord = { ...appointment, id: randomUUID(), kind: "service_payment", status: "confirmed", title: "DEMO payment", createdAt: now,
    fields: { invoice: invoice.id, amount: 10625, direction: "receipt" }, computed: { provider: "stripe", live: true } };
  workspaceDatabase(db => { put(db, invoice); put(db, payment); queueShopRecordNotifications(db, payment); queueShopRecordNotifications(db, payment); }, true);
  expect(communicationSnapshot().messages).toHaveLength(1);
  expect(communicationSnapshot().messages[0].purpose).toBe("payment_receipt");
  workspaceDatabase(db => { put(db, { ...payment, status: "reconciled", revision: 2 });
    const testPayment = { ...payment, id: randomUUID(), computed: { provider: "stripe", live: false } }; put(db, testPayment); queueShopRecordNotifications(db, testPayment); }, true);
  await dispatchQueuedMessages();
  expect(communicationSnapshot().messages).toHaveLength(1);
  expect(communicationSnapshot().messages[0].status).toBe("blocked");
});
