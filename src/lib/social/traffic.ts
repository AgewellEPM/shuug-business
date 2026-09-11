import { randomUUID } from "node:crypto";
import { credentials } from "./connections";
import { accessToken } from "./tokens";
import { num,object,rows,socialRequest,str } from "./http";
import { businessDay,moveDate } from "../history/dates";
import type { TrafficReport,TrafficSegment } from "./model";
export async function pullTraffic():Promise<TrafficReport> {
  const c=credentials("ga4"),id=c.objectId??"";if(!/^\d{1,20}$/.test(id))throw new Error("Enter your numeric Google Analytics 4 property ID.");
  const token=await accessToken({id:"ga4",platform:"ga4",role:"brand"},c),property=await socialRequest(`https://analyticsadmin.googleapis.com/v1beta/properties/${id}`,token),timezone=str(property.timeZone,"America/New_York"),today=businessDay(new Date().toISOString(),timezone),start=moveDate(today,-56,"day"),end=moveDate(today,-1,"day");
  const report:TrafficReport={id:randomUUID(),at:new Date().toISOString(),propertyId:id,propertyName:str(property.displayName,id),timezone,currency:str(property.currencyCode,"USD"),start,end,daily:[],sources:[],landingPages:[],campaigns:[],partial:false,warnings:[],source:"ga4"};
  async function run(dimension:string,metricNames:string[]){const result=await socialRequest(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,token,{body:{dateRanges:[{startDate:start,endDate:end}],dimensions:[{name:dimension}],metrics:metricNames.map(name=>({name})),limit:10000,returnPropertyQuota:true}});
    if((num(result.rowCount)??0)>10000){report.partial=true;report.warnings.push(`${dimension} results exceeded 10,000 rows.`);}const metadata=result.metadata?object(result.metadata):{};
    if(metadata.subjectToThresholding||metadata.dataLossFromOtherRow||rows(metadata.samplingMetadatas).length)report.warnings.push(`${dimension} data may be thresholded, sampled or grouped by Google Analytics.`);
    return rows(result.rows).map(row=>{const values=rows(row.metricValues).map(m=>num(m.value));if(values.some(v=>v===null))throw new Error("Google Analytics returned an unreadable metric.");return {name:str(rows(row.dimensionValues)[0]?.value),values:values as number[]};});}
  report.daily=(await run("date",["sessions","engagedSessions","ecommercePurchases","purchaseRevenue"])).map(r=>({date:`${r.name.slice(0,4)}-${r.name.slice(4,6)}-${r.name.slice(6,8)}`,sessions:r.values[0],engagedSessions:r.values[1],purchases:r.values[2],revenue:r.values[3]}));
  const segment=(r:{name:string;values:number[]}):TrafficSegment=>({name:r.name,sessions:r.values[0],purchases:r.values[1],revenue:r.values[2]});
  report.sources=(await run("sessionSourceMedium",["sessions","ecommercePurchases","purchaseRevenue"])).map(segment);
  report.landingPages=(await run("landingPagePlusQueryString",["sessions","ecommercePurchases","purchaseRevenue"])).map(segment).map(r=>({...r,name:r.name.split("?")[0]}));
  // Merge query-string variants after stripping them; do not retain customer IDs in URLs.
  const pages=new Map<string,TrafficSegment>();for(const row of report.landingPages){const prior=pages.get(row.name)??{name:row.name,sessions:0,purchases:0,revenue:0};prior.sessions+=row.sessions;prior.purchases+=row.purchases;prior.revenue+=row.revenue;pages.set(row.name,prior);}report.landingPages=[...pages.values()];
  report.campaigns=(await run("sessionCampaignName",["sessions","ecommercePurchases","purchaseRevenue"])).map(segment);
  report.warnings.push("Analytics purchases and revenue depend on your website's event setup. They are not added to order-ledger sales.");return report;
}
