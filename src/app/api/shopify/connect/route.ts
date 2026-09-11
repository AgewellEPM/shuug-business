import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { shopifyAuthorizeUrl } from "@/lib/connections/shopify-oauth";
import { appBaseUrl } from "@/lib/connections/vault";
import { requireOwnerAccess } from "@/lib/auth/identity";
export async function GET(){try{await requireOwnerAccess();const state=randomUUID(),jar=await cookies();jar.set("shopify_oauth_state",state,{httpOnly:true,sameSite:"lax",secure:appBaseUrl().startsWith("https:"),path:"/",maxAge:600});return NextResponse.redirect(shopifyAuthorizeUrl(state));}catch{return NextResponse.redirect(new URL("/settings?error=shopify_setup",appBaseUrl()));}}
