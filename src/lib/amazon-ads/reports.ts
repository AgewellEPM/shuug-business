import { readFileSync,writeFileSync,renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { z } from "zod";
import { adsAccountKey,adsProfile,adsRequest,requireAdsConfig } from "./client";
import { amazonId,profileToday } from "./model";
import { adsDirectory } from "./store";
const amount=z.number().finite().nonnegative().nullable().optional();
const rowSchema=z.object({campaignId:amazonId,campaignName:z.string().optional(),impressions:amount,clicks:amount,cost:amount,purchases14d:amount,sales14d:amount});
export type PerformanceRow=z.infer<typeof rowSchema>;
export type PerformanceReport={id:string;profileId:string;accountKey:string;currency:string;startDate:string;endDate:string;status:string;updatedAt:string;rows:PerformanceRow[]};
function file(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw new Error("Invalid report account.");return path.join(adsDirectory(),`report-${key}.json`);}
export function savedReport(key:string):PerformanceReport|null {try{const report=JSON.parse(readFileSync(file(key),"utf8"));if(report.accountKey!==key||!Array.isArray(report.rows))throw new Error("Invalid report");return report;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw new Error("The saved Amazon report could not be read.");}}
function save(report:PerformanceReport){report.updatedAt=new Date().toISOString();const tmp=path.join(adsDirectory(),`report-${randomUUID()}.tmp`);writeFileSync(tmp,JSON.stringify(report),{mode:0o600});renameSync(tmp,file(report.accountKey));return report;}
export async function requestAdsReport(profileId:string,days:number){
  z.union([z.literal(7),z.literal(30)]).parse(days);const cfg=requireAdsConfig(),profile=await adsProfile(profileId,cfg),key=adsAccountKey(cfg,profileId);
  const today=new Date(`${profileToday(profile)}T00:00:00Z`),endDate=new Date(today.getTime()-86400000).toISOString().slice(0,10),startDate=new Date(today.getTime()-days*86400000).toISOString().slice(0,10);
  const prior=savedReport(key);if(prior&&prior.startDate===startDate&&prior.endDate===endDate&&["PENDING","PROCESSING"].includes(prior.status))return prior;
  const result=z.object({reportId:z.string().min(1),status:z.string()}).parse(await adsRequest(cfg,profileId,"/reporting/reports","POST",{name:`Shuug Sponsored Products ${startDate} to ${endDate}`,startDate,endDate,configuration:{adProduct:"SPONSORED_PRODUCTS",groupBy:["campaign"],columns:["campaignId","campaignName","impressions","clicks","cost","purchases14d","sales14d"],reportTypeId:"spCampaigns",timeUnit:"SUMMARY",format:"GZIP_JSON"}},"application/vnd.createasyncreportrequest.v3+json"));
  return save({id:result.reportId,profileId,accountKey:key,currency:profile.currencyCode,startDate,endDate,status:result.status,updatedAt:new Date().toISOString(),rows:[]});
}
export async function downloadAdsReport(value:string):Promise<PerformanceRow[]>{
  const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port||!/(?:^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname))throw new Error("Amazon returned an unsupported report download host.");
  // This is an Amazon-signed S3 URL. Never attach Ads credentials to the download.
  const response=await fetch(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.body)throw new Error("The report download expired or failed. Check report status again.");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>5_000_000)throw new Error("This report is too large. Request a 7-day report or use Amazon's reporting console.");chunks.push(part.value);}}
  finally{await reader.cancel();}
  const bytes=Buffer.concat(chunks),decoded=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes,{maxOutputLength:20_000_000}):bytes;
  return z.array(rowSchema).max(20000).parse(JSON.parse(decoded.toString("utf8")));
}
export async function checkAdsReport(profileId:string){
  const cfg=requireAdsConfig(),key=adsAccountKey(cfg,profileId),report=savedReport(key);if(!report)throw new Error("Request a performance report first.");await adsProfile(profileId,cfg);
  const result=z.object({reportId:z.string(),status:z.string(),url:z.string().nullable().optional()}).parse(await adsRequest(cfg,profileId,`/reporting/reports/${encodeURIComponent(report.id)}`,"GET"));
  if(result.reportId!==report.id)throw new Error("Amazon returned a different report. Request a new report.");
  if(result.status==="COMPLETED"){if(!result.url)throw new Error("Amazon has not supplied the report download yet.");report.rows=await downloadAdsReport(result.url);}
  report.status=result.status;return save(report);
}
export function performanceTotals(rows:PerformanceRow[]){
  const total=(key:"cost"|"sales14d"|"clicks"|"impressions"|"purchases14d")=>rows.some(r=>r[key]===undefined||r[key]===null)?null:rows.reduce((sum,r)=>sum+(r[key]??0),0);
  const cost=total("cost"),sales=total("sales14d");return {cost,sales,clicks:total("clicks"),impressions:total("impressions"),purchases:total("purchases14d"),acos:cost!==null&&sales!==null&&sales>0?cost/sales:null,roas:cost!==null&&sales!==null&&cost>0?sales/cost:null};
}
