import { mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { dateOnly } from "../expenses/model";
import type { BusinessActivity } from "./model";
export const journalSchema=z.object({date:dateOnly,title:z.string().trim().min(1,"Add a title.").max(180),detail:z.string().trim().max(5000),kind:z.enum(["Visit","Call","Meeting","Delivery","Production","Business note"]),channel:z.enum(["shared","bulk","stores","online"])});
function directory(){const dir=path.join(dataDirectory(),"business-journal");mkdirSync(dir,{recursive:true,mode:0o700});return dir;}
export function listJournal():BusinessActivity[]{return readdirSync(directory()).filter(s=>/^[a-f0-9-]{36}\.json$/.test(s)).map(s=>{const row=JSON.parse(readFileSync(path.join(directory(),s),"utf8"));return {...row,...journalSchema.parse(row)};}).sort((a,b)=>b.date.localeCompare(a.date));}
export function addJournal(input:z.input<typeof journalSchema>):BusinessActivity {
  const fields=journalSchema.parse(input),row:BusinessActivity={...fields,id:randomUUID(),href:`/calendar?date=${fields.date}&view=day`,source:"saved"};
  const file=path.join(directory(),`${row.id}.json`),temp=`${file}.tmp`;writeFileSync(temp,JSON.stringify(row),{mode:0o600});renameSync(temp,file);return row;
}
