"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { mapCustomerRows } from "@/lib/customers/import-model";
import { previewCustomers,commitCustomers } from "@/lib/customers/import";
import { fetchQboCustomers } from "@/lib/integrations/quickbooks";
import { getQboTokens } from "@/lib/integrations/token-store";
async function run<T>(action:()=>Promise<T>){try{await requireWorkspaceAccess();return {ok:true as const,result:await action()};}catch(e){return {ok:false as const,error:e instanceof z.ZodError?"Check the file columns and values.":e instanceof Error?e.message:"Import failed."};}}
export async function previewFileCustomersAction(rows:Record<string,string>[],mapping:Record<string,string>,channel:string){
  await requireSectionAccess("sales", "view");
return run(async()=>{z.array(z.record(z.string().max(160),z.string().max(1000))).min(1).max(5000).parse(rows);z.record(z.string().max(30),z.string().max(160)).parse(mapping);const c=z.enum(["wholesale_bulk","store","online"]).parse(channel);return previewCustomers(mapCustomerRows(rows,mapping,c),"Spreadsheet","sheet");});}
export async function previewQuickBooksCustomersAction(channel:string){
  await requireSectionAccess("sales", "view");
return run(async()=>{const c=z.enum(["wholesale_bulk","store","online"]).parse(channel),realm=getQboTokens()?.realmId;if(!realm)throw new Error("Connect QuickBooks in Settings first.");const rows=await fetchQboCustomers();return previewCustomers(rows.map((customer,index)=>({index,customer:{...customer,channel:c},issue:""})),"QuickBooks",`qbo:${realm}`);});}
export async function commitCustomersAction(id:string,indices:number[]){
  await requireSectionAccess("sales", "edit");
return run(async()=>{const result=await commitCustomers(id,indices);revalidatePath("/customers");revalidatePath("/");return result;});}
