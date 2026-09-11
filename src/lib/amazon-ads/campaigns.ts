import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adsAccountKey,adsProfile,adsRequest,batchResult,getAdsCampaign,MEDIA,requireAdsConfig,type AdsConfig,type BatchResult } from "./client";
import { amazonCampaignName,planSchema,profileToday,validateProfilePlan,type AdsPlan,type CampaignReceipt } from "./model";
import { claimSubmission,readReceipt,withReceiptLock,writeReceipt } from "./store";

function boundReceipt(id:string){const r=readReceipt(id),cfg=requireAdsConfig();if(r.accountKey!==adsAccountKey(cfg,r.profile.profileId))throw new Error("This draft belongs to another Amazon Ads authorization. Reconnect its account or create a new draft.");return {r,cfg};}
export async function saveAdsDraft(input:AdsPlan,id:string=randomUUID(),revision=0){
  const plan=planSchema.parse(input),cfg=requireAdsConfig(),profile=await adsProfile(plan.profileId,cfg);validateProfilePlan(plan,profile);
  z.uuid().parse(id);z.number().int().nonnegative().parse(revision);
  return withReceiptLock(id,async()=>{
    let previous:CampaignReceipt|undefined;
    try{previous=readReceipt(id);}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
    if(previous&&(previous.revision!==revision||previous.status!=="draft"))throw new Error("This draft changed or was submitted. Reopen it before making changes.");
    if(previous&&previous.accountKey!==adsAccountKey(cfg,plan.profileId))throw new Error("Create a new draft when changing advertising accounts.");
    if(!previous&&revision!==0)throw new Error("The original draft is missing. Create a new draft.");
    const now=new Date().toISOString();
    return writeReceipt({id,revision:revision+1,createdAt:previous?.createdAt||now,updatedAt:now,accountKey:adsAccountKey(cfg,plan.profileId),profile,plan,status:"draft",step:"review",message:"Draft saved. Review its products, targeting and budget before creating the campaign in Amazon.",adIds:[],targetIds:[],negativeIds:[],complete:false});
  });
}
export async function submitAdsDraft(id:string,revision:number){return withReceiptLock(id,async()=>{
  const {r,cfg}=boundReceipt(id);
  if(r.status!=="draft")return r;
  if(r.revision!==revision)throw new Error("The draft changed. Review the saved version before submitting.");
  const profile=await adsProfile(r.plan.profileId,cfg);validateProfilePlan(r.plan,profile);
  if(profile.currencyCode!==r.profile.currencyCode||profile.accountInfo.id!==r.profile.accountInfo.id)throw new Error("The advertising account changed. Save and review the draft again.");
  if(!claimSubmission(id)){r.status="attention";r.message="This submission was already attempted. Check its campaign reference in Amazon; it will not be sent twice.";return writeReceipt(r);}
  r.status="creating";r.revision++;writeReceipt(r);
  const p=r.plan;
  async function create(step:string,endpoint:string,key:keyof typeof MEDIA,idField:string,items:unknown[],apply:(result:BatchResult,data:unknown)=>void){
    r.step=step;r.message=`Creating ${step} in Amazon…`;writeReceipt(r);
    const data=await adsRequest(cfg,p.profileId,endpoint,"POST",{[key]:items},MEDIA[key],true);
    const result=batchResult(data,key,idField,items.length);apply(result,data);writeReceipt(r);
    if(result.errors.length)throw new Error(result.errors.join(" "));
  }
  try{
    await create("campaign","/sp/campaigns","campaigns","campaignId",[{name:amazonCampaignName(r),state:"PAUSED",targetingType:p.targeting==="AUTO"?"AUTO":"MANUAL",startDate:p.startDate,...(p.endDate?{endDate:p.endDate}:{}),budget:{budgetType:"DAILY",budget:p.dailyBudgetCents/100},dynamicBidding:{strategy:"LEGACY_FOR_SALES",placementBidding:[]}}],result=>{r.campaignId=result.ids[0];});
    await create("ad group","/sp/adGroups","adGroups","adGroupId",[{campaignId:r.campaignId,name:"Selected products",defaultBid:p.bidCents/100,state:"ENABLED"}],result=>{r.adGroupId=result.ids[0];});
    const context={campaignId:r.campaignId!,adGroupId:r.adGroupId!,state:"ENABLED"};
    await create("product ads","/sp/productAds","productAds","adId",p.products.map(product=>({...context,...(profile.accountInfo.type.toLowerCase()==="seller"?{sku:product.sku}:{asin:product.asin})})),(result,data)=>{
      r.adIds=result.ids;
      // Seller SKUs may point at a different ASIN than the user entered. Verify the
      // returned representation before allowing a campaign to become active.
      const representation=z.object({productAds:z.object({success:z.array(z.object({index:z.number().int(),productAd:z.object({asin:z.string(),sku:z.string().optional()}).optional()}))})}).parse(data);
      for(const item of representation.productAds.success){const selected=p.products[item.index];if(!item.productAd||item.productAd.asin!==selected?.asin||(profile.accountInfo.type.toLowerCase()==="seller"&&item.productAd.sku!==selected.sku)){writeReceipt(r);throw new Error("Amazon's product identifier did not match the reviewed product, or its details were missing. The campaign stays paused; inspect the product ads in Amazon.");}}
    });
    if(p.targeting==="KEYWORDS")await create("keywords","/sp/keywords","keywords","keywordId",p.keywords.map(k=>({...context,keywordText:k.text,matchType:k.match,bid:p.bidCents/100})),result=>{r.targetIds=result.ids;});
    if(p.targeting==="PRODUCTS")await create("product targets","/sp/targets","targetingClauses","targetId",p.targetAsins.map(asin=>({...context,expressionType:"MANUAL",expression:[{type:"ASIN_SAME_AS",value:asin}],bid:p.bidCents/100})),result=>{r.targetIds=result.ids;});
    if(p.negativeKeywords.length)await create("negative keywords","/sp/negativeKeywords","negativeKeywords","negativeKeywordId",p.negativeKeywords.map(keywordText=>({...context,keywordText,matchType:"NEGATIVE_PHRASE"})),result=>{r.negativeIds=result.ids;});
    r.complete=true;r.status="paused";r.step="ready";r.message="Campaign and all selected ads were created. The campaign is paused. Review it before launching.";
  }catch(e){r.status="attention";r.message=`Stopped at ${r.step}. ${e instanceof Error?e.message:"Amazon did not confirm the operation."} Any campaign created by this submission was requested paused. Check its actual status in Amazon.`;}
  return writeReceipt(r);
});}

