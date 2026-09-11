import { createHash,randomUUID } from "node:crypto";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "../connections/vault";
import { fetchShopifyOrders,fetchShopifyOrder } from "./shopify";
import { getQboTokens } from "./token-store";
import { getShopifyConfig } from "./config";
import { findOrCreateQboCustomer,findOrCreateQboItem,createQboInvoice } from "./quickbooks";
import { buildQboCustomer,buildQboInvoice } from "./quickbooks-map";
import type { IncomingOrder } from "./types";
import { z } from "zod";
interface Review {orders:IncomingOrder[];realm:string;shop:string;expires:number}
export function syncEligibility(order:IncomingOrder):string|null {
  if(order.currency!=="USD")return "Only verified USD orders are supported by this invoice mapping.";
  if(order.cancelled!==false||order.testOrder!==false||order.edited!==false)return "Cancelled, test, edited or unverified orders need accounting review.";
  if(order.financialStatus!=="PENDING"||order.outstandingCents!==order.totalCents||order.refundedCents!==0)return "Paid, authorized, partially paid or refunded orders need a payment-aware accounting workflow.";
  if(order.linesComplete!==true||!order.lines.length)return "The complete billable line list is required.";
  if(!order.customer)return "Customer details are missing.";
  if(order.shippingCents!==0)return "Shipping needs an accounting item mapping.";
  if(order.lines.some(l=>!l.sku))return "Every line needs a Shopify SKU.";
  const lines=order.lines.reduce((n,l)=>n+l.unitPriceCents*l.quantity,0);
  if(lines!==order.subtotalCents||order.totalCents!==order.subtotalCents)return "Discount or tax totals need accounting review.";
  if(order.lines.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<=0||!Number.isSafeInteger(l.unitPriceCents)||l.unitPriceCents<0)||!Number.isSafeInteger(order.totalCents)||order.totalCents<=0)return "An order line or total has no valid billable amount.";
  return null;
}
function dir(){const d=path.join(dataDirectory(),"invoice-sync");mkdirSync(d,{recursive:true,mode:0o700});return d;}
function accounts(){const realm=getQboTokens()?.realmId,shop=getShopifyConfig()?.storeDomain;if(!realm||!shop)throw new Error("Connect Shopify and QuickBooks first.");return {realm,shop};}
export async function previewInvoiceSync(){const {realm,shop}=accounts(),orders=await fetchShopifyOrders(25),reviewId=randomUUID();writeFileSync(path.join(dir(),`${reviewId}.json`),JSON.stringify({orders,realm,shop,expires:Date.now()+15*60_000} satisfies Review),{mode:0o600,flag:"wx"});return {reviewId,orders:orders.map(o=>({id:o.externalId,name:o.name,customer:o.customer?.company||"Missing customer",totalCents:o.totalCents,eligible:!syncEligibility(o),blockedReason:syncEligibility(o),lines:o.lines.length}))};}
export async function commitInvoiceSync(reviewId:string){z.uuid().parse(reviewId);const account=accounts(),review:Review=JSON.parse(readFileSync(path.join(dir(),`${reviewId}.json`),"utf8"));if(review.expires<Date.now())throw new Error("Preview expired. Refresh the preview.");if(review.realm!==account.realm||review.shop!==account.shop)throw new Error("The connected company changed. Preview again.");const results:{order:string;ok:boolean;message:string;invoiceId?:string}[]=[];
  for(const order of review.orders){const blocked=syncEligibility(order);if(blocked||!order.customer){results.push({order:order.name,ok:false,message:`Skipped: ${blocked||"Customer information is missing."}`});continue;}
    const key=createHash("sha256").update(`${account.realm}:${account.shop}:${order.externalId}`).digest("hex"),file=path.join(dir(),`order-${key}.json`);
    try{const receipt=JSON.parse(readFileSync(file,"utf8"));results.push({order:order.name,...receipt,message:receipt.ok?"Already invoiced; skipped.":"Previously submitted without confirmation. Check QuickBooks before resubmitting."});continue;}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
    const fresh=await fetchShopifyOrder(order.externalId);
    if(!fresh||syncEligibility(fresh)||JSON.stringify(fresh)!==JSON.stringify(order)){results.push({order:order.name,ok:false,message:"This order changed after preview. Preview again before invoicing."});continue;}
    // Claim each source order before writes. Repeated syncs never duplicate an invoice.
    try{writeFileSync(file,JSON.stringify({ok:false,message:"Submission pending"}),{mode:0o600,flag:"wx"});}catch{results.push({order:order.name,ok:false,message:"Another sync is processing this order."});continue;}
    try{const customerId=await findOrCreateQboCustomer(buildQboCustomer(order.customer)),itemMap:Record<string,string>={};
      for(const line of order.lines){if(!line.sku)throw new Error("A line has no SKU. Add a SKU in Shopify before invoicing.");itemMap[line.sku]??=await findOrCreateQboItem(line.title);}
      const invoice=await createQboInvoice(buildQboInvoice(order,customerId,itemMap),key.slice(0,50));if(!invoice.Id)throw new Error("QuickBooks returned no invoice receipt.");const result={ok:true,message:"Invoice created",invoiceId:invoice.Id};writeFileSync(file,JSON.stringify(result),{mode:0o600});results.push({order:order.name,...result});
    }catch(e){const result={ok:false,message:e instanceof Error?e.message:"Sync failed. Check QuickBooks before retrying."};writeFileSync(file,JSON.stringify(result),{mode:0o600});results.push({order:order.name,...result});}
  }return results;
}
