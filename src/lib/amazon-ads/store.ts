import { mkdirSync,readFileSync,writeFileSync,renameSync,readdirSync,openSync,closeSync,unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import type { CampaignReceipt } from "./model";
export function adsDirectory(){const dir=path.join(dataDirectory(),"amazon-ads");mkdirSync(dir,{recursive:true,mode:0o700});return dir;}
function filename(id:string){z.uuid().parse(id);return path.join(adsDirectory(),`${id}.json`);}
export function readReceipt(id:string):CampaignReceipt {const r=JSON.parse(readFileSync(filename(id),"utf8"));if(r.id!==id||!r.plan||!r.profile||!Array.isArray(r.adIds))throw new Error("The saved Amazon Ads submission could not be read. Restore the record before continuing.");return r;}
export function writeReceipt(r:CampaignReceipt){r.updatedAt=new Date().toISOString();const tmp=path.join(adsDirectory(),`${randomUUID()}.tmp`);writeFileSync(tmp,JSON.stringify(r),{mode:0o600});renameSync(tmp,filename(r.id));return r;}
export function listReceipts(){return readdirSync(adsDirectory()).filter(x=>/^[a-f0-9-]{36}\.json$/.test(x)).map(x=>readReceipt(x.slice(0,-5))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function withReceiptLock<T>(id:string,run:()=>Promise<T>):Promise<T>{
  const file=`${filename(id)}.lock`;let fd:number;try{fd=openSync(file,"wx",0o600);}catch{throw new Error("This campaign has an operation in progress. Check its status before trying again.");}
  try{return await run();}finally{closeSync(fd);unlinkSync(file);}
}
export function claimSubmission(id:string){try{writeFileSync(`${filename(id)}.submitted`,new Date().toISOString(),{flag:"wx",mode:0o600});return true;}catch(e){if((e as NodeJS.ErrnoException).code==="EEXIST")return false;throw e;}}
