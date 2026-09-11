"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";

import { revalidatePath } from "next/cache";
import { getDealStore } from "@/lib/data/store";
import { loadAnalytics } from "@/lib/analytics/load";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { answerRequest, type AssistantReply } from "@/lib/features/assistant";

export async function askAssistantAction(question:string):Promise<AssistantReply> {
  try {
  await requireSectionAccess("admin", "edit");

    await requireWorkspaceAccess();
    if(typeof question!=="string"||!question.trim()||question.length>1000) return {answer:"Enter a request of up to 1,000 characters."};
    const reply=await answerRequest(question,async()=>({...(await loadAnalytics(await getDealStore())),demo:!process.env.DATABASE_URL}));
    if(reply.changed) revalidatePath("/", "layout");
    return reply;
  } catch(e) {return {answer:e instanceof Error?e.message:"The request could not be completed. Try again."};}
}
