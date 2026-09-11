import { optionLabels, selectionKey, restaurantOrderLineInput } from "./modifier-model";
import { restaurantCheckBalance } from "./credits";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { sealSecret, openSecret } from "../connections/vault";
import { restaurantState } from "./store";
import { emptyRestaurantBusiness, restaurantCalendarDay, restaurantDay, type RestaurantBusiness } from "./business-model";
import { executeRestaurantCommand, restaurantMenuAvailability, assertRestaurantRecipeStock } from "./business";
import { restaurantWebsite, pickupRequestInput } from "./website-model";
import { priceRestaurantOrder } from "./pricing";
import { availableSpecials } from "./specials";
import { ticketStatus } from "./kitchen";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const sealed = (v: unknown) => Buffer.from(sealSecret(JSON.stringify(v))).toString("base64url");
function opened(token: string) { must(token.length > 20 && token.length < 60000, "Reload the menu to start a new order."); try { return JSON.parse(openSecret(Buffer.from(token, "base64url").toString())); } catch { throw new Error("This order link is invalid. Open the restaurant menu again."); } }
const proofSchema = z.object({ purpose: z.literal("restaurant-menu"), id: z.uuid(), issued: z.number().int() }).strict();
const quoteSchema = z.object({ purpose: z.literal("restaurant-checkout"), id: z.uuid(), issued: z.number().int(), input: pickupRequestInput, fingerprint: z.string().length(64) }).strict();
const statusSchema = z.object({ purpose: z.literal("restaurant-status"), id: z.uuid(), issued: z.number().int() }).strict();
function fresh(issued: number, minutes = 15) { must(issued <= Date.now() && Date.now() - issued <= minutes * 60000, "This review expired. Reload the menu before placing an order."); }
function slots(b: RestaurantBusiness) {
  const site = restaurantWebsite(b), today = restaurantCalendarDay(b.config), now = Date.now();
  return site.slots.filter(slot => slot.enabled && Date.parse(slot.at) >= now + 15 * 60000 && Date.parse(slot.at) <= now + 2 * 3600000 && restaurantCalendarDay(b.config, new Date(slot.at)) === today).map(slot => ({ id: slot.id, at: slot.at, remaining: slot.capacity - site.orders.filter(r => r.slotId === slot.id && b.orders.some(o => o.id === r.orderId && o.status !== "cancelled")).length })).filter(slot => slot.remaining > 0).sort((a, b) => a.at.localeCompare(b.at));
}
function menu(b: RestaurantBusiness) { return b.menu.filter(m => m.active).map(m => ({ id: m.id, name: m.name, category: m.category, description: m.description, allergens: m.allergens, price: m.price, available: m.modifierGroups?.length ? 20 : Math.min(20, restaurantMenuAvailability(b, m)), modifierGroups: (m.modifierGroups ?? []).map(g => ({ id: g.id, name: g.name, min: g.min, max: g.max, options: g.options.filter(o => o.active).map(o => ({ id: o.id, name: o.name, priceDelta: o.priceDelta, allergens: o.allergens })) })) })).filter(m => m.available > 0); }
export function restaurantStorefront() {
  return restaurantState.change(s => { const b = s.business ??= emptyRestaurantBusiness(), site = restaurantWebsite(b); return { enabled: site.enabled && b.config.taxReviewed, accepting: site.enabled && b.config.taxReviewed && !b.closes.some(c => c.date >= restaurantDay(b.config)), name: b.config.name, timezone: b.config.timezone, instructions: site.instructions, origins: site.origins, specials: availableSpecials(b, "online"), menu: menu(b), slots: slots(b), taxBasisPoints: b.config.taxBasisPoints }; });
}
export function restaurantMenuProof() { return sealed({ purpose: "restaurant-menu", id: randomUUID(), issued: Date.now() }); }
function price(b: RestaurantBusiness, input: z.infer<typeof pickupRequestInput>) {
  const site = restaurantWebsite(b); must(site.enabled && b.config.taxReviewed && !b.closes.some(c => c.date >= restaurantDay(b.config)), "Online pickup ordering is closed.");
  const slot = slots(b).find(v => v.id === input.slotId); must(slot, "That pickup time is no longer available. Choose another time.");
  must(input.lines.reduce((sum, i) => sum + i.qty, 0) <= 20, "Online pickup orders are limited to 20 portions. Contact the restaurant for catering.");
  const priced = priceRestaurantOrder(b, input.lines, "online", input.specialCode), items = priced.lines.map(l => ({ id: l.menuId, revision: l.menuRevision, name: l.name, qty: l.qty, unitPrice: l.unitPrice, options: optionLabels(l), allergens: l.allergens, subtotal: l.subtotal, listSubtotal: l.listSubtotal, discount: l.discount }));
  assertRestaurantRecipeStock(b, priced.lines);
  const special = priced.special ? { id: priced.special.id, revision: priced.special.revision, name: priced.special.name, code: priced.special.code, serviceDate: priced.special.serviceDate } : null;
  return { items, subtotal: priced.subtotal, listSubtotal: priced.listSubtotal, discount: priced.discount, special, tax: priced.tax, total: priced.total, slot: { id: slot.id, at: slot.at }, fingerprint: hash({ items, special, rate: b.config.taxBasisPoints, slot: { id: slot.id, at: slot.at }, websiteRevision: site.revision }) };

}
export function reviewRestaurantPickup(proof: string, raw: unknown) {
  const ticket = proofSchema.parse(opened(proof)); fresh(ticket.issued); const input = pickupRequestInput.parse(raw);
  return restaurantState.change(s => { const b = s.business ??= emptyRestaurantBusiness(), priced = price(b, input); return { ...priced, input, quote: sealed({ purpose: "restaurant-checkout", id: ticket.id, issued: Date.now(), input, fingerprint: priced.fingerprint }) }; });
}
export function submitRestaurantPickup(token: string) {
  const originalQuote = opened(token), quote = quoteSchema.parse(originalQuote), request = hash(originalQuote);
  const id = restaurantState.change(s => {
    const b = s.business ??= emptyRestaurantBusiness(), site = restaurantWebsite(b), prior = site.orders.find(o => o.requestId === quote.id);
    if (prior) { must(prior.request === request, "This review was already used for a different order."); return prior.orderId; }
    fresh(quote.issued); const priced = price(b, quote.input); must(priced.fingerprint === quote.fingerprint, "The menu or pickup terms changed. Review your order again.");
    const created = executeRestaurantCommand({ requestId: randomUUID(), action: "order.create", input: { specialCode: quote.input.specialCode, ref: `WEB-${quote.id}`, channel: "takeaway", guest: quote.input.name, covers: 1, reservationId: null, server: "Website pickup", note: quote.input.note, lines: quote.input.lines } }, "Website customer", "website");
    const order = b.orders.find(o => o.id === created.id)!;
    // Customer reviewed the displayed allergen information. Staff must separately
    // review dietary notes before the kitchen can begin cooking this ticket.
    executeRestaurantCommand({ requestId: randomUUID(), action: "order.fire", input: { id: order.id, revision: order.revision, allergensReviewed: true } }, "Website customer: menu review");
    order.channel = "online"; s.tickets.find(t => t.id === order.ticketId)!.kitchenReviewRequired = true;
    site.orders.push({ orderId: order.id, requestId: quote.id, request, slotId: quote.input.slotId, phone: quote.input.phone, email: quote.input.email });
    b.audit.push({ id: randomUUID(), at: new Date().toISOString(), actor: "Website customer", action: "online.submit", reference: order.id }); return order.id;
  });
  return sealed({ purpose: "restaurant-status", id, issued: Date.now() });
}
function receipt(token: string) { const parsed = statusSchema.parse(opened(token)); fresh(parsed.issued, 30 * 24 * 60); return parsed; }
export function restaurantPickupStatus(token: string) {
  const parsed = receipt(token);
  return restaurantState.change(s => {
    const b = s.business ??= emptyRestaurantBusiness(), site = restaurantWebsite(b), order = b.orders.find(o => o.id === parsed.id && o.channel === "online"), web = site.orders.find(o => o.orderId === parsed.id); must(order && web, "Order unavailable.");
    const ticket = s.tickets.find(t => t.id === order.ticketId), slot = site.slots.find(v => v.id === web.slotId);
    return { ref: order.ref, status: order.status === "cancelled" ? "Cancelled" : order.status === "closed" ? "Completed" : order.status === "served" ? "Collected" : ticket?.kitchenReviewRequired ? "Received — awaiting kitchen review" : ticket && ticketStatus(ticket.items) === "ready" ? "Ready for pickup" : "Preparing", lines: order.lines.map(l => ({ name: l.name, options: optionLabels(l), qty: l.qty, subtotal: l.subtotal })), special: order.special ? { name: order.special.name, code: order.special.code } : null, discount: order.discount ?? 0, listSubtotal: order.listSubtotal ?? order.subtotal, subtotal: order.subtotal, tax: order.tax, total: order.total, paid: order.paid, balance: restaurantCheckBalance(b, order), pickup: slot?.at, canCancel: order.status === "fired" && !order.paid && ticket?.items.every(i => i.status === "new") === true };
  });
}
export function cancelRestaurantPickup(token: string) {
  const parsed = receipt(token);
  restaurantState.change(s => { const b = s.business ??= emptyRestaurantBusiness(), order = b.orders.find(o => o.id === parsed.id && o.channel === "online"), ticket = s.tickets.find(t => t.id === order?.ticketId); must(order, "Order unavailable."); if (order.status === "cancelled") return; must(order.status === "fired" && !order.paid && ticket?.items.every(i => i.status === "new"), "Preparation has started. Contact the restaurant about this order."); executeRestaurantCommand({ requestId: randomUUID(), action: "order.cancel", input: { id: order.id, revision: order.revision, reason: "Customer cancelled before preparation" } }, "Website customer"); });
}

