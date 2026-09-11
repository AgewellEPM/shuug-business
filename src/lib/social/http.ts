import { z } from "zod";
export type Row=Record<string,unknown>;
export const object=(v:unknown):Row=>z.record(z.string(),z.unknown()).parse(v);
export const rows=(v:unknown):Row[]=>z.array(z.record(z.string(),z.unknown())).parse(v??[]);
export const str=(v:unknown,fallback="")=>typeof v==="string"?v:typeof v==="number"?String(v):fallback;
export const num=(v:unknown):number|null=>typeof v==="number"&&Number.isFinite(v)?v:typeof v==="string"&&v.trim()!==""&&Number.isFinite(Number(v))?Number(v):null;
export async function boundedJson(response:Response,max=5000000):Promise<Row> {const reader=response.body?.getReader();if(!reader)throw new Error("The service returned an empty response.");const chunks:Uint8Array[]=[];let size=0;try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>max){await reader.cancel();throw new Error("The service response exceeded this workspace's limit.");}chunks.push(p.value);}}finally{reader.releaseLock();}return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));}
export async function socialRequest(url:string,token:string,options:{body?:unknown;headers?:Record<string,string>;method?:"GET"|"POST"}={}) {
  const allowed=["graph.facebook.com","graph.threads.net","open.tiktokapis.com","www.googleapis.com","youtubeanalytics.googleapis.com","api.linkedin.com","api.pinterest.com","api.x.com","public.api.bsky.app","analyticsdata.googleapis.com","analyticsadmin.googleapis.com"];
  const target=new URL(url);if(target.protocol!=="https:"||!allowed.includes(target.hostname)||target.username||target.password||target.port)throw new Error("Unsupported social API endpoint.");
  const r=await fetch(url,{method:options.method??(options.body?"POST":"GET"),headers:{Accept:"application/json",...(token?{Authorization:`Bearer ${token}`} :{}),...(options.body?{"Content-Type":"application/json"}:{}),...options.headers},...(options.body?{body:JSON.stringify(options.body)}:{}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw new Error(r.status===429?"The platform rate limit was reached. Wait before refreshing again.":`The platform returned ${r.status}. Check the account ID, app access and token permissions in Connections.`);
  const data=await boundedJson(r);
  if(data.error){const e=object(data.error);if(e.code!=="ok")throw new Error("The platform rejected this request. Check app permissions and reconnect this account.");}
  return data;
}