export async function observeAdsDraft(id:string){return withReceiptLock(id,async()=>{
  const {r,cfg}=boundReceipt(id);if(!r.campaignId)return r;
  await adsProfile(r.profile.profileId,cfg);const live=await getAdsCampaign(r.profile.profileId,r.campaignId,cfg);r.lastObservedState=live.state;
  if(r.complete&&(live.state==="PAUSED"||live.state==="ENABLED")){r.status=live.state==="PAUSED"?"paused":"active";r.message=`Amazon reports this campaign as ${live.state.toLowerCase()}.`;}
  else r.message=`Amazon reports ${live.state.toLowerCase()}. This submission is incomplete; review its resources in Amazon before enabling it.`;
  return writeReceipt(r);
});}
export async function setAdsDraftState(id:string,revision:number,enabled:boolean){return withReceiptLock(id,async()=>{
  z.boolean().parse(enabled);const {r,cfg}=boundReceipt(id);if(!r.campaignId)throw new Error("Create the campaign first.");
  if(r.revision!==revision)throw new Error("The campaign changed. Reload its status and review again.");
  const profile=await adsProfile(r.profile.profileId,cfg),live=await getAdsCampaign(r.profile.profileId,r.campaignId,cfg);
  if(enabled){
    if(!r.complete)throw new Error("This submission is incomplete. Inspect it in Amazon before enabling any ads.");
    if(profile.currencyCode!==r.profile.currencyCode||profile.accountInfo.id!==r.profile.accountInfo.id||profile.accountInfo.validPaymentMethod===false)throw new Error("The account or its payment settings changed. Check Amazon Ads first.");
    if(live.name!==amazonCampaignName(r)||live.budget.budgetType!=="DAILY"||Math.round(live.budget.budget*100)!==r.plan.dailyBudgetCents||live.startDate!==r.plan.startDate||(live.endDate||"")!==r.plan.endDate||live.targetingType!==(r.plan.targeting==="AUTO"?"AUTO":"MANUAL")||live.dynamicBidding?.strategy!=="LEGACY_FOR_SALES")throw new Error("Amazon's campaign settings differ from this review. Manage the changed campaign in Amazon Ads.");
    if(live.endDate&&live.endDate<profileToday(profile))throw new Error("The campaign end date has passed. Update its schedule in Amazon Ads.");
    const placements=live.dynamicBidding?.placementBidding;
    if(placements!==undefined&&(!Array.isArray(placements)||placements.some(p=>!p||typeof p!=="object"||p.percentage!==0)))throw new Error("Amazon placement bid increases differ from the reviewed budget. Review those changes in Amazon Ads.");
    if(!["PAUSED","ENABLED"].includes(live.state))throw new Error("This campaign cannot be launched in its current state.");
    await verifyLaunchResources(r,cfg);
  }
  const state=enabled?"ENABLED":"PAUSED";
  if(live.state===state){r.status=enabled?"active":"paused";r.lastObservedState=state;r.message=`Amazon already reports this campaign as ${state.toLowerCase()}.`;return writeReceipt(r);}
  r.revision++;r.status="attention";r.step=enabled?"launch":"pause";r.message=`${enabled?"Launch":"Pause"} requested; waiting for Amazon confirmation.`;writeReceipt(r);
  try{const data=await adsRequest(cfg,r.profile.profileId,"/sp/campaigns","PUT",{campaigns:[{campaignId:r.campaignId,state}]},MEDIA.campaigns,true),result=batchResult(data,"campaigns","campaignId",1);if(result.errors.length||result.ids[0]!==r.campaignId)throw new Error(result.errors.join(" ")||"Amazon did not confirm the expected campaign.");r.status=enabled?"active":"paused";r.lastObservedState=state;r.message=enabled?"Amazon accepted the launch. Delivery depends on your schedule, product eligibility and Amazon review.":"Amazon accepted the pause request.";}
  catch(e){r.message=`${e instanceof Error?e.message:"Amazon did not confirm the change."} Use Check Amazon status before trying again.`;}
  return writeReceipt(r);
});}

