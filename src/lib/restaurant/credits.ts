import { orderLineId, orderLineLabel } from "./modifier-model";
import { randomUUID } from "node:crypto";
import type { RestaurantBusiness, RestaurantOrder } from "./business-model";
import { restaurantDay } from "./business-model";
import { creditTaxDelta, restaurantCreditInput, restaurantCancelCreditInput, restaurantRefundInput, type RestaurantCredit } from "./credit-model";
import type { JournalLine } from "../accounting/ledger";
function must(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const debit = (accountNumber: number, debitCents: number): JournalLine => ({ accountNumber, debitCents, creditCents: 0 });
const credit = (accountNumber: number, creditCents: number): JournalLine => ({ accountNumber, debitCents: 0, creditCents });
const balance = (b: RestaurantBusiness, account: number) => b.journals.flatMap(j => j.lines).filter(l => l.accountNumber === account).reduce((n, l) => n + l.debitCents - l.creditCents, 0);
export function restaurantCheckBalance(b: RestaurantBusiness, order: RestaurantOrder) {
  const credits = (b.credits ?? []).filter(c => c.orderId === order.id), refunds = (b.refunds ?? []).filter(r => r.orderId === order.id);
  const foodCredit = credits.reduce((t, c) => t + c.subtotal, 0), taxCredit = credits.reduce((t, c) => t + c.tax, 0), tipCredit = credits.reduce((t, c) => t + c.tips, 0), returned = refunds.reduce((t, r) => t + r.amount, 0);
  return { foodCredit, taxCredit, tipCredit, credited: credits.reduce((t, c) => t + c.total, 0), refunded: returned, refundDue: credits.reduce((t, c) => t + c.refundLiability, 0) - returned, due: order.status === "cancelled" ? 0 : Math.max(0, order.total - order.paid - foodCredit - taxCredit) };
}
export function creditedRestaurantLine(b: RestaurantBusiness, order: RestaurantOrder, line: RestaurantOrder["lines"][number]) {
  return (b.credits ?? []).filter(c => c.orderId === order.id).flatMap(c => c.lines).filter(c => c.lineId ? c.lineId === orderLineId(line) : c.menuId === line.menuId).reduce((n, c) => n + c.amount, 0);
}
export function restaurantCreditView(b: RestaurantBusiness) {
  return b.orders.filter(o => ["fired", "served", "closed", "cancelled"].includes(o.status)).map(o => ({
    id: o.id, ref: o.ref, status: o.status, revision: o.revision, date: o.date, saleDate: o.saleDate, subtotal: o.subtotal, tax: o.tax, total: o.total, paid: o.paid, balance: restaurantCheckBalance(b, o),
    lines: o.lines.map(l => ({ lineId: orderLineId(l), menuId: l.menuId, name: orderLineLabel(l), quantity: l.qty, subtotal: l.subtotal, credited: creditedRestaurantLine(b, o, l) })),
    tenders: b.tenders.filter(t => t.orderId === o.id).map(t => ({ id: t.id, method: t.method, reference: t.reference, amount: t.amount, tip: t.tip, available: t.amount + t.tip - (b.refunds ?? []).filter(r => r.tenderId === t.id).reduce((n, r) => n + r.amount, 0) })),
    credits: (b.credits ?? []).filter(c => c.orderId === o.id), refunds: (b.refunds ?? []).filter(r => r.orderId === o.id),
  }));
}
export function executeRestaurantCredit(b: RestaurantBusiness, action: "credit.issue" | "credit.cancel" | "refund.record", raw: unknown, actor: string, journal: (date: string, source: string, memo: string, lines: JournalLine[]) => void, cancelPreparation: (order: RestaurantOrder, reason: string) => void) {
  const input = action === "credit.issue" ? restaurantCreditInput.parse(raw) : action === "credit.cancel" ? restaurantCancelCreditInput.parse(raw) : restaurantRefundInput.parse(raw);
  const order = b.orders.find(o => o.id === input.id); must(order && order.revision === input.revision, "This check changed. Reload before reviewing the adjustment.");
  const date = restaurantDay(b.config), at = new Date().toISOString(); must(!b.closes.some(c => c.date >= date), "The current business day is closed. Record the adjustment in a new open business day.");
  const summary = restaurantCheckBalance(b, order);
  if (action === "refund.record") {
    const p = restaurantRefundInput.parse(raw), tender = b.tenders.find(t => t.id === p.tenderId && t.orderId === order.id); must(tender, "Choose a payment originally received for this check.");
    must(p.amount <= summary.refundDue, "Refund exceeds the reviewed credit owed to this guest. Issue the credit before recording a refund.");
    must(p.amount <= tender.amount + tender.tip - (b.refunds ?? []).filter(r => r.tenderId === tender.id).reduce((n, r) => n + r.amount, 0), "Refund exceeds the amount remaining on the original payment.");
    must(!b.tenders.some(t => t.reference === p.reference) && !b.journals.some(j => j.source === `restaurant-bank:${p.reference}`), "This receipt or bank reference was already recorded.");
    if (tender.method === "cash") must(p.amount <= balance(b, 1005), "Record the actual drawer funding before recording this cash refund.");
    const id = randomUUID(); (b.refunds ??= []).push({ id, orderId: order.id, tenderId: tender.id, method: tender.method, amount: p.amount, reference: p.reference, evidence: p.evidence, date, at, actor });
    journal(date, `restaurant-bank:${p.reference}`, `Guest refund: ${order.ref} · ${p.evidence}`, [debit(2150, p.amount), credit(tender.method === "cash" ? 1005 : 1010, p.amount)]);
    order.revision++; return id;
  }
  const p = action === "credit.issue" ? restaurantCreditInput.parse(raw) : restaurantCancelCreditInput.parse(raw);
  must(!(b.credits ?? []).some(c => c.reference.toLowerCase() === p.reference.toLowerCase()), "Use a unique restaurant credit reference.");
  const tipsReceived = b.tenders.filter(t => t.orderId === order.id).reduce((n, t) => n + t.tip, 0);
  must(p.tips <= tipsReceived - summary.tipCredit, "Tip credit exceeds the tips received and not yet credited on this check.");
  must(p.tips <= Math.max(0, -balance(b, 2400)), "These tips are no longer held in Tips Payable. Review the prior staff payout and payroll correction before crediting them.");
  let lines: RestaurantCredit["lines"] = [], subtotal = 0, tax = 0, deposit = 0, receivableReduction = 0;
  if (action === "credit.issue") {
    const issue = restaurantCreditInput.parse(raw); must(["served", "closed", "cancelled"].includes(order.status), "Serve the check before crediting a sale, or use cancellation for an unserved paid check.");
    must(order.status !== "cancelled" || issue.lines.length === 0, "A cancelled check has no sale to credit. Only remaining held tips can be credited.");
    lines = issue.lines.map(l => {
      const candidates = order.lines.filter(o => o.menuId === l.menuId && (!l.lineId || orderLineId(o) === l.lineId));
      must(candidates.length === 1, "Choose the specific line from the original check for this credit. Repeated menu items require a line ID.");
      const original = candidates[0], previous = creditedRestaurantLine(b, order, original);
      must(l.amount <= original.subtotal - previous, `Credit exceeds the remaining net sale for ${orderLineLabel(original)}.`);
      return { ...l, lineId: orderLineId(original), name: orderLineLabel(original) };
    });
    must(new Set(lines.map(l => l.lineId)).size === lines.length, "Choose each check line once.");
    subtotal = lines.reduce((n, l) => n + l.amount, 0); tax = creditTaxDelta(order.subtotal, order.tax, summary.foodCredit, summary.taxCredit, subtotal); receivableReduction = Math.min(summary.due, subtotal + tax);
    must(subtotal + p.tips > 0, "Enter an item credit or a held-tip credit.");
  } else {
    must(order.status === "fired" && order.paid > 0, "Use paid cancellation only for an unserved check with a received payment.");
    deposit = order.paid; cancelPreparation(order, p.reason); order.status = "cancelled";
  }
  const total = subtotal + tax + deposit + p.tips, id = randomUUID(), refundLiability = total - receivableReduction;
  (b.credits ??= []).push({ id, orderId: order.id, reference: p.reference, kind: action === "credit.cancel" ? "cancellation" : "sale", date, at, actor, reason: p.reason, lines, subtotal, tax, tips: p.tips, deposit, total, receivableReduction, refundLiability });
  journal(date, `restaurant-credit:${id}`, `Guest credit: ${order.ref} · ${p.reference} · ${p.reason}`, [debit(4050, subtotal), debit(2200, tax), debit(2400, p.tips), debit(2100, deposit), credit(1200, receivableReduction), credit(2150, refundLiability)]);
  order.revision++; return id;
}
