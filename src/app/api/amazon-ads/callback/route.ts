import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/connections/vault";
import { finishAdsOAuth } from "@/lib/amazon-ads/oauth";
export async function GET(request:Request){
  const url=new URL(request.url),jar=await cookies(),expected=jar.get("amazon_ads_oauth")?.value||"";
  jar.set("amazon_ads_oauth","",{path:"/api/amazon-ads",maxAge:0,httpOnly:true,sameSite:"lax",secure:appBaseUrl().startsWith("https:")});
  try{await finishAdsOAuth(url.searchParams.get("code")||"",url.searchParams.get("state")||"",expected);return NextResponse.redirect(new URL("/amazon-marketing?connected=1",appBaseUrl()));}
  catch{return NextResponse.redirect(new URL("/settings?error=amazon_ads_authorization",appBaseUrl()));}
}
