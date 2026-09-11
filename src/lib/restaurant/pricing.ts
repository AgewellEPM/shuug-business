import { resolveMenuOptions, selectionKey } from "./modifier-model";
import type { RestaurantBusiness, RestaurantOrder } from "./business-model";
import { captureSpecial, checkSpecialCapacity, estimatedSpecialCost, specialServiceDate } from "./specials";
function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
export function priceRestaurantOrder(b: RestaurantBusiness, input: { menuId: string; qty: number; options?: string[] }[], channel: RestaurantOrder["channel"], specialCode = "") {
  must(new Set(input.map(selectionKey)).size === input.length, "Combine quantities for identical menu items and options.");
  const special = specialCode ? (b.specials ?? []).find(s => s.code === specialCode) : undefined, date = special ? specialServiceDate(special) : null;
  must(!specialCode || special && date && special.channels.includes(channel), "This special is not available for this channel or service time.");
  const lines: RestaurantOrder["lines"] = input.map(line => {
    const item = b.menu.find(m => m.id === line.menuId && m.active); must(item, "A menu item is unavailable.");
    const resolved = resolveMenuOptions(item, line.options);
    const listSubtotal = resolved.price * line.qty, discount = special?.menuIds.includes(item.id) ? Math.round(listSubtotal * special.discountBasisPoints / 10000) : 0;
    if (discount && special) { const cost = estimatedSpecialCost(b, { ...item, recipe: resolved.recipe }); must(cost !== null && listSubtotal - discount - cost * line.qty >= special.minimumFoodContribution * line.qty, `The discounted ${item.name} does not meet this special's food contribution minimum.`); }
    return { menuId: item.id, menuRevision: item.revision, name: item.name, station: item.station, qty: line.qty, unitPrice: resolved.price, baseUnitPrice: item.price, modifiers: resolved.choices, listSubtotal, discount, subtotal: listSubtotal - discount, allergens: resolved.allergens, recipe: resolved.recipe };
  });
  const listSubtotal = lines.reduce((t, l) => t + l.listSubtotal!, 0), discount = lines.reduce((t, l) => t + l.discount!, 0), subtotal = listSubtotal - discount, tax = Math.round(subtotal * b.config.taxBasisPoints / 10000);
  if (special) { must(discount > 0, "Add an eligible menu item for this special."); checkSpecialCapacity(b, special, discount, date!); }
  must(subtotal + tax <= 99_999_999, "Order total exceeds the supported limit.");
  return { lines, listSubtotal, discount, subtotal, tax, total: subtotal + tax, special: special ? captureSpecial(special, date!) : null };
}
