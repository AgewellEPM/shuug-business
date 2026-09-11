import { createHash,randomUUID,timingSafeEqual } from "node:crypto";
import { readFileSync,writeFileSync,renameSync,unlinkSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { appBaseUrl,saveSecrets } from "../connections/vault";
import { adsDirectory } from "./store";
import { exchangeAdsToken,getAdsConfig,type AdsConfig } from "./client";
const AUTH={na:"https://www.amazon.com/ap/oa",eu:"https://www.amazon.co.uk/ap/oa",fe:"https://www.amazon.co.jp/ap/oa"};
function binding(c:AdsConfig){return createHash("sha256").update([c.clientId,c.clientSecret,c.region,appBaseUrl()].join("|")).digest("hex");}
export function beginAdsOAuth(){
  const cfg=getAdsConfig(false);if(!cfg)throw new Error("Save the Amazon Ads app client ID and secret first.");
  const state=randomUUID(),redirectUri=`${appBaseUrl()}/api/amazon-ads/callback`;
  writeFileSync(path.join(adsDirectory(),`oauth-${state}.json`),JSON.stringify({expires:Date.now()+600000,binding:binding(cfg),redirectUri}),{flag:"wx",mode:0o600});
  return {state,url:`${AUTH[cfg.region]}?${new URLSearchParams({client_id:cfg.clientId,scope:"advertising::campaign_management",response_type:"code",redirect_uri:redirectUri,state})}`};
}
export async function finishAdsOAuth(code:string,state:string,expected:string){
  z.string().min(1).max(4096).parse(code);z.uuid().parse(state);
  if(state.length!==expected.length||!timingSafeEqual(Buffer.from(state),Buffer.from(expected)))throw new Error("Authorization state mismatch.");
  const cfg=getAdsConfig(false);if(!cfg)throw new Error("The Amazon Ads app configuration is missing.");
  const file=path.join(adsDirectory(),`oauth-${state}.json`),claimed=`${file}.claimed`;
  renameSync(file,claimed);
  try{const saved=JSON.parse(readFileSync(claimed,"utf8"));if(saved.expires<Date.now()||saved.binding!==binding(cfg))throw new Error("The authorization expired or app configuration changed.");const token=await exchangeAdsToken(cfg,{grant_type:"authorization_code",code,redirect_uri:saved.redirectUri});if(!token.refresh_token)throw new Error("Amazon did not provide durable authorization. Start again.");if(binding(getAdsConfig(false)!)!==saved.binding)throw new Error("App configuration changed during authorization.");saveSecrets({AMAZON_ADS_REFRESH_TOKEN:token.refresh_token,AMAZON_ADS_CHECKED_AT:""});}
  finally{unlinkSync(claimed);}
}
