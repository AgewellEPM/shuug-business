import { salesChannel, type SalesChannel } from "../data/channels";
import type { CustomerDeal, Order } from "../data/model";
import { signedAmount } from "../expenses/model";
import { businessDay, moveDate } from "./dates";
import type { BusinessHistory, DaySummary, HistoricalSale } from "./model";

export function historicalSales(orders:Order[],deals:CustomerDeal[],timezone:string):HistoricalSale[] {
  return orders.map(order=>{
    const deal=deals.find(d=>d.customer.id===order.customerId);
    const products=order.lines.map(line=>{
      const sku=deal?.skus.find(s=>s.id===line.skuId);
      const recorded=Number.isSafeInteger(line.costAtOrderCents)&&(line.costAtOrderCents??-1)>=0;
      const cost=recorded?line.costAtOrderCents!:sku?Math.round(sku.costPerCaseCents*line.cases):null;
      return {id:line.skuId,name:sku?.name??line.skuId,quantity:line.quantity,unit:line.unit,revenueCents:line.lineTotalCents,costCents:cost,estimated:!recorded&&cost!==null};
    });
    return {id:order.id,date:businessDay(order.createdAt,timezone),customer:deal?.customer.company??order.customerId,channel:deal?salesChannel(deal.customer.channel):"shared",status:order.status,revenueCents:order.subtotalCents,costCents:products.some(p=>p.costCents===null)?null:products.reduce((n,p)=>n+p.costCents!,0),estimated:products.some(p=>p.estimated),products};
  });
}
export function emptySummary(date:string):DaySummary {return {date,salesCents:0,costCents:0,operatingCents:0,sharedCents:0,purchaseCents:0,orders:0,estimatedOrders:0,missingCostOrders:0,activityCount:0,contributionCents:0,grossProfitCents:0,margin:null};}
function finish(s:DaySummary):DaySummary {s.grossProfitCents=s.missingCostOrders?null:s.salesCents-s.costCents;s.contributionCents=s.grossProfitCents===null?null:s.grossProfitCents-s.operatingCents;s.margin=s.salesCents&&s.grossProfitCents!==null?s.grossProfitCents/s.salesCents:null;return s;}
export function summarizeHistory(data:BusinessHistory,start:string,end:string,channel:SalesChannel="all") {
  const days=new Map<string,DaySummary>();
  const get=(date:string)=>{if(!days.has(date))days.set(date,emptySummary(date));return days.get(date)!;};
  const inRange=(date:string)=>date>=start&&date<=end;
  for(const sale of data.sales)if(inRange(sale.date)&&sale.status!=="cancelled"&&(channel==="all"||sale.channel===channel)) {
    const d=get(sale.date);d.salesCents+=sale.revenueCents;d.orders++;d.costCents+=sale.costCents??0;if(sale.estimated)d.estimatedOrders++;if(sale.costCents===null)d.missingCostOrders++;
  }
  for(const expense of data.expenses) {
    const f=expense.fields;if(expense.status!=="recorded"||f.currency!=="USD"||!inRange(f.date))continue;
    const shared=f.channel==="shared",allocated=channel==="all"||f.channel===channel;
    if(!shared&&!allocated)continue;
    const d=get(f.date),amount=signedAmount(f);
    if(allocated)d.purchaseCents+=amount;
    if(f.treatment==="operating") {if(allocated)d.operatingCents+=amount;else if(shared)d.sharedCents+=amount;}
  }
  for(const a of data.activities)if(inRange(a.date)&&(channel==="all"||a.channel===channel||a.channel==="shared"))get(a.date).activityCount++;
  const result=[...days.values()].map(finish).sort((a,b)=>a.date.localeCompare(b.date));
  return {days:result,total:combineSummaries(result,start)};
}
export function combineSummaries(rows:DaySummary[],date:string) {
  const total=emptySummary(date);for(const row of rows)for(const key of ["salesCents","costCents","operatingCents","sharedCents","purchaseCents","orders","estimatedOrders","missingCostOrders","activityCount"] as const)total[key]+=row[key];return finish(total);
}
export function calendarDays(month:string) {
  const first=`${month.slice(0,7)}-01`,offset=new Date(`${first}T12:00:00Z`).getUTCDay(),start=moveDate(first,-offset,"day");
  return Array.from({length:42},(_,i)=>moveDate(start,i,"day"));
}
