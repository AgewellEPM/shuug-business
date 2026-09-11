// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { adsAccessToken,adsRequest,batchResult,getAdsConfig,MEDIA } from "./client";
import { observeAdsDraft,saveAdsDraft,setAdsDraftState,submitAdsDraft } from "./campaigns";
import { readReceipt } from "./store";
import { beginAdsOAuth,finishAdsOAuth } from "./oauth";
import { checkAdsReport,downloadAdsReport,performanceTotals,requestAdsReport } from "./reports";
import type { AdsPlan } from "./model";
let dir:string;
const profile={profileId:12345,countryCode:"US",currencyCode:"USD",timezone:"America/New_York",accountInfo:{id:"SELLER",type:"seller",name:"Fixture business",validPaymentMethod:true}};
const plan:AdsPlan={name:"Sauce discovery",profileId:"12345",products:[{name:"Fixture sauce",asin:"B000000001",sku:"SELLER-SAUCE"}],targeting:"KEYWORDS",keywords:[{text:"hot sauce",match:"PHRASE"}],targetAsins:[],negativeKeywords:["free sample"],dailyBudgetCents:1500,bidCents:75,startDate:"2026-09-10",endDate:"2026-10-10"};
type Row=Record<string,unknown>;
let entities:Record<string,Row[]>;
let writePaths:string[];
beforeEach(()=>{
  dir=mkdtempSync(path.join(tmpdir(),"shuug-amazon-ads-"));vi.stubEnv("DEALDESK_DATA_DIR",dir);for(const [key,value] of Object.entries({CLIENT_ID:"fixture-app",CLIENT_SECRET:"fixture-secret",REFRESH_TOKEN:dir,REGION:"na"}))vi.stubEnv(`AMAZON_ADS_${key}`,value);
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-09-10T15:00:00Z"));
  entities={campaigns:[],adGroups:[],productAds:[],keywords:[],targetingClauses:[],negativeKeywords:[]};writePaths=[];
  vi.stubGlobal("fetch",vi.fn(async(url,init)=>{
    const route=new URL(String(url)).pathname,body=init?.body?JSON.parse(String(init.body).startsWith("{")?String(init.body):"{}"):{};
    if(route==="/auth/o2/token")return Response.json({access_token:"fixture-access",refresh_token:"authorized-fixture",expires_in:3600});
    expect(init?.headers).toMatchObject({"Amazon-Advertising-API-ClientId":"fixture-app",Authorization:"Bearer fixture-access"});
    if(route==="/v2/profiles")return Response.json([profile]);
    expect(init?.headers).toMatchObject({"Amazon-Advertising-API-Scope":"12345"});
    const endpoint=route.split("/")[2],key=endpoint==="targets"?"targetingClauses":endpoint;
    if(route.endsWith("/list"))return Response.json({[key]:entities[key],totalResults:entities[key].length});
    writePaths.push(route);
    const idField:Record<string,string>={campaigns:"campaignId",adGroups:"adGroupId",productAds:"adId",keywords:"keywordId",targetingClauses:"targetId",negativeKeywords:"negativeKeywordId"};
    const base:Record<string,number>={campaigns:100,adGroups:200,productAds:300,keywords:400,targetingClauses:500,negativeKeywords:600};
    const response=(body[key] as Row[]).map((item,index)=>{
      const id=String(item[idField[key]]||base[key]+index),row={...item,[idField[key]]:id,...(key==="productAds"?{asin:plan.products[index]?.asin||"B000000002"}:{})};
      if(init?.method==="PUT")entities[key]=entities[key].map(existing=>existing[idField[key]]===id?{...existing,...row}:existing);else entities[key].push(row);
      const singular:Record<string,string>={campaigns:"campaign",adGroups:"adGroup",productAds:"productAd",keywords:"keyword",targetingClauses:"targetingClause",negativeKeywords:"negativeKeyword"};
      return {index,[idField[key]]:id,[singular[key]]:row};
    });
    if(key==="adGroups"&&entities.campaigns[0].targetingType==="AUTO")entities.targetingClauses=[{campaignId:"100",adGroupId:"200",targetId:"500",expressionType:"AUTO",bid:body.adGroups[0].defaultBid,state:"ENABLED"}];
    return Response.json({[key]:{success:response,error:[]}},{status:207});
  }));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});

