import { createHash } from "node:crypto";
import { z } from "zod";
import { setting } from "../connections/vault";
import { amazonId,campaignSchema,profileSchema,type AdsProduct } from "./model";

export type AdsConfig={clientId:string;clientSecret:string;refreshToken:string;region:"na"|"eu"|"fe"};
export const ADS_HOSTS={na:"https://advertising-api.amazon.com",eu:"https://advertising-api-eu.amazon.com",fe:"https://advertising-api-fe.amazon.com"};
export const LWA_HOSTS={na:"https://api.amazon.com",eu:"https://api.amazon.co.uk",fe:"https://api.amazon.co.jp"};
export function getAdsConfig(requireToken=true):AdsConfig|null {
  const clientId=setting("AMAZON_ADS_CLIENT_ID"),clientSecret=setting("AMAZON_ADS_CLIENT_SECRET"),refreshToken=setting("AMAZON_ADS_REFRESH_TOKEN"),region=setting("AMAZON_ADS_REGION")||"na";
  if(!clientId||!clientSecret||(requireToken&&!refreshToken)||!['na','eu','fe'].includes(region))return null;
  return {clientId,clientSecret,refreshToken,region:region as AdsConfig["region"]};
}
export function requireAdsConfig(){const cfg=getAdsConfig();if(!cfg)throw new Error("Connect Amazon Ads in Settings first.");return cfg;}
export function adsAccountKey(cfg:AdsConfig,profileId:string){return createHash("sha256").update([cfg.clientId,cfg.refreshToken,cfg.region,profileId].join("|")).digest("hex");}
const tokenSchema=z.object({access_token:z.string().min(1),expires_in:z.number().positive(),refresh_token:z.string().optional()});
export async function exchangeAdsToken(cfg:AdsConfig,body:Record<string,string>){
  const res=await fetch(`${LWA_HOSTS[cfg.region]}/auth/o2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...body,client_id:cfg.clientId,client_secret:cfg.clientSecret}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw new Error(`Amazon Ads authorization failed (${res.status}). Check app approval and reconnect.`);
  return tokenSchema.parse(await res.json());
}
const tokens=new Map<string,{token?:string;expires:number;pending?:Promise<string>}>();
export async function adsAccessToken(cfg:AdsConfig,force=false):Promise<string>{
  const key=adsAccountKey(cfg,cfg.clientSecret);let entry=tokens.get(key);if(!entry){entry={expires:0};tokens.set(key,entry);}if(entry.pending)return entry.pending;if(!force&&entry.token&&entry.expires>Date.now()+60000)return entry.token;
  const current=entry;current.pending=exchangeAdsToken(cfg,{grant_type:"refresh_token",refresh_token:cfg.refreshToken}).then(r=>{current.token=r.access_token;current.expires=Date.now()+r.expires_in*1000;return r.access_token;});
  try{return await current.pending;}finally{current.pending=undefined;}
}
export class AdsRequestError extends Error {constructor(message:string,readonly uncertain:boolean){super(message);}}
export async function adsRequest(cfg:AdsConfig,profileId:string|null,path:string,method:"GET"|"POST"|"PUT",body?:unknown,media="application/json",write=false):Promise<unknown>{
  let token=await adsAccessToken(cfg);
  for(let i=0;i<2;i++){
    let res:Response;
    try{res=await fetch(`${ADS_HOSTS[cfg.region]}${path}`,{method,headers:{Authorization:`Bearer ${token}`,"Amazon-Advertising-API-ClientId":cfg.clientId,...(profileId?{"Amazon-Advertising-API-Scope":profileId}:{}),Accept:media,...(body?{"Content-Type":media}:{}),...(write?{Prefer:"return=representation"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(25000)});}
    catch{throw new AdsRequestError(write?"Amazon did not confirm the write. Check the saved submission and Amazon before trying another campaign.":"Amazon Ads could not be reached. Try again.",write);}
    if(res.status===401&&i===0){token=await adsAccessToken(cfg,true);continue;}
    if(!res.ok)throw new AdsRequestError(res.status===429?"Amazon Ads rate limit reached. Wait before retrying.":`Amazon Ads returned ${res.status}. Check account access and the campaign details.`,write&&res.status>=500);
    try{return await res.json();}catch{throw new AdsRequestError("Amazon Ads returned an unreadable response. Check the saved submission before retrying.",write);}
  }
  throw new AdsRequestError("Reconnect Amazon Ads to continue.",false);
}
export const MEDIA={campaigns:"application/vnd.spCampaign.v3+json",adGroups:"application/vnd.spAdGroup.v3+json",productAds:"application/vnd.spProductAd.v3+json",keywords:"application/vnd.spKeyword.v3+json",targetingClauses:"application/vnd.spTargetingClause.v3+json",negativeKeywords:"application/vnd.spNegativeKeyword.v3+json"};
export async function listAdsProfiles(cfg=requireAdsConfig()){return z.array(profileSchema).parse(await adsRequest(cfg,null,"/v2/profiles","GET"));}
export async function adsProfile(id:string,cfg=requireAdsConfig()){const profile=(await listAdsProfiles(cfg)).find(p=>p.profileId===id);if(!profile)throw new Error("That advertising account is no longer authorized. Choose an account again.");return profile;}
export async function testAmazonAdsConnection(){const profiles=await listAdsProfiles();return `${profiles.length} advertising account${profiles.length===1?"":"s"} available. Choose your account in Amazon Marketing.`;}
export async function listAdsCampaigns(profileId:string,nextToken?:string,cfg=requireAdsConfig()){
  return z.object({campaigns:z.array(campaignSchema),nextToken:z.string().optional(),totalResults:z.number().optional()}).parse(await adsRequest(cfg,profileId,"/sp/campaigns/list","POST",{maxResults:100,...(nextToken?{nextToken}:{}),stateFilter:{include:["ENABLED","PAUSED"]}},MEDIA.campaigns));
}
export async function getAdsCampaign(profileId:string,campaignId:string,cfg=requireAdsConfig()){
  const result=z.object({campaigns:z.array(campaignSchema)}).parse(await adsRequest(cfg,profileId,"/sp/campaigns/list","POST",{campaignIdFilter:{include:[campaignId]},maxResults:1},MEDIA.campaigns));
  const campaign=result.campaigns.find(c=>c.campaignId===campaignId);if(!campaign)throw new Error("This campaign was not found in the selected account.");return campaign;
}
export async function listAdvertisedProducts(profileId:string,nextToken?:string,cfg=requireAdsConfig()){
  const result=z.object({productAds:z.array(z.object({adId:amazonId,asin:z.string().optional(),sku:z.string().optional(),state:z.string()})),nextToken:z.string().optional()}).parse(await adsRequest(cfg,profileId,"/sp/productAds/list","POST",{maxResults:100,...(nextToken?{nextToken}:{}),stateFilter:{include:["ENABLED","PAUSED"]}},MEDIA.productAds));
  const products:AdsProduct[]=result.productAds.filter(p=>p.asin&&/^[A-Z0-9]{10}$/.test(p.asin)).map(p=>({asin:p.asin!,sku:p.sku||"",name:p.sku||p.asin!}));
  return {products:[...new Map(products.map(p=>[`${p.asin}:${p.sku}`,p])).values()],nextToken:result.nextToken};
}
export type BatchResult={ids:string[];errors:string[]};
export function batchResult(data:unknown,key:string,idField:string,expected:number):BatchResult{
  const container=z.record(z.string(),z.unknown()).parse(data),group=z.object({success:z.array(z.record(z.string(),z.unknown())),error:z.array(z.record(z.string(),z.unknown()))}).parse(container[key]);
  const indices=new Set<number>(),ids:string[]=[];
  for(const row of group.success){const index=z.number().int().min(0).max(expected-1).parse(row.index);if(indices.has(index))throw new AdsRequestError("Amazon repeated an item result. Check the submission in Amazon.",true);indices.add(index);ids.push(amazonId.parse(row[idField]));}
  // Do not return arbitrary provider messages, which can contain credentials or payload data.
  if(new Set(ids).size!==ids.length)throw new AdsRequestError("Amazon repeated a resource ID. Inspect the campaign before continuing.",true);
  const errors=group.error.map(row=>`Item ${typeof row.index==="number"?row.index+1:"?"}: Amazon rejected this item. Review eligibility, identifiers and targeting in Amazon Ads.`);
  if(group.success.length+group.error.length!==expected)errors.push("Amazon did not report every submitted item. Check the campaign before continuing.");
  return {ids,errors};
}
