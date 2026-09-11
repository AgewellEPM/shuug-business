"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { readVisits,updateVisits } from "@/lib/visits/store";
import { placeIdSchema,prospectSchema,visitListSchema,type Prospect } from "@/lib/visits/model";
import { searchPlaces,placeDetails,optimizeRoute } from "@/lib/visits/google";
import { deliverEvent } from "@/lib/connections/automation";
import { getDealStore } from "@/lib/data/store";
function error(e:unknown){return e instanceof z.ZodError?e.issues[0]?.message||"Check your entries.":e instanceof Error?e.message:"Request failed.";}
export async function searchPlacesAction(query:string,pageToken?:string){try{
  await requireSectionAccess("distribution", "edit");
await requireWorkspaceAccess();return {ok:true as const,...await searchPlaces(query,pageToken)};}catch(e){return {ok:false as const,error:error(e),places:[]};}}
export async function refreshPlacesAction(ids:string[]){try{
  await requireSectionAccess("distribution", "view");
await requireWorkspaceAccess();z.array(placeIdSchema).max(20).parse(ids);const results=await Promise.allSettled([...new Set(ids)].map(placeDetails));return {ok:true as const,places:results.flatMap(r=>r.status==="fulfilled"?[r.value]:[]),error:results.some(r=>r.status==="rejected")?"Some places could not be refreshed. Your saved contact notes are still available.":undefined};}catch(e){return {ok:false as const,places:[],error:error(e)};}}
export async function saveProspectAction(input:{placeId?:string;name?:string;address?:string;phone?:string}){try{
  await requireSectionAccess("distribution", "edit");
await requireWorkspaceAccess();const parsed=z.object({placeId:placeIdSchema.optional(),name:z.string().trim().max(160).optional(),address:z.string().trim().max(300).optional(),phone:z.string().trim().max(50).optional()}).parse(input);if(!parsed.placeId&&!parsed.name)throw new Error("Add a business name or select a Google result.");const now=new Date().toISOString();let saved:Prospect|undefined;
  const state=updateVisits(data=>{saved=parsed.placeId?data.prospects.find(p=>p.placeId===parsed.placeId):undefined;if(saved)return;saved=prospectSchema.parse({id:randomUUID(),placeId:parsed.placeId||null,name:parsed.name||"",address:parsed.address||"",phone:parsed.phone||"",createdAt:now,updatedAt:now});data.prospects.push(saved);});
  const delivery=await deliverEvent("prospect.saved",{id:saved!.id,placeId:saved!.placeId,name:saved!.name});return {ok:true as const,state,prospectId:saved!.id,delivery};
}catch(e){return {ok:false as const,error:error(e)};}}
export async function updateProspectAction(id:string,input:Partial<Prospect>,revision:number){try{
  await requireSectionAccess("distribution", "edit");
await requireWorkspaceAccess();z.uuid().parse(id);const allowed=prospectSchema.pick({name:true,address:true,phone:true,decisionMaker:true,role:true,email:true,notes:true,status:true,nextVisit:true}).partial().parse(input);const state=updateVisits(data=>{const p=data.prospects.find(p=>p.id===id);if(!p)throw new Error("Prospect not found.");Object.assign(p,allowed,{updatedAt:new Date().toISOString()});},revision);return {ok:true as const,state};}catch(e){return {ok:false as const,error:error(e)};}}
export async function saveVisitListAction(input:unknown,revision:number){try{
  await requireSectionAccess("distribution", "edit");
await requireWorkspaceAccess();const list=visitListSchema.parse(input);const state=updateVisits(data=>{if(list.prospectIds.some(id=>!data.prospects.some(p=>p.id===id)))throw new Error("A stop is no longer in your prospect list.");if(new Set(list.prospectIds).size!==list.prospectIds.length)throw new Error("A business can appear once in a route.");const index=data.lists.findIndex(l=>l.id===list.id);const next={...list,updatedAt:new Date().toISOString()};if(index>=0)data.lists[index]=next;else data.lists.push(next);},revision);return {ok:true as const,state};}catch(e){return {ok:false as const,error:error(e)};}}
export async function optimizeVisitListAction(start:string,ids:string[],roundTrip:boolean){try{
  await requireSectionAccess("distribution", "edit");
await requireWorkspaceAccess();z.array(z.uuid()).min(1).max(20).parse(ids);const state=readVisits();const stops=ids.map(id=>{const p=state.prospects.find(p=>p.id===id);if(!p)throw new Error("Save each business as a prospect before routing.");return {id,placeId:p.placeId,address:p.address};});if(new Set(ids).size!==ids.length)throw new Error("Remove duplicate stops.");return {ok:true as const,route:await optimizeRoute(start,stops,roundTrip)};}catch(e){return {ok:false as const,error:error(e)};}}
export async function convertProspectAction(id:string){try{
  await requireSectionAccess("distribution", "edit");
await requireWorkspaceAccess();const before=readVisits(),p=before.prospects.find(p=>p.id===id);if(!p)throw new Error("Prospect not found.");if(p.customerId)return {ok:true as const,customerId:p.customerId,state:before};if(!p.name||!p.decisionMaker||!z.email().safeParse(p.email).success)throw new Error("Add your verified business name, buyer name and email before creating a customer.");const store=await getDealStore();const deal=await store.createCustomer({company:p.name,channel:"store",buyerName:p.decisionMaker,buyerEmail:p.email,website:null,accountOwner:"Owner",region:"",billingAddress:p.address,shippingAddress:p.address,quickbooksCustomerId:null,requiresPO:false});const state=updateVisits(data=>{const item=data.prospects.find(x=>x.id===id)!;item.customerId=deal.customer.id;item.status="customer";item.updatedAt=new Date().toISOString();});return {ok:true as const,customerId:deal.customer.id,state};}catch(e){return {ok:false as const,error:error(e)};}}
export async function reloadVisitsAction(){try{
  await requireSectionAccess("distribution", "view");
await requireWorkspaceAccess();return {ok:true as const,state:readVisits()};}catch(e){return {ok:false as const,error:error(e)};}}
