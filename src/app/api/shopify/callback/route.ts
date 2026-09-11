import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setting,appBaseUrl } from "@/lib/connections/vault";
import { exchangeShopifyCode,verifyShopifyHmac,shopDomain } from "@/lib/connections/shopify-oauth";
import { equalSecret } from "@/lib/connections/access";
export async function GET(request:Request){const params=new URL(request.url).searchParams,jar=await cookies(),expected=jar.get("shopify_oauth_state")?.value;jar.delete("shopify_oauth_state");const state=params.get("state"),shop=params.get("shop"),code=params.get("code");
  if(!expected||!state||!equalSecret(expected,state)||!shop||shopDomain(shop)!==shop||!code||!verifyShopifyHmac(params,setting("SHOPIFY_CLIENT_SECRET")))return NextResponse.redirect(new URL("/settings?error=shopify_verification",appBaseUrl()));
  try{await exchangeShopifyCode(code,shop);return NextResponse.redirect(new URL("/settings?connected=shopify",appBaseUrl()));}catch{return NextResponse.redirect(new URL("/settings?error=shopify_exchange",appBaseUrl()));}
}
