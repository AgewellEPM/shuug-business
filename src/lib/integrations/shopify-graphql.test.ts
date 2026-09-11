// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("./config",()=>({getShopifyConfig:()=>({storeDomain:"test.myshopify.com",adminToken:"test-secret",apiVersion:"2026-07"})}));
import { fromOrder, orderNode } from "./shopify-graphql";
import { fetchShopifyOrders, testShopifyConnection } from "./shopify";
import { syncEligibility } from "./review-sync";
const money=(amount:string)=>({shopMoney:{amount,currencyCode:"USD"}});
const raw={legacyResourceId:"123",name:"#1001",poNumber:"PO-1",customer:{legacyResourceId:"42",firstName:"Test",lastName:"Buyer",defaultEmailAddress:{emailAddress:"buyer@example.com"},defaultAddress:null},billingAddress:null,shippingAddress:null,cancelledAt:null,test:false,edited:false,displayFinancialStatus:"PENDING",currentSubtotalPriceSet:money("72.00"),currentShippingPriceSet:money("0"),currentTotalPriceSet:money("72.00"),totalOutstandingSet:money("72.00"),totalRefundedSet:money("0"),lineItems:{pageInfo:{hasNextPage:false},nodes:[{sku:"AMBA",title:"Amba case",currentQuantity:1,originalUnitPriceSet:money("72.00")}]}};
beforeEach(()=>vi.stubGlobal("fetch",vi.fn()));afterEach(()=>vi.unstubAllGlobals());
it("maps current GraphQL records and preserves eligibility metadata",()=>{const order=fromOrder(orderNode.parse(raw));expect(order).toMatchObject({externalId:"123",currency:"USD",outstandingCents:7200,financialStatus:"PENDING",linesComplete:true,customer:{buyerEmail:"buyer@example.com"}});expect(syncEligibility(order)).toBeNull();});
it.each([{financialStatus:"PAID",outstandingCents:0},{financialStatus:"AUTHORIZED"},{refundedCents:100},{currency:"CAD"},{linesComplete:false},{testOrder:true},{cancelled:true},{edited:true},{shippingCents:500},{totalCents:7500}])("blocks unsupported invoice cases %j",patch=>{expect(syncEligibility({...fromOrder(orderNode.parse(raw)),...patch})).toBeTruthy();});
it("rejects incomplete and mixed-currency responses",()=>{expect(orderNode.safeParse({...raw,test:undefined}).success).toBe(false);expect(()=>fromOrder({...raw,totalOutstandingSet:{shopMoney:{amount:"72",currencyCode:"CAD"}}})).toThrow("mixed currencies");});
it("uses authenticated GraphQL pagination and never drops a line-list truncation flag",async()=>{
  const fetch=vi.mocked(globalThis.fetch);fetch.mockResolvedValueOnce(Response.json({data:{orders:{pageInfo:{hasNextPage:true,endCursor:"cursor1"},nodes:[raw]}}})).mockResolvedValueOnce(Response.json({data:{orders:{pageInfo:{hasNextPage:false,endCursor:"cursor2"},nodes:[{...raw,legacyResourceId:"124",lineItems:{...raw.lineItems,pageInfo:{hasNextPage:true}}}]}}}));
  const orders=await fetchShopifyOrders(2);expect(orders).toHaveLength(2);expect(orders[1].linesComplete).toBe(false);
  expect(fetch.mock.calls[0][0]).toBe("https://test.myshopify.com/admin/api/2026-07/graphql.json");
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).variables.after).toBe("cursor1");
});
it("fails closed on GraphQL errors without exposing the provider response",async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({errors:[{message:"raw provider detail test-secret"}],data:{shop:{name:"Partial"}}}));await expect(testShopifyConnection()).rejects.toThrow("permissions");});
