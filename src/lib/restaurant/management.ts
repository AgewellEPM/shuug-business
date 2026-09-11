import type { ReportQuery } from "./report-model";
import { restaurantCheckBalance, restaurantCreditView } from "./credits";
import { stocktakeViews } from "./stocktake";
import { specialResults } from "./specials";
import { restaurantState } from "./store";
import { emptyRestaurantBusiness, restaurantDay } from "./business-model";
import { restaurantMenuCosts, restaurantSalesReport, restaurantStock } from "./reporting";
import { ticketStatus } from "./kitchen";
import { restaurantWebsite } from "./website-model";
export function restaurantManagementData(financial: boolean, reportOptions: ReportQuery = {}) {
  return restaurantState.change(s => {
    const b = s.business ??= emptyRestaurantBusiness();
    const balances = (account: number) => b.journals.flatMap(j => j.lines).filter(l => l.accountNumber === account).reduce((t, l) => t + l.debitCents - l.creditCents, 0);
    return { prepRecipes: b.prepRecipes ?? [], prepBatches: b.prepBatches ?? [], stocktakes: stocktakeViews(b), config: b.config, website: restaurantWebsite(b), today: restaurantDay(b.config), suppliers: b.suppliers, ingredients: restaurantStock(b), menu: restaurantMenuCosts(b), lots: b.lots, purchases: b.purchases,
      orders: b.orders.map(o => ({ ...o, balance: restaurantCheckBalance(b, o), kitchenReviewRequired: s.tickets.find(t => t.id === o.ticketId)?.kitchenReviewRequired === true, kitchenStatus: (() => { const t = s.tickets.find(t => t.id === o.ticketId); return t ? ticketStatus(t.items) : null; })() })), tables: s.tables, seatedParties: s.reservations.filter(r => r.status === "seated"), movements: b.movements.slice(-100).reverse(),
      financial: financial ? { serviceHours: b.serviceHours ?? [], checks: restaurantCreditView(b), credits: b.credits ?? [], refunds: b.refunds ?? [], refundsPayable: -balances(2150), bills: b.bills, tenders: b.tenders, closes: b.closes, journals: b.journals, drawer: balances(1005), processor: balances(1010), tipsPayable: -balances(2400), specials: specialResults(b), report: restaurantSalesReport(b, reportOptions) } : null };
  });
}
/** Accountants can review restaurant books without receiving operational
 * recipes, guest contact details, floor records or kitchen notes. */
export function restaurantFinanceData(reportOptions: ReportQuery = {}) {
  const data = restaurantManagementData(true, reportOptions);
  return { ...data, prepRecipes: [], prepBatches: [], website: { ...data.website, orders: [], slots: [], origins: [], instructions: "" }, ingredients: [], menu: [], lots: [], purchases: [], orders: [], tables: [], seatedParties: [], movements: [] };
}
