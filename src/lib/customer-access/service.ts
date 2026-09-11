import { sharedInspectionsForClient } from "../auto-repair/inspection-state";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDealStore } from "../data/store";
import { listBusinessRecords, customerAppointmentOffers } from "../workspace/store";
import { paymentTotal } from "../workspace/model";
import { persistentState } from "../workspace/state";
import { getStripeConfig } from "../payments/config";
import { paymentRows } from "../website-payments/state";
import { websitePaymentReady, websitePaymentSettings } from "../website-payments/settings";
import { workspaceDatabase } from "../workspace/database";
import { createCustomerAccount, customerInput, customerSession, customerFromDatabase, type CustomerAccount } from "./accounts";
import { priceOrder, validateOrder } from "../pricing";
import type { CreateOrderInput } from "../data/store";
import { listShipments } from "../ops/store";

export const customerSettingsSchema = z.object({ enabled: z.boolean(), pricing: z.boolean(), ordering: z.boolean(), orderStatus: z.boolean(), servicePortal: z.boolean(), booking: z.boolean().default(false) }).strict();
const settings = persistentState("customer-portal-settings", () => ({ enabled: false, pricing: true, ordering: false, orderStatus: true, servicePortal: true, booking: false }));
export const customerSettings = () => customerSettingsSchema.parse(settings.read());
export function saveCustomerSettings(raw: unknown) { const input = customerSettingsSchema.parse(raw); return settings.change(s => Object.assign(s, input)); }
export async function createLinkedCustomer(raw: unknown) {
  const input = customerInput.parse(raw), store = await getDealStore();
  if (input.customerId && !(await store.getDeal(input.customerId))) throw new Error("Choose an existing product customer.");
  if (input.clientId && !listBusinessRecords(["client"]).some(r => r.id === input.clientId)) throw new Error("Choose an existing service client.");
  return createCustomerAccount(input);
}
export function requireCustomer(token: string | undefined) {
  if (!customerSettings().enabled) throw new Error("The customer portal is not available. Contact the organization.");
  const account = customerSession(token); if (!account) throw new Error("Sign in to your customer account."); return account;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function validDeal(deal: Awaited<ReturnType<Awaited<ReturnType<typeof getDealStore>>["getDeal"]>>) {
  if (!deal) throw new Error("Your product account is unavailable. Contact the organization.");
  const today = new Date().toISOString().slice(0, 10);
  if (!deal.agreement.approvedBy.trim() || today < deal.agreement.effectiveDate || today > deal.agreement.expirationDate) throw new Error("Your price agreement needs renewal or approval. Contact the organization.");
  return deal;
}
export async function customerView(token: string) {
  const user = requireCustomer(token), config = customerSettings(), store = await getDealStore();
  const deal = user.customerId ? await store.getDeal(user.customerId) : null;
  let priceMessage = ""; if (deal) try { validDeal(deal); } catch (e) { priceMessage = (e as Error).message; }
  // Explicit projections: never send margin policies, costs, staff notes, other
  // account IDs, agreement history or participant records to the customer.
  const catalog = deal && !priceMessage && (config.pricing || config.ordering) ? deal.agreement.lines.flatMap(line => {
    const sku = deal.skus.find(s => s.id === line.skuId); return sku ? [{ id: sku.id, name: sku.name, unitsPerCase: sku.unitsPerCase, priceCents: line.unitPriceCents, minCases: line.minCasesPerSku, tiers: line.tiers.map(t => ({ minQty: t.minQty, maxQty: t.maxQty, unitPriceCents: t.unitPriceCents })) }] : [];
  }) : [];
  const shipments = config.orderStatus && user.customerId ? listShipments() : [];
  const orders = config.orderStatus && user.customerId ? (await store.listOrders(user.customerId)).map(o => {
    const own = shipments.filter(s => s.kind === "order" && s.refId === o.id);
    const shipped = o.lines.length > 0 && o.lines.every(l => own.flatMap(s => s.lines).filter(s => s.skuId === l.skuId).reduce((sum, s) => sum + s.cases, 0) + 0.000001 >= l.cases);
    return { id: o.id, status: o.status, fulfillment: o.status === "cancelled" ? "cancelled" : shipped ? "shipped" : own.length ? "partially shipped" : o.status === "fulfilled" ? "fulfilled" : "awaiting fulfillment", shipments: own.map(s => ({ carrier: s.carrier, trackingNumber: s.trackingNumber, createdAt: s.createdAt })), createdAt: o.createdAt, poNumber: o.poNumber, subtotalCents: o.subtotalCents, freightCents: o.freightCents, totalCents: o.totalCents, lines: o.lines.map(l => ({ skuId: l.skuId, name: deal?.skus.find(s => s.id === l.skuId)?.name ?? l.skuId, quantity: l.quantity, unit: l.unit, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents })) };
  }) : [];
  const all = (config.servicePortal || config.booking) && user.clientId ? listBusinessRecords() : [];
  const client = all.find(r => r.kind === "client" && r.id === user.clientId);
  const jobs = client ? all.filter(r => r.kind === "job" && r.fields.client === client.id && !["draft", "cancelled"].includes(r.status)) : [];
  const proposals = client ? all.filter(r => r.kind === "proposal" && r.fields.client === client.id && r.status !== "draft").map(r => ({ id: r.id, revision: r.revision, title: r.title, status: r.status, currency: r.currency, scope: String(r.fields.scope ?? ""), exclusions: String(r.fields.exclusions ?? ""), amount: Number(r.fields.amount ?? 0), expires: String(r.fields.expires ?? "") })) : [];
  const appointments = all.filter(r => r.kind === "booking" && jobs.some(j => j.id === r.fields.job) && ["scheduled", "completed", "cancelled"].includes(r.status)).map(r => ({ id: r.id, title: r.title, start: String(r.fields.start ?? ""), end: String(r.fields.end ?? ""), status: r.status }));
  const invoices = all.filter(r => r.kind === "invoice" && all.some(j => j.kind === "job" && j.id === r.fields.job && j.fields.client === user.clientId) && r.status === "issued").map(r => ({ id: r.id, title: r.title, description: String(r.fields.description ?? ""), amount: Number(r.fields.amount ?? 0), paid: paymentTotal(all, "service_payment", "invoice", r.id), currency: r.currency, due: String(r.fields.due ?? "") }));
  const paymentConfig = websitePaymentSettings();
  const invoicePayments = paymentConfig.invoiceEnabled && websitePaymentReady();
  const checkouts = workspaceDatabase(db => paymentRows(db).filter(p => p.accountId === user.id && p.kind === "invoice").map(p => ({ id: p.id, invoiceId: p.invoiceId, status: p.status })));
  requireCustomer(token); // Recheck revocation after asynchronous repository reads.
  return { inspections: config.servicePortal && client ? workspaceDatabase(db => sharedInspectionsForClient(db, client.id)) : [], user: { name: user.name, email: user.email }, config, invoicePayments, paymentTestMode: invoicePayments && !getStripeConfig()?.live, checkouts, company: deal?.customer.company ?? client?.title ?? user.name, catalog, priceMessage, orders, proposals: config.servicePortal ? proposals : [], jobs: config.servicePortal ? jobs.map(r => ({ id: r.id, revision: r.revision, title: r.title, status: r.status, due: String(r.fields.due ?? "") })) : [], appointments, offers: config.booking ? customerAppointmentOffers(token) : [], invoices: config.servicePortal ? invoices : [] };
}
export const websiteOrderInput = z.object({ lines: z.array(z.object({ skuId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(100000), unit: z.enum(["case", "bottle"]) }).strict()).min(1).max(100), poNumber: z.string().trim().max(60).nullable(), note: z.string().trim().max(280) }).strict();
type Quote = { id: string; accountId: string; customerId: string; agreementHash: string; expires: number; input: CreateOrderInput; public: { id: string; expires: number; lines: { name: string; quantity: number; unit: string; unitPriceCents: number; totalCents: number }[]; subtotalCents: number; freightCents: number; freightNote: string; totalCents: number; paymentTerms: string; poNumber: string | null }; orderId: string | null };
function initQuotes(db: import("node:sqlite").DatabaseSync) { db.exec("CREATE TABLE IF NOT EXISTS customer_quotes (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, body TEXT NOT NULL)"); }
function quoteAccount(token: string) { const account = requireCustomer(token); if (!customerSettings().ordering || !account.customerId) throw new Error("Online ordering is not enabled for this account."); return account as CustomerAccount & { customerId: string }; }
export async function previewCustomerOrder(token: string, raw: unknown) {
  const account = quoteAccount(token), input = websiteOrderInput.parse(raw);
  if (new Set(input.lines.map(l => l.skuId)).size !== input.lines.length) throw new Error("Use one order line per product.");
  const store = await getDealStore(), deal = validDeal(await store.getDeal(account.customerId));
  const pricing = priceOrder(input.lines, deal.agreement, deal.skus), checked = validateOrder({ pricing, agreement: deal.agreement, requiresPO: deal.customer.requiresPO, poNumber: input.poNumber });
  if (!checked.ok) throw new Error(checked.violations.map(v => v.message).join(" "));
  if (!Number.isSafeInteger(pricing.totalCents) || pricing.totalCents <= 0 || pricing.totalCents > 100000000) throw new Error("This order amount needs staff review.");
  const id = randomUUID(), expires = Date.now() + 15 * 60000;
  const quote: Quote = { id, accountId: account.id, customerId: account.customerId, agreementHash: hash(deal.agreement), expires, orderId: null,
    input: { customerId: account.customerId, poNumber: input.poNumber, note: input.note, lines: pricing.lines, subtotalCents: pricing.subtotalCents, freightCents: pricing.freightCents, totalCents: pricing.totalCents, requestId: id },
    public: { id, expires, lines: pricing.lines.map(l => ({ name: deal.skus.find(s => s.id === l.skuId)!.name, quantity: l.quantity, unit: l.unit, unitPriceCents: l.unitPriceCents, totalCents: l.lineTotalCents })), subtotalCents: pricing.subtotalCents, freightCents: pricing.freightCents, freightNote: pricing.freightNote, totalCents: pricing.totalCents, paymentTerms: deal.agreement.paymentTerms, poNumber: input.poNumber } };
  workspaceDatabase(db => {
    initQuotes(db); if (customerFromDatabase(db, token)?.id !== account.id) throw new Error("Sign in again.");
    db.prepare("DELETE FROM customer_quotes WHERE json_extract(body,'$.expires')<? AND json_extract(body,'$.orderId') IS NULL").run(Date.now());
    const count = db.prepare("SELECT count(*) AS n FROM customer_quotes WHERE accountId=? AND json_extract(body,'$.orderId') IS NULL").get(account.id) as { n: number }; if (count.n >= 30) throw new Error("Too many open order reviews. Try again in 15 minutes.");
    db.prepare("INSERT INTO customer_quotes VALUES(?,?,?)").run(id, account.id, JSON.stringify(quote));
  }, true);
  return quote.public;
}
export async function submitCustomerOrder(token: string, quoteId: string) {
  const account = quoteAccount(token); z.uuid().parse(quoteId);
  const quote = workspaceDatabase(db => { initQuotes(db); const row = db.prepare("SELECT body FROM customer_quotes WHERE id=? AND accountId=?").get(quoteId, account.id) as { body: string } | undefined; return row ? JSON.parse(row.body) as Quote : undefined; });
  if (!quote || quote.customerId !== account.customerId) throw new Error("Order review unavailable. Review your order again.");
  const store = await getDealStore();
  // Stable repository IDs recover a write that succeeded before the receipt was saved.
  const prior = await store.getOrder(`ORD-${quote.id}`);
  if (prior?.customerId === account.customerId) return { id: prior.id, duplicate: true };
  if (quote.expires < Date.now()) throw new Error("Your order review expired. Review current pricing again.");
  const deal = validDeal(await store.getDeal(account.customerId));
  if (hash(deal.agreement) !== quote.agreementHash) throw new Error("Your agreement changed. Review the current prices before ordering.");
  quoteAccount(token);
  const order = await store.createOrder(quote.input);
  workspaceDatabase(db => { initQuotes(db); quote.orderId = order.id; db.prepare("UPDATE customer_quotes SET body=? WHERE id=?").run(JSON.stringify(quote), quote.id); }, true);
  return { id: order.id, duplicate: false };
}
