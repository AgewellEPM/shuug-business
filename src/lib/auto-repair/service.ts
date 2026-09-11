import { inspectionRows } from "./inspection-state";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { listRecords } from "../sdk/records";
import type { ModuleRecord } from "../sdk/types";
import type { BusinessRecord } from "../workspace/model";
import { createRepairProposalInTransaction } from "../workspace/store";
import { sealSecret, openSecret } from "../connections/vault";
import { estimateInput, estimateCreateInput, repairCommandInput, type RepairQuote, type EstimateInput } from "./model";
import { pricingBooks, pricingHash, must, commandReceipt, recordCommand, changePricingBook } from "./library";
function vehicles(db: DatabaseSync): ModuleRecord[] { const row = db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get() as { body: string } | undefined; return row ? JSON.parse(row.body).vehicles ?? [] : []; }
function clients(db: DatabaseSync): BusinessRecord[] { return (db.prepare("SELECT body FROM records WHERE kind='client'").all() as { body: string }[]).map(r => JSON.parse(r.body)); }
const round = (numerator: bigint, divisor: bigint) => Number((numerator + divisor / BigInt(2)) / divisor);
const money = (n: number, currency: string) => `${currency} ${(n / 100).toFixed(2)}`;
function calculate(db: DatabaseSync, input: EstimateInput): RepairQuote {
  const book = pricingBooks(db).find(b => b.id === input.bookId && b.status === "published"); must(book, "Choose published pricing rules.");
  const d = book.definition, today = new Date().toISOString().slice(0, 10);
  must(d.effectiveFrom <= today && (!d.effectiveTo || d.effectiveTo >= today), "These pricing rules are not effective on today's UTC pricing date.");
  must(input.expires >= today && Date.parse(input.expires) - Date.parse(today) <= 366 * 86400000, "Choose an offer expiry from today through the next year.");
  must(input.labor.length + input.parts.length > 0, "Add labor or parts to this estimate.");
  const vehicle = vehicles(db).find(v => v.id === input.vehicleId && !v.archived); must(vehicle, "Choose an active vehicle.");
  const client = clients(db).find(c => c.id === vehicle.values.customer_id && c.status !== "archived"); must(client, "Link the vehicle to an existing service client before estimating.");
  const labor = input.labor.map(line => {
    const r = d.labor.find(r => r.category === line.category); must(r, "Choose a labor category from these pricing rules.");
    const billedMinutes = Math.ceil(Math.max(line.minutes, r.minimumMinutes) / r.incrementMinutes) * r.incrementMinutes;
    return { ...line, requestedMinutes: line.minutes, billedMinutes, hourlyRate: r.hourlyRate, minimumMinutes: r.minimumMinutes, incrementMinutes: r.incrementMinutes, amount: round(BigInt(r.hourlyRate) * BigInt(billedMinutes), BigInt(60)) };
  });
  const parts = input.parts.map(line => {
    const r = d.parts.find(r => r.category === line.category)?.bands.find(b => line.unitCost >= b.fromCost && (b.untilCost === null || line.unitCost < b.untilCost)); must(r, "No parts cost band matches this category and unit cost.");
    const unitPrice = round(BigInt(line.unitCost) * BigInt(10000 + r.markupBasisPoints), BigInt(10000));
    return { ...line, ...r, unitPrice, amount: unitPrice * line.quantity };
  });
  const laborSubtotal = labor.reduce((n, l) => n + l.amount, 0), partsSubtotal = parts.reduce((n, p) => n + p.amount, 0), subtotal = laborSubtotal + partsSubtotal;
  const laborTax = round(BigInt(laborSubtotal) * BigInt(input.laborTaxBasisPoints), BigInt(10000)), partsTax = round(BigInt(partsSubtotal) * BigInt(input.partsTaxBasisPoints), BigInt(10000)), tax = laborTax + partsTax, total = subtotal + tax;
  must(Number.isSafeInteger(total) && total > 0 && total <= 99_999_999, "The estimate exceeds the supported positive amount. Split the work into separate reviewed proposals.");
  const identity = { id: vehicle.id, vin: String(vehicle.values.vin ?? ""), label: [vehicle.values.year, vehicle.values.make, vehicle.values.model].filter(v => v !== undefined && v !== "").join(" ") };
  const inspection = input.inspectionId ? inspectionRows(db).find(i => i.id === input.inspectionId && i.status === "reviewed" && i.vehicle.id === vehicle.id && i.clientId === client.id) : undefined;
  must(!input.inspectionId || inspection, "Choose a reviewed inspection for this vehicle and client.");
  const customerScope = [input.scope, ...(inspection ? [`Related inspection: ${inspection.title} · reviewed ${inspection.reviewedAt}. Only the work in this proposal is priced.`] : []), `Vehicle: ${identity.label} · VIN ${identity.vin}`, "Labor:", ...labor.map(l => `${l.description} — ${l.billedMinutes} billed minutes at ${money(l.hourlyRate, d.currency)}/hour: ${money(l.amount, d.currency)}`), "Parts:", ...parts.map(p => `${p.quantity} × ${p.description} at ${money(p.unitPrice, d.currency)} each: ${money(p.amount, d.currency)}`), `Labor ${money(laborSubtotal, d.currency)} · Parts ${money(partsSubtotal, d.currency)}`, `Labor tax (${input.laborTaxBasisPoints / 100}%): ${money(laborTax, d.currency)} · Parts tax (${input.partsTaxBasisPoints / 100}%): ${money(partsTax, d.currency)}`, `Total quoted: ${money(total, d.currency)}`].join("\n");
  z.string().max(12000).parse(customerScope);
  return { ...(inspection ? { inspection: { id: inspection.id, revision: inspection.revision, title: inspection.title, reviewedAt: inspection.reviewedAt } } : {}), input, pricedOn: today, currency: d.currency, book: { id: book.id, name: d.name, version: d.version, revision: book.revision }, vehicle: identity, client: { id: client.id, title: client.title }, labor, parts, laborSubtotal, partsSubtotal, laborTax, partsTax, subtotal, tax, total, customerScope, fingerprints: { book: pricingHash(book), vehicle: pricingHash(vehicle), client: pricingHash(client) } };
}
export function reviewRepairEstimate(raw: unknown, actor: { id: string }) {
  const input = estimateInput.parse(raw); listRecords("vehicles"); // Complete any legacy module import before opening this transaction.
  return workspaceDatabase(db => { const quote = calculate(db, input), proof = Buffer.from(sealSecret(JSON.stringify({ purpose: "repair-estimate", id: randomUUID(), actor: actor.id, issued: Date.now(), quote }))).toString("base64url"); return { quote, proof }; }, true);
}
export function createRepairEstimate(raw: unknown, actor: { id: string; name: string }) {
  const input = estimateCreateInput.parse(raw), request = pricingHash({ action: "repair-estimate.create", input, actor: actor.id });
  let saved: { purpose: string; id: string; actor: string; issued: number; quote: RepairQuote };
  try { saved = JSON.parse(openSecret(Buffer.from(input.proof, "base64url").toString())); } catch { throw new Error("This estimate review is invalid. Review the estimate again."); }
  z.uuid().parse(saved.id);
  must(saved.purpose === "repair-estimate" && saved.actor === actor.id, "This estimate review belongs to another user.");
  return workspaceDatabase(db => {
    const prior = commandReceipt(db, input.requestId, request); if (prior) return prior;
    const reviewKey = `repair-estimate-review:${saved.id}`, reviewRequest = pricingHash({ actor: actor.id, quote: saved.quote, issued: saved.issued });
    const used = commandReceipt(db, reviewKey, reviewRequest); if (used) { recordCommand(db, input.requestId, request, used); return used; }
    must(Number.isFinite(saved.issued) && saved.issued <= Date.now() && Date.now() - saved.issued <= 15 * 60000, "This estimate review expired. Calculate and review it again.");
    const current = calculate(db, estimateInput.parse(saved.quote.input)); must(pricingHash(current) === pricingHash(saved.quote), "The pricing, vehicle or client changed during review. Calculate and review the estimate again.");
    const proposal = createRepairProposalInTransaction(db, current, `${actor.name} (${actor.id})`), result = { id: proposal.id }; recordCommand(db, input.requestId, request, result); recordCommand(db, reviewKey, reviewRequest, result); return result;
  }, true);
}
export function repairWorkspace() {
  listRecords("vehicles");
  return workspaceDatabase(db => ({ inspections: inspectionRows(db).filter(i => i.status === "reviewed").map(i => ({ id: i.id, title: i.title, vehicleId: i.vehicle.id, recommendations: i.findings.filter(f => ["attention", "unsafe"].includes(f.outcome)).map(f => f.recommendation) })), books: pricingBooks(db), vehicles: vehicles(db).filter(v => !v.archived).map(v => ({ id: v.id, values: v.values })), clients: clients(db).filter(c => c.status !== "archived").map(c => ({ id: c.id, title: c.title })),
    estimates: (db.prepare("SELECT body FROM records WHERE kind='proposal' ORDER BY updated_at DESC").all() as { body: string }[]).map(r => JSON.parse(r.body) as BusinessRecord).filter(r => r.computed?.repairEstimate).map(r => ({ id: r.id, title: r.title, status: r.status, revision: r.revision, quote: r.computed!.repairEstimate as RepairQuote })), today: new Date().toISOString().slice(0, 10) }));
}
export function executeRepairCommand(raw: unknown, actor: { id: string; name: string }) {
  const command = repairCommandInput.parse(raw);
  if (command.action === "estimate.review") return reviewRepairEstimate(command.input, actor);
  if (command.action === "estimate.create") return createRepairEstimate(command.input, actor);
  return changePricingBook(command.action, command.input, actor);
}
