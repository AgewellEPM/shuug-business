import { restaurantCheckBalance } from "./credits";
import type { RestaurantBusiness, RestaurantOrder, MenuItem } from "./business-model";
import { restaurantCalendarDay, restaurantDay } from "./business-model";
import type { RestaurantSpecial, SpecialUse } from "./special-model";
import { localDateTime } from "../timeclock/zoned-time";
const must = (v: unknown, message: string) => { if (!v) throw new Error(message); };
export function estimatedSpecialCost(b: RestaurantBusiness, menu: MenuItem) {
  const day = restaurantDay(b.config), expiry = restaurantCalendarDay(b.config);
  const costs = menu.recipe.map(r => { const lots = b.lots.filter(l => l.ingredientId === r.ingredientId && l.remainingQuantity > 0 && l.receivedDate <= day && (!l.expires || l.expires >= expiry)), quantity = lots.reduce((t, l) => t + l.remainingQuantity, 0); return quantity && b.ingredients.some(i => i.id === r.ingredientId && i.active) ? r.quantity * lots.reduce((t, l) => t + l.remainingCost, 0) / quantity : null; });
  return costs.some(c => c === null) ? null : Math.ceil(costs.reduce<number>((t, c) => t + c!, 0));
}
export function validateSpecial(b: RestaurantBusiness, special: RestaurantSpecial) {
  must(special.endDate >= special.startDate && Date.parse(special.endDate) - Date.parse(special.startDate) <= 366 * 86400000, "Choose a special date range of no more than one year.");
  must(special.overnight ? special.endTime <= special.startTime : special.endTime > special.startTime, "Choose a valid same-day window or an overnight window ending the next day.");
  must(special.maxOrdersPerDate <= special.maxOrders, "The daily order limit cannot exceed the total limit.");
  for (const list of [special.menuIds, special.weekdays, special.channels]) must(new Set<string | number>(list).size === list.length, "Choose each menu item, weekday and channel once.");
  must(special.menuIds.every(id => b.menu.some(m => m.id === id)), "Choose existing menu items.");
}
export function validateSpecialPublication(b: RestaurantBusiness, special: RestaurantSpecial) {
  validateSpecial(b, special); must(b.config.taxReviewed, "Review restaurant operating and tax settings first.");
  must(special.endDate >= restaurantCalendarDay(b.config), "Choose a special that has not ended.");
  for (const id of special.menuIds) { const menu = b.menu.find(m => m.id === id)!; const cost = estimatedSpecialCost(b, menu); must(menu.active && cost !== null, "Every promoted menu item needs active ingredients and recorded stock costs."); must(menu.price - Math.round(menu.price * special.discountBasisPoints / 10000) - cost! >= special.minimumFoodContribution, `The discounted ${menu.name} does not meet the reviewed food contribution minimum.`); }
}
export function specialServiceDate(special: RestaurantSpecial, now = Date.now()) {
  if (special.status !== "active" || !special.timezone) return null;
  const local = localDateTime(now, special.timezone), time = local.slice(11); let date = local.slice(0, 10);
  if (special.overnight) { if (time < special.endTime) date = new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10); else if (time < special.startTime) return null; }
  else if (time < special.startTime || time >= special.endTime) return null;
  return date >= special.startDate && date <= special.endDate && special.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) ? date : null;
}
export function specialUsage(b: RestaurantBusiness, id: string, serviceDate?: string, ignoreId?: string) {
  const orders = b.orders.filter(o => o.id !== ignoreId && o.special?.id === id && ["fired", "served", "closed"].includes(o.status));
  return { orders: orders.length, dateOrders: orders.filter(o => o.special?.serviceDate === serviceDate).length, discount: orders.reduce((t, o) => t + (o.discount ?? 0), 0) };
}
export function checkSpecialCapacity(b: RestaurantBusiness, special: RestaurantSpecial, discount: number, date: string, ignoreId?: string) {
  const used = specialUsage(b, special.id, date, ignoreId);
  must(used.orders < special.maxOrders && used.dateOrders < special.maxOrdersPerDate, "This special has reached its order limit. Review the order without this offer.");
  must(used.discount + discount <= special.discountBudget, "This special has reached its discount budget. Review the order without this offer.");
}
export function availableSpecials(b: RestaurantBusiness, channel: RestaurantOrder["channel"]) {
  return (b.specials ?? []).flatMap(s => { const date = specialServiceDate(s); if (!date || !s.channels.includes(channel)) return []; const used = specialUsage(b, s.id, date); return used.orders < s.maxOrders && used.dateOrders < s.maxOrdersPerDate && used.discount < s.discountBudget ? [{ code: s.code, name: s.name, description: s.description, discountBasisPoints: s.discountBasisPoints, menuIds: s.menuIds, startDate: s.startDate, endDate: s.endDate, startTime: s.startTime, endTime: s.endTime, overnight: s.overnight, timezone: s.timezone }] : []; });
}
export function reviewSpecialForFire(b: RestaurantBusiness, order: RestaurantOrder) {
  if (!order.special) return;
  const special = (b.specials ?? []).find(s => s.id === order.special!.id);
  must(special && special.revision === order.special.revision && specialServiceDate(special) === order.special.serviceDate && special.channels.includes(order.channel), "The special changed or ended. Cancel this draft and review a new check.");
  must(Date.now() - Date.parse(order.special.reviewedAt) <= 15 * 60000, "This special review expired. Cancel this draft and review a new check.");
  checkSpecialCapacity(b, special!, order.discount ?? 0, order.special.serviceDate, order.id);
}
export function assertActualSpecialFoodCost(order: RestaurantOrder) {
  if (!order.special) return;
  for (const line of order.lines.filter(l => order.special!.menuIds.includes(l.menuId))) must(line.foodCost !== undefined && line.subtotal - line.foodCost >= order.special.minimumFoodContribution * line.qty, `Current ingredient costs put ${line.name} below this special's reviewed contribution minimum. Review another offer or menu price.`);
}
export function specialResults(b: RestaurantBusiness) {
  return (b.specials ?? []).map(s => {
    const orders = b.orders.filter(o => o.special?.id === s.id), served = orders.filter(o => ["served", "closed"].includes(o.status)), cancelled = orders.filter(o => o.status === "cancelled"), spend = (b.specialSpend ?? []).filter(x => x.specialId === s.id);
    const sales = served.reduce((t, o) => t + o.subtotal - restaurantCheckBalance(b, o).foodCredit, 0), foodCost = served.reduce((t, o) => t + o.foodCost, 0), advertising = spend.reduce((t, x) => t + x.amount, 0), used = specialUsage(b, s.id, specialServiceDate(s) ?? undefined);
    const waste = cancelled.reduce((t, o) => t + b.movements.filter(m => m.reference === o.id && m.kind === "waste").reduce((n, m) => n + Math.abs(m.cost), 0), 0);
    return { ...s, usage: used, servedOrders: served.length, pendingOrders: orders.filter(o => o.status === "fired").length, cancelledOrders: cancelled.length, listSales: served.reduce((t, o) => t + (o.listSubtotal ?? o.subtotal), 0), discount: served.reduce((t, o) => t + (o.discount ?? 0), 0), credits: served.reduce((t, o) => t + restaurantCheckBalance(b, o).foodCredit, 0), sales, foodCost, waste, advertising, beforeLaborContribution: sales - foodCost - waste - advertising, advertisingOverBudget: advertising > s.advertisingBudget, spend, byChannel: (["dine_in", "takeaway", "online"] as const).map(channel => ({ channel, orders: served.filter(o => o.channel === channel).length, sales: served.filter(o => o.channel === channel).reduce((t, o) => t + o.subtotal - restaurantCheckBalance(b, o).foodCredit, 0) })) };
  });
}
export function captureSpecial(s: RestaurantSpecial, date: string): SpecialUse { return { id: s.id, revision: s.revision, code: s.code, name: s.name, serviceDate: date, reviewedAt: new Date().toISOString(), minimumFoodContribution: s.minimumFoodContribution, menuIds: [...s.menuIds] }; }
