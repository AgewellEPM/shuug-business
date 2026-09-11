import type { JournalEntry } from "../accounting/ledger";
export interface RestaurantConfig { currency: "USD"; timezone: string; taxBasisPoints: number; taxReviewed: boolean; businessDayStartHour: number; name: string; onlineOrdering: boolean }
export interface Supplier { id: string; name: string; email: string; phone: string; active: boolean; revision: number }
export interface Ingredient { id: string; name: string; unit: "g" | "ml" | "each"; reorderAt: number; targetStock: number; supplierId: string | null; active: boolean; revision: number }
export interface IngredientLot { id: string; ingredientId: string; supplierId: string; invoiceReference: string; receivedDate: string; expires: string | null; receivedQuantity: number; receivedCost: number; remainingQuantity: number; remainingCost: number; purchaseId: string | null; stocktakeId?: string; prepBatchId?: string }
export interface MenuItem { modifierGroups?: import("./modifier-model").ModifierGroup[]; id: string; name: string; category: string; price: number; station: string; description: string; allergens: string; recipe: { ingredientId: string; quantity: number }[]; active: boolean; revision: number }
export interface PurchaseOrder { id: string; supplierId: string; reference: string; status: "draft" | "ordered" | "partial" | "received" | "cancelled"; lines: { ingredientId: string; quantity: number; expectedCost: number; received: number }[]; createdDate: string; revision: number }
export interface StockMovement { id: string; ingredientId: string; lotId: string; date: string; kind: "received" | "kitchen" | "returned" | "waste" | "count" | "prep_input" | "prep_output"; quantity: number; cost: number; reference: string; reason: string }
export interface RestaurantOrder { special?: import("./special-model").SpecialUse | null; listSubtotal?: number; discount?: number; id: string; ref: string; channel: "dine_in" | "takeaway" | "online"; guest: string; covers: number; reservationId: string | null; tableId: string | null; server: string; note: string; status: "draft" | "fired" | "served" | "closed" | "cancelled"; revision: number; date: string; createdAt: string; servedAt: string | null; saleDate: string | null; saleHour: number | null; closedAt: string | null; ticketId: string | null; lines: { id?: string; modifiers?: import("./modifier-model").CapturedModifier[]; baseUnitPrice?: number; menuId: string; menuRevision: number; name: string; station: string; qty: number; unitPrice: number; subtotal: number; listSubtotal?: number; discount?: number; foodCost?: number; allergens: string; recipe: { ingredientId: string; quantity: number }[] }[]; subtotal: number; tax: number; taxBasisPoints: number; total: number; foodCost: number; paid: number; consumed: { ingredientId: string; lotId: string; quantity: number; cost: number }[] }
export interface RestaurantTender { id: string; orderId: string; method: "cash" | "external_card"; amount: number; tip: number; reference: string; date: string; at: string; actor: string }
export interface SupplierBill { id: string; supplierId: string; reference: string; amount: number; paid: number; date: string; lotIds: string[] }
export interface RestaurantClose { grossSales?: number; credits?: number; creditedTax?: number; creditedTips?: number; cashRefunds?: number; cardRefunds?: number; refundsOwed?: number; id: string; operated: boolean; date: string; openingCash: number; countedCash: number; expectedCash: number; variance: number; cashCollected: number; cardCollected: number; sales: number; tax: number; tips: number; foodCost: number; orderCount: number; covers: number; note: string; actor: string; at: string; revision: number }
export interface RestaurantBusiness {
  prepRecipes?: import("./prep-model").PrepRecipe[]; prepBatches?: import("./prep-model").PrepBatch[];
  serviceHours?: import("./report-model").ServiceHoursReview[];
  credits?: import("./credit-model").RestaurantCredit[]; refunds?: import("./credit-model").RestaurantRefund[];
  stocktakes?: import("./stocktake-model").RestaurantStocktake[];
  specials?: import("./special-model").RestaurantSpecial[]; specialSpend?: import("./special-model").SpecialSpend[];
  website?: import("./website-model").RestaurantWebsite;
  config: RestaurantConfig; suppliers: Supplier[]; ingredients: Ingredient[]; lots: IngredientLot[]; menu: MenuItem[]; purchases: PurchaseOrder[]; movements: StockMovement[]; orders: RestaurantOrder[]; tenders: RestaurantTender[]; bills: SupplierBill[]; closes: RestaurantClose[]; journals: JournalEntry[];
  audit: { id: string; at: string; actor: string; action: string; reference: string }[];
  commands: Record<string, { request: string; result: { id: string; kind: string } }>;
}
export const emptyRestaurantBusiness = (): RestaurantBusiness => ({ config: { currency: "USD", timezone: "UTC", taxBasisPoints: 0, taxReviewed: false, businessDayStartHour: 0, name: "Restaurant", onlineOrdering: false }, suppliers: [], ingredients: [], lots: [], menu: [], purchases: [], movements: [], orders: [], tenders: [], bills: [], closes: [], journals: [], audit: [], commands: {} });
export function restaurantDay(config: RestaurantConfig, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`); if (Number(parts.hour) < config.businessDayStartHour) date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10);
}
export function restaurantCalendarDay(config: RestaurantConfig, now = new Date()) { return restaurantDay({ ...config, businessDayStartHour: 0 }, now); }
