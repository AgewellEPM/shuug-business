/** Amazon Orders API 2026-01-01; LWA refresh, bounded pagination and durable snapshots. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { setting } from "../connections/vault";
import { mapPipelineOrder, amazonOrderSchema, type PipelineOrder } from "./pipeline";
import { accountKey, readAmazon, saveAmazon, type AmazonState } from "./store";
export interface AmazonConfig {clientId:string;clientSecret:string;refreshToken:string;marketplaceId:string;region:"na"|"eu"|"fe"}
export function getAmazonConfig():AmazonConfig|null {
  const clientId=setting("AMAZON_SP_CLIENT_ID"),clientSecret=setting("AMAZON_SP_CLIENT_SECRET"),refreshToken=setting("AMAZON_SP_REFRESH_TOKEN"),marketplaceId=setting("AMAZON_SP_MARKETPLACE_ID"),region=setting("AMAZON_SP_REGION")||"na";
  if(!clientId||!clientSecret||!refreshToken||!marketplaceId||!['na','eu','fe'].includes(region))return null;
  return {clientId,clientSecret,refreshToken,marketplaceId,region:region as AmazonConfig["region"]};
}
export const amazonConfigured=()=>!!getAmazonConfig();
const HOST={na:"https://sellingpartnerapi-na.amazon.com",eu:"https://sellingpartnerapi-eu.amazon.com",fe:"https://sellingpartnerapi-fe.amazon.com"};
const cache=new Map<string,{token?:string;expires:number;pending?:Promise<string>}>();
export async function lwaAccessToken(cfg:AmazonConfig,force=false):Promise<string>{
  const key=createHash("sha256").update(cfg.clientId+cfg.refreshToken+cfg.clientSecret).digest("hex");let entry=cache.get(key);if(!entry){entry={expires:0};cache.set(key,entry);}if(entry.pending)return entry.pending;if(!force&&entry.token&&entry.expires>Date.now()+60000)return entry.token;
  const current=entry;current.pending=(async()=>{const res=await fetch("https://api.amazon.com/auth/o2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:cfg.refreshToken,client_id:cfg.clientId,client_secret:cfg.clientSecret}),cache:"no-store",signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`Amazon authorization failed (${res.status}). Check or reconnect the Selling Partner app.`);const d=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await res.json());current.token=d.access_token;current.expires=Date.now()+d.expires_in*1000;return d.access_token;})();try{return await current.pending;}finally{current.pending=undefined;}
}
async function page(cfg:AmazonConfig,params:URLSearchParams){
  let token=await lwaAccessToken(cfg);
  for(let attempt=0;attempt<2;attempt++){
    const res=await fetch(`${HOST[cfg.region]}/orders/2026-01-01/orders?${params}`,{headers:{"x-amz-access-token":token,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(25000)});
    if(res.status===401&&attempt===0){token=await lwaAccessToken(cfg,true);continue;}
    if(!res.ok)throw new Error(res.status===429?"Amazon's request limit was reached. Wait a few minutes, then continue syncing.":`Amazon Orders returned ${res.status}. Check the marketplace, app roles and connection.`);
    return z.object({orders:z.array(amazonOrderSchema),pagination:z.object({nextToken:z.string().optional()}).optional()}).parse(await res.json());
  }
  throw new Error("Reconnect Amazon to continue.");
}
export interface AmazonPullResult {ok:boolean;orders:PipelineOrder[];state?:AmazonState;error?:string}
export async function testAmazonConnection(){const cfg=getAmazonConfig();if(!cfg)throw new Error("Add your Amazon app credentials in Settings.");const params=new URLSearchParams({marketplaceIds:cfg.marketplaceId,createdAfter:new Date(Date.now()-86400000).toISOString(),maxResultsPerPage:"1",includedData:"FULFILLMENT,PACKAGES,PROCEEDS,PAYMENT"});await page(cfg,params);return `Orders API connected · ${cfg.marketplaceId}`;}
const running=new Map<string,Promise<AmazonPullResult>>();
export async function pullAmazonOrders(days=30,continueSync=false):Promise<AmazonPullResult>{
  const cfg=getAmazonConfig();if(!cfg)return {ok:false,orders:[],error:"Connect Amazon in Settings to load live orders."};
  const key=accountKey(cfg);if(running.has(key))return running.get(key)!;
  const work=(async():Promise<AmazonPullResult>=>{
    const prior=readAmazon(key),orders:PipelineOrder[]=[];
    const count=z.number().int().min(1).max(365).parse(days),before=continueSync&&prior.nextToken?prior.before!:new Date(Date.now()-120000).toISOString();
    const after=continueSync&&prior.nextToken?prior.after!:new Date(Date.now()-count*86400000).toISOString();
    let next=continueSync?prior.nextToken:undefined;
    const visited=new Set<string>();
    // Updated-time windows catch old orders that have just been shipped.
    for(let i=0;i<10;i++){
      if(next)visited.add(next);
      const params=new URLSearchParams({marketplaceIds:cfg.marketplaceId,lastUpdatedAfter:after,lastUpdatedBefore:before,maxResultsPerPage:"100",includedData:"FULFILLMENT,PACKAGES,PROCEEDS,PAYMENT"});if(next)params.set("paginationToken",next);
      try {const result=await page(cfg,params);orders.push(...result.orders.map(mapPipelineOrder));const following=result.pagination?.nextToken;if(following&&visited.has(following))throw new Error("Amazon returned a repeated page token. Start a fresh sync.");next=following;}
      catch(e){if(orders.length){const state=saveAmazon(key,orders,{partial:true,nextToken:next,after,before});return {ok:false,orders:state.orders,state,error:e instanceof Error?e.message:"Sync stopped. Saved orders are still available."};}throw e;}
      if(!next)break;
    }
    const state=saveAmazon(key,orders,{partial:!!next,nextToken:next,after,before});return {ok:true,orders:state.orders,state};
  })().catch((e):AmazonPullResult=>({ok:false,orders:[],error:e instanceof Error?e.message:"Amazon sync failed."}));
  running.set(key,work);try{return await work;}finally{running.delete(key);}
}
