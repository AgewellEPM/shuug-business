import { createHash,randomUUID } from "node:crypto";
import { mkdirSync,readFileSync,writeFileSync,renameSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "../connections/vault";
import type { PipelineOrder } from "./pipeline";
import type { AmazonConfig } from "./client";
export type AmazonState={accountKey:string;orders:PipelineOrder[];syncedAt:string|null;history:{at:string;orderId:string;from:string|null;to:string}[];partial:boolean;nextToken?:string;after?:string;before?:string};
export function accountKey(config:AmazonConfig){return createHash("sha256").update([config.clientId,config.refreshToken,config.marketplaceId,config.region].join("|")).digest("hex").slice(0,32);}
function filename(key:string){if(!/^[a-f0-9]{32}$/.test(key))throw new Error("Invalid Amazon workspace.");return path.join(dataDirectory(),`amazon-${key}.json`);}
export function readAmazon(key:string):AmazonState {try{const s=JSON.parse(readFileSync(filename(key),"utf8"));if(s.accountKey!==key||!Array.isArray(s.orders)||!Array.isArray(s.history))throw new Error("Invalid data");return s;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {accountKey:key,orders:[],syncedAt:null,history:[],partial:false};throw new Error("Saved Amazon orders could not be read. Restore the snapshot before syncing.");}}
export function saveAmazon(key:string,orders:PipelineOrder[],meta:{partial:boolean;nextToken?:string;after:string;before:string}) {
  const state=readAmazon(key),map=new Map(state.orders.map(o=>[o.orderId,o]));
  for(const o of orders){const old=map.get(o.orderId);if(old&&Date.parse(old.updatedAt)>Date.parse(o.updatedAt))continue;if(old?.stage!==o.stage)state.history.unshift({at:new Date().toISOString(),orderId:o.orderId,from:old?.stage||null,to:o.stage});map.set(o.orderId,o);}
  state.orders=[...map.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));state.history=state.history.slice(0,2000);state.syncedAt=new Date().toISOString();Object.assign(state,meta);if(!meta.nextToken)delete state.nextToken;
  const dir=dataDirectory();mkdirSync(dir,{recursive:true,mode:0o700});const temp=path.join(dir,`amazon-${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(state),{mode:0o600});renameSync(temp,filename(key));return state;
}
