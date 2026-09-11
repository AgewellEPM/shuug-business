"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { adsAccountKey,adsProfile,listAdsCampaigns,listAdsProfiles,listAdvertisedProducts,requireAdsConfig } from "@/lib/amazon-ads/client";
import { observeAdsDraft,saveAdsDraft,setAdsDraftState,submitAdsDraft } from "@/lib/amazon-ads/campaigns";
import { listReceipts } from "@/lib/amazon-ads/store";
import { checkAdsReport,requestAdsReport,savedReport } from "@/lib/amazon-ads/reports";
import type { AdsPlan } from "@/lib/amazon-ads/model";
async function run<T>(action:()=>Promise<T>){try{await requireWorkspaceAccess();const result=await action();revalidatePath("/amazon-marketing");return {ok:true as const,result};}catch(e){return {ok:false as const,error:e instanceof z.ZodError?e.issues[0]?.message||"Check the campaign details.":e instanceof Error?e.message:"Amazon Ads could not complete the request."};}}
export async function loadAdsAccountsAction(){
  await requireSectionAccess("marketing", "view");
return run(()=>listAdsProfiles());}
export async function loadAdsWorkspaceAction(profileId:string){
  await requireSectionAccess("marketing", "view");
return run(async()=>{z.string().regex(/^\d+$/).parse(profileId);const cfg=requireAdsConfig(),profile=await adsProfile(profileId,cfg),accountKey=adsAccountKey(cfg,profileId);const campaigns=await listAdsCampaigns(profileId,undefined,cfg);return {profile,campaigns,receipts:listReceipts().filter(r=>r.accountKey===accountKey),report:savedReport(accountKey)};});}
export async function moreAdsCampaignsAction(profileId:string,nextToken:string){
  await requireSectionAccess("marketing", "view");
return run(async()=>{z.string().max(4000).parse(nextToken);await adsProfile(profileId);return listAdsCampaigns(profileId,nextToken);});}
export async function advertisedProductsAction(profileId:string,nextToken?:string){
  await requireSectionAccess("marketing", "view");
return run(async()=>{z.string().max(4000).optional().parse(nextToken);await adsProfile(profileId);return listAdvertisedProducts(profileId,nextToken);});}
export async function saveAdsDraftAction(plan:AdsPlan,id?:string,revision?:number){
  await requireSectionAccess("marketing", "edit");
return run(()=>saveAdsDraft(plan,id,revision));}
export async function submitAdsDraftAction(id:string,revision:number){
  await requireSectionAccess("marketing", "edit");
return run(()=>submitAdsDraft(id,revision));}
export async function adsDraftStateAction(id:string,revision:number,enabled:boolean){
  await requireSectionAccess("marketing", "edit");
return run(()=>setAdsDraftState(id,revision,enabled));}
export async function observeAdsDraftAction(id:string){
  await requireSectionAccess("marketing", "edit");
return run(()=>observeAdsDraft(id));}
export async function requestAdsReportAction(profileId:string,days:number){
  await requireSectionAccess("marketing", "edit");
return run(()=>requestAdsReport(profileId,days));}
export async function checkAdsReportAction(profileId:string){
  await requireSectionAccess("marketing", "edit");
return run(()=>checkAdsReport(profileId));}
