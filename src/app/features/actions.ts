"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { createTracker, setFeatureEnabled, setTrackerEnabled, saveRecord, archiveRecord } from "@/lib/features/store";
import { activateTool } from "@/lib/features/assistant";

async function run<T>(action:()=>T) {
  try { await requireWorkspaceAccess(); const result=action(); revalidatePath("/", "layout"); return {ok:true as const,result}; }
  catch(e) {return {ok:false as const,error:e instanceof z.ZodError ? e.issues[0]?.message || "Check the fields and try again." : e instanceof Error?e.message:"The change could not be saved."};}
}
export async function activateToolAction(id:string,type:"feature"|"template") {
  await requireSectionAccess("admin", "edit");
return run(()=>activateTool(z.string().max(60).parse(id),z.enum(["feature","template"]).parse(type)));}
export async function setToolVisibilityAction(id:string,type:"feature"|"tracker",enabled:boolean) {
  await requireSectionAccess("admin", "edit");
return run(()=>{z.boolean().parse(enabled);return z.enum(["feature","tracker"]).parse(type)==="feature"?setFeatureEnabled(id,enabled):setTrackerEnabled(id,enabled);});}
export async function createTrackerAction(definition:unknown,requestId:string) {
  await requireSectionAccess("admin", "edit");
return run(()=>createTracker(definition,requestId));}
export async function saveTrackerRecordAction(trackerId:string,input:unknown) {
  await requireSectionAccess("admin", "edit");
return run(()=>saveRecord(trackerId,input));}
export async function archiveTrackerRecordAction(trackerId:string,recordId:string,revision:number,archived:boolean) {
  await requireSectionAccess("admin", "edit");
return run(()=>archiveRecord(trackerId,recordId,revision,z.boolean().parse(archived)));}