/** Recheck live children so edits made in Amazon cannot bypass the saved review. */
async function verifyLaunchResources(r:CampaignReceipt,cfg:AdsConfig){
  const p=r.plan;
  async function list(endpoint:string,key:keyof typeof MEDIA){
    const response=z.record(z.string(),z.unknown()).parse(await adsRequest(cfg,p.profileId,`${endpoint}/list`,"POST",{campaignIdFilter:{include:[r.campaignId]},maxResults:100},MEDIA[key]));
    const rows=z.array(z.record(z.string(),z.unknown())).parse(response[key]);
    if(response.nextToken||(typeof response.totalResults==="number"&&response.totalResults>rows.length))throw new Error("Amazon has additional campaign resources beyond this review. Review the campaign in Amazon Ads.");
    return rows.filter(row=>row.state!=="ARCHIVED");
  }
  const changed=()=>{throw new Error("Products, bids or targeting changed in Amazon after this campaign was reviewed. Review those changes in Amazon Ads before launching.");};
  const groups=await list("/sp/adGroups","adGroups");
  if(groups.length!==1||String(groups[0].adGroupId)!==r.adGroupId||Number(groups[0].defaultBid)!==p.bidCents/100||groups[0].state!=="ENABLED")changed();
  const ads=await list("/sp/productAds","productAds");
  if(ads.length!==p.products.length||ads.some(ad=>!r.adIds.includes(String(ad.adId))||ad.state!=="ENABLED"||String(ad.adGroupId)!==r.adGroupId||!p.products.some(product=>product.asin===ad.asin&&(r.profile.accountInfo.type.toLowerCase()!=="seller"||product.sku===ad.sku))))changed();
  const keywords=await list("/sp/keywords","keywords");
  if(p.targeting==="KEYWORDS"){
    if(keywords.length!==p.keywords.length||keywords.some(k=>!r.targetIds.includes(String(k.keywordId))||k.state!=="ENABLED"||String(k.adGroupId)!==r.adGroupId||k.bid!==p.bidCents/100||!p.keywords.some(selected=>selected.text===k.keywordText&&selected.match===k.matchType)))changed();
  }else if(keywords.length)changed();
  const targets=await list("/sp/targets","targetingClauses");
  if(p.targeting==="PRODUCTS"){
    if(targets.length!==p.targetAsins.length||targets.some(t=>!r.targetIds.includes(String(t.targetId))||t.state!=="ENABLED"||String(t.adGroupId)!==r.adGroupId||t.bid!==p.bidCents/100||t.expressionType!=="MANUAL"||!Array.isArray(t.expression)||t.expression.length!==1||t.expression[0]?.type!=="ASIN_SAME_AS"||!p.targetAsins.includes(t.expression[0]?.value)))changed();
  }else if(p.targeting==="AUTO"){
    if(!targets.length||targets.some(t=>t.state!=="ENABLED"||String(t.adGroupId)!==r.adGroupId||t.expressionType!=="AUTO"||(t.bid!=null&&t.bid!==p.bidCents/100)))changed();
  }else if(targets.length)changed();
  const negatives=await list("/sp/negativeKeywords","negativeKeywords");
  if(negatives.length!==p.negativeKeywords.length||negatives.some(n=>!r.negativeIds.includes(String(n.negativeKeywordId))||n.state!=="ENABLED"||String(n.adGroupId)!==r.adGroupId||n.matchType!=="NEGATIVE_PHRASE"||!p.negativeKeywords.includes(String(n.keywordText))))changed();
}
