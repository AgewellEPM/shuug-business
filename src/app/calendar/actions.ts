"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { addJournal, journalSchema } from "@/lib/history/journal";
import { loadBusinessHistory } from "@/lib/history/load";
export async function addBusinessActivityAction(input:z.input<typeof journalSchema>) {
  try{
  await requireSectionAccess("admin", "edit");
await requireWorkspaceAccess();const activity=addJournal(input);revalidatePath("/calendar");return {ok:true as const,activity};}
  catch(e){return {ok:false as const,error:e instanceof z.ZodError?e.issues[0].message:e instanceof Error?e.message:"Activity could not be saved."};}
}
export async function refreshBusinessHistoryAction(){
  await requireSectionAccess("admin", "view");
await requireWorkspaceAccess();return loadBusinessHistory();}
