"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { setting,saveSecrets } from "@/lib/connections/vault";
import { connectionCatalog,CONNECTION_IDS,type ConnectionId } from "@/lib/connections/catalog";
import { shopDomain } from "@/lib/connections/shopify-oauth";
import { publicWebsite } from "@/lib/ppc/market";
import { publicRequest } from "@/lib/connections/public-http";
import { testShopifyConnection } from "@/lib/integrations/shopify";
import { testQuickBooksConnection } from "@/lib/integrations/quickbooks";
import { searchPlaces } from "@/lib/visits/google";
import { pullAccountPerformance } from "@/lib/ppc/google-ads";
import { deliverEvent } from "@/lib/connections/automation";
import { testAmazonConnection } from "@/lib/amazon/client";
import { testAmazonAdsConnection } from "@/lib/amazon-ads/client";
const fields:Record<ConnectionId,string[]>={
  slack:["SLACK_WEBHOOK_URL"],stripe:["STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET"],
  amazonads:["AMAZON_ADS_CLIENT_ID","AMAZON_ADS_CLIENT_SECRET","AMAZON_ADS_REFRESH_TOKEN","AMAZON_ADS_REGION"],
  amazon:["AMAZON_SP_CLIENT_ID","AMAZON_SP_CLIENT_SECRET","AMAZON_SP_REFRESH_TOKEN","AMAZON_SP_MARKETPLACE_ID","AMAZON_SP_REGION"],
  shopify:["SHOPIFY_STORE_DOMAIN","SHOPIFY_CLIENT_ID","SHOPIFY_CLIENT_SECRET","SHOPIFY_ADMIN_TOKEN"],quickbooks:["QBO_CLIENT_ID","QBO_CLIENT_SECRET","QBO_ENVIRONMENT"],
  maps:["GOOGLE_MAPS_SERVER_KEY","GOOGLE_MAPS_BROWSER_KEY"],zapier:["ZAPIER_WEBHOOK_URL","ZAPIER_EVENTS_ENABLED"],custom:["CUSTOM_API_NAME","CUSTOM_API_URL","CUSTOM_API_TOKEN","CUSTOM_EVENTS_ENABLED"],
  googleads:["GOOGLE_ADS_DEVELOPER_TOKEN","GOOGLE_ADS_CLIENT_ID","GOOGLE_ADS_CLIENT_SECRET","GOOGLE_ADS_REFRESH_TOKEN","GOOGLE_ADS_CUSTOMER_ID","GOOGLE_ADS_LOGIN_CUSTOMER_ID","GOOGLE_ADS_ENABLE_CAMPAIGN_PUSH"],research:["BRAVE_SEARCH_API_KEY"],
};
const checks:Record<ConnectionId,string>={slack:"SLACK_CHECKED_AT",stripe:"STRIPE_CHECKED_AT",amazonads:"AMAZON_ADS_CHECKED_AT",amazon:"AMAZON_CHECKED_AT",shopify:"SHOPIFY_CHECKED_AT",quickbooks:"QBO_CHECKED_AT",maps:"MAPS_CHECKED_AT",zapier:"ZAPIER_CHECKED_AT",custom:"CUSTOM_CHECKED_AT",googleads:"GOOGLE_ADS_CHECKED_AT",research:"RESEARCH_CHECKED_AT"};
function message(e:unknown){return e instanceof z.ZodError?e.issues[0]?.message||"Check the entered values.":e instanceof Error?e.message:"The connection could not be saved.";}
export async function saveConnectionAction(id:ConnectionId,input:Record<string,string>){try{
  await requireSectionAccess("admin", "edit");

  await requireWorkspaceAccess();z.enum(CONNECTION_IDS).parse(id);z.record(z.string(),z.string().max(4096)).parse(input);
  if(Object.keys(input).some(k=>!fields[id].includes(k)))throw new Error("Unexpected connection field.");
  const patch:Record<string,string>={};for(const k of fields[id])if(input[k]?.trim())patch[k]=input[k].trim();
  if(patch.SLACK_WEBHOOK_URL&&!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(patch.SLACK_WEBHOOK_URL))throw new Error("Paste the incoming webhook URL from your Slack app. It sends to the channel selected in Slack.");
  if(patch.STRIPE_SECRET_KEY&&!/^sk_(test|live)_[A-Za-z0-9]+$/.test(patch.STRIPE_SECRET_KEY))throw new Error("Use a Stripe test or live secret key.");
  if(patch.STRIPE_WEBHOOK_SECRET&&!/^whsec_[A-Za-z0-9]+$/.test(patch.STRIPE_WEBHOOK_SECRET))throw new Error("Use the Stripe webhook signing secret for this backend endpoint.");
  if(patch.SHOPIFY_STORE_DOMAIN){const domain=shopDomain(patch.SHOPIFY_STORE_DOMAIN);if(!domain)throw new Error("Use your store’s myshopify.com address.");patch.SHOPIFY_STORE_DOMAIN=domain;}
  if(patch.AMAZON_SP_REGION&&!['na','eu','fe'].includes(patch.AMAZON_SP_REGION))throw new Error("Choose an Amazon region: na, eu or fe.");
  if(patch.AMAZON_ADS_REGION&&!['na','eu','fe'].includes(patch.AMAZON_ADS_REGION))throw new Error("Choose an Amazon Ads region: na, eu or fe.");
  if(id==="amazonads"&&["AMAZON_ADS_CLIENT_ID","AMAZON_ADS_CLIENT_SECRET","AMAZON_ADS_REGION"].some(k=>patch[k]&&patch[k]!==setting(k)))patch.AMAZON_ADS_REFRESH_TOKEN=input.AMAZON_ADS_REFRESH_TOKEN?.trim()||"";
  if(patch.QBO_ENVIRONMENT&&!['sandbox','production'].includes(patch.QBO_ENVIRONMENT))throw new Error("Choose a QuickBooks environment.");
  for(const k of ["ZAPIER_WEBHOOK_URL","CUSTOM_API_URL"])if(patch[k]&&!publicWebsite(patch[k]))throw new Error("Use a public HTTPS endpoint.");
  if(patch.ZAPIER_WEBHOOK_URL&&!/^https:\/\/hooks\.zapier\.com\/hooks\/catch\//.test(patch.ZAPIER_WEBHOOK_URL))throw new Error("Paste the Catch Hook URL supplied by Zapier.");
  for(const k of ["GOOGLE_ADS_CUSTOMER_ID","GOOGLE_ADS_LOGIN_CUSTOMER_ID"]){if(patch[k]){patch[k]=patch[k].replace(/-/g,"");if(!/^\d{10}$/.test(patch[k]))throw new Error("Google Ads account IDs have 10 digits.");}}
  for(const k of ["ZAPIER_EVENTS_ENABLED","CUSTOM_EVENTS_ENABLED","GOOGLE_ADS_ENABLE_CAMPAIGN_PUSH"])if(patch[k]&&!['true','false'].includes(patch[k]))throw new Error("Invalid event setting.");
  if(id==="shopify"&&["SHOPIFY_STORE_DOMAIN","SHOPIFY_CLIENT_ID","SHOPIFY_CLIENT_SECRET"].some(k=>patch[k]&&patch[k]!==setting(k))){patch.SHOPIFY_ADMIN_TOKEN=input.SHOPIFY_ADMIN_TOKEN?.trim()||"";patch.SHOPIFY_REFRESH_TOKEN="";patch.SHOPIFY_TOKEN_EXPIRES_AT="";patch.SHOPIFY_GRANTED_SCOPES="";}
  if(id==="quickbooks"&&["QBO_CLIENT_ID","QBO_CLIENT_SECRET","QBO_ENVIRONMENT"].some(k=>patch[k]&&patch[k]!==setting(k)))patch.QBO_TOKENS="";
  patch[checks[id]]="";saveSecrets(patch);revalidatePath("/settings");revalidatePath("/visits");revalidatePath("/ads");
  return {ok:true,message:"Saved securely. Check the connection or continue to sign in.",connections:connectionCatalog()};
}catch(e){return {ok:false,message:message(e)};}}
export async function testConnectionAction(id:ConnectionId){try{
  await requireSectionAccess("admin", "edit");
await requireWorkspaceAccess();z.enum(CONNECTION_IDS).parse(id);let detail="";
  if(id==="shopify")detail=await testShopifyConnection();
  else if(id==="slack"){const r=await publicRequest(setting("SLACK_WEBHOOK_URL"),{method:"POST",body:{text:"Shuug Business connection test. Future enabled website workflows can send request references to this channel.",mrkdwn:false}});if(r.status!==200||r.body.trim()!=="ok")throw new Error(`Slack did not confirm delivery (HTTP ${r.status}). Check the channel before retrying.`);detail="Slack confirmed the test message in the webhook’s configured channel.";}
  else if(id==="stripe"){const r=await fetch("https://api.stripe.com/v1/balance",{headers:{Authorization:`Bearer ${setting("STRIPE_SECRET_KEY")}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Stripe returned ${r.status}. Check the secret key.`);detail="Stripe accepted a read-only connection check. No payment was created.";}
  else if(id==="amazon")detail=await testAmazonConnection();
  else if(id==="amazonads")detail=await testAmazonAdsConnection();
  else if(id==="quickbooks")detail=await testQuickBooksConnection();
  else if(id==="maps"){const data=await searchPlaces("grocery stores in Springfield Massachusetts");detail=`Places API connected · ${data.places.length} businesses returned. The map and driving route are checked when you open Store finder.`;}
  else if(id==="googleads"){const r=await pullAccountPerformance();if(!r.ok)throw new Error(r.error);detail=`${r.account?.name} · ${r.account?.currency}`;}
  else if(id==="research"){const res=await fetch("https://api.search.brave.com/res/v1/web/search?q=Shuug&count=1",{headers:{"X-Subscription-Token":setting("BRAVE_SEARCH_API_KEY")},cache:"no-store",signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error(`Search returned ${res.status}.`);detail="Live search connected.";}
  else if(id==="zapier"){const r=await deliverEvent("connection.test",{message:"Shuug Business connection test"},"zapier");if(!r[0]?.ok)throw new Error(r[0]?.message||"Add a webhook first.");detail="Test event delivered. Finish mapping the trigger in Zapier.";}
  else {const r=await publicRequest(setting("CUSTOM_API_URL"),{headers:setting("CUSTOM_API_TOKEN")?{Authorization:`Bearer ${setting("CUSTOM_API_TOKEN")}`}:{}});if(r.status<200||r.status>=300)throw new Error(`Your API returned ${r.status}. Check its health endpoint and credentials.`);detail="API accepted an authenticated GET request.";}
  saveSecrets({[checks[id]]:new Date().toISOString()});revalidatePath("/settings");return {ok:true,message:detail,connections:connectionCatalog()};
}catch(e){return {ok:false,message:message(e)};}}
export async function disconnectConnectionAction(id:ConnectionId){try{
  await requireSectionAccess("admin", "edit");
await requireWorkspaceAccess();z.enum(CONNECTION_IDS).parse(id);const patch=Object.fromEntries(fields[id].map(k=>[k,""]));patch[checks[id]]="";if(id==="shopify"){patch.SHOPIFY_BACKEND_ENABLED="false";patch.SHOPIFY_WRITE_ENABLED="false";patch.SHOPIFY_REFRESH_TOKEN="";patch.SHOPIFY_TOKEN_EXPIRES_AT="";patch.SHOPIFY_GRANTED_SCOPES="";}if(id==="quickbooks")patch.QBO_TOKENS="";saveSecrets(patch);revalidatePath("/settings");return {ok:true,message:"Disconnected from this workspace. You can also revoke app access in the provider account.",connections:connectionCatalog()};}catch(e){return {ok:false,message:message(e)};}}
export async function createAutomationTokenAction(){try{
  await requireSectionAccess("admin", "edit");
await requireWorkspaceAccess();const token=randomBytes(32).toString("hex");saveSecrets({AUTOMATION_INBOUND_TOKEN:token});return {ok:true,token,message:"New token created. Previous inbound tokens no longer work."};}catch(e){return {ok:false,message:message(e)};}}
