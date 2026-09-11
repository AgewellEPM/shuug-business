"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { pullAmazonOrders, type AmazonPullResult } from "@/lib/amazon/client";
export async function pullAmazonAction(days=30,continueSync=false):Promise<AmazonPullResult>{try{
  await requireSectionAccess("operations", "edit");
await requireWorkspaceAccess();return await pullAmazonOrders(days,continueSync);}catch(e){return {ok:false,orders:[],error:e instanceof Error?e.message:"Amazon could not be refreshed."};}}
