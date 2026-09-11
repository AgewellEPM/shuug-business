import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { equalSecret } from "@/lib/connections/access";
import { appBaseUrl } from "@/lib/connections/vault";
import { finishSocialOAuth } from "@/lib/social/oauth";
export async function GET(request:Request){const url=new URL(request.url),jar=await cookies(),state=url.searchParams.get("state")??"",expected=jar.get("social_oauth")?.value??"";let notice="oauth_failed";
  try{if(!expected||!equalSecret(expected,state)||url.searchParams.has("error"))throw new Error("Authorization not completed.");await finishSocialOAuth(state,url.searchParams.get("code")??"");notice="connected";}catch{/* Return only a fixed status; OAuth responses may contain secrets. */}
  jar.set("social_oauth","",{path:"/api/social",maxAge:0});return NextResponse.redirect(new URL(`/social?tab=connections&notice=${notice}`,appBaseUrl()));}
