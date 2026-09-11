import { z } from "zod";
import { parseDollarsToCents } from "../money";
import { mapShopifyCustomer, type ShopifyAddressRaw } from "./shopify-map";
import type { IncomingCustomer, IncomingOrder } from "./types";
const address = z.object({address1:z.string().nullable(),address2:z.string().nullable(),city:z.string().nullable(),province:z.string().nullable(),zip:z.string().nullable(),country:z.string().nullable(),company:z.string().nullable()}).nullable();
export const customerNode = z.object({legacyResourceId:z.string(),firstName:z.string().nullable(),lastName:z.string().nullable(),defaultEmailAddress:z.object({emailAddress:z.string()}).nullable(),defaultAddress:address});
const amount = z.object({shopMoney:z.object({amount:z.string(),currencyCode:z.string()})});
export const orderNode = z.object({
  legacyResourceId:z.string(),name:z.string(),poNumber:z.string().nullable(),customer:customerNode.nullable(),
  billingAddress:address,shippingAddress:address,cancelledAt:z.string().nullable(),test:z.boolean(),edited:z.boolean(),displayFinancialStatus:z.string().nullable(),
  currentSubtotalPriceSet:amount,currentShippingPriceSet:amount,currentTotalPriceSet:amount,totalOutstandingSet:amount,totalRefundedSet:amount,
  lineItems:z.object({pageInfo:z.object({hasNextPage:z.boolean()}),nodes:z.array(z.object({sku:z.string().nullable(),title:z.string(),currentQuantity:z.number().int().nonnegative(),originalUnitPriceSet:amount}))}),
});
export const addressFields="address1 address2 city province zip country company";
export const customerFields=`legacyResourceId firstName lastName defaultEmailAddress { emailAddress } defaultAddress { ${addressFields} }`;
const moneyFields="shopMoney { amount currencyCode }";
export const orderFields=`
  legacyResourceId name poNumber customer { ${customerFields} } billingAddress { ${addressFields} } shippingAddress { ${addressFields} }
  cancelledAt test edited displayFinancialStatus currentSubtotalPriceSet { ${moneyFields} } currentShippingPriceSet { ${moneyFields} }
  currentTotalPriceSet { ${moneyFields} } totalOutstandingSet { ${moneyFields} } totalRefundedSet { ${moneyFields} }
  lineItems(first: 100) { pageInfo { hasNextPage } nodes { sku title currentQuantity originalUnitPriceSet { ${moneyFields} } } }
`;
export const ordersQuery=`query ReviewedOrders($first: Int!, $after: String) { orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { ${orderFields} } } }`;
export function fromCustomer(raw:z.infer<typeof customerNode>):IncomingCustomer {
  return mapShopifyCustomer({id:raw.legacyResourceId,first_name:raw.firstName,last_name:raw.lastName,email:raw.defaultEmailAddress?.emailAddress,default_address:raw.defaultAddress});
}
function formatted(a:ShopifyAddressRaw|null){return a?[a.address1,a.address2,a.city,a.province,a.zip,a.country].filter(Boolean).join(", "):"";}
export function fromOrder(raw:z.infer<typeof orderNode>):IncomingOrder {
  const customer=raw.customer?fromCustomer(raw.customer):null;
  if(customer) {customer.billingAddress=formatted(raw.billingAddress)||customer.billingAddress;customer.shippingAddress=formatted(raw.shippingAddress)||customer.shippingAddress;customer.company=raw.billingAddress?.company||raw.shippingAddress?.company||customer.company;}
  const money=(v:z.infer<typeof amount>)=>parseDollarsToCents(v.shopMoney.amount);
  const currency=raw.currentTotalPriceSet.shopMoney.currencyCode;
  if([raw.currentSubtotalPriceSet,raw.currentShippingPriceSet,raw.totalOutstandingSet,raw.totalRefundedSet,...raw.lineItems.nodes.map(l=>l.originalUnitPriceSet)].some(v=>v.shopMoney.currencyCode!==currency))throw new Error("Shopify returned mixed currencies within an order. Review it in Shopify.");
  return {externalId:raw.legacyResourceId,name:raw.name,poNumber:raw.poNumber,customer,customerExternalId:customer?.externalId||null,
    lines:raw.lineItems.nodes.map(l=>({sku:l.sku,title:l.title,quantity:l.currentQuantity,unitPriceCents:money(l.originalUnitPriceSet)})),
    subtotalCents:money(raw.currentSubtotalPriceSet),shippingCents:money(raw.currentShippingPriceSet),totalCents:money(raw.currentTotalPriceSet),
    currency,financialStatus:raw.displayFinancialStatus,cancelled:!!raw.cancelledAt,testOrder:raw.test,edited:raw.edited,
    outstandingCents:money(raw.totalOutstandingSet),refundedCents:money(raw.totalRefundedSet),linesComplete:!raw.lineItems.pageInfo.hasNextPage};
}
