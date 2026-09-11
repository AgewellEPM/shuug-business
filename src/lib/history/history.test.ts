// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { MemoryDealStore } from "../data/store";
import { priceOrder } from "../pricing/order";
import { buildSeedDeals } from "../data/seed";
import type { Order } from "../data/model";
import { blankExpense, type Expense } from "../expenses/model";
import { businessDay,moveDate,period } from "./dates";
import { calendarDays,historicalSales,summarizeHistory } from "./calculate";
import { addJournal,listJournal } from "./journal";
import type { BusinessHistory } from "./model";
let dir:string;
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),"shuug-history-test-"));vi.stubEnv("DEALDESK_DATA_DIR",dir);});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
const deal=buildSeedDeals()[0];
const order:Order={id:"fixture-order",customerId:deal.customer.id,status:"submitted",poNumber:null,createdAt:"2026-09-10T02:30:00Z",subtotalCents:10000,totalCents:10500,freightCents:500,note:"",lines:[{skuId:deal.skus[0].id,unit:"case",quantity:2,cases:2,unitPriceCents:5000,lineTotalCents:10000,costAtOrderCents:4000,tierLabel:"fixture",isOverride:false}]};
const expense=(patch:Partial<Expense["fields"]>,status:Expense["status"]="recorded"):Expense=>({id:"expense",revision:1,createdAt:"",updatedAt:"",status,fields:{...blankExpense("2026-09-09"),merchant:"Fixture",amountCents:1000,...patch},receipt:null,history:[]});
function data():BusinessHistory{return {today:"2026-09-10",timezone:"America/New_York",sales:historicalSales([order],[deal],"America/New_York"),expenses:[],activities:[],durableOrders:true};}
it("buckets timestamps in the business timezone and navigates leap days without month overflow",()=>{
  expect(businessDay("2026-09-10T02:30:00Z")).toBe("2026-09-09");expect(businessDay("2026-11-01T05:30:00Z")).toBe("2026-11-01");
  expect(moveDate("2024-01-31",1,"month")).toBe("2024-02-29");expect(moveDate("2024-02-29",1,"year")).toBe("2025-02-28");expect(period("2026-12-18","year")).toEqual({start:"2026-01-01",end:"2026-12-31"});expect(calendarDays("2026-09-10")).toHaveLength(42);
});
it("uses captured costs, excludes cancelled sales, and subtracts only recorded operating receipts",()=>{
  const d=data();d.sales.push({...d.sales[0],id:"cancelled",status:"cancelled"});d.expenses=[expense({}),expense({kind:"refund",amountCents:200}),expense({treatment:"inventory",amountCents:50000}),expense({treatment:"transfer",amountCents:30000}),expense({currency:"CAD",amountCents:60000}),expense({amountCents:80000},"draft"),expense({amountCents:80000},"archived")];
  expect(summarizeHistory(d,"2026-09-01","2026-09-30").total).toMatchObject({orders:1,salesCents:10000,costCents:4000,grossProfitCents:6000,operatingCents:800,contributionCents:5200,margin:0.6,estimatedOrders:0});
});
it("separates shared costs from channel contribution and never mixes currencies",()=>{
  const d=data();d.sales[0].channel="stores";d.expenses=[expense({channel:"shared",amountCents:1000}),expense({channel:"stores",amountCents:500}),expense({channel:"online",amountCents:900}),expense({channel:"stores",currency:"EUR",amountCents:600})];
  expect(summarizeHistory(d,"2026-09-09","2026-09-09","stores").total).toMatchObject({sharedCents:1000,operatingCents:500,contributionCents:5500});expect(summarizeHistory(d,"2026-09-09","2026-09-09").total.operatingCents).toBe(2400);
});
it("labels legacy costs as estimates and unknown products cannot manufacture a profit",()=>{
  const legacy=structuredClone(order);delete legacy.lines[0].costAtOrderCents;const sales=historicalSales([legacy],[deal],"America/New_York");expect(sales[0].estimated).toBe(true);
  legacy.lines[0].skuId="unknown";const d=data();d.sales=historicalSales([legacy],[deal],"America/New_York");expect(summarizeHistory(d,"2026-09-01","2026-09-30").total).toMatchObject({missingCostOrders:1,grossProfitCents:null,contributionCents:null,margin:null});
});
it("saves newly created local orders and their captured cost across a fresh store",async()=>{
  const store=new MemoryDealStore(),customer=(await store.getDeal(deal.customer.id))!,priced=priceOrder([{skuId:customer.skus[0].id,quantity:2,unit:"bottle"}],customer.agreement,customer.skus);
  const created=await store.createOrder({...priced,customerId:customer.customer.id,poNumber:null,note:"Cost history fixture"});expect(created.lines[0].costAtOrderCents).toBe(Math.round(customer.skus[0].costPerCaseCents*2/customer.skus[0].unitsPerCase));
  const restored=await new MemoryDealStore().getOrder(created.id);expect(restored).toEqual(created);
});
it("keeps business journal entries on disk and validates calendar dates",()=>{
  const row=addJournal({title:"Buyer visit",date:"2026-09-10",detail:"Met Alex",kind:"Visit",channel:"stores"});expect(listJournal()).toEqual([row]);expect(()=>addJournal({title:"Visit",date:"2026-02-30",detail:"",kind:"Visit",channel:"stores"})).toThrow();
});
