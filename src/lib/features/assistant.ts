import { resolveRequest } from "./resolve";
import { FEATURES, TEMPLATES } from "./catalog";
import { enableTemplate, setFeatureEnabled } from "./store";
import type { Analytics } from "../analytics/metrics";
import { salesChannel, SALES_LABELS } from "../data/channels";
import type { CustomerChannel } from "../data/model";

export type AssistantReply = {
  answer: string;
  links?: { label: string; href: string }[];
  choices?: { id: string; type: "feature" | "template"; name: string }[];
  changed?: boolean;
};
const money = (cents:number) => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(cents/100);
export function activateTool(id: string, type: "feature" | "template"): AssistantReply {
  if (type === "template") {
    const {tracker,created} = enableTemplate(id);
    return {answer:created ? `${tracker.name} is ready. I created a saved tracker from the ${tracker.name.toLowerCase()} template, with ${tracker.fields.length} fields and Bulk / Stores / Online views. Add your first record to get started.` : `${tracker.name} is already saved. It is now available in your tools, with its existing records.`,links:[{label:`Open ${tracker.name}`,href:`/trackers/${tracker.id}`}],changed:true};
  }
  const result = setFeatureEnabled(id,true), feature = FEATURES.find(f=>f.id===id)!;
  return {answer:`${result.label} ${result.alreadyEnabled ? "is already available" : "has been added to your tools"}.${feature.requirement ? ` ${feature.requirement}` : ""}`,links:[{label:`Open ${result.label}`,href:result.href},...(feature.requirement && !["operations","invoice-audit","amazon"].includes(id)?[{label:"Connections",href:"/settings"}]:[])],changed:!result.alreadyEnabled};
}
export async function answerRequest(question:string, load:()=>Promise<{analytics:Analytics;demo:boolean}>):Promise<AssistantReply> {
  const intent=resolveRequest(question);
  if(intent.kind==="help") return {answer:`I can open ${FEATURES.length} business tools, set up ${TEMPLATES.length} tracker templates, and answer questions about recorded sales, top products, top customers and channels. Try “I need to track sample requests” or “Show sales by channel.” Custom trackers use a field builder.`,links:[{label:"Browse tools & templates",href:"/features"},{label:"Create a custom tracker",href:"/features?new=Custom%20tracker"}]};
  if(intent.kind==="tools") {
    if(intent.activate) return activateTool(intent.matches[0].id,intent.matches[0].type);
    return {answer:intent.matches.length>1?"Your request matches more than one tool. Choose the one you want to open or set up.":"This tool covers that request. Open it to see the available workflow.",choices:intent.matches};
  }
  if(intent.kind==="custom") return {answer:"You can create a saved tracker for this. Review its name and fields in the builder, then create it. Trackers support text, notes, numbers, USD amounts, dates, choices and checkboxes.",links:[{label:"Configure this tracker",href:`/features?new=${encodeURIComponent(intent.name||"Custom tracker")}`}]};
  if(intent.kind==="answer") {
    const {analytics:a,demo}=await load();
    const source=demo?"Source: local demo order data, all recorded dates. ":"Source: recorded workspace orders, all recorded dates. ";
    let answer:string;
    if(!a.orderCount) answer="There are no recorded orders yet. Add an order to start calculating sales.";
    else if(intent.metric==="sales") answer=`Recorded product sales total ${money(a.totalRevenueCents)} across ${a.orderCount} orders. Average product sales per order: ${money(a.avgOrderCents)}. This excludes freight and is not a bank balance or paid-invoice total.`;
    else {
      const channelTotals=new Map<string,number>();
      for(const row of a.byChannel){const label=["wholesale_bulk","store","online","amazon"].includes(row.key)?SALES_LABELS[salesChannel(row.key as CustomerChannel)]:row.label;channelTotals.set(label,(channelTotals.get(label)||0)+row.revenueCents);}
      const rows=intent.metric==="products"?a.topProducts.slice(0,5):intent.metric==="customers"?a.byCustomer.slice(0,5):[...channelTotals].map(([label,revenueCents])=>({label,revenueCents}));
      answer=rows.map(r=>`${r.label}: ${money(r.revenueCents)}`).join("\n")||"No matching records yet.";
      answer+="\nAmounts are recorded product sales, excluding freight.";
    }
    return {answer:source+"\n\n"+answer,links:[{label:"Open sales reports",href:"/analytics"}]};
  }
  return {answer:"I couldn't match that to a supported action. Try “track returns,” “enable inventory,” “show top products,” or choose a tool below. You can also configure your own tracker. No workspace changes were made.",links:[{label:"Browse tools",href:"/features"},{label:"Custom tracker",href:"/features?new=Custom%20tracker"}]};
}
