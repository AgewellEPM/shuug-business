import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireOwnerAccess } from "@/lib/auth/identity";
import { appBaseUrl } from "@/lib/connections/vault";
import { beginAdsOAuth } from "@/lib/amazon-ads/oauth";
export async function GET(){
  try{await requireOwnerAccess();}catch{return new NextResponse("Owner access required",{status:403});}
  try{const auth=beginAdsOAuth();(await cookies()).set("amazon_ads_oauth",auth.state,{httpOnly:true,sameSite:"lax",secure:appBaseUrl().startsWith("https:"),path:"/api/amazon-ads",maxAge:600});return NextResponse.redirect(auth.url);}
  catch{return NextResponse.redirect(new URL("/settings?error=amazon_ads_setup",appBaseUrl()));}
}
