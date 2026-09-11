import { restaurantPeriodReport } from "./sales-report";
import type { ReportQuery } from "./report-model";
import type { RestaurantBusiness } from "./business-model";
import { restaurantCalendarDay } from "./business-model";
import { restaurantMenuAvailability } from "./business";

export function restaurantStock(b: RestaurantBusiness) {
  const today = restaurantCalendarDay(b.config);
  return b.ingredients.map(i => {
    const lots = b.lots.filter(l => l.ingredientId === i.id && l.remainingQuantity > 0), available = lots.filter(l => !l.expires || l.expires >= today);
    const quantity = available.reduce((t, l) => t + l.remainingQuantity, 0), value = available.reduce((t, l) => t + l.remainingCost, 0), expiring = available.filter(l => l.expires && Date.parse(`${l.expires}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`) <= 3 * 86400000);
    return { ...i, available: quantity, total: lots.reduce((t, l) => t + l.remainingQuantity, 0), expired: lots.filter(l => l.expires && l.expires < today).reduce((t, l) => t + l.remainingQuantity, 0), value: lots.reduce((t, l) => t + l.remainingCost, 0), unitCost: quantity ? value / quantity : null, expiring: expiring.reduce((t, l) => t + l.remainingQuantity, 0), suggestedOrder: i.active && quantity <= i.reorderAt ? Math.max(0, i.targetStock - quantity) : 0 };
  });
}
export function restaurantMenuCosts(b: RestaurantBusiness) {
  const stock = restaurantStock(b);
  return b.menu.map(m => {
    const unknown = m.recipe.filter(r => stock.find(i => i.id === r.ingredientId)?.unitCost == null), estimatedCost = unknown.length ? null : Math.ceil(m.recipe.reduce((t, r) => t + stock.find(i => i.id === r.ingredientId)!.unitCost! * r.quantity, 0));
    return { ...m, available: restaurantMenuAvailability(b, m), estimatedCost, contribution: estimatedCost === null ? null : m.price - estimatedCost, missingCosts: unknown.map(r => stock.find(i => i.id === r.ingredientId)?.name ?? r.ingredientId) };
  });
}
export function restaurantSalesReport(b: RestaurantBusiness, query: ReportQuery = {}) {
  const report = restaurantPeriodReport(b, query);
  const menu = restaurantMenuCosts(b), specialCandidates = menu.filter(m => m.active && m.available > 0 && m.contribution !== null && m.contribution > 0).sort((a, c) => c.contribution! - a.contribution!).slice(0, 5).map(m => ({ id: m.id, name: m.name, price: m.price, estimatedFoodCost: m.estimatedCost!, beforeLaborContribution: m.contribution!, available: m.available }));
  return { ...report, specialCandidates };
}
