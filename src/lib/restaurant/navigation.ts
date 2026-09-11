/** Stable industry tool IDs open their connected restaurant workflows. Existing
 * reference records remain available at the original /m/<id> addresses. */
const destinations: Record<string, string> = {
  "restaurant-menu": "/restaurant/manage?tab=menu",
  "restaurant-recipes": "/restaurant/manage?tab=menu#recipes",
  "ingredient-inventory": "/restaurant/manage?tab=stock",
  "food-waste": "/restaurant/manage?tab=stock#waste",
  suppliers: "/restaurant/manage?tab=purchasing",
  "purchase-orders": "/restaurant/manage?tab=purchasing#purchases",
  "restaurant-reservations": "/restaurant",
  "daily-close": "/restaurant/finance",
  "staff-shifts": "/team/schedule",
};
export function restaurantWorkspaceLink(id: string) { return destinations[id] ?? null; }
