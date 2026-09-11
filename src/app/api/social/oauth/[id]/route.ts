import { requireSectionAccess } from "@/lib/permissions/guard";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { beginSocialOAuth } from "@/lib/social/oauth";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {try{await requireOwnerAccess();await requireSectionAccess("marketing","edit");}catch{return new Response("Owner access required",{status:403});}try{const result=beginSocialOAuth((await context.params).id);(await cookies()).set("social_oauth",result.state,{httpOnly:true,secure:appBaseUrl().startsWith("https:"),sameSite:"lax",path:"/api/social",maxAge:600});return NextResponse.redirect(result.url);}catch{return NextResponse.redirect(new URL("/social?tab=connections&notice=oauth_setup",appBaseUrl()));}}
