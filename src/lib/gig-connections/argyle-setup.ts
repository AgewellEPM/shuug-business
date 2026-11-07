import { randomBytes } from "node:crypto";
import { z } from "zod";
import { saveSecrets, setting } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { argyleConfiguration, argyleList, argyleRequest, sourceItem } from "./argyle-provider";
import { initArgyle } from "./argyle-store";

export const argyleSetupInput=z.object({provider:z.literal("argyle"),environment:z.enum(["sandbox","production"]),
  apiKeyId:z.string().trim().max(500).default(""),apiKeySecret:z.string().trim().max(2000).default(""),
  enabled:z.boolean(),lookbackDays:z.number().int().min(1).max(366).default(366)}).strict();
export function argyleSetupStatus() {
  const c=argyleConfiguration();
  const workerLastSeenAt=workspaceDatabase(db=>{initArgyle(db);return (db.prepare("SELECT lastSeenAt FROM gig_cloud_worker WHERE id=1").get() as {lastSeenAt:string}|undefined)?.lastSeenAt??null;});
  return {environment:c.environment,apiKeyIdConfigured:Boolean(c.apiKeyId),apiKeySecretConfigured:Boolean(c.apiKeySecret),
    webhookSecretConfigured:c.webhookSecret.length>=32,publicWorkspace:c.publicWorkspace,enabled:c.enabled,ready:c.ready,
    webhookUrl:c.webhookUrl,subscriptionConfigured:Boolean(setting("ARGYLE_WEBHOOK_ID")),
    workerLastSeenAt,workerRunning:Boolean(workerLastSeenAt&&Date.now()-Date.parse(workerLastSeenAt)<660_000),
    lookbackDays:Number(setting("ARGYLE_LOOKBACK_DAYS")||366),liveOffersVerified:false};
}
export function saveArgyleSetup(raw:unknown) {
  const input=argyleSetupInput.parse(raw), old=argyleConfiguration();
  const id=input.apiKeyId||old.apiKeyId, secret=input.apiKeySecret||old.apiKeySecret;
  const identityChanged=input.environment!==old.environment||id!==old.apiKeyId;
  if(identityChanged && (!input.apiKeyId||!input.apiKeySecret)) throw new Error("Supply both keys when changing the provider account or environment.");
  const secretChanged=secret!==old.apiKeySecret;
  if(identityChanged||secretChanged) workspaceDatabase(db=>{
    initArgyle(db);
    if(db.prepare("SELECT 1 FROM gig_cloud_users WHERE status!='disconnected' LIMIT 1").get()) throw new Error("Disconnect or reconcile existing client links before changing the provider account keys.");
  });
  if(input.enabled && (!id||!secret)) throw new Error("Save your provider API key ID and secret first.");
  saveSecrets({ARGYLE_ENV:input.environment,ARGYLE_ENABLED:String(input.enabled),ARGYLE_LOOKBACK_DAYS:String(input.lookbackDays),
    ...(input.apiKeyId?{ARGYLE_API_KEY_ID:input.apiKeyId}:{}),...(input.apiKeySecret?{ARGYLE_API_KEY_SECRET:input.apiKeySecret}:{}),
    ...(!old.webhookSecret?{ARGYLE_WEBHOOK_SECRET:randomBytes(48).toString("base64url")}:{}),
    ...(identityChanged?{ARGYLE_WEBHOOK_ID:null}:{}),
  });
  return argyleSetupStatus();
}
export async function checkArgyleAccess() {
  const page=await argyleRequest("items?limit=1",z.object({results:z.array(sourceItem)}));
  return {ok:true,environment:argyleConfiguration().environment,providerResponded:true,exampleItemsReturned:page.results.length};
}
export async function argyleCoverage(query:string) {
  const q=z.string().trim().min(2).max(100).parse(query);
  const items=await argyleList("items",sourceItem,{q,status:"healthy,issues",limit:"25"},1000);
  const details=[];
  for(const item of items.slice(0,10)) details.push(await argyleRequest(`items/${item.id}`,sourceItem));
  return details;
}
export async function registerArgyleWebhooks() {
  const c=argyleConfiguration();
  if(!c.ready) throw new Error("Save the provider keys and public HTTPS workspace first.");
  const events=["accounts.connected","accounts.updated","accounts.removed","accounts.failed",...(["gigs","shifts","ratings","vehicles"] as const).flatMap(kind=>[`${kind}.added`,`${kind}.updated`,...(kind==="ratings"?[]:[`${kind}.removed`])])];
  const existing=await argyleList("webhooks",z.object({id:z.string(),name:z.string(),url:z.string(),events:z.array(z.string())}),{},1000);
  const same=existing.find(row=>row.name==="gigtax-connected-work"&&row.url===c.webhookUrl);
  if(same) {
    if(!events.every(event=>same.events.includes(event)) || setting("ARGYLE_WEBHOOK_ID")!==same.id) throw new Error("An existing subscription needs review in Argyle Console before adopting its signing secret.");
    return {registered:true,subscriptionId:same.id};
  }
  const result=await argyleRequest("webhooks",z.object({id:z.string()}),{name:"gigtax-connected-work",url:c.webhookUrl,secret:c.webhookSecret,events});
  saveSecrets({ARGYLE_WEBHOOK_ID:result.id});return {registered:true,subscriptionId:result.id};
}
