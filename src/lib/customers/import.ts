import { createHash, randomUUID } from "node:crypto";
import { mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { getDealStore, type DealStore } from "../data/store";
import { archiveImportedBatch, importedArchive } from "./import-archive";
import type { CustomerDeal } from "../data/model";
import { importCustomerSchema,type ImportRow,type ImportPreview } from "./import-model";
import { publicWebsite } from "../ppc/market";
type Review=ImportPreview & {sourceKey:string;expiresAt:number;done:Record<string,string>};
function directory(){const dir=path.join(dataDirectory(),"customer-imports");mkdirSync(dir,{recursive:true,mode:0o700});return dir;}
function save(review:Review){const temp=path.join(directory(),`${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(review),{mode:0o600});renameSync(temp,path.join(directory(),`${review.id}.json`));}
function fingerprint(row:NonNullable<ImportRow["customer"]>){return [row.company,row.buyerEmail,row.billingAddress].map(s=>s.trim().toLowerCase()).join("|");}
async function customers(store:DealStore){const list=await store.listCustomers();return (await Promise.all(list.map(c=>store.getDeal(c.id)))).flatMap(d=>d?[d.customer]:[]);}
export async function previewCustomers(rows:ImportRow[],source:string,sourceKey:string,store?:DealStore):Promise<ImportPreview>{
  if(!rows.length||rows.length>10000)throw new Error("Choose between 1 and 10,000 customer rows.");
  const existing=await customers(store||await getDealStore()),seen=new Set<string>(),archive=importedArchive();
  for(const row of rows){if(!row.customer)continue;const parsed=importCustomerSchema.safeParse(row.customer);if(!parsed.success){row.issue=parsed.error.issues[0]?.message||"Check this customer.";row.customer=null;continue;}
    row.customer=parsed.data;
    const c=parsed.data,key=fingerprint(c),sourceId=c.externalId?archive.sources[`${sourceKey}:${c.externalId}`]:undefined;
    const duplicate=existing.find(e=>e.id===sourceId||(c.buyerEmail&&e.buyerEmail.toLowerCase()===c.buyerEmail.toLowerCase())||e.company.trim().toLowerCase()===c.company.toLowerCase());
    if(duplicate){row.duplicateId=duplicate.id;row.issue="Possible existing customer — skipped to protect their current details and pricing.";}
    else if(seen.has(key))row.issue="Repeated customer in this import.";
    seen.add(key);
  }
  const review:Review={id:randomUUID(),source,sourceKey,createdAt:new Date().toISOString(),expiresAt:Date.now()+30*60_000,rows,count:rows.length,done:{}};save(review);return {id:review.id,source,createdAt:review.createdAt,rows,count:rows.length};
}
export async function commitCustomers(id:string,indices:number[],store?:DealStore){
  z.uuid().parse(id);z.array(z.number().int().min(0).max(9999)).min(1).max(10000).parse(indices);
  const lock=path.join(directory(),"import.lock");let fd:number;try{fd=openSync(lock,"wx",0o600);}catch{throw new Error("Another customer import is being processed. Try again after it finishes.");}
  try{
    const review:Review=JSON.parse(readFileSync(path.join(directory(),`${id}.json`),"utf8"));if(review.expiresAt<Date.now())throw new Error("Import preview expired. Create a new preview.");
    const repo=store||await getDealStore(),existing=await customers(repo),results:{index:number;customerId?:string;message:string}[]=[],archived:{deal:CustomerDeal;sourceKey:string}[]=[];
    for(const index of [...new Set(indices)]){
      const row=review.rows.find(r=>r.index===index);if(!row?.customer||row.issue){results.push({index,message:row?.issue||"Invalid row."});continue;}
      if(review.done[index]){results.push({index,customerId:review.done[index],message:"Already imported."});continue;}
      const c=row.customer,duplicate=existing.find(e=>(c.buyerEmail&&e.buyerEmail.toLowerCase()===c.buyerEmail.toLowerCase())||e.company.trim().toLowerCase()===c.company.toLowerCase());
      const sourceId=c.externalId?`${review.sourceKey}:${c.externalId}`:`sheet:${fingerprint(c)}`,stableId=`import-${createHash("sha256").update(sourceId).digest("hex").slice(0,20)}`;
      if(duplicate&&duplicate.id!==stableId){results.push({index,customerId:duplicate.id,message:"Existing customer — skipped."});continue;}
      try{const deal=await repo.createCustomer({...c,website:publicWebsite(c.website)||null,requiresPO:false,quickbooksCustomerId:review.sourceKey.startsWith("qbo:")?c.externalId||null:null},stableId);
        deal.customer.phone=c.phone;archived.push({deal,sourceKey:sourceId});review.done[index]=deal.customer.id;existing.push(deal.customer);results.push({index,customerId:deal.customer.id,message:"Imported."});
      }catch(e){results.push({index,message:e instanceof Error?e.message:"This row could not be imported."});}
    }
    archiveImportedBatch(archived);save(review);
    return {results,imported:results.filter(r=>r.message==="Imported.").length,skipped:results.filter(r=>r.message!=="Imported.").length};
  }finally{closeSync(fd);unlinkSync(lock);}
}
