import type { Expense } from "../expenses/model";
export type BusinessChannel="bulk"|"stores"|"online"|"shared";
export interface BusinessActivity {id:string;date:string;title:string;detail:string;kind:string;channel:BusinessChannel;href:string;source:"saved"|"demo"|"workspace"}
export interface HistoricalSale {
  id:string;date:string;customer:string;channel:BusinessChannel;status:string;revenueCents:number;
  costCents:number|null;estimated:boolean;
  products:{id:string;name:string;quantity:number;unit:string;revenueCents:number;costCents:number|null;estimated:boolean}[];
}
export interface BusinessHistory {today:string;timezone:string;sales:HistoricalSale[];expenses:Expense[];activities:BusinessActivity[];durableOrders:boolean}
export interface DaySummary {date:string;salesCents:number;costCents:number;operatingCents:number;sharedCents:number;purchaseCents:number;orders:number;estimatedOrders:number;missingCostOrders:number;activityCount:number;contributionCents:number|null;grossProfitCents:number|null;margin:number|null}
