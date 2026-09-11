import { z } from "zod";

export const amazonId = z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).transform(String);
export const profileSchema=z.object({profileId:amazonId,countryCode:z.string(),currencyCode:z.string(),timezone:z.string(),accountInfo:z.object({id:z.string(),type:z.string(),name:z.string().optional(),marketplaceStringId:z.string().optional(),validPaymentMethod:z.boolean().optional()})});
export type AdsProfile=z.infer<typeof profileSchema>;
export const productSchema=z.object({name:z.string().trim().min(1).max(200),asin:z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "Enter a 10-character Amazon ASIN."),sku:z.string().trim().max(100),localSkuId:z.string().max(100).optional()});
export type AdsProduct=z.infer<typeof productSchema>;
const phrase=z.string().trim().min(1).max(80);
export const planSchema=z.object({
  name:z.string().trim().min(1).max(100),profileId:z.string().regex(/^\d+$/),
  products:z.array(productSchema).min(1,"Choose at least one product.").max(30),
  targeting:z.enum(["AUTO","KEYWORDS","PRODUCTS"]),
  keywords:z.array(z.object({text:phrase,match:z.enum(["EXACT","PHRASE","BROAD"])})).max(100),
  targetAsins:z.array(z.string().toUpperCase().regex(/^[A-Z0-9]{10}$/)).max(100),negativeKeywords:z.array(phrase).max(100),
  dailyBudgetCents:z.number().int().min(100).max(100000),bidCents:z.number().int().min(2).max(10000),
  startDate:z.iso.date(),endDate:z.union([z.literal(""),z.iso.date()]),
}).superRefine((p,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(p.bidCents>p.dailyBudgetCents)issue("The bid must be no greater than the daily budget.");
  if(p.endDate&&p.endDate<p.startDate)issue("End date must be on or after the start date.");
  if(p.targeting==="KEYWORDS"&&!p.keywords.length)issue("Add at least one keyword.");
  if(p.targeting==="PRODUCTS"&&!p.targetAsins.length)issue("Add at least one target ASIN.");
  if(new Set(p.products.map(x=>`${x.asin}:${x.sku}`)).size!==p.products.length)issue("Remove repeated products.");
  if(new Set(p.products.filter(x=>x.sku).map(x=>x.sku)).size!==p.products.filter(x=>x.sku).length)issue("A seller SKU can only be added once.");
  if(new Set(p.keywords.map(k=>`${k.text.toLowerCase()}:${k.match}`)).size!==p.keywords.length)issue("Remove repeated keywords with the same match type.");
  if(new Set(p.targetAsins).size!==p.targetAsins.length)issue("Remove repeated target ASINs.");
  if(new Set(p.negativeKeywords.map(k=>k.toLowerCase())).size!==p.negativeKeywords.length)issue("Remove repeated negative keywords.");
  if(p.targeting==="KEYWORDS"&&p.keywords.some(k=>p.negativeKeywords.some(n=>` ${k.text.toLowerCase()} `.includes(` ${n.toLowerCase()} `))))issue("A negative phrase blocks one of your keywords. Remove that conflict.");
});
export type AdsPlan=z.infer<typeof planSchema>;
export const campaignSchema=z.object({campaignId:amazonId,name:z.string(),state:z.string(),targetingType:z.string(),startDate:z.string(),endDate:z.string().optional(),budget:z.object({budget:z.number(),budgetType:z.string()}),dynamicBidding:z.object({strategy:z.string()}).passthrough().optional()}).passthrough();
export type AdsCampaign=z.infer<typeof campaignSchema>;
export type CampaignReceipt={
  id:string;revision:number;createdAt:string;updatedAt:string;accountKey:string;profile:AdsProfile;plan:AdsPlan;
  status:"draft"|"creating"|"paused"|"active"|"attention";step:string;message:string;
  campaignId?:string;adGroupId?:string;adIds:string[];targetIds:string[];negativeIds:string[];
  complete:boolean;lastObservedState?:string;
};
export function profileToday(profile:AdsProfile,now=new Date()) {return new Intl.DateTimeFormat("en-CA",{timeZone:profile.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(now);}
export function validateProfilePlan(plan:AdsPlan,profile:AdsProfile) {
  if(plan.profileId!==profile.profileId)throw new Error("The advertising account changed. Review the campaign again.");
  if(!["seller","vendor"].includes(profile.accountInfo.type.toLowerCase()))throw new Error("Choose a seller or vendor advertising account.");
  if(!["USD","CAD","GBP","EUR","AUD"].includes(profile.currencyCode))throw new Error("This builder currently supports USD, CAD, GBP, EUR and AUD advertising accounts.");
  if(profile.accountInfo.validPaymentMethod===false)throw new Error("Add a valid payment method in Amazon Ads first.");
  if(profile.accountInfo.type.toLowerCase()==="seller"&&plan.products.some(p=>!p.sku))throw new Error("Enter the Amazon seller SKU for every product. It can differ from your local SKU.");
  if(plan.startDate<profileToday(profile))throw new Error("Choose today or a future start date in the advertising account’s time zone.");
}
export function amazonCampaignName(r:CampaignReceipt){return `${r.plan.name} [Shuug ${r.id.slice(0,8)}]`;}
export function productLink(asin:string,country:string){const domain:Record<string,string>={US:"amazon.com",CA:"amazon.ca",GB:"amazon.co.uk",UK:"amazon.co.uk",DE:"amazon.de",FR:"amazon.fr",IT:"amazon.it",ES:"amazon.es",AU:"amazon.com.au",NL:"amazon.nl",IE:"amazon.ie"};return `https://www.${domain[country]||"amazon.com"}/dp/${encodeURIComponent(asin)}`;}
