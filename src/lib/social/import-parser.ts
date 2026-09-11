import { emptyMetrics,postSchema } from "./model";
export const REPORT_TEMPLATE="post_id,post_url,published_at,text,format,views,likes,comments,shares,saves,clicks\nexample-1,https://www.instagram.com/p/EXAMPLE/,2026-09-01T12:00:00Z,Replace this example with your real post,Photo,,,,,,\n";
export function rowsToPosts(input:Record<string,unknown>[]) {
  if(input.length>500)throw new Error("Import up to 500 posts at a time.");
  return input.map((row,index)=>{const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.trim().toLowerCase().replace(/[ -]+/g,"_"),v]));const value=(key:string)=>String(r[key]??"").trim();
    const metric=(key:string)=>{const text=value(key);if(!text)return null;const n=Number(text.replaceAll(",",""));if(!Number.isFinite(n))throw new Error(`Row ${index+2}: ${key} must be a number or blank.`);return n;};
    return postSchema.parse({id:value("post_id"),url:value("post_url"),publishedAt:value("published_at"),text:value("text"),format:value("format")||"Post",metrics:{...emptyMetrics(),...Object.fromEntries(["views","impressions","reach","likes","comments","shares","saves","clicks"].map(k=>[k,metric(k)]))}});
  });
}
