"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { previewInvoiceSync,commitInvoiceSync } from "@/lib/integrations/review-sync";
export async function previewSyncAction(){try{
  await requireSectionAccess("admin", "view");
await requireWorkspaceAccess();return {ok:true as const,...await previewInvoiceSync()};}catch(e){return {ok:false as const,error:e instanceof Error?e.message:"Could not preview orders."};}}
export async function commitSyncAction(reviewId:string){try{
  await requireSectionAccess("admin", "edit");
await requireWorkspaceAccess();return {ok:true as const,results:await commitInvoiceSync(reviewId)};}catch(e){return {ok:false as const,error:e instanceof Error?e.message:"Could not sync orders."};}}
