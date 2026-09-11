"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { credentials,credentialsSchema,disconnectSocial,saveCredentials,socialConnections } from "@/lib/social/connections";
import { creativeConnections,prepareCreative,removeCreativeKey,runCreative,saveCreativeKey } from "@/lib/social/creative";
import { discoverLink,saveDiscovery } from "@/lib/social/discovery";
import { brandSchema,campaignFields } from "@/lib/social/model";
import { importSnapshot,reportInput } from "@/lib/social/import";
import { buildPlan,marketingSignals } from "@/lib/social/planner";
import { pullSocialAccount } from "@/lib/social/providers";
import { campaignStatus,changeSocial,readSocial,saveBrand,saveCampaign,saveSnapshot,saveTraffic } from "@/lib/social/store";
import { pullTraffic } from "@/lib/social/traffic";
import { businessDay } from "@/lib/history/dates";
const idSchema=z.union([z.uuid(),z.literal("ga4")]);
async function view(){const state=readSocial();return {state,signals:await marketingSignals(state),connections:socialConnections(),creative:creativeConnections()};}
export async function socialAction(command:string,input:unknown={}) {
  try {await requireWorkspaceAccess();await requireSectionAccess("marketing",command==="load"?"view":"edit");let message="Saved.";let jobId:string|undefined;
    if(command==="discover") {
      const {links,role}=z.object({links:z.string().trim().min(3).max(12000),role:z.enum(["brand","competitor"])}).parse(input),urls=[...new Set(links.split(/\s+/).filter(Boolean))];if(urls.length>10)throw new Error("Drop up to 10 links at a time.");
      const outcomes:string[]=[];let successes=0;
      for(const raw of urls){try{const discovery=await discoverLink(raw),saved=saveDiscovery(discovery,role);successes++;outcomes.push(`${discovery.name}: ${saved.added.length} profiles added${saved.existing.length?`, ${saved.existing.length} already tracked`:""}.`);
        // Bluesky is public and free. Other providers wait for an explicit connection/refresh.
        for(const id of saved.added){const a=readSocial().accounts.find(a=>a.id===id)!;if(a.platform==="bluesky"){try{saveSnapshot(await pullSocialAccount(a),a.revision);}catch{outcomes.push("Bluesky metrics could not refresh yet; the profile is saved.");}}}
      }catch(e){outcomes.push(e instanceof Error?e.message:"This link could not be read.");}}
      if(!successes)throw new Error(outcomes.join(" "));
      if(role==="brand"&&readSocial().discoveries?.length){const s=readSocial(),added=buildPlan(await marketingSignals(s),businessDay(new Date().toISOString(),s.brand.timezone),2);outcomes.push(`${added} campaign drafts added. Review the brand and plan below.`);}message=outcomes.join(" ");
    }else if(command==="refresh") {
      const {id}=z.object({id:idSchema}).parse(input);
      if(id==="ga4"){const before=credentials(id),report=await pullTraffic(),after=credentials(id);if(before.objectId!==after.objectId||before.clientId!==after.clientId)throw new Error("Analytics connection changed during refresh. Try again.");saveTraffic(report);message="Website traffic refreshed.";}
      else {const account=readSocial().accounts.find(a=>a.id===id&&!a.disabled);if(!account)throw new Error("Profile not found.");saveSnapshot(await pullSocialAccount(account),account.revision);message=`${account.label} metrics refreshed.`;}
    }else if(command==="connect") {const p=z.object({id:idSchema,fields:credentialsSchema}).parse(input);if(p.id!=="ga4"&&!readSocial().accounts.some(a=>a.id===p.id&&!a.disabled))throw new Error("Profile not found.");saveCredentials(p.id,p.fields);message="Connection details saved. Sign in or refresh to verify access.";}
    else if(command==="disconnect"){disconnectSocial(idSchema.parse((input as {id:string}).id));message="Connection removed. Saved history is retained.";}
    else if(command==="untrack"){const p=z.object({id:z.uuid(),revision:z.number().int()}).parse(input);changeSocial(s=>{const a=s.accounts.find(a=>a.id===p.id);if(!a||a.revision!==p.revision)throw new Error("Profile changed. Refresh first.");a.disabled=true;a.revision++;});message="Profile hidden. Its saved history remains in the workspace export.";}
    else if(command==="brand"){const p=z.object({brand:brandSchema,revision:z.number().int()}).parse(input);saveBrand(p.brand,p.revision);message="Brand direction saved. New plans use these settings.";}
    else if(command==="plan"){const p=z.object({start:z.string(),weeks:z.union([z.literal(1),z.literal(2),z.literal(4)])}).parse(input);message=`${buildPlan(await marketingSignals(),p.start,p.weeks)} new campaign drafts added. Existing posts were preserved.`;}
    else if(command==="campaign"){const p=z.object({fields:campaignFields,id:z.uuid().optional(),revision:z.number().int().optional()}).parse(input);saveCampaign(p.fields,p.id,p.revision);message="Campaign saved as a draft.";}
    else if(command==="status"){const p=z.object({id:z.uuid(),revision:z.number().int(),status:z.enum(["draft","ready","published","archived"]),publishedUrl:z.string().optional(),reviewed:z.boolean().optional()}).parse(input);if(p.status==="ready"&&!p.reviewed)throw new Error("Review the caption, claims, link and artwork before marking ready.");campaignStatus(p.id,p.revision,p.status,p.publishedUrl);message=p.status==="published"?"Publication recorded. The live post link is saved in history.":`Campaign marked ${p.status}.`;}
    else if(command==="import"){const p=reportInput.parse(input),account=readSocial().accounts.find(a=>a.id===p.accountId);if(!account)throw new Error("Profile not found.");message=saveSnapshot(importSnapshot(p),account.revision)?"Report imported with its source and observation date.":"This report is already imported.";}
    else if(command==="creative-key"){const p=z.object({provider:z.enum(["gemini","openai"]),key:z.string()}).parse(input);saveCreativeKey(p.provider,p.key);message="Image provider key saved securely. Requests run only when you choose Generate.";}
    else if(command==="creative-disconnect"){const p=z.object({provider:z.enum(["gemini","openai"])}).parse(input);removeCreativeKey(p.provider);message="Image provider disconnected.";}
    else if(command==="prepare-image"){const p=z.object({campaignId:z.uuid(),provider:z.enum(["gemini","openai"]),ratio:z.enum(["1:1","4:5","9:16","16:9"])}).parse(input);jobId=prepareCreative(p.campaignId,p.provider,p.ratio).id;message="Prompt prepared. Review it before generating an image.";}
    else if(command==="generate-image"){const p=z.object({id:z.uuid(),confirmed:z.literal(true)}).parse(input);await runCreative(p.id);message="Image saved. Review its product details and text before attaching it to a post.";}
    else if(command!=="load")throw new Error("Unknown social workspace action.");
    revalidatePath("/social");revalidatePath("/calendar");return {ok:true as const,...await view(),message,jobId};
  }catch(e){return {ok:false as const,error:e instanceof z.ZodError?e.issues[0].message:e instanceof Error?e.message:"Social marketing could not be updated."};}
}
