import { createHash } from "node:crypto";
import { credentials,saveCredentials,type SocialCredentials } from "./connections";
import type { SocialAccount } from "./model";
import { boundedJson,str } from "./http";
const active=new Map<string,Promise<string>>(),cache=new Map<string,{token:string;until:number}>();
export function oauthProvider(platform:string):"google"|"tiktok"|"pinterest"|null {return platform==="youtube"||platform==="ga4"?"google":platform==="tiktok"?"tiktok":platform==="pinterest"?"pinterest":null;}
export async function tokenExchange(provider:"google"|"tiktok"|"pinterest",c:SocialCredentials,extra:Record<string,string>) {
  const url=provider==="google"?"https://oauth2.googleapis.com/token":provider==="tiktok"?"https://open.tiktokapis.com/v2/oauth/token/":"https://api.pinterest.com/v5/oauth/token";
  const body=new URLSearchParams({...extra,...(provider==="pinterest"?{}:{[provider==="tiktok"?"client_key":"client_id"]:c.clientId||"",client_secret:c.clientSecret||""})});
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",...(provider==="pinterest"?{Authorization:`Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`}:{})},body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error("Authorization could not be refreshed. Reconnect this account.");const result=await boundedJson(response);if(typeof result.access_token!=="string"||!result.access_token)throw new Error("The platform did not grant an access token. Check its app approval and scopes.");return result;
}
export async function accessToken(account:Pick<SocialAccount,"id"|"platform"|"role">|{id:"ga4";platform:"ga4";role:"brand"},c=credentials(account.id)):Promise<string> {
  if(account.platform==="bluesky"||account.platform==="other")return "";
  if(account.platform==="youtube"&&account.role==="competitor"&&c.apiKey)return "";
  const provider=oauthProvider(account.platform);
  if(!c.refreshToken||!provider){if(c.accessToken)return c.accessToken;throw new Error("Connect this account before pulling metrics.");}
  if(!c.clientId||!c.clientSecret)throw new Error("Add the app client ID and secret to refresh this account.");
  const key=createHash("sha256").update(JSON.stringify([account.id,c])).digest("hex"),hit=cache.get(key);if(hit&&hit.until>Date.now()+60000)return hit.token;
  if(active.has(key))return active.get(key)!;
  const pending=(async()=>{const token=await tokenExchange(provider,c,{grant_type:"refresh_token",refresh_token:c.refreshToken!});
    if(JSON.stringify(credentials(account.id))!==JSON.stringify(c))throw new Error("The connection changed during authorization. Refresh again.");
    if(typeof token.refresh_token==="string"&&token.refresh_token!==c.refreshToken)saveCredentials(account.id,{refreshToken:token.refresh_token},false);
    const value=str(token.access_token);const entry={token:value,until:Date.now()+Math.min(86400,Math.max(60,Number(token.expires_in)||1800))*1000};cache.set(key,entry);cache.set(createHash("sha256").update(JSON.stringify([account.id,credentials(account.id)])).digest("hex"),entry);return value;
  })();active.set(key,pending);try{return await pending;}finally{active.delete(key);}
}
