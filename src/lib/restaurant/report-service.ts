import { restaurantState } from "./store";
import { emptyRestaurantBusiness } from "./business-model";
import { restaurantSalesReport } from "./reporting";
import type { ReportQuery } from "./report-model";
export function restaurantReportData(query: ReportQuery = {}) { return restaurantSalesReport(restaurantState.read().business ?? emptyRestaurantBusiness(), query); }
