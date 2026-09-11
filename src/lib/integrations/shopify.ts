/** Shopify GraphQL Admin API. Bounded reads; missing scopes and partial results fail closed. */
import { z } from "zod";
import { freshShopifyConfig } from "../shopify-backend/tokens";
import { customerNode, customerFields, orderNode, orderFields, ordersQuery, fromCustomer, fromOrder } from "./shopify-graphql";
import type { IncomingCustomer, IncomingOrder } from "./types";

async function shopifyQuery<T>(query:string,variables:Record<string,unknown>,schema:z.ZodType<T>):Promise<T> {
  const cfg=await freshShopifyConfig();if(!cfg)throw new Error("Connect your Shopify store in Settings first.");
  const response=await fetch(`https://${cfg.storeDomain}/admin/api/${cfg.apiVersion}/graphql.json`,{
    method:"POST",headers:{"X-Shopify-Access-Token":cfg.adminToken,"Content-Type":"application/json"},
    body:JSON.stringify({query,variables}),cache:"no-store",signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw new Error(`Shopify request failed (${response.status}). Check the connection and app permissions.`);
  const result=await response.json();
  if(result.errors?.length)throw new Error("Shopify could not complete the request. Check read_orders / read_customers permissions and access to customer data.");
  const parsed=schema.safeParse(result.data);if(!parsed.success)throw new Error("Shopify returned incomplete data. No accounting changes were made.");return parsed.data;
}
export async function testShopifyConnection():Promise<string> {
  const result=await shopifyQuery("query ShopConnection { shop { name } }",{},z.object({shop:z.object({name:z.string()})}));return result.shop.name;
}
export async function fetchShopifyCustomers(limit=50):Promise<IncomingCustomer[]> {
  const first=z.number().int().min(1).max(250).parse(limit);
  const data=await shopifyQuery(`query Customers($first: Int!) { customers(first:$first) { nodes { ${customerFields} } } }`,{first},z.object({customers:z.object({nodes:z.array(customerNode)})}));return data.customers.nodes.map(fromCustomer);
}
export async function fetchShopifyOrders(limit=50):Promise<IncomingOrder[]> {
  // Keep GraphQL's requested query cost below 1,000 points: each order includes up to 100 lines.
  const count=z.number().int().min(1).max(250).parse(limit),orders:IncomingOrder[]=[];
  let cursor:string|null=null;
  while(orders.length<count){
    const data:{orders:{pageInfo:{hasNextPage:boolean;endCursor:string|null};nodes:z.infer<typeof orderNode>[]}}=await shopifyQuery(ordersQuery,{first:Math.min(2,count-orders.length),after:cursor},z.object({orders:z.object({pageInfo:z.object({hasNextPage:z.boolean(),endCursor:z.string().nullable()}),nodes:z.array(orderNode)})}));
    orders.push(...data.orders.nodes.map(fromOrder));
    if(!data.orders.pageInfo.hasNextPage)break;
    if(!data.orders.nodes.length||!data.orders.pageInfo.endCursor||data.orders.pageInfo.endCursor===cursor)throw new Error("Shopify pagination did not advance. Preview again.");
    cursor=data.orders.pageInfo.endCursor;
  }
  return orders;
}
export async function fetchShopifyOrder(externalId:string):Promise<IncomingOrder|null> {
  z.string().regex(/^\d+$/).parse(externalId);
  const data=await shopifyQuery(`query ReviewedOrder($id: ID!) { order(id: $id) { ${orderFields} } }`,{id:`gid://shopify/Order/${externalId}`},z.object({order:orderNode.nullable()}));
  return data.order?fromOrder(data.order):null;
}
