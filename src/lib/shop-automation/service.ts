import { randomUUID } from "node:crypto";
import { workspaceDatabase } from "../workspace/database";
import { setting } from "../connections/vault";
import { processPendingRuns } from "../getting-started/runner";
import { processWebsitePayments } from "../website-payments/service";
import { processShopInvoices, shopInvoiceSettings } from "../shop-invoicing/service";
import { dispatchQueuedMessages, communicationConnectionStatus } from "../communications/service";
import { communicationSnapshot } from "../communications/store";
import { setupState } from "../getting-started/store";
import { shopSettings } from "./settings";
import { reserveUpcomingShopNotifications } from "./notifications";

export function shopAutomationState() {
  const counts = workspaceDatabase(db => ({
    records: db.prepare("SELECT kind,count(*) AS count FROM records GROUP BY kind").all(),
    lastRun: db.prepare("SELECT body FROM documents WHERE id='shop-automation:last-run'").get() as { body: string } | undefined,
    reviews: (db.prepare("SELECT body FROM documents WHERE kind='shop-notification' AND json_extract(body,'$.state')='review' ORDER BY rowid DESC LIMIT 50").all() as { body: string }[]).map(row => JSON.parse(row.body)),
  }));
  const setup = setupState();
  return { settings: shopSettings(), invoicing: shopInvoiceSettings(), communications: communicationConnectionStatus(),
    dispatchEnabled: setting("COMMUNICATIONS_SEND_ENABLED") === "true", records: counts.records, notificationReviews: counts.reviews,
    lastRun: counts.lastRun ? JSON.parse(counts.lastRun.body) : null,
    websiteForms: setup.forms, intakePending: setup.submissions.filter(row => row.status === "new").length,
    messageCounts: communicationSnapshot().counts,
  };
}

/** One supervised worker covers existing form tasks/payments and the shop's
 * clerical automations. Every dispatch still uses its own native reservation. */
export async function processShopAutomation(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Choose a work limit from 1 to 100.");
  const lease = randomUUID();
  const acquired = workspaceDatabase(db => {
    const row = db.prepare("SELECT body FROM documents WHERE id='shop-automation:lease'").get() as { body: string } | undefined;
    if (row && JSON.parse(row.body).expires > Date.now()) return false;
    db.prepare("INSERT INTO documents VALUES('shop-automation:lease','shop-automation',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body")
      .run(JSON.stringify({ id: lease, expires: Date.now() + 300000 }));
    return true;
  }, true);
  if (!acquired) return { status: "busy" as const };
  const startedAt = new Date().toISOString();
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    try {
      leaseLost = !workspaceDatabase(db => {
        const row = db.prepare("SELECT body FROM documents WHERE id='shop-automation:lease'").get() as { body: string } | undefined;
        if (!row || JSON.parse(row.body).id !== lease) return false;
        db.prepare("UPDATE documents SET body=? WHERE id='shop-automation:lease'")
          .run(JSON.stringify({ id: lease, expires: Date.now() + 300000 }));
        return true;
      }, true);
    } catch { leaseLost = true; }
  }, 15000);
  heartbeat.unref();
  const requireLease = () => { if (leaseLost) throw new Error("The shop worker lost its reservation. Review the current run before continuing."); };
  try {
    const workflows = await processPendingRuns();
    requireLease();
    const payments = await processWebsitePayments(limit);
    requireLease();
    const invoices = processShopInvoices(limit);
    requireLease();
    const scanned = reserveUpcomingShopNotifications();
    requireLease();
    const messages = await dispatchQueuedMessages(limit);
    requireLease();
    const result = { status: "completed" as const, startedAt, finishedAt: new Date().toISOString(), workflows, payments: payments.length,
      invoices: invoices.map(row => ({ jobId: row.jobId, status: row.status, ...("detail" in row ? { detail: row.detail } : {}) })), scanned, messages };
    workspaceDatabase(db => db.prepare("INSERT INTO documents VALUES('shop-automation:last-run','shop-automation',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(result)), true);
    return result;
  } catch (error) {
    workspaceDatabase(db => db.prepare("INSERT INTO documents VALUES('shop-automation:last-run','shop-automation',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body")
      .run(JSON.stringify({ status: "review", startedAt, finishedAt: new Date().toISOString(), detail: "The pass stopped before all phases completed. Review the native invoice and message histories before continuing." })), true);
    throw error;
  } finally {
    clearInterval(heartbeat);
    workspaceDatabase(db => {
      const row = db.prepare("SELECT body FROM documents WHERE id='shop-automation:lease'").get() as { body: string } | undefined;
      if (row && JSON.parse(row.body).id === lease) db.prepare("DELETE FROM documents WHERE id='shop-automation:lease'").run();
    }, true);
  }
}
