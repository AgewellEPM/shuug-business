import { randomUUID } from "node:crypto";
import { setting,saveSecrets } from "./vault";
import { publicRequest } from "./public-http";
export interface AutomationResult {provider:string;ok:boolean;message:string}
export async function deliverEvent(type:string,data:unknown,provider?:"zapier"|"custom"):Promise<AutomationResult[]> {
  const event={id:randomUUID(),type,createdAt:new Date().toISOString(),source:"shuug-business",data};
  const targets=([{id:"zapier",url:setting("ZAPIER_WEBHOOK_URL"),enabled:setting("ZAPIER_EVENTS_ENABLED")==="true",token:""},{id:"custom",url:setting("CUSTOM_API_URL"),enabled:setting("CUSTOM_EVENTS_ENABLED")==="true",token:setting("CUSTOM_API_TOKEN")}] as const).filter(t=>t.url&&(provider?t.id===provider:t.enabled));
  const results:AutomationResult[]=[];
  for(const t of targets){try{const response=await publicRequest(t.url,{method:"POST",headers:{"Idempotency-Key":event.id,...(t.token?{Authorization:`Bearer ${t.token}`}:{})},body:event});const ok=response.status>=200&&response.status<300;results.push({provider:t.id,ok,message:ok?"Event delivered":`Endpoint returned ${response.status}. No automatic retry was sent.`});}catch(err){results.push({provider:t.id,ok:false,message:err instanceof Error?err.message:"Webhook delivery failed."});}}
  if(results.length)saveSecrets({LAST_AUTOMATION_DELIVERY:JSON.stringify({id:event.id,type,createdAt:event.createdAt,results})});return results;
}
