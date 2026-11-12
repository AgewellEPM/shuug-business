import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceUser } from "../auth/identity";
import { workspaceDatabase } from "../workspace/database";
import { issueServiceInvoiceInTransaction } from "../workspace/store";
import { numberField, paymentTotal, textField, type BusinessRecord } from "../workspace/model";
import { queueMessageInDatabase } from "../communications/store";
import { setting } from "../connections/vault";
import { shopSettingsInDatabase } from "../shop-automation/settings";
import { createShopInvoiceGrantInDatabase } from "./invoice-link";
import { repairInvoiceContext, reviewedRepairTax, transactionRecords } from "./tax-snapshot";

export const shopInvoiceSettingsInput = z.object({ revision: z.number().int().nonnegative(), enabled: z.boolean(), emailOnIssue: z.boolean(),
  dueDays: z.number().int().min(0).max(90), linkDays: z.number().int().min(1).max(90), reviewed: z.literal(true) }).strict();
interface Settings { revision: number; enabled: boolean; emailOnIssue: boolean; dueDays: number; linkDays: number }
const settingsKey = "shop-invoice-settings";
const initial: Settings = { revision: 0, enabled: false, emailOnIssue: false, dueDays: 7, linkDays: 30 };
function settingsInDatabase(db: DatabaseSync): Settings {
  const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='shop-invoice-settings'").get(settingsKey) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : { ...initial };
}
export function shopInvoiceSettings() { return workspaceDatabase(settingsInDatabase); }
export function saveShopInvoiceSettings(raw: unknown, user: WorkspaceUser) {
  if (!user.isOwner) throw new Error("The owner must review automatic invoicing settings.");
  const { reviewed, ...input } = shopInvoiceSettingsInput.parse(raw); void reviewed;
  return workspaceDatabase(db => {
    if (settingsInDatabase(db).revision !== input.revision) throw new Error("Invoice automation settings changed. Reload before saving.");
    const settings = { ...input, revision: input.revision + 1 };
    db.prepare("INSERT INTO documents VALUES(?,'shop-invoice-settings',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(settingsKey, JSON.stringify(settings));
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(settingsKey, user.id, "Reviewed automatic repair invoicing settings", new Date().toISOString(), JSON.stringify(settings));
    return settings;
  }, true);
}
export const issueShopInvoiceInput = z.object({ jobId: z.uuid(), jobRevision: z.number().int().positive().optional(), requestId: z.uuid().optional() }).strict();
export interface ShopInvoiceResult { jobId: string; invoiceId: string; status: "issued" | "existing"; messageId?: string; grantId?: string }
function automaticInvoicingEnabled(db: DatabaseSync) {
  return settingsInDatabase(db).enabled && shopSettingsInDatabase(db).enabled && setting("SHOP_AUTOMATION_ENABLED") === "true";
}
function accountingDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function issueInDatabase(db: DatabaseSync, input: z.infer<typeof issueShopInvoiceInput>, actor: string, automatic = false): ShopInvoiceResult {
  // Recheck every pause switch under the same write lock as invoice/ledger issue.
  if (automatic && !automaticInvoicingEnabled(db)) throw new Error("Automatic invoicing is paused.");
  const key = `shop-invoice-job:${input.jobId}`;
  const saved = db.prepare("SELECT body FROM documents WHERE id=? AND kind='shop-invoice-job'").get(key) as { body: string } | undefined;
  if (saved) {
    const previous = JSON.parse(saved.body) as ShopInvoiceResult;
    const invoice = transactionRecords(db).find(r => r.id === previous.invoiceId && r.kind === "invoice");
    if (!invoice) throw new Error("The previously issued invoice is unavailable. Review its history.");
    return { ...previous, status: "existing" };
  }
  const records = transactionRecords(db), job = records.find(r => r.id === input.jobId && r.kind === "job");
  if (!job || job.status !== "accepted" || !textField(job, "acceptedBy") || (input.jobRevision && job.revision !== input.jobRevision)) throw new Error("Choose the current work order after explicit customer completion acceptance.");
  const invoices = records.filter(r => r.kind === "invoice" && r.fields.job === job.id);
  const issued = invoices.find(r => r.status === "issued" && r.fields.method === "fixed");
  if (issued) {
    const result: ShopInvoiceResult = { jobId: job.id, invoiceId: issued.id, status: "existing" };
    db.prepare("INSERT INTO documents VALUES(?,'shop-invoice-job',?)").run(key, JSON.stringify(result));
    return result;
  }
  if (invoices.some(r => r.status === "draft")) throw new Error("A human invoice draft already exists for this work. Review that draft before automatic invoicing.");
  if (invoices.some(r => r.status === "issued" && r.fields.method !== "deposit")) throw new Error("This work already uses another billing method. Review it before fixed automatic invoicing.");
  const candidate: BusinessRecord = { id: job.id, kind: "invoice", title: "Repair invoice", currency: job.currency, status: "draft", revision: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), fields: { job: job.id, method: "fixed", amount: 0 } };
  const { proposal, agreement } = repairInvoiceContext(candidate, records);
  if (!proposal?.computed?.repairEstimate || proposal.status !== "accepted" || agreement?.status !== "signed" || job.currency !== "USD") throw new Error("Automatic repair invoices require a reviewed USD repair estimate and signed, customer-accepted scope.");
  const deposits = invoices.filter(r => r.status === "issued" && r.fields.method === "deposit");
  if (deposits.some(r => paymentTotal(records, "service_payment", "invoice", r.id, true) !== numberField(r, "amount"))) throw new Error("An issued deposit is not fully received or was refunded. Review its balance before automatic final invoicing.");
  const deposit = deposits.reduce((n, r) => n + numberField(r, "amount"), 0);
  candidate.fields.amount = numberField(proposal, "amount") - deposit;
  candidate.computed = { depositApplied: deposit };
  if (numberField(candidate, "amount") < 0) throw new Error("Deposits exceed the accepted repair quote. Review the allocation.");
  const snapshot = reviewedRepairTax(candidate, records);
  if (!snapshot) throw new Error("A reviewed tax allocation is required before automatic invoicing.");
  const settings = settingsInDatabase(db), today = accountingDate(shopSettingsInDatabase(db).timeZone);
  const dueDate = new Date(`${today}T00:00:00.000Z`); dueDate.setUTCDate(dueDate.getUTCDate() + settings.dueDays);
  const due = dueDate.toISOString().slice(0, 10);
  const quote = proposal.computed.repairEstimate as { customerScope: string };
  const invoice = issueServiceInvoiceInTransaction(db, { jobId: job.id, title: `Invoice - ${job.title}`.slice(0, 200), amount: numberField(candidate, "amount"),
    description: `${quote.customerScope}\n${deposit ? `Deposit applied: USD ${(deposit / 100).toFixed(2)}.\n` : ""}Amount due: USD ${(numberField(candidate, "amount") / 100).toFixed(2)}.`, issuedOn: today, due }, actor);
  const result: ShopInvoiceResult = { jobId: job.id, invoiceId: invoice.id, status: "issued" };
  if (settings.emailOnIssue) {
    const customer = records.find(r => r.id === job.fields.client && r.kind === "client");
    if (!customer) throw new Error("The invoice customer is unavailable.");
    const grant = createShopInvoiceGrantInDatabase(db, invoice, settings.linkDays);
    const message = queueMessageInDatabase(db, { eventKey: `shop-invoice-issued:${invoice.id}`, channel: "email", to: textField(customer, "email"),
      subject: "Your repair invoice is ready", body: `Your repair invoice is ready at this private link:\n\n${grant.url}\n\nKeep this link private. It expires ${grant.expiresAt.slice(0, 10)}.`,
      purpose: "invoice", source: "shop-invoicing", customerId: customer.id, recordId: invoice.id, expectedStatus: "issued" });
    result.messageId = message.id; result.grantId = grant.id;
  }
  db.prepare("INSERT INTO documents VALUES(?,'shop-invoice-job',?)").run(key, JSON.stringify(result));
  return result;
}
/** Clerical execution never approves repairs, changes scope, completes work or accepts it. */
export function issueAcceptedShopInvoice(raw: unknown, actor: string): ShopInvoiceResult {
  const input = issueShopInvoiceInput.parse(raw);
  return workspaceDatabase(db => {
    const request = JSON.stringify({ input, actor });
    if (input.requestId) {
      const prior = db.prepare("SELECT request,result FROM commands WHERE id=?").get(input.requestId) as { request: string; result: string } | undefined;
      if (prior) { if (prior.request !== request) throw new Error("Request ID belongs to different invoicing details."); return JSON.parse(prior.result); }
    }
    const result = issueInDatabase(db, input, actor);
    if (input.requestId) db.prepare("INSERT INTO commands VALUES(?,?,?)").run(input.requestId, request, JSON.stringify(result));
    return result;
  }, true);
}
export function processShopInvoices(limit = 20): Array<ShopInvoiceResult | { jobId: string; status: "review"; detail: string }> {
  if (!workspaceDatabase(automaticInvoicingEnabled)) return [];
  const batch = z.number().int().min(1).max(100).parse(limit);
  const jobs = workspaceDatabase(db => transactionRecords(db).filter(r => r.kind === "job" && r.status === "accepted")
    .filter(r => !db.prepare("SELECT id FROM documents WHERE id=? AND kind='shop-invoice-job'").get(`shop-invoice-job:${r.id}`))
    .map(job => {
      const r = job;
      const old = db.prepare("SELECT body FROM documents WHERE id=? AND kind='shop-invoice-review'").get(`shop-invoice-review:${r.id}`) as { body: string } | undefined;
      const at = old ? Date.parse(JSON.parse(old.body).at) : null;
      return { job, reviewedAt: at !== null && Number.isFinite(at) ? at : old ? 0 : null };
    }).filter(row => row.reviewedAt === null || row.reviewedAt <= Date.now() - 60000)
    .sort((a, b) => Number(a.reviewedAt !== null) - Number(b.reviewedAt !== null) || (a.reviewedAt ?? 0) - (b.reviewedAt ?? 0) || a.job.createdAt.localeCompare(b.job.createdAt) || a.job.id.localeCompare(b.job.id))
    .slice(0, batch).map(row => row.job));
  return jobs.map(job => {
    try {
      return workspaceDatabase(db => {
        return issueInDatabase(db, { jobId: job.id, jobRevision: job.revision }, "Owner-configured repair invoice automation", true);
      }, true);
    } catch (error) {
      const detail = (error instanceof Error ? error.message : "The accepted repair needs invoice review.").slice(0, 1000);
      workspaceDatabase(db => db.prepare("INSERT INTO documents VALUES(?,'shop-invoice-review',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body")
        .run(`shop-invoice-review:${job.id}`, JSON.stringify({ jobId: job.id, detail, at: new Date().toISOString() })), true);
      return { jobId: job.id, status: "review" as const, detail };
    }
  });
}