it("saves a durable review without writes, creates paused resources and never repeats a submission",async()=>{
  const draft=await saveAdsDraft(plan);expect(writePaths).toEqual([]);expect(readReceipt(draft.id).plan.products).toEqual(plan.products);
  const created=await submitAdsDraft(draft.id,draft.revision);expect(created).toMatchObject({status:"paused",complete:true,campaignId:"100",adGroupId:"200",adIds:["300"],targetIds:["400"],negativeIds:["600"]});
  expect(entities.campaigns[0]).toMatchObject({state:"PAUSED",budget:{budget:15,budgetType:"DAILY"},dynamicBidding:{strategy:"LEGACY_FOR_SALES",placementBidding:[]}});
  expect(entities.productAds[0]).toMatchObject({sku:"SELLER-SAUCE",state:"ENABLED"});const count=writePaths.length;
  await submitAdsDraft(draft.id,draft.revision);expect(writePaths).toHaveLength(count);
  expect(vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith("/sp/productAds"))?.[1]?.headers).toMatchObject({Accept:MEDIA.productAds,Prefer:"return=representation"});
});
it("rechecks campaign children before a separately requested launch and can pause again",async()=>{
  const draft=await saveAdsDraft(plan),ready=await submitAdsDraft(draft.id,draft.revision);
  const active=await setAdsDraftState(ready.id,ready.revision,true);expect(active.status).toBe("active");expect(entities.campaigns[0].state).toBe("ENABLED");
  const paused=await setAdsDraftState(active.id,active.revision,false);expect(paused.status).toBe("paused");expect((await observeAdsDraft(paused.id)).lastObservedState).toBe("PAUSED");
});
it("blocks launch after an external bid or daily budget change",async()=>{
  const draft=await saveAdsDraft(plan),ready=await submitAdsDraft(draft.id,draft.revision),count=writePaths.length;
  entities.adGroups[0].defaultBid=99;await expect(setAdsDraftState(ready.id,ready.revision,true)).rejects.toThrow("changed in Amazon");expect(writePaths).toHaveLength(count);
  entities.adGroups[0].defaultBid=.75;entities.campaigns[0].budget={budget:900,budgetType:"DAILY"};await expect(setAdsDraftState(ready.id,ready.revision,true)).rejects.toThrow("settings differ");expect(writePaths).toHaveLength(count);
  entities.campaigns[0].budget={budget:15,budgetType:"DAILY"};entities.campaigns[0].dynamicBidding={strategy:"LEGACY_FOR_SALES",placementBidding:[{placement:"PLACEMENT_TOP",percentage:200}]};await expect(setAdsDraftState(ready.id,ready.revision,true)).rejects.toThrow("placement bid increases");expect(writePaths).toHaveLength(count);
});
it.each(["AUTO","PRODUCTS"] as const)("builds %s targeting with the correct API contract",async targeting=>{
  const p={...plan,targeting,targetAsins:targeting==="PRODUCTS"?["B000000099"]:[]},draft=await saveAdsDraft(p),ready=await submitAdsDraft(draft.id,draft.revision);
  expect(ready.complete).toBe(true);expect(entities.keywords).toHaveLength(0);
  if(targeting==="PRODUCTS")expect(entities.targetingClauses[0]).toMatchObject({expressionType:"MANUAL",expression:[{type:"ASIN_SAME_AS",value:"B000000099"}]});
  expect((await setAdsDraftState(ready.id,ready.revision,true)).status).toBe("active");
});
it("retains partial product-ad success and blocks launch/replay",async()=>{
  const draft=await saveAdsDraft({...plan,products:[...plan.products,{name:"Second sauce",asin:"B000000002",sku:"SECOND"}]});
  const original=vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async(url,init)=>String(url).endsWith("/sp/productAds")?Response.json({productAds:{success:[{index:0,adId:"300",productAd:{asin:"B000000001",sku:"SELLER-SAUCE"}}],error:[{index:1}]}},{status:207}):original(url,init));
  const stopped=await submitAdsDraft(draft.id,draft.revision);expect(stopped).toMatchObject({status:"attention",complete:false,campaignId:"100",adIds:["300"]});const count=vi.mocked(fetch).mock.calls.length;
  await submitAdsDraft(draft.id,draft.revision);expect(vi.mocked(fetch).mock.calls.length).toBe(count);await expect(setAdsDraftState(stopped.id,stopped.revision,true)).rejects.toThrow("incomplete");
});
it("does not replay a campaign create after an ambiguous network failure",async()=>{
  const draft=await saveAdsDraft(plan),original=vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async(url,init)=>{const response=await original(url,init);if(String(url).endsWith("/sp/campaigns"))throw new Error("socket closed after acceptance");return response;});
  const stopped=await submitAdsDraft(draft.id,draft.revision);expect(stopped.status).toBe("attention");expect(stopped.campaignId).toBeUndefined();await submitAdsDraft(draft.id,draft.revision);expect(entities.campaigns).toHaveLength(1);
});
it("blocks seller SKU/ASIN mismatches, stale draft edits, and authorization changes",async()=>{
  await expect(saveAdsDraft({...plan,products:[{...plan.products[0],sku:""}]})).rejects.toThrow("seller SKU");
  const draft=await saveAdsDraft(plan);await expect(saveAdsDraft(plan,draft.id,0)).rejects.toThrow("changed");vi.stubEnv("AMAZON_ADS_REFRESH_TOKEN","another-account");await expect(submitAdsDraft(draft.id,draft.revision)).rejects.toThrow("another Amazon Ads authorization");
});
it("refreshes OAuth once for concurrent readers and retries only a rejected authorization",async()=>{
  const cfg=getAdsConfig()!;await Promise.all([adsAccessToken(cfg),adsAccessToken(cfg)]);expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes("/auth/o2/token"))).toHaveLength(1);
  vi.mocked(fetch).mockResolvedValueOnce(new Response("",{status:401}));await adsRequest(cfg,null,"/v2/profiles","GET");expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes("/auth/o2/token"))).toHaveLength(2);
});
it("binds OAuth to a single state and the saved app credentials",async()=>{
  const auth=beginAdsOAuth();expect(new URL(auth.url).searchParams.get("scope")).toBe("advertising::campaign_management");await expect(finishAdsOAuth("code",auth.state,"wrong")).rejects.toThrow("mismatch");await finishAdsOAuth("code",auth.state,auth.state);await expect(finishAdsOAuth("code",auth.state,auth.state)).rejects.toThrow();
  const again=beginAdsOAuth();vi.stubEnv("AMAZON_ADS_CLIENT_SECRET","changed");await expect(finishAdsOAuth("code",again.state,again.state)).rejects.toThrow("configuration changed");
});
it("rejects missing and duplicate batch results instead of reporting completion",()=>{
  expect(batchResult({campaigns:{success:[],error:[]}},"campaigns","campaignId",1).errors).not.toHaveLength(0);
  expect(()=>batchResult({campaigns:{success:[{index:0,campaignId:"1"},{index:1,campaignId:"1"}],error:[]}},"campaigns","campaignId",2)).toThrow("repeated a resource");
});
it("fetches the requested report without sending credentials to S3 and preserves missing metrics",async()=>{
  const original=vi.mocked(fetch).getMockImplementation()!,reportId="report-fixture",rows=[{campaignId:"100",campaignName:"Fixture",cost:10,clicks:4,impressions:100,sales14d:50,purchases14d:2}];
  vi.mocked(fetch).mockImplementation(async(url,init)=>{
    const parsed=new URL(String(url));
    if(parsed.pathname==="/reporting/reports"){const body=JSON.parse(String(init?.body));expect(body).toMatchObject({startDate:"2026-09-03",endDate:"2026-09-09",configuration:{reportTypeId:"spCampaigns",timeUnit:"SUMMARY"}});return Response.json({reportId,status:"PENDING"});}
    if(parsed.pathname===`/reporting/reports/${reportId}`)return Response.json({reportId,status:"COMPLETED",url:"https://fixture.s3.amazonaws.com/report.gz"});
    if(parsed.hostname==="fixture.s3.amazonaws.com"){expect(init?.headers).toBeUndefined();return new Response(gzipSync(JSON.stringify(rows)));}
    return original(url,init);
  });
  await requestAdsReport("12345",7);const report=await checkAdsReport("12345");expect(report.rows).toEqual(rows);expect(performanceTotals(report.rows)).toMatchObject({cost:10,sales:50,acos:.2,roas:5});expect(performanceTotals([{campaignId:"1",cost:null}]).cost).toBeNull();await expect(downloadAdsReport("http://127.0.0.1/secrets")).rejects.toThrow("unsupported");
});
