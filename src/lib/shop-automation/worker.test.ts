// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const calls = vi.hoisted(() => ({ workflows: vi.fn(), payments: vi.fn(), invoices: vi.fn(), notifications: vi.fn(), messages: vi.fn() }));
vi.mock("../getting-started/runner", () => ({ processPendingRuns: calls.workflows }));
vi.mock("../website-payments/service", () => ({ processWebsitePayments: calls.payments }));
vi.mock("../shop-invoicing/service", () => ({ processShopInvoices: calls.invoices, shopInvoiceSettings: vi.fn() }));
vi.mock("../communications/service", () => ({ dispatchQueuedMessages: calls.messages, communicationConnectionStatus: vi.fn() }));
vi.mock("./notifications", () => ({ reserveUpcomingShopNotifications: calls.notifications }));
import { processShopAutomation } from "./service";
import { workspaceDatabase } from "../workspace/database";
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "shuug-shop-worker-")); vi.stubEnv("DEALDESK_DATA_DIR", directory);
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
  for (const call of Object.values(calls)) call.mockReset();
  calls.workflows.mockResolvedValue({ completed: 0 }); calls.payments.mockResolvedValue([]); calls.invoices.mockReturnValue([]);
  calls.notifications.mockReturnValue(0); calls.messages.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
it("renews the actual SQLite lease during a pass longer than its initial lifetime", async () => {
  let release!: (value: unknown) => void;
  calls.workflows.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const running = processShopAutomation();
  await vi.advanceTimersByTimeAsync(360000);
  const lease = workspaceDatabase(db => JSON.parse((db.prepare("SELECT body FROM documents WHERE id='shop-automation:lease'").get() as { body: string }).body));
  expect(lease.expires).toBeGreaterThan(Date.now());
  expect(await processShopAutomation()).toEqual({ status: "busy" });
  release({ completed: 0 }); expect((await running).status).toBe("completed");
  expect(workspaceDatabase(db => db.prepare("SELECT id FROM documents WHERE id='shop-automation:lease'").get())).toBeUndefined();
});
it("stops further phases after takeover and preserves the new worker's lease", async () => {
  let release!: (value: unknown) => void;
  calls.workflows.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const running = processShopAutomation();
  const rejection = expect(running).rejects.toThrow("lost its reservation");
  workspaceDatabase(db => db.prepare("UPDATE documents SET body=? WHERE id='shop-automation:lease'").run(JSON.stringify({ id: "replacement-worker", expires: Date.now() + 300000 })), true);
  await vi.advanceTimersByTimeAsync(15000); release({ completed: 0 }); await rejection;
  expect(calls.payments).not.toHaveBeenCalled(); expect(calls.invoices).not.toHaveBeenCalled(); expect(calls.messages).not.toHaveBeenCalled();
  const state = workspaceDatabase(db => ({ lease: JSON.parse((db.prepare("SELECT body FROM documents WHERE id='shop-automation:lease'").get() as { body: string }).body),
    lastRun: JSON.parse((db.prepare("SELECT body FROM documents WHERE id='shop-automation:last-run'").get() as { body: string }).body) }));
  expect(state.lease.id).toBe("replacement-worker"); expect(state.lastRun.status).toBe("review");
});
