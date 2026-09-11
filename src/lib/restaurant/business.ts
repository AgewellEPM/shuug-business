import { executePrepAction } from "./prep";
import { reviewServiceHours } from "./service-hours";
import { validateMenuModifiers, optionLabels } from "./modifier-model";
import { executeRestaurantCredit, restaurantCheckBalance } from "./credits";
import { executeStocktakeAction } from "./stocktake";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { restaurantState, addTicket, type RestaurantState } from "./store";
import { emptyRestaurantBusiness, restaurantDay, restaurantCalendarDay, type RestaurantBusiness, type Ingredient, type MenuItem, type RestaurantOrder } from "./business-model";
import { validateEntry, type JournalLine } from "../accounting/ledger";
import { ticketStatus } from "./kitchen";
import { restaurantWebsite } from "./website-model";
import { allowedOrigin } from "../getting-started/model";
import { restaurantActionSchemas } from "./commands";
import { priceRestaurantOrder } from "./pricing";
import { validateSpecial, validateSpecialPublication, reviewSpecialForFire, assertActualSpecialFoodCost } from "./specials";
import type { RestaurantSpecial } from "./special-model";

const actions = ["prep.recipe.save", "prep.start", "prep.complete", "prep.discard", "hours.review", "credit.issue", "credit.cancel", "refund.record", "stocktake.start", "stocktake.record", "stocktake.found", "stocktake.remove-found", "stocktake.submit", "stocktake.post", "stocktake.return", "stocktake.cancel", "stocktake.recount", "special.save", "special.publish", "special.pause", "special.archive", "special.spend", "website.configure", "pickup.save", "order.allergens", "configure", "supplier.save", "ingredient.save", "menu.save", "purchase.save", "purchase.order", "purchase.cancel", "receive", "waste", "order.create", "order.fire", "order.serve", "order.close", "order.cancel", "tender", "bill.pay", "drawer.transfer", "processor.settle", "tips.pay", "close"] as const;
export type RestaurantAction = typeof actions[number];
export const restaurantCommandSchema = z.object({ requestId: z.uuid(), action: z.enum(actions), input: z.record(z.string(), z.unknown()) }).strict();
export const marketingRestaurantActions: RestaurantAction[] = ["special.save", "special.pause", "special.archive"];
export const moneyRestaurantActions: RestaurantAction[] = ["hours.review", "credit.issue", "credit.cancel", "refund.record", "stocktake.post", "stocktake.return", "special.spend", "tender", "bill.pay", "drawer.transfer", "processor.settle", "tips.pay", "close"];
function must(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function business(s: RestaurantState) { return s.business ??= emptyRestaurantBusiness(); }
const debit = (accountNumber: number, debitCents: number): JournalLine => ({ accountNumber, debitCents, creditCents: 0 });
const credit = (accountNumber: number, creditCents: number): JournalLine => ({ accountNumber, debitCents: 0, creditCents });
function journal(b: RestaurantBusiness, date: string, source: string, memo: string, lines: JournalLine[]) {
  const nonzero = lines.filter(l => l.debitCents || l.creditCents); if (!nonzero.length) return;
  must(!b.journals.some(j => j.source === source), "This restaurant event was already posted.");
  const error = validateEntry({ lines: nonzero }); must(!error, error ?? "Invalid accounting entry.");
  b.journals.push({ id: `restaurant:${randomUUID()}`, date, source, memo, lines: nonzero });
}
function openDay(b: RestaurantBusiness, date: string) { must(date <= restaurantDay(b.config), "Cannot post to a future business day."); must(!b.closes.some(c => c.date >= date), "This business day is closed. Use a reviewed adjustment in an open period."); }
function unique<T extends { id: string; name: string }>(rows: T[], input: { id?: string; name: string }) { must(!rows.some(r => r.id !== input.id && r.name.toLowerCase() === input.name.toLowerCase()), "Use a unique name."); }
function revision<T extends { id: string; revision: number }>(rows: T[], input: { id?: string; revision?: number }) { const old = rows.find(r => r.id === input.id); if (input.id) must(old && old.revision === input.revision, "This record changed. Reload before saving."); return old; }
function stockLots(b: RestaurantBusiness, ingredientId: string, date: string, expiryDate = date) { return b.lots.filter(l => l.ingredientId === ingredientId && l.receivedDate <= date && l.remainingQuantity > 0 && (!l.expires || l.expires >= expiryDate)).sort((a, c) => (a.expires ?? "9999-12-31").localeCompare(c.expires ?? "9999-12-31") || a.receivedDate.localeCompare(c.receivedDate) || a.id.localeCompare(c.id)); }
function consume(b: RestaurantBusiness, ingredient: Ingredient, qty: number, date: string, kind: "kitchen" | "waste" | "prep_input", ref: string, reason: string, includeExpired = false) {
  const lots = includeExpired ? b.lots.filter(l => l.ingredientId === ingredient.id && l.receivedDate <= date && l.remainingQuantity > 0).sort((a, c) => (a.expires ?? "9999-12-31").localeCompare(c.expires ?? "9999-12-31") || a.receivedDate.localeCompare(c.receivedDate)) : stockLots(b, ingredient.id, date, kind !== "waste" ? restaurantCalendarDay(b.config) : date);
  must(lots.reduce((sum, l) => sum + l.remainingQuantity, 0) >= qty, `Insufficient ${includeExpired ? "" : "unexpired "}stock for ${ingredient.name}. Receive stock or change the order.`);
  const consumed = []; let remaining = qty;
  for (const lot of lots) {
    if (!remaining) break; const taken = Math.min(remaining, lot.remainingQuantity), cost = taken === lot.remainingQuantity ? lot.remainingCost : Number((BigInt(lot.remainingCost) * BigInt(taken) + BigInt(lot.remainingQuantity) / BigInt(2)) / BigInt(lot.remainingQuantity));
    lot.remainingQuantity -= taken; lot.remainingCost -= cost; remaining -= taken;
    const movement = { id: randomUUID(), ingredientId: ingredient.id, lotId: lot.id, date, kind, quantity: -taken, cost: -cost, reference: ref, reason };
    b.movements.push(movement); consumed.push({ ingredientId: ingredient.id, lotId: lot.id, quantity: taken, cost });
  }
  return consumed;
}
function orderById(b: RestaurantBusiness, input: { id: string; revision?: number }) { const order = b.orders.find(o => o.id === input.id); must(order && (input.revision === undefined || order.revision === input.revision), "This order changed or is unavailable. Reload before continuing."); return order; }

function cancelPreparation(s: RestaurantState, b: RestaurantBusiness, order: RestaurantOrder, reason: string, today: string) {
        if (order.status === "fired") {
          const ticket = s.tickets.find(t => t.id === order.ticketId); must(ticket, "Kitchen ticket unavailable."); const untouched = ticket.items.every(i => i.status === "new");
          if (untouched) for (const item of order.consumed) { const lot = b.lots.find(l => l.id === item.lotId)!; lot.remainingQuantity += item.quantity; lot.remainingCost += item.cost; b.movements.push({ ...item, id: randomUUID(), date: today, kind: "returned", reference: order.id, reason: reason }); }
          else for (const item of order.consumed) b.movements.push({ ...item, id: randomUUID(), date: today, kind: "waste", quantity: 0, cost: item.cost, reference: order.id, reason: `Prepared food discarded: ${reason}` });
          journal(b, today, `restaurant-cancel:${order.id}`, reason, [debit(untouched ? 1300 : 6910, order.foodCost), credit(1320, order.foodCost)]);
          s.archivedTickets = [...(s.archivedTickets ?? []), { ...ticket, note: `Cancelled: ${reason}`.slice(0, 200) }]; s.tickets = s.tickets.filter(t => t.id !== ticket.id);
        }
}

/** All commands, stock changes, kitchen tickets, journal entries and retry
 * receipts commit together. No provider network calls occur in this transaction. */
export function executeRestaurantCommand(raw: unknown, actor: string, source: "staff" | "website" = "staff") {
  const command = restaurantCommandSchema.parse(raw), hash = createHash("sha256").update(JSON.stringify({ ...command, actor, ...(source === "website" ? { source } : {}) })).digest("hex");
  return restaurantState.change(s => {
    const b = business(s), previous = b.commands[command.requestId]; if (previous) { must(previous.request === hash, "This request ID was already used for another action."); return previous.result; }
    const today = restaurantDay(b.config), input = command.input;
    let result: { id: string; kind: string };
    switch (command.action) {
      case "prep.recipe.save": case "prep.start": case "prep.complete": case "prep.discard": {
        result = { id: executePrepAction(b, command.action, input, actor, {
          consume: (ingredient, qty, ref) => consume(b, ingredient, qty, today, "prep_input", ref, "Measured prep input"),
          journal: (date, source, memo, lines) => journal(b, date, source, memo, lines),
        }), kind: command.action === "prep.recipe.save" ? "prep-recipe" : "prep-batch" }; break;
      }
      case "hours.review": { result = { id: reviewServiceHours(b, input, actor), kind: "service-hours" }; break; }
      case "credit.issue": case "credit.cancel": case "refund.record": {
        result = { id: executeRestaurantCredit(b, command.action, input, actor, (date, source, memo, lines) => journal(b, date, source, memo, lines), (order, reason) => cancelPreparation(s, b, order, reason, today)), kind: command.action === "refund.record" ? "restaurant-refund" : "restaurant-credit" }; break;
      }
      case "stocktake.start": case "stocktake.record": case "stocktake.found": case "stocktake.remove-found": case "stocktake.submit": case "stocktake.post": case "stocktake.return": case "stocktake.cancel": case "stocktake.recount": {
        result = { id: executeStocktakeAction(b, command.action, input, actor, (date, source, memo, lines) => journal(b, date, source, memo, lines)), kind: "stocktake" }; break;
      }
      case "special.save": {
        const parsed = restaurantActionSchemas["special.save"].parse(input), specials = b.specials ??= [], old = revision(specials, parsed);
        must(!old || old.status === "draft" && !old.publishedAt, "Published special terms are preserved. Create a new special code for different terms.");
        must(!specials.some(s => s.id !== parsed.id && s.code === parsed.code), "This special code already exists. Use a unique code.");
        const value: RestaurantSpecial = { ...parsed, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1, status: "draft", publishedAt: null, timezone: null, createdAt: old?.createdAt ?? new Date().toISOString(), publishedBy: null };
        validateSpecial(b, value); b.specials = [...specials.filter(s => s.id !== value.id), value]; result = { id: value.id, kind: "special" }; break;
      }
      case "special.publish": case "special.pause": case "special.archive": {
        const parsed = command.action === "special.publish" ? restaurantActionSchemas["special.publish"].parse(input) : restaurantActionSchemas["special.pause"].parse(input), special = revision(b.specials ?? [], parsed); must(special, "Special unavailable.");
        if (command.action === "special.publish") { must(["draft", "paused"].includes(special.status), "Only a draft or paused special can be published."); validateSpecialPublication(b, special); special.status = "active"; special.publishedAt ??= new Date().toISOString(); special.publishedBy = actor; special.timezone ??= b.config.timezone; }
        else if (command.action === "special.pause") { must(special.status === "active", "Only an active special can be paused."); special.status = "paused"; }
        else { must(special.status !== "archived", "This special is already archived."); special.status = "archived"; }
        special.revision++; result = { id: special.id, kind: "special" }; break;
      }
      case "special.spend": {
        const parsed = restaurantActionSchemas["special.spend"].parse(input), special = (b.specials ?? []).find(s => s.id === parsed.id); must(special?.publishedAt, "Choose a published special for recorded advertising spend."); openDay(b, parsed.date);
        must(!b.journals.some(j => j.source === `restaurant-bank:${parsed.reference}`) && !b.tenders.some(t => t.reference === parsed.reference), "This bank reference was already recorded.");
        const spent = (b.specialSpend ?? []).filter(v => v.specialId === special.id).reduce((t, v) => t + v.amount, 0); must(spent + parsed.amount <= special.advertisingBudget || parsed.overrunReason.length >= 3, "Explain the advertising budget overrun before recording this actual expense.");
        const id = randomUUID(); (b.specialSpend ??= []).push({ ...parsed, id, specialId: special.id, actor, at: new Date().toISOString() }); journal(b, parsed.date, `restaurant-bank:${parsed.reference}`, `Special advertising: ${special.code} · ${parsed.provider} · ${parsed.evidence}`, [debit(6200, parsed.amount), credit(1000, parsed.amount)]); result = { id, kind: "special-spend" }; break;
      }
      case "website.configure": {
        const parsed = restaurantActionSchemas["website.configure"].parse(input), website = restaurantWebsite(b); must(parsed.revision === website.revision, "Website settings changed. Reload before saving.");
        must(!parsed.enabled || b.config.taxReviewed, "Review restaurant tax and operating settings before opening online orders.");
        Object.assign(website, parsed, { origins: [...new Set(parsed.origins.map(allowedOrigin))], revision: website.revision + 1 }); result = { id: "website", kind: "website" }; break;
      }
      case "pickup.save": {
        const parsed = restaurantActionSchemas["pickup.save"].parse(input), website = restaurantWebsite(b), old = revision(website.slots, parsed);
        must(Date.parse(parsed.at) > Date.now(), "Publish a future pickup time.");
        const bookings = website.orders.filter(r => r.slotId === parsed.id && b.orders.some(o => o.id === r.orderId && o.status !== "cancelled"));
        must(!old || !bookings.length || old.at === parsed.at, "A pickup time with customer orders cannot be moved."); must(parsed.capacity >= bookings.length, "Capacity is below the number of accepted orders.");
        must(!website.slots.some(slot => slot.id !== parsed.id && Date.parse(slot.at) === Date.parse(parsed.at)), "This pickup time already exists.");
        const slot = { ...parsed, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1 }; website.slots = [...website.slots.filter(v => v.id !== slot.id), slot]; result = { id: slot.id, kind: "pickup" }; break;
      }
      case "order.allergens": {
        const parsed = restaurantActionSchemas["order.allergens"].parse(input), order = orderById(b, parsed), ticket = s.tickets.find(t => t.id === order.ticketId);
        must(order.channel === "online" && order.status === "fired" && ticket?.kitchenReviewRequired, "This order is not awaiting kitchen review."); ticket.kitchenReviewRequired = false; order.revision++; result = { id: order.id, kind: "order" }; break;
      }
      case "configure": {
        const parsed = restaurantActionSchemas["configure"].parse(input);
        try { new Intl.DateTimeFormat("en-US", { timeZone: parsed.timezone }).format(); } catch { throw new Error("Choose a valid IANA timezone, such as America/New_York."); }
        must(!b.orders.some(o => ["draft", "fired", "served"].includes(o.status)), "Close active orders before changing operating settings.");
        if (b.closes.length || b.orders.length || b.journals.length || b.stocktakes?.length || s.reservations.some(r => r.startAt) || b.specials?.some(p => p.publishedAt)) must(parsed.timezone === b.config.timezone && parsed.businessDayStartHour === b.config.businessDayStartHour, "Timezone and business-day boundaries are fixed after restaurant activity is recorded. Set them during initial setup.");
        Object.assign(b.config, parsed); result = { id: "configuration", kind: "configuration" }; break;
      }
      case "supplier.save": {
        const parsed = restaurantActionSchemas["supplier.save"].parse(input), old = revision(b.suppliers, parsed); unique(b.suppliers, parsed);
        const value = { ...parsed, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1 }; b.suppliers = [...b.suppliers.filter(x => x.id !== value.id), value]; result = { id: value.id, kind: "supplier" }; break;
      }
      case "ingredient.save": {
        const parsed = restaurantActionSchemas["ingredient.save"].parse(input), old = revision(b.ingredients, parsed); unique(b.ingredients, parsed);
        must(parsed.targetStock >= parsed.reorderAt, "Target stock must be at least the reorder level."); must(!parsed.supplierId || b.suppliers.some(v => v.id === parsed.supplierId), "Choose a supplier.");
        if (old && old.unit !== parsed.unit) must(!b.lots.some(l => l.ingredientId === old.id) && !b.prepRecipes?.some(r => r.outputIngredientId === old.id || r.inputs.some(l => l.ingredientId === old.id)) && !b.menu.some(m => m.recipe.some(l => l.ingredientId === old.id) || m.modifierGroups?.some(g => g.options.some(o => o.recipe.some(r => r.ingredientId === old.id)))), "Stock units are fixed after receiving or using this ingredient in a recipe.");
        const value = { ...parsed, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1 }; b.ingredients = [...b.ingredients.filter(x => x.id !== value.id), value]; result = { id: value.id, kind: "ingredient" }; break;
      }
      case "menu.save": {
        const parsed = restaurantActionSchemas["menu.save"].parse(input), old = revision(b.menu, parsed); unique(b.menu, parsed);
        must(new Set(parsed.recipe.map(l => l.ingredientId)).size === parsed.recipe.length, "Combine repeated recipe ingredients."); for (const line of parsed.recipe) must(b.ingredients.some(i => i.id === line.ingredientId && i.active), "Choose active ingredients for every recipe quantity.");
        const modifierGroups = parsed.modifierGroups ?? old?.modifierGroups ?? []; validateMenuModifiers(b, modifierGroups);
        const value: MenuItem = { ...parsed, modifierGroups, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1 }; b.menu = [...b.menu.filter(x => x.id !== value.id), value]; result = { id: value.id, kind: "menu" }; break;
      }
      case "purchase.save": {
        const parsed = restaurantActionSchemas["purchase.save"].parse(input), old = revision(b.purchases, parsed);
        must(!old || old.status === "draft", "Only draft purchase orders can be edited."); must(b.suppliers.some(v => v.id === parsed.supplierId && v.active), "Choose an active supplier.");
        must(!b.purchases.some(p => p.id !== old?.id && p.supplierId === parsed.supplierId && p.reference === parsed.reference), "This supplier purchase reference is already used.");
        must(new Set(parsed.lines.map(l => l.ingredientId)).size === parsed.lines.length, "Combine repeated purchase ingredients."); for (const line of parsed.lines) must(b.ingredients.some(i => i.id === line.ingredientId && i.active), "Choose active ingredients.");
        const value = { id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1, supplierId: parsed.supplierId, reference: parsed.reference, status: "draft" as const, lines: parsed.lines.map(l => ({ ...l, received: 0 })), createdDate: today }; b.purchases = [...b.purchases.filter(p => p.id !== value.id), value]; result = { id: value.id, kind: "purchase" }; break;
      }
      case "purchase.order": case "purchase.cancel": {
        const parsed = restaurantActionSchemas["purchase.order"].parse(input), p = revision(b.purchases, parsed); must(p, "Purchase order unavailable.");
        if (command.action === "purchase.order") { must(p.status === "draft", "Only a draft purchase order can be marked ordered."); p.status = "ordered"; }
        else { must(["draft", "ordered"].includes(p.status) && p.lines.every(l => !l.received), "Received purchases cannot be cancelled. Record a reviewed supplier correction."); p.status = "cancelled"; }
        p.revision++; result = { id: p.id, kind: "purchase" }; break;
      }
      case "receive": {
        const parsed = restaurantActionSchemas["receive"].parse(input); openDay(b, parsed.date);
        must(b.suppliers.some(v => v.id === parsed.supplierId && v.active), "Choose an active supplier."); must(!b.bills.some(v => v.supplierId === parsed.supplierId && v.reference.toLowerCase() === parsed.invoiceReference.toLowerCase()), "This supplier invoice was already received. Use its original request for a retry.");
        const purchase = parsed.purchaseId ? b.purchases.find(p => p.id === parsed.purchaseId && p.supplierId === parsed.supplierId && ["ordered", "partial"].includes(p.status)) : null; must(!parsed.purchaseId || purchase, "Choose an ordered purchase from this supplier.");
        const billId = randomUUID(), lotIds: string[] = []; let amount = 0;
        for (const line of parsed.lines) {
          must(b.ingredients.some(i => i.id === line.ingredientId && i.active), "Choose active ingredients.");
          if (purchase) { const item = purchase.lines.find(l => l.ingredientId === line.ingredientId); must(item && item.received + line.quantity <= item.quantity, "Receipt quantity exceeds the outstanding purchase order quantity."); item.received += line.quantity; }
          const lotId = randomUUID(); b.lots.push({ id: lotId, ingredientId: line.ingredientId, supplierId: parsed.supplierId, invoiceReference: parsed.invoiceReference, receivedDate: parsed.date, expires: line.expires, receivedQuantity: line.quantity, receivedCost: line.cost, remainingQuantity: line.quantity, remainingCost: line.cost, purchaseId: parsed.purchaseId });
          b.movements.push({ id: randomUUID(), ingredientId: line.ingredientId, lotId, date: parsed.date, kind: "received", quantity: line.quantity, cost: line.cost, reference: billId, reason: parsed.invoiceReference }); lotIds.push(lotId); amount += line.cost;
        }
        must(amount <= 99_999_999, "Split this receipt into smaller supplier invoices."); if (purchase) { purchase.status = purchase.lines.every(l => l.quantity === l.received) ? "received" : "partial"; purchase.revision++; }
        b.bills.push({ id: billId, supplierId: parsed.supplierId, reference: parsed.invoiceReference, amount, paid: 0, date: parsed.date, lotIds }); journal(b, parsed.date, `restaurant-receipt:${billId}`, `Food received: ${parsed.invoiceReference}`, [debit(1300, amount), credit(2000, amount)]); result = { id: billId, kind: "receipt" }; break;
      }
      case "waste": {
        const parsed = restaurantActionSchemas["waste"].parse(input); openDay(b, parsed.date); const ingredient = b.ingredients.find(i => i.id === parsed.ingredientId); must(ingredient, "Ingredient unavailable.");
        const ref = randomUUID(), consumed = consume(b, ingredient, parsed.quantity, parsed.date, "waste", ref, parsed.reason, parsed.includeExpired), cost = consumed.reduce((t, l) => t + l.cost, 0); journal(b, parsed.date, `restaurant-waste:${ref}`, parsed.reason, [debit(6910, cost), credit(1300, cost)]); result = { id: ref, kind: "waste" }; break;
      }
      case "order.create": {
        const parsed = restaurantActionSchemas["order.create"].parse(input); openDay(b, today); must(b.config.taxReviewed, "Review the restaurant's tax treatment in Settings before taking priced orders.");
        const visit = parsed.reservationId ? s.reservations.find(r => r.id === parsed.reservationId && r.status === "seated") : null; must(parsed.channel !== "dine_in" || visit?.tableId, "Seat the party before opening its table order."); must(!parsed.reservationId || visit, "Choose a seated party.");
        if (visit) must(!b.orders.some(o => o.reservationId === visit.id && !["cancelled", "closed"].includes(o.status)), "This party already has an active order.");
        const channel = source === "website" ? "online" : parsed.channel, priced = priceRestaurantOrder(b, parsed.lines, channel, parsed.specialCode);
        const value: RestaurantOrder = { ...parsed, ...priced, lines: priced.lines.map(l => ({ ...l, id: randomUUID() })), channel, covers: visit?.partySize ?? parsed.covers, id: randomUUID(), tableId: visit?.tableId ?? null, status: "draft", revision: 1, date: today, createdAt: new Date().toISOString(), servedAt: null, saleDate: null, saleHour: null, closedAt: null, ticketId: null, taxBasisPoints: b.config.taxBasisPoints, foodCost: 0, paid: 0, consumed: [] }; b.orders.push(value); result = { id: value.id, kind: "order" }; break;
      }
      case "order.fire": {
        const parsed = restaurantActionSchemas["order.fire"].parse(input), order = orderById(b, parsed); openDay(b, order.date); must(order.status === "draft", "Only a draft order can be sent to the kitchen.");
        reviewSpecialForFire(b, order);
        for (const line of order.lines) {
          const current = b.menu.find(m => m.id === line.menuId); must(current?.active && current.revision === line.menuRevision, "A menu item changed. Cancel this draft and review a new order.");
          line.foodCost = 0;
          for (const r of line.recipe) { const ingredient = b.ingredients.find(i => i.id === r.ingredientId && i.active); must(ingredient, "A recipe ingredient is unavailable."); const consumed = consume(b, ingredient, r.quantity * line.qty, today, "kitchen", order.id, order.ref); line.foodCost += consumed.reduce((t, l) => t + l.cost, 0); order.consumed.push(...consumed); }
        }
        assertActualSpecialFoodCost(order);
        order.foodCost = order.consumed.reduce((t, l) => t + l.cost, 0); const ticket = addTicket({ ref: order.ref, server: order.server, note: order.note, items: order.lines.map(l => ({ name: l.name, station: l.station, qty: l.qty, modifiers: optionLabels(l), allergens: l.allergens })) }); ticket.orderId = order.id; order.ticketId = ticket.id; order.status = "fired"; order.revision++;
        journal(b, today, `restaurant-preparation:${order.id}`, `Kitchen stock: ${order.ref}`, [debit(1320, order.foodCost), credit(1300, order.foodCost)]); result = { id: order.id, kind: "order" }; break;
      }
      case "order.serve": {
        const parsed = restaurantActionSchemas["order.serve"].parse(input), order = orderById(b, parsed); openDay(b, today); must(order.status === "fired", "Only a fired order can be served."); const ticket = s.tickets.find(t => t.id === order.ticketId); must(ticket && ticketStatus(ticket.items) === "ready", "All kitchen items must be ready before serving the order.");
        for (const item of ticket.items) item.status = "served"; ticket.status = "served"; order.status = "served"; order.servedAt = new Date().toISOString(); order.saleDate = today; order.saleHour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: b.config.timezone }).format(new Date())); order.revision++;
        journal(b, today, `restaurant-sale:${order.id}`, `Restaurant sale: ${order.ref}`, [debit(1200, order.total), credit(4000, order.subtotal), credit(2200, order.tax)]);
        journal(b, today, `restaurant-food-cost:${order.id}`, `Food cost: ${order.ref}`, [debit(5000, order.foodCost), credit(1320, order.foodCost)]);
        if (order.paid) journal(b, today, `restaurant-deposit-applied:${order.id}`, `Apply customer deposit: ${order.ref}`, [debit(2100, order.paid), credit(1200, order.paid)]); result = { id: order.id, kind: "order" }; break;
      }
      case "order.close": {
        const parsed = restaurantActionSchemas["order.close"].parse(input), order = orderById(b, parsed); openDay(b, today); must(order.status === "served" && restaurantCheckBalance(b, order).due === 0, "Serve the order and settle its remaining balance with received payments or reviewed credits before closing the check."); order.status = "closed"; order.closedAt = new Date().toISOString(); order.revision++; result = { id: order.id, kind: "order" }; break;
      }
      case "order.cancel": {
        const parsed = restaurantActionSchemas["order.cancel"].parse(input), order = orderById(b, parsed); openDay(b, today); must(["draft", "fired"].includes(order.status) && !order.paid, "Only unpaid, unserved orders can be cancelled. Paid or served checks require a reviewed refund or correction.");
        cancelPreparation(s, b, order, parsed.reason, today);
        order.status = "cancelled"; order.revision++; result = { id: order.id, kind: "order" }; break;
      }
      case "tender": {
        const parsed = restaurantActionSchemas["tender"].parse(input), order = orderById(b, parsed); openDay(b, today);
        must(["fired", "served"].includes(order.status), "Payments are recorded against fired or served orders."); must(parsed.amount <= restaurantCheckBalance(b, order).due, "Payment exceeds the remaining check balance."); must(!b.tenders.some(t => t.reference === parsed.reference) && !b.journals.some(j => j.source === `restaurant-bank:${parsed.reference}`), "This payment reference was already recorded.");
        const tenderId = randomUUID(); b.tenders.push({ id: tenderId, orderId: order.id, method: parsed.method, amount: parsed.amount, tip: parsed.tip, reference: parsed.reference, date: today, at: new Date().toISOString(), actor }); order.paid += parsed.amount; order.revision++;
        journal(b, today, `restaurant-tender:${tenderId}`, `Recorded ${parsed.method}: ${parsed.reference}`, [debit(parsed.method === "cash" ? 1005 : 1010, parsed.amount + parsed.tip), credit(order.status === "served" ? 1200 : 2100, parsed.amount), credit(2400, parsed.tip)]); result = { id: tenderId, kind: "tender" }; break;
      }
      case "bill.pay": {
        const parsed = restaurantActionSchemas["bill.pay"].parse(input), bill = b.bills.find(p => p.id === parsed.id); openDay(b, today); must(bill && parsed.amount <= bill.amount - bill.paid, "Payment exceeds the supplier bill balance."); must(!b.journals.some(j => j.source === `restaurant-bank:${parsed.reference}`) && !b.tenders.some(t => t.reference === parsed.reference), "This bank reference was already recorded.");
        bill.paid += parsed.amount; journal(b, today, `restaurant-bank:${parsed.reference}`, `Supplier payment: ${bill.reference}`, [debit(2000, parsed.amount), credit(1000, parsed.amount)]); result = { id: bill.id, kind: "bill" }; break;
      }
      case "drawer.transfer": case "processor.settle": case "tips.pay": {
        const parsed = restaurantActionSchemas["drawer.transfer"].parse(input); openDay(b, today);
        must(!b.journals.some(j => j.source === `restaurant-bank:${parsed.reference}`) && !b.tenders.some(t => t.reference === parsed.reference), "This bank reference was already recorded.");
        const balance = (account: number) => b.journals.flatMap(j => j.lines).filter(l => l.accountNumber === account).reduce((t, l) => t + l.debitCents - l.creditCents, 0);
        let lines: JournalLine[];
        if (command.action === "drawer.transfer") { must(parsed.direction, "Choose a transfer direction."); if (parsed.direction === "out") must(parsed.amount <= balance(1005), "Transfer exceeds recorded drawer cash."); lines = parsed.direction === "in" ? [debit(1005, parsed.amount), credit(1000, parsed.amount)] : [debit(1000, parsed.amount), credit(1005, parsed.amount)]; }
        else if (command.action === "processor.settle") { must(parsed.fees !== undefined && parsed.fees < parsed.amount, "Enter reviewed fees below the gross settlement."); if (parsed.direction === "out") { must(parsed.amount <= -balance(1010), "Processor debit exceeds the recorded refund clearing balance."); lines = [debit(1010, parsed.amount), debit(6400, parsed.fees), credit(1000, parsed.amount + parsed.fees)]; } else { must(parsed.amount <= balance(1010), "Settlement exceeds the recorded processor balance."); lines = [debit(1000, parsed.amount - parsed.fees), debit(6400, parsed.fees), credit(1010, parsed.amount)]; } }
        else { must(parsed.method, "Choose the payout method."); must(parsed.amount <= -balance(2400), "Payout exceeds recorded tips payable."); if (parsed.method === "cash") must(parsed.amount <= balance(1005), "Payout exceeds recorded drawer cash."); lines = [debit(2400, parsed.amount), credit(parsed.method === "cash" ? 1005 : 1000, parsed.amount)]; }
        journal(b, today, `restaurant-bank:${parsed.reference}`, parsed.evidence, lines); result = { id: parsed.reference, kind: command.action }; break;
      }
      case "close": {
        const parsed = restaurantActionSchemas["close"].parse(input); must(!(b.stocktakes ?? []).some(c => ["counting", "submitted"].includes(c.status) && c.date <= parsed.date), "Finish or cancel open physical inventory counts before closing the business day."); openDay(b, parsed.date);
        must(!b.orders.some(o => o.date <= parsed.date && !["closed", "cancelled"].includes(o.status)), "Close or cancel every open check through this business date first.");
        const orders = b.orders.filter(o => o.status === "closed" && o.saleDate === parsed.date), tenders = b.tenders.filter(t => t.date === parsed.date), credits = (b.credits ?? []).filter(c => c.date === parsed.date), refunds = (b.refunds ?? []).filter(r => r.date === parsed.date);
        const grossSales = orders.reduce((t, o) => t + o.subtotal, 0), creditedSales = credits.reduce((t, c) => t + c.subtotal, 0), creditedTax = credits.reduce((t, c) => t + c.tax, 0), creditedTips = credits.reduce((t, c) => t + c.tips, 0), cashRefunds = refunds.filter(r => r.method === "cash").reduce((t, r) => t + r.amount, 0), cardRefunds = refunds.filter(r => r.method === "external_card").reduce((t, r) => t + r.amount, 0);
        const cash = tenders.filter(t => t.method === "cash").reduce((t, p) => t + p.amount + p.tip, 0), card = tenders.filter(t => t.method === "external_card").reduce((t, p) => t + p.amount + p.tip, 0), opening = b.journals.filter(j => j.date < parsed.date).flatMap(j => j.lines).filter(l => l.accountNumber === 1005).reduce((t, l) => t + l.debitCents - l.creditCents, 0), expected = b.journals.filter(j => j.date <= parsed.date).flatMap(j => j.lines).filter(l => l.accountNumber === 1005).reduce((t, l) => t + l.debitCents - l.creditCents, 0), variance = parsed.countedCash - expected, closeId = randomUUID();
        must(parsed.operated || parsed.openMinutes === undefined, "Closed days cannot have opening time.");
        must(parsed.operated || (!orders.length && !tenders.length), "A day with customer orders or payments must be recorded as open for service.");
        b.closes.push({ id: closeId, operated: parsed.operated, date: parsed.date, openingCash: opening, countedCash: parsed.countedCash, expectedCash: expected, variance, grossSales, credits: creditedSales, creditedTax, creditedTips, cashRefunds, cardRefunds, refundsOwed: b.orders.reduce((n, o) => n + restaurantCheckBalance(b, o).refundDue, 0), cashCollected: cash - cashRefunds, cardCollected: card - cardRefunds, sales: grossSales - creditedSales, tax: orders.reduce((t, o) => t + o.tax, 0) - creditedTax, tips: tenders.reduce((t, p) => t + p.tip, 0) - creditedTips, foodCost: orders.reduce((t, o) => t + o.foodCost, 0), orderCount: orders.length, covers: [...new Map(orders.map(o => [o.reservationId ?? o.id, o.covers])).values()].reduce((t, covers) => t + covers, 0), note: parsed.note, actor, at: new Date().toISOString(), revision: 1 });
        if (parsed.openMinutes !== undefined) reviewServiceHours(b, { closeId, revision: 0, openMinutes: parsed.openMinutes, evidence: parsed.note.slice(0, 1000), reviewed: true }, actor);
        if (variance) journal(b, parsed.date, `restaurant-cash-variance:${closeId}`, parsed.note, variance < 0 ? [debit(6920, -variance), credit(1005, -variance)] : [debit(1005, variance), credit(6920, variance)]); result = { id: closeId, kind: "close" }; break;
      }
    }
    b.audit.push({ id: randomUUID(), at: new Date().toISOString(), actor, action: command.action, reference: result.id }); b.commands[command.requestId] = { request: hash, result }; return result;
  });
}
export function restaurantBusinessSnapshot() { return restaurantState.change(s => business(s)); }
export function restaurantJournalEntries() { return restaurantBusinessSnapshot().journals; }
export function restaurantMenuAvailability(b: RestaurantBusiness, menu: MenuItem) {
  const day = restaurantDay(b.config), quantities = menu.recipe.map(line => Math.floor(stockLots(b, line.ingredientId, day, restaurantCalendarDay(b.config)).reduce((sum, l) => sum + l.remainingQuantity, 0) / line.quantity));
  return menu.active && menu.recipe.every(l => b.ingredients.some(i => i.id === l.ingredientId && i.active)) ? Math.min(...quantities) : 0;
}

/** Check combined demand before offering an online review. Sending to the
 * kitchen repeats this check inside atomic lot consumption. */
export function assertRestaurantRecipeStock(b: RestaurantBusiness, lines: { qty: number; recipe: MenuItem["recipe"] }[]) {
  const needs = new Map<string, number>();
  for (const line of lines) for (const r of line.recipe) needs.set(r.ingredientId, (needs.get(r.ingredientId) ?? 0) + r.quantity * line.qty);
  for (const [id, quantity] of needs) {
    const ingredient = b.ingredients.find(i => i.id === id && i.active);
    must(ingredient && stockLots(b, id, restaurantDay(b.config), restaurantCalendarDay(b.config)).reduce((n, l) => n + l.remainingQuantity, 0) >= quantity, `Insufficient unexpired stock for ${ingredient?.name ?? "a selected ingredient"}. Choose another item or quantity.`);
  }
}
