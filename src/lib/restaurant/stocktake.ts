import { createHash, randomUUID } from "node:crypto";
import type { RestaurantBusiness } from "./business-model";
import { restaurantDay, restaurantCalendarDay } from "./business-model";
import type { RestaurantStocktake, StocktakeLine } from "./stocktake-model";
import { stocktakeStartInput, stocktakeRecordInput, stocktakeFoundInput, stocktakeRemoveFoundInput, stocktakeSubmitInput, stocktakePostInput, stocktakeReturnInput, stocktakeRestartInput } from "./stocktake-model";
import type { JournalLine } from "../accounting/ledger";
function must(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const at = () => new Date().toISOString();
export function stocktakeFingerprint(b: RestaurantBusiness, ingredients: string[]) {
  const selected = new Set(ingredients), lots = b.lots.filter(l => selected.has(l.ingredientId)).sort((a, c) => a.id.localeCompare(c.id));
  const units = b.ingredients.filter(i => selected.has(i.id)).map(i => ({ id: i.id, unit: i.unit })).sort((a, c) => a.id.localeCompare(c.id));
  // Movement identities detect intervening stock use/return even if quantity and value come back to their original amounts.
  return createHash("sha256").update(JSON.stringify({ timezone: b.config.timezone, cutoff: b.config.businessDayStartHour, units, lots, movements: b.movements.filter(m => selected.has(m.ingredientId)).map(m => m.id) })).digest("hex");
}
export function stocktakeIsStale(b: RestaurantBusiness, count: RestaurantStocktake) { return b.closes.some(c => c.date >= count.date) || count.date !== restaurantDay(b.config) || stocktakeFingerprint(b, count.scope.map(i => i.id)) !== count.fingerprint; }
function fresh(b: RestaurantBusiness, count: RestaurantStocktake) { must(!stocktakeIsStale(b, count), "Inventory or the business date changed during this count. Start a recount; the original observations remain in history."); }
function countById(b: RestaurantBusiness, id: string, revision: number) { const count = b.stocktakes?.find(c => c.id === id); must(count && count.revision === revision, "This stocktake changed. Reload before continuing."); return count; }
function start(b: RestaurantBusiness, raw: unknown, actor: string, recountOf: string | null = null) {
  const input = stocktakeStartInput.parse(raw), counts = b.stocktakes ??= [];
  must(b.config.taxReviewed, "Review the restaurant operating settings before starting a stocktake.");
  must(!b.closes.some(c => c.date >= restaurantDay(b.config)), "The current business day is closed. Start counting in an open business day.");
  must(new Set(input.ingredientIds).size === input.ingredientIds.length, "Choose each ingredient once.");
  must(!counts.some(c => c.reference.toLowerCase() === input.reference.toLowerCase()), "Use a unique stocktake reference.");
  must(!counts.some(c => ["counting", "submitted"].includes(c.status) && c.scope.some(i => input.ingredientIds.includes(i.id))), "An open stocktake already includes these ingredients. Finish, cancel or recount it first.");
  const scope = input.ingredientIds.map(id => { const ingredient = b.ingredients.find(i => i.id === id); must(ingredient, "Choose existing restaurant ingredients."); return { id, name: ingredient.name, unit: ingredient.unit }; });
  const lots = b.lots.filter(l => input.ingredientIds.includes(l.ingredientId) && l.remainingQuantity > 0); must(lots.length <= 500, "Count fewer ingredients at once; a count sheet supports up to 500 stored lots.");
  const lines: StocktakeLine[] = lots.map(l => { const ingredient = scope.find(i => i.id === l.ingredientId)!; return { id: randomUUID(), ingredientId: ingredient.id, ingredientName: ingredient.name, unit: ingredient.unit, lotId: l.id, lotReference: l.invoiceReference, supplierId: l.supplierId, expires: l.expires, expectedQuantity: l.remainingQuantity, expectedCost: l.remainingCost, basisQuantity: l.receivedQuantity, basisCost: l.receivedCost, countedQuantity: null, reason: "", counter: null, countedAt: null }; });
  const count: RestaurantStocktake = { id: randomUUID(), revision: 1, reference: input.reference, date: restaurantDay(b.config), timezone: b.config.timezone, status: "counting", scope, fingerprint: stocktakeFingerprint(b, input.ingredientIds), lines, found: [], startedAt: at(), startedBy: actor, note: input.note, submittedAt: null, submittedBy: null, postedAt: null, postedBy: null, postingEvidence: "", recountOf, history: [{ at: at(), actor, action: "started", note: input.note }] };
  counts.push(count); return count;
}
function proportional(quantity: number, cost: number, total: number) { return Number((BigInt(quantity) * BigInt(cost) + BigInt(total) / BigInt(2)) / BigInt(total)); }
export function stocktakeLineValue(line: StocktakeLine) {
  if (line.countedQuantity === null) return null;
  const difference = line.countedQuantity - line.expectedQuantity;
  const value = difference >= 0 ? proportional(difference, line.basisCost, line.basisQuantity) : line.countedQuantity === 0 ? -line.expectedCost : -proportional(-difference, line.expectedCost, line.expectedQuantity);
  must(Number.isSafeInteger(value) && Number.isSafeInteger(line.expectedCost + value), "This count valuation exceeds supported whole-cent precision. Review the original receipt cost and count with accounting.");
  return { quantity: difference, cost: value, afterQuantity: line.countedQuantity, afterCost: line.expectedCost + value };
}
export function stocktakePreview(count: RestaurantStocktake) {
  const lines = count.lines.map(line => ({ ...line, adjustment: stocktakeLineValue(line) })), missing = lines.filter(l => l.countedQuantity === null).length;
  const gains = lines.reduce((t, l) => t + Math.max(0, l.adjustment?.cost ?? 0), 0) + count.found.reduce((t, f) => t + f.cost, 0), losses = lines.reduce((t, l) => t + Math.max(0, -(l.adjustment?.cost ?? 0)), 0);
  return { lines, missing, gains, losses, netValue: gains - losses, changedLots: lines.filter(l => l.adjustment && l.adjustment.quantity !== 0).length + count.found.length };
}
export function executeStocktakeAction(b: RestaurantBusiness, action: string, raw: unknown, actor: string, postJournal: (date: string, source: string, memo: string, lines: JournalLine[]) => void) {
  if (action === "stocktake.start") return start(b, raw, actor).id;
  const parsed = action === "stocktake.record" ? stocktakeRecordInput.parse(raw) : action === "stocktake.found" ? stocktakeFoundInput.parse(raw) : action === "stocktake.remove-found" ? stocktakeRemoveFoundInput.parse(raw) : action === "stocktake.submit" ? stocktakeSubmitInput.parse(raw) : action === "stocktake.post" ? stocktakePostInput.parse(raw) : action === "stocktake.recount" ? stocktakeRestartInput.parse(raw) : stocktakeReturnInput.parse(raw);
  const count = countById(b, parsed.id, parsed.revision); must(!["posted", "cancelled"].includes(count.status), "This stocktake is closed. Start a new count for any further adjustment.");
  if (action === "stocktake.cancel" || action === "stocktake.recount") {
    const input = action === "stocktake.recount" ? stocktakeRestartInput.parse(raw) : stocktakeReturnInput.parse(raw); count.status = "cancelled"; count.revision++; count.history.push({ at: at(), actor, action: "cancelled", note: input.reason });
    if (action === "stocktake.recount") { const next = stocktakeRestartInput.parse(raw); return start(b, { reference: next.reference, ingredientIds: count.scope.map(i => i.id), note: next.reason }, actor, count.id).id; } return count.id;
  }
  fresh(b, count);
  if (action === "stocktake.record") {
    must(count.status === "counting", "Return the submitted count for corrections before editing it."); const input = stocktakeRecordInput.parse(raw), line = count.lines.find(l => l.id === input.lineId); must(line, "Choose a line from this count sheet.");
    must(input.quantity === line.expectedQuantity || input.reason.length >= 3, "Explain the quantity difference for this lot.");
    const before = { quantity: line.countedQuantity, reason: line.reason, counter: line.counter, countedAt: line.countedAt }; line.countedQuantity = input.quantity; line.reason = input.reason; line.counter = actor; line.countedAt = at(); stocktakeLineValue(line);
    count.history.push({ at: at(), actor, action: "count recorded", note: input.reason, lineId: line.id, before, after: { quantity: input.quantity } });
  } else if (action === "stocktake.found") {
    must(count.status === "counting", "Return the submitted count for corrections before editing it."); const input = stocktakeFoundInput.parse(raw); must(count.scope.some(i => i.id === input.ingredientId), "Found stock must belong to a selected ingredient."); must(b.suppliers.some(s => s.id === input.supplierId), "Choose the supplier recorded on the stock evidence.");
    const old = count.found.find(f => f.id === input.foundId); must(!input.foundId || old, "Found-stock line unavailable."); must(old || count.found.length < 100, "Use at most 100 found-stock lots per count.");
    const next = { id: old?.id ?? randomUUID(), ingredientId: input.ingredientId, supplierId: input.supplierId, lotReference: input.lotReference, quantity: input.quantity, cost: input.cost, expires: input.expires, evidence: input.evidence, counter: actor, countedAt: at() };
    must(!count.found.some(f => f.id !== old?.id && f.ingredientId === input.ingredientId && f.lotReference.toLowerCase() === input.lotReference.toLowerCase()), "This found-stock reference is already on the count sheet.");
    count.found = [...count.found.filter(f => f.id !== next.id), next]; count.history.push({ at: at(), actor, action: "found stock recorded", note: input.evidence, lineId: next.id, ...(old ? { before: old } : {}), after: next });
  } else if (action === "stocktake.remove-found") {
    must(count.status === "counting", "Return the submitted count for corrections before editing it."); const input = stocktakeRemoveFoundInput.parse(raw), old = count.found.find(f => f.id === input.foundId); must(old, "Found-stock line unavailable."); count.found = count.found.filter(f => f.id !== old.id); count.history.push({ at: at(), actor, action: "found stock removed", note: input.reason, lineId: old.id, before: old });
  } else if (action === "stocktake.submit") {
    must(count.status === "counting", "Only an in-progress count can be submitted."); must(stocktakePreview(count).missing === 0, "Record an actual quantity for every stored lot, including zero where it is empty.");
    count.status = "submitted"; count.submittedAt = at(); count.submittedBy = actor; count.history.push({ at: at(), actor, action: "submitted", note: "All selected ingredients physically checked, including those with no recorded lots." });
  } else if (action === "stocktake.return") {
    must(count.status === "submitted", "Only a submitted count can be returned for correction."); const input = stocktakeReturnInput.parse(raw); count.status = "counting"; count.history.push({ at: at(), actor, action: "returned for correction", note: input.reason });
  } else if (action === "stocktake.post") {
    must(count.status === "submitted", "Submit the completed count for review before posting adjustments."); must(!b.closes.some(c => c.date >= count.date), "The count's business day is closed. Start a new count in an open period.");
    const input = stocktakePostInput.parse(raw), preview = stocktakePreview(count); must(!preview.missing, "Every lot needs an actual count."); must(preview.gains <= 99_999_999 && preview.losses <= 99_999_999, "Split this count into smaller reviewed scopes before posting large value adjustments.");
    for (const line of preview.lines) {
      const adjustment = line.adjustment!, lot = b.lots.find(l => l.id === line.lotId); must(lot, "A counted lot is unavailable.");
      if (!adjustment.quantity) continue; lot.remainingQuantity = adjustment.afterQuantity; lot.remainingCost = adjustment.afterCost;
      b.movements.push({ id: randomUUID(), ingredientId: line.ingredientId, lotId: line.lotId, date: count.date, kind: "count", quantity: adjustment.quantity, cost: adjustment.cost, reference: count.id, reason: line.reason });
    }
    for (const found of count.found) {
      const lotId = randomUUID(); b.lots.push({ id: lotId, ingredientId: found.ingredientId, supplierId: found.supplierId, invoiceReference: found.lotReference, receivedDate: count.date, expires: found.expires, receivedQuantity: found.quantity, receivedCost: found.cost, remainingQuantity: found.quantity, remainingCost: found.cost, purchaseId: null, stocktakeId: count.id });
      b.movements.push({ id: randomUUID(), ingredientId: found.ingredientId, lotId, date: count.date, kind: "count", quantity: found.quantity, cost: found.cost, reference: count.id, reason: found.evidence });
    }
    const lines: JournalLine[] = [];
    if (preview.gains) lines.push({ accountNumber: 1300, debitCents: preview.gains, creditCents: 0 }, { accountNumber: 6930, debitCents: 0, creditCents: preview.gains });
    if (preview.losses) lines.push({ accountNumber: 6930, debitCents: preview.losses, creditCents: 0 }, { accountNumber: 1300, debitCents: 0, creditCents: preview.losses });
    if (lines.length) postJournal(count.date, `restaurant-stocktake:${count.id}`, `Stocktake: ${count.reference} · ${input.evidence}`, lines);
    count.status = "posted"; count.postedAt = at(); count.postedBy = actor; count.postingEvidence = input.evidence; count.history.push({ at: at(), actor, action: "posted", note: input.evidence, after: { gains: preview.gains, losses: preview.losses } });
  } else throw new Error("Choose a supported stocktake action.");
  count.revision++; return count.id;
}
export function stocktakeViews(b: RestaurantBusiness) {
  const today = restaurantCalendarDay(b.config);
  return (b.stocktakes ?? []).map(count => { const { fingerprint: _fingerprint, ...data } = count; void _fingerprint; return { ...data, ...stocktakePreview(count), stale: ["counting", "submitted"].includes(count.status) && stocktakeIsStale(b, count), expiredLots: count.lines.filter(l => l.expires && l.expires < today).map(l => l.id) }; });
}