const cartSchema = z.object({ purpose: z.literal("restaurant-cart"), id: z.uuid(), issued: z.number().int(), lines: z.array(restaurantOrderLineInput).max(20) }).strict();
export function restaurantCartLines(proof: string, cart = "") {
  const ticket = proofSchema.parse(opened(proof)); fresh(ticket.issued);
  if (!cart) return [];
  const saved = cartSchema.parse(opened(cart)); fresh(saved.issued); must(saved.id === ticket.id, "This cart belongs to another menu session. Start again."); return saved.lines;
}
export function updateRestaurantCart(proof: string, cart: string, raw: unknown, removeIndex?: number) {
  const ticket = proofSchema.parse(opened(proof)), existing = restaurantCartLines(proof, cart);
  if (removeIndex !== undefined) { must(Number.isInteger(removeIndex) && removeIndex >= 0 && removeIndex < existing.length, "Choose an item in this cart."); existing.splice(removeIndex, 1); }
  const additions = z.array(restaurantOrderLineInput).max(100).parse(raw), merged = new Map<string, z.infer<typeof restaurantOrderLineInput>>();
  for (const line of [...existing, ...additions]) { const key = selectionKey(line), prior = merged.get(key); merged.set(key, { ...line, qty: line.qty + (prior?.qty ?? 0) }); }
  const lines = [...merged.values()]; must(lines.length <= 20 && lines.reduce((n, l) => n + l.qty, 0) <= 20, "Online pickup orders are limited to 20 portions.");
  if (lines.length && removeIndex === undefined) restaurantState.change(s => { const b = s.business ??= emptyRestaurantBusiness(); const priced = priceRestaurantOrder(b, lines, "online"); assertRestaurantRecipeStock(b, priced.lines); });
  return sealed({ purpose: "restaurant-cart", id: ticket.id, issued: ticket.issued, lines });
}
