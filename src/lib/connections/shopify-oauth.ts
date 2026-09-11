import { createHmac, timingSafeEqual } from "node:crypto";
import { setting, saveSecrets, appBaseUrl } from "./vault";
import { baseScopes, writeScopes } from "../shopify-backend/model";
import { ShopifyStore } from "../shopify-backend/store";
export function requestedShopifyScopes(): string[] {
  if (setting("SHOPIFY_BACKEND_ENABLED") !== "true") return ["read_orders", "read_customers"];
  return [...baseScopes, ...(setting("SHOPIFY_WRITE_ENABLED") === "true" ? writeScopes : [])];
}
export function shopDomain(input:string):string|null {
  const s=input.trim().toLowerCase().replace(/^https:\/\//,"").replace(/\/$/,"");
  const domain=s.includes(".")?s:`${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)?domain:null;
}
export function shopifyAuthorizeUrl(state:string):string {
  const shop=shopDomain(setting("SHOPIFY_STORE_DOMAIN")),id=setting("SHOPIFY_CLIENT_ID");
  if(!shop||!id||!setting("SHOPIFY_CLIENT_SECRET"))throw new Error("Add your Shopify store and app credentials in the connection wizard first.");
  return `https://${shop}/admin/oauth/authorize?${new URLSearchParams({client_id:id,scope:requestedShopifyScopes().join(","),redirect_uri:`${appBaseUrl()}/api/shopify/callback`,state})}`;
}
export function verifyShopifyHmac(params:URLSearchParams,secret:string):boolean {
  const hmac=params.get("hmac");if(!hmac||!/^[a-f0-9]{64}$/i.test(hmac))return false;
  const entries=[...params.entries()].filter(([k])=>k!=="hmac"&&k!=="signature").sort(([a],[b])=>a.localeCompare(b));
  if(new Set(entries.map(([k])=>k)).size!==entries.length)return false;
  const message=entries.map(([k,v])=>`${k}=${v}`).join("&");
  const expected=createHmac("sha256",secret).update(message).digest();
  return timingSafeEqual(expected,Buffer.from(hmac,"hex"));
}
export async function exchangeShopifyCode(code:string,shop:string) {
  if(shop!==setting("SHOPIFY_STORE_DOMAIN")||!shopDomain(shop))throw new Error("Shopify store mismatch.");
  const res=await fetch(`https://${shop}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:setting("SHOPIFY_CLIENT_ID"),client_secret:setting("SHOPIFY_CLIENT_SECRET"),code,expiring:1}),cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw new Error(`Shopify authorization failed (${res.status}). Reconnect your store.`);
  const data=await res.json() as {access_token?:string;scope?:string;refresh_token?:string;expires_in?:number};
  const granted=data.scope?.split(",")||[];
  if(!data.access_token||requestedShopifyScopes().some(scope=>!granted.includes(scope)&&!granted.includes(scope.replace(/^read_/,"write_"))))throw new Error("Shopify did not grant the requested access. Reconnect and approve the connection scopes.");
  saveSecrets({SHOPIFY_ADMIN_TOKEN:data.access_token,SHOPIFY_GRANTED_SCOPES:granted.join(","),SHOPIFY_REFRESH_TOKEN:data.refresh_token||"",SHOPIFY_TOKEN_EXPIRES_AT:data.expires_in?String(Date.now()+data.expires_in*1000):"",SHOPIFY_CONNECTED_AT:new Date().toISOString()});
  const store=new ShopifyStore();try{store.reconnect(shop);}finally{store.close();}
}
