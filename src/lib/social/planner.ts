import { randomUUID } from "node:crypto";
import { loadWorkspace } from "../data/workspace";
import { SKUS } from "../data/seed";
import { historicalSales } from "../history/calculate";
import { businessDay } from "../history/dates";
import type { HistoricalSale } from "../history/model";
import { campaignFields, type SocialState, type SocialCampaign } from "./model";
import { changeSocial,readSocial } from "./store";
import { accountInsights } from "./insights";

export const offsetDay=(day:string,n:number)=>new Date(Date.parse(`${day}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
export interface MarketingSignals {start:string;end:string;orders:number;revenueCents:number;previousRevenueCents:number;estimatedOrders:number;demo:boolean;products:{id:string;name:string;quantity:number;revenueCents:number;profitCents:number|null}[];facts:string[];topSalesWeekday?:number;formatTests?:{platform:string;format:string;reason:string}[];traffic:{sessions:number|null;purchases:number|null;topSource:string;at:string;start:string;end:string}|null}
export function analyzeSales(sales:HistoricalSale[],state:SocialState,today:string,demo:boolean):MarketingSignals {
  const end=offsetDay(today,-1),start=offsetDay(today,-28),prior=offsetDay(start,-28),recent=sales.filter(s=>s.status!=="cancelled"&&s.date>=start&&s.date<=end),previous=sales.filter(s=>s.status!=="cancelled"&&s.date>=prior&&s.date<start);
  const products=new Map<string,MarketingSignals["products"][number]>();
  for(const sale of recent)for(const p of sale.products){const row=products.get(p.id)||{id:p.id,name:p.name,quantity:0,revenueCents:0,profitCents:0};row.quantity+=p.quantity;row.revenueCents+=p.revenueCents;row.profitCents=row.profitCents===null||p.costCents===null?null:row.profitCents+p.revenueCents-p.costCents;products.set(p.id,row);}
  const report=state.traffic.at(-1),traffic=report?{sessions:report.start>start||report.end<end?null:report.daily.filter(d=>d.date>=start&&d.date<=end).reduce((n,d)=>n+d.sessions,0),purchases:report.start>start||report.end<end?null:report.daily.filter(d=>d.date>=start&&d.date<=end).reduce((n,d)=>n+d.purchases,0),topSource:[...report.sources].sort((a,b)=>b.sessions-a.sessions)[0]?.name||"",at:report.at,start:report.start,end:report.end}:null;
  const sorted=[...products.values()].sort((a,b)=>(b.profitCents??-Infinity)-(a.profitCents??-Infinity)||b.revenueCents-a.revenueCents);
  const facts=[`${recent.length} ${demo?"workspace orders (includes demo history)":"saved workspace orders"} from ${start} through ${end}.`,...(recent.some(s=>s.estimated)?["Some historical product costs use current SKU costs; the associated profit is estimated."]:[]),...(sorted[0]?[`${sorted[0].name}: ${sorted[0].quantity} units in those orders; ${sorted[0].profitCents===null?"cost is incomplete":`$${(sorted[0].profitCents/100).toFixed(2)} gross profit before operating and marketing expenses`}.`]:["No sales in the last 28 complete days. Start with a measured product introduction test."]),...(traffic?[`GA4 report ${report!.start}–${report!.end}, refreshed ${report!.at.slice(0,10)}. Its sales attribution is separate from the order ledger.`]:["Website traffic is not connected. No visitor or conversion figures have been assumed."])];
  const weekdays=Array.from({length:7},()=>0);for(const sale of recent)weekdays[new Date(`${sale.date}T12:00:00Z`).getUTCDay()]++;
  const topSalesWeekday=recent.length>=10?weekdays.indexOf(Math.max(...weekdays)):undefined;
  if(topSalesWeekday!==undefined)facts.push(`${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][topSalesWeekday]} had the most recorded orders (${weekdays[topSalesWeekday]}) in this window. Test an earlier post that day; this is not proof of a best posting time.`);
  const formatTests:NonNullable<MarketingSignals["formatTests"]>=[];
  for(const account of state.accounts.filter(a=>!a.disabled&&a.role==="brand")) {
    const insight=accountInsights(account,state),formats=new Map<string,{sum:number;count:number}>();
    for(const p of insight.latest?.posts??[])if(p.publishedAt.slice(0,10)>=start&&p.publishedAt.slice(0,10)<=end&&p.metrics.likes!==null&&p.metrics.comments!==null){const f=formats.get(p.format)??{sum:0,count:0};f.sum+=p.metrics.likes+p.metrics.comments;f.count++;formats.set(p.format,f);}
    const best=[...formats].filter(([,v])=>v.count>=3).sort((a,b)=>b[1].sum/b[1].count-a[1].sum/a[1].count)[0];
    if(best){const reason=`${account.label} on ${account.platform}: ${best[0]} averaged ${(best[1].sum/best[1].count).toFixed(1)} lifetime likes + comments across ${best[1].count} recent posts, observed ${insight.latest!.at.slice(0,10)}. Try another example; post age and audience differ.`;formatTests.push({platform:account.platform,format:best[0],reason});facts.push(reason.slice(0,500));}
  }
  return {start,end,orders:recent.length,revenueCents:recent.reduce((n,s)=>n+s.revenueCents,0),previousRevenueCents:previous.reduce((n,s)=>n+s.revenueCents,0),estimatedOrders:recent.filter(s=>s.estimated).length,demo,products:sorted,facts,traffic,topSalesWeekday,formatTests};
}
export async function marketingSignals(state=readSocial()):Promise<MarketingSignals> {
  const workspace=await loadWorkspace();const signals=analyzeSales(historicalSales(workspace.orders,workspace.deals,state.brand.timezone),state,businessDay(new Date().toISOString(),state.brand.timezone),!workspace.durable);
  // Names from the real catalog remain available when the selected sales window is empty.
  if(!signals.products.length)signals.products=(workspace.deals[0]?.skus||SKUS).map(p=>({id:p.id,name:p.name,quantity:0,revenueCents:0,profitCents:null}));
  return signals;
}
export function campaignDrafts(state:SocialState,signals:MarketingSignals,start:string,weeks:number):SocialCampaign[] {
  const now=new Date().toISOString(),found=state.discoveries?.flatMap(d=>d.products)??[],products=found.length?found.map(p=>({id:"",name:p.name,url:p.url})):signals.products.map(p=>({id:p.id,name:p.name,url:state.brand.website}));
  const ideas=[{title:"Product in everyday use",objective:"Website visits",format:"Photo",caption:(p:string)=>`Meet ${p}. How would you use it in your kitchen? Explore the product and find your next idea.`,brief:"Show one everyday use of the product in a simple, inviting setting. Use the real package reference when supplied. Keep the composition uncluttered."},{title:"Start a conversation",objective:"Community",format:"Text",caption:(p:string)=>`What would you pair with ${p}? Tell us your favorite meal or serving idea.`,brief:"A clear product detail or simple question card. Avoid inventing customer quotes."},{title:"Meet the product",objective:"Awareness",format:"Short video",caption:(p:string)=>`A closer look at ${p}. Save this for your next meal idea.`,brief:"Storyboard a 15-second video: real package, close-up, serving idea. Record your own footage and add readable captions."}] as const;
  const drafts:SocialCampaign[]=[];
  for(let w=0;w<weeks;w++)for(let slot=0;slot<state.brand.postsPerWeek;slot++) {
    const platform=state.brand.platforms[(w*state.brand.postsPerWeek+slot)%state.brand.platforms.length],dayOffset=Math.floor(slot*7/state.brand.postsPerWeek),shift=signals.topSalesWeekday===undefined?0:(signals.topSalesWeekday-new Date(`${start}T12:00:00Z`).getUTCDay()+7)%7,date=offsetDay(start,w*7+(dayOffset+shift)%7),idea=ideas[(w+slot)%ideas.length],product=products[(w+slot)%Math.max(1,products.length)]||{id:"",name:state.brand.name,url:state.brand.website},id=randomUUID(),planKey=`${date}/${platform}/${slot}`;
    const formatTest=signals.formatTests?.find(f=>f.platform===platform),formatHint=slot===0&&formatTest?(/video|reel/i.test(formatTest.format)?"Short video":/carousel/i.test(formatTest.format)?"Carousel":/image|photo/i.test(formatTest.format)?"Photo":/text/i.test(formatTest.format)?"Text":null):null;
    let destination=product.url;if(destination){const url=new URL(destination);url.searchParams.set("utm_source",platform);url.searchParams.set("utm_medium","organic_social");url.searchParams.set("utm_campaign",`shuug_${date}_${id.slice(0,8)}`);destination=url.href;}
    const trafficTest=!!signals.traffic&&(signals.traffic.sessions??0)>=100&&signals.traffic.purchases===0&&slot===0;
    const fields=campaignFields.parse({title:`${idea.title} · ${product.name}`,date,time:"12:00",timezone:state.brand.timezone,platform,format:["tiktok","youtube"].includes(platform)?"Short video":formatHint||idea.format,channel:"online",objective:trafficTest?"Website visits":idea.objective,productId:product.id,productName:product.name,caption:idea.caption(product.name),headline:product.name,cta:idea.objective==="Website visits"?"Explore the product":"Join the conversation",destination,creativeBrief:`${idea.brief}\nBrand direction: ${state.brand.voice}\nColors: ${state.brand.colors}${trafficTest?"\nMake the product and next step clear. Test the landing page and verify purchase event tracking before interpreting zero purchases.":""}`,reason:[signals.orders?"Test a product-led post using the recent sales mix, then compare measured traffic and engagement.":"Start a baseline test while sales and traffic history build up.",...(formatHint&&formatTest?[formatTest.reason]:[]),...(trafficTest?[`${signals.traffic!.sessions} GA4 sessions and no reported purchases in the selected window. Test product clarity and verify measurement; this does not establish why visitors did not purchase.`]:[])].join(" "),evidence:signals.facts.slice(0,10),hypothesis:"A concrete serving idea may encourage product interest. This is a test, not a forecast.",measure:"Compare tagged visits and GA4 purchases with other posts on this same platform; check likes, comments and saves where available. Noon is a starting test time, not an inferred best time.",assetIds:[],publishedUrl:""});
    drafts.push({id,revision:1,createdAt:now,updatedAt:now,status:"draft",fields,planKey,history:[{at:now,revision:1,status:"draft",fields:structuredClone(fields)}]});
  }
  return drafts;
}
export function buildPlan(signals:MarketingSignals,start:string,weeks:number) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||offsetDay(start,0)!==start||![1,2,4].includes(weeks))throw new Error("Choose a valid start date and one, two or four weeks.");
  return changeSocial(s=>{const drafts=campaignDrafts(s,signals,start,weeks),existing=new Set(s.campaigns.map(c=>c.planKey)),added=drafts.filter(d=>!existing.has(d.planKey));if(s.campaigns.length+added.length>5000)throw new Error("Export and archive your campaign history before adding more plans.");s.campaigns.push(...added);return added.length;});
}
