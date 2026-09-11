import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { readSocial } from "@/lib/social/store";
import { marketingSignals } from "@/lib/social/planner";
import { PLATFORM_HELP,socialConnections } from "@/lib/social/connections";
import { CREATIVE_MODELS,creativeConnections } from "@/lib/social/creative";
import { appBaseUrl } from "@/lib/connections/vault";
import { SocialWorkspace } from "@/components/social/SocialWorkspace";
export const dynamic="force-dynamic";
export const maxDuration=180;
export default async function SocialPage({searchParams}:{searchParams:Promise<{tab?:string;notice?:string}>}){const params=await searchParams;await requireWorkspaceAccess();await requireSectionAccess("marketing");const state=readSocial();return <SocialWorkspace initialTab={params.tab==="connections"?"Brand & connections":"Overview"} initialNotice={params.notice==="connected"?"Authorization saved. Refresh metrics to verify your account.":params.notice==="oauth_setup"?"Save the app connection details first, then sign in.":params.notice==="oauth_failed"?"Authorization did not complete. Check the app redirect URL and scopes, then start sign-in again.":""} initial={{state,signals:await marketingSignals(state),connections:socialConnections(),creative:creativeConnections()}} help={PLATFORM_HELP} models={CREATIVE_MODELS} callbackUrl={`${appBaseUrl()}/api/social/callback`}/>;}
