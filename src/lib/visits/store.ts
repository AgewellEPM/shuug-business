import { readFileSync,writeFileSync,mkdirSync,renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { prospectSchema,visitListSchema,type VisitState } from "./model";
const schema=z.object({prospects:z.array(prospectSchema).max(5000),lists:z.array(visitListSchema).max(200),revision:z.number().int().nonnegative()});
export function readVisits():VisitState {try{return schema.parse(JSON.parse(readFileSync(path.join(dataDirectory(),"visits.json"),"utf8")));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {prospects:[],lists:[],revision:0};throw new Error("Saved visit data could not be read. Restore the saved file before editing.");}}
/** Synchronous read/update/write keeps mutations serial in the local Node server. */
export function updateVisits(mutate:(data:VisitState)=>void,revision?:number):VisitState {
  const data=readVisits();if(revision!==undefined&&data.revision!==revision)throw new Error("This list changed in another tab. Refresh before saving again.");
  mutate(data);data.revision++;schema.parse(data);mkdirSync(dataDirectory(),{recursive:true,mode:0o700});
  const temp=path.join(dataDirectory(),`visits-${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(data),{mode:0o600});renameSync(temp,path.join(dataDirectory(),"visits.json"));return data;
}
