import { mkdirSync,readFileSync,writeFileSync,renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import type { CustomerDeal } from "../data/model";
type Archive={deals:CustomerDeal[];sources:Record<string,string>};
export function importedArchive():Archive {
  try {const value=JSON.parse(readFileSync(path.join(dataDirectory(),"imported-customers.json"),"utf8"));if(!Array.isArray(value.deals)||!value.sources||value.deals.some((d:CustomerDeal)=>!d.customer?.id||!d.agreement?.id||!Array.isArray(d.versions)))throw new Error("Invalid archive");return value;}
  catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {deals:[],sources:{}};throw new Error("The imported customer archive could not be opened. Restore it before importing.");}
}
export function archiveImportedDeal(deal:CustomerDeal,sourceKey?:string){
  const state=importedArchive(),index=state.deals.findIndex(d=>d.customer.id===deal.customer.id);
  if(index<0&&!sourceKey)return;
  if(index<0)state.deals.push(deal);else state.deals[index]=deal;if(sourceKey)state.sources[sourceKey]=deal.customer.id;
  const dir=dataDirectory();mkdirSync(dir,{recursive:true,mode:0o700});const temp=path.join(dir,`imported-${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(state),{mode:0o600});renameSync(temp,path.join(dir,"imported-customers.json"));
}
export function archiveImportedBatch(entries:{deal:CustomerDeal;sourceKey:string}[]){
  const state=importedArchive(),byId=new Map(state.deals.map(d=>[d.customer.id,d]));
  for(const entry of entries){byId.set(entry.deal.customer.id,entry.deal);state.sources[entry.sourceKey]=entry.deal.customer.id;}
  state.deals=[...byId.values()];const dir=dataDirectory();mkdirSync(dir,{recursive:true,mode:0o700});const temp=path.join(dir,`imported-${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(state),{mode:0o600});renameSync(temp,path.join(dir,"imported-customers.json"));
}
