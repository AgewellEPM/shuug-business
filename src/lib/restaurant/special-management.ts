import { restaurantState } from "./store";
import { emptyRestaurantBusiness, restaurantCalendarDay, restaurantDay } from "./business-model";
import { estimatedSpecialCost, specialResults } from "./specials";
import { restaurantSalesReport } from "./reporting";
export function specialManagementData(canReadSpend = false) {
  return restaurantState.change(state => {
    const b = state.business ??= emptyRestaurantBusiness(), report = restaurantSalesReport(b);
    return { name: b.config.name, timezone: b.config.timezone, today: restaurantCalendarDay(b.config), businessDate: restaurantDay(b.config), menu: b.menu.filter(m => m.active).map(m => ({ id: m.id, name: m.name, price: m.price, estimatedFoodCost: estimatedSpecialCost(b, m) })), specials: specialResults(b).map(s => ({ ...s, spend: canReadSpend ? s.spend : [] })), guidance: report.guidance, quietest: report.quietest, busiest: report.busiest };
  });
}
