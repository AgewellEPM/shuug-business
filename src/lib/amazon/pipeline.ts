import { z } from "zod";
export const STAGES=[{id:"ordered",label:"Ordered / payment check"},{id:"ready",label:"Ready to ship"},{id:"partial",label:"Partially shipped"},{id:"shipped",label:"Shipped / in transit"},{id:"delivered",label:"Delivered"},{id:"exceptions",label:"Needs attention"}] as const;
export type Stage=typeof STAGES[number]["id"];
const money=z.object({amount:z.union([z.string(),z.number()]),currencyCode:z.string()});
const window=z.object({earliestDateTime:z.string().optional(),latestDateTime:z.string().optional()});
export const amazonOrderSchema=z.object({orderId:z.string().min(1),createdTime:z.string(),lastUpdatedTime:z.string(),salesChannel:z.object({channelName:z.string().optional(),marketplaceName:z.string().optional(),marketplaceId:z.string()}),
  fulfillment:z.object({fulfillmentStatus:z.string(),fulfilledBy:z.string().optional(),shipByWindow:window.optional(),deliverByWindow:window.optional()}).optional(),
  proceeds:z.object({grandTotal:money.optional()}).optional(),payment:z.object({paymentExecutions:z.array(z.object({paymentMethod:z.string().optional(),paymentAmount:money.optional()})).optional()}).optional(),
  orderItems:z.array(z.object({orderItemId:z.string(),quantityOrdered:z.number().int().nonnegative(),product:z.object({title:z.string().optional(),sellerSku:z.string().optional(),asin:z.string().optional()}),fulfillment:z.object({quantityFulfilled:z.number().int().nonnegative().optional(),quantityUnfulfilled:z.number().int().nonnegative().optional()}).optional()})),
  packages:z.array(z.object({packageReferenceId:z.string(),carrier:z.string().optional(),trackingNumber:z.string().optional(),shipTime:z.string().optional(),packageStatus:z.object({status:z.string(),detailedStatus:z.string().optional()}).optional()})).optional(),
});
export interface PipelineOrder {
  orderId:string;createdAt:string;updatedAt:string;marketplaceId:string;channel:string;status:string;fulfilledBy:string;stage:Stage;
  totalCents:number|null;currency:string|null;shipBy:string|null;deliverBy:string|null;
  items:{id:string;title:string;sku:string;quantity:number;shipped:number|null;unshipped:number|null}[];
  packages:{id:string;carrier:string;tracking:string;status:string;detail:string;shippedAt:string|null}[];
  payments:{method:string;amountCents:number|null;currency:string|null}[];
}
function cents(value:unknown){if(value===undefined||value===null||value==="")return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<1e12?Math.round(n*100):null;}
export function pipelineStage(status:string,packages:{status:string}[]):Stage {
  if(["CANCELLED","UNFULFILLABLE"].includes(status)||packages.some(p=>p.status==="UNDELIVERABLE"))return "exceptions";
  if(status==="SHIPPED"&&packages.length&&packages.every(p=>p.status==="DELIVERED"))return "delivered";
  if(status==="PARTIALLY_SHIPPED")return "partial";
  if(status==="SHIPPED")return "shipped";
  if(status==="UNSHIPPED")return "ready";
  if(["PENDING","PENDING_AVAILABILITY"].includes(status))return "ordered";
  return "exceptions";
}
export function mapPipelineOrder(input:unknown):PipelineOrder {
  const o=amazonOrderSchema.parse(input),status=o.fulfillment?.fulfillmentStatus||"UNKNOWN";
  const packages=(o.packages||[]).map(p=>({id:p.packageReferenceId,carrier:p.carrier||"Not provided",tracking:p.trackingNumber||"",status:p.packageStatus?.status||"UNKNOWN",detail:p.packageStatus?.detailedStatus||"",shippedAt:p.shipTime||null}));
  return {orderId:o.orderId,createdAt:o.createdTime,updatedAt:o.lastUpdatedTime,marketplaceId:o.salesChannel.marketplaceId,channel:o.salesChannel.marketplaceName||o.salesChannel.channelName||"Amazon",status,fulfilledBy:o.fulfillment?.fulfilledBy||"UNKNOWN",stage:pipelineStage(status,packages),totalCents:cents(o.proceeds?.grandTotal?.amount),currency:o.proceeds?.grandTotal?.currencyCode||null,shipBy:o.fulfillment?.shipByWindow?.latestDateTime||null,deliverBy:o.fulfillment?.deliverByWindow?.latestDateTime||null,
    items:o.orderItems.map(i=>({id:i.orderItemId,title:i.product.title||i.product.sellerSku||"Product details unavailable",sku:i.product.sellerSku||i.product.asin||"",quantity:i.quantityOrdered,shipped:i.fulfillment?.quantityFulfilled??null,unshipped:i.fulfillment?.quantityUnfulfilled??null})),packages,
    payments:(o.payment?.paymentExecutions||[]).map(p=>({method:p.paymentMethod||"Method not provided",amountCents:cents(p.paymentAmount?.amount),currency:p.paymentAmount?.currencyCode||null}))};
}
export function isLate(order:PipelineOrder,now=Date.now()){return ["ready","partial"].includes(order.stage)&&!!order.shipBy&&Date.parse(order.shipBy)<now;}
