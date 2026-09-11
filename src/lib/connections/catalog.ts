import { setting } from "./vault";
import { getQboTokens } from "../integrations/token-store";
export const CONNECTION_IDS=["shopify","quickbooks","slack","stripe","maps","zapier","custom","googleads","research","amazon","amazonads"] as const;
export type ConnectionId=typeof CONNECTION_IDS[number];
export interface ConnectionSummary {id:ConnectionId;configured:boolean;connected:boolean;label:string;fields:Record<string,boolean>;publicValues:Record<string,string>}
export function connectionCatalog():ConnectionSummary[] {
  const specs:{id:ConnectionId;label:string;required:string[];publicKeys:string[];connected:boolean}[]=[
    {id:"slack",label:"Slack",required:["SLACK_WEBHOOK_URL"],publicKeys:[],connected:!!setting("SLACK_CHECKED_AT")},
    {id:"stripe",label:"Stripe",required:["STRIPE_SECRET_KEY"],publicKeys:[],connected:!!setting("STRIPE_CHECKED_AT")},
    {id:"shopify",label:"Shopify",required:["SHOPIFY_STORE_DOMAIN","SHOPIFY_CLIENT_ID","SHOPIFY_CLIENT_SECRET"],publicKeys:["SHOPIFY_STORE_DOMAIN"],connected:!!setting("SHOPIFY_ADMIN_TOKEN")},
    {id:"quickbooks",label:"QuickBooks",required:["QBO_CLIENT_ID","QBO_CLIENT_SECRET"],publicKeys:["QBO_ENVIRONMENT"],connected:!!getQboTokens()},
    {id:"maps",label:"Google Maps & Places",required:["GOOGLE_MAPS_SERVER_KEY","GOOGLE_MAPS_BROWSER_KEY"],publicKeys:[],connected:!!setting("MAPS_CHECKED_AT")},
    {id:"zapier",label:"Zapier",required:["ZAPIER_WEBHOOK_URL"],publicKeys:["ZAPIER_EVENTS_ENABLED"],connected:!!setting("ZAPIER_CHECKED_AT")},
    {id:"custom",label:"Custom API",required:["CUSTOM_API_URL"],publicKeys:["CUSTOM_API_NAME","CUSTOM_EVENTS_ENABLED"],connected:!!setting("CUSTOM_CHECKED_AT")},
    {id:"googleads",label:"Google Ads",required:["GOOGLE_ADS_DEVELOPER_TOKEN","GOOGLE_ADS_CLIENT_ID","GOOGLE_ADS_CLIENT_SECRET","GOOGLE_ADS_REFRESH_TOKEN","GOOGLE_ADS_CUSTOMER_ID"],publicKeys:["GOOGLE_ADS_CUSTOMER_ID","GOOGLE_ADS_LOGIN_CUSTOMER_ID","GOOGLE_ADS_ENABLE_CAMPAIGN_PUSH"],connected:!!setting("GOOGLE_ADS_CHECKED_AT")},
    {id:"research",label:"Live market research",required:["BRAVE_SEARCH_API_KEY"],publicKeys:[],connected:!!setting("RESEARCH_CHECKED_AT")},
    {id:"amazon",label:"Amazon",required:["AMAZON_SP_CLIENT_ID","AMAZON_SP_CLIENT_SECRET","AMAZON_SP_REFRESH_TOKEN","AMAZON_SP_MARKETPLACE_ID"],publicKeys:["AMAZON_SP_MARKETPLACE_ID","AMAZON_SP_REGION"],connected:!!setting("AMAZON_CHECKED_AT")},
    {id:"amazonads",label:"Amazon Ads",required:["AMAZON_ADS_CLIENT_ID","AMAZON_ADS_CLIENT_SECRET","AMAZON_ADS_REFRESH_TOKEN"],publicKeys:["AMAZON_ADS_REGION"],connected:!!setting("AMAZON_ADS_CHECKED_AT")},
  ];return specs.map(s=>({id:s.id,label:s.label,configured:(s.id==="shopify"&&!!setting("SHOPIFY_STORE_DOMAIN")&&!!setting("SHOPIFY_ADMIN_TOKEN"))||s.required.every(k=>!!setting(k)),connected:s.connected,fields:Object.fromEntries(s.required.map(k=>[k,!!setting(k)])),publicValues:Object.fromEntries(s.publicKeys.map(k=>[k,setting(k)]))}));
}
