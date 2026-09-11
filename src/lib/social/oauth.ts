import { randomBytes } from "node:crypto";
import { readFileSync,renameSync,unlinkSync,writeFileSync } from "node:fs";
import path from "node:path";
import { appBaseUrl } from "../connections/vault";
import { credentials,saveCredentials } from "./connections";
import { checksum,readSocial,socialDirectory } from "./store";
import { oauthProvider,tokenExchange } from "./tokens";
import { str } from "./http";
function context(id:string){const account=id==="ga4"?{platform:"ga4",disabled:false}:readSocial().accounts.find(a=>a.id===id);if(!account||account.disabled)throw new Error("Choose an active social connection first.");const provider=oauthProvider(account.platform);if(!provider)throw new Error("This platform uses an access token or report import.");const c=credentials(id);if(!c.clientId||!c.clientSecret)throw new Error("Save your app client ID and secret first.");const redirect=`${appBaseUrl()}/api/social/callback`;return {provider,c,redirect,platform:account.platform,binding:checksum(JSON.stringify([id,c.clientId,c.clientSecret,c.objectId,redirect]))};}
export function beginSocialOAuth(id:string){const x=context(id),state=randomBytes(24).toString("hex");
  const params=new URLSearchParams({response_type:"code",[x.provider==="tiktok"?"client_key":"client_id"]:x.c.clientId!,redirect_uri:x.redirect,state});
  let host:string;
  if(x.provider==="google"){host="https://accounts.google.com/o/oauth2/v2/auth";params.set("scope",x.platform==="ga4"?"https://www.googleapis.com/auth/analytics.readonly":"https://www.googleapis.com/auth/youtube.readonly");params.set("access_type","offline");params.set("prompt","consent");}
  else if(x.provider==="tiktok"){host="https://www.tiktok.com/v2/auth/authorize/";params.set("scope","user.info.basic,user.info.profile,user.info.stats,video.list");}
  else{host="https://www.pinterest.com/oauth/";params.set("scope","user_accounts:read,boards:read,pins:read");}
  writeFileSync(path.join(socialDirectory(),`oauth-${state}.json`),JSON.stringify({id,binding:x.binding,expires:Date.now()+600000}),{flag:"wx",mode:0o600});return {state,url:`${host}?${params}`};
}
export async function finishSocialOAuth(state:string,code:string){if(!/^[a-f0-9]{48}$/.test(state)||!code||code.length>5000)throw new Error("The sign-in link is invalid or expired.");
  const file=path.join(socialDirectory(),`oauth-${state}.json`),claimed=`${file}.claimed`;try{renameSync(file,claimed);}catch{throw new Error("This sign-in has expired or was already used.");}
  try{const pending=JSON.parse(readFileSync(claimed,"utf8")),x=context(pending.id);if(pending.expires<Date.now()||pending.binding!==x.binding)throw new Error("Connection settings changed or sign-in expired. Start again.");const token=await tokenExchange(x.provider,x.c,{grant_type:"authorization_code",code,redirect_uri:x.redirect});if(context(pending.id).binding!==pending.binding)throw new Error("Connection settings changed during sign-in.");saveCredentials(pending.id,{accessToken:str(token.access_token),...(typeof token.refresh_token==="string"?{refreshToken:token.refresh_token}:{})});return pending.id as string;}finally{unlinkSync(claimed);}
}
