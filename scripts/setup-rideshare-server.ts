/** Initialize an empty persistent server volume. No secrets in arguments or output. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, realpathSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setting } from "../src/lib/connections/vault";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { getBranding } from "../src/lib/branding/store";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveCustomerSettings } from "../src/lib/customer-access/service";

const root=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."));
const {publicHttpsUrl}=createRequire(import.meta.url)(path.join(root,"public/rideshare-tax-pros/links.js"));
async function main(){
  const configured=process.env.APP_BASE_URL;
  assert(publicHttpsUrl(configured),"APP_BASE_URL must be a hosted HTTPS origin.");
  const url=new URL(configured!);assert(url.pathname==="/"&&!url.search&&!url.hash,"APP_BASE_URL must not include a path, query or fragment.");
  const input=process.env.DEALDESK_DATA_DIR;assert(input&&path.isAbsolute(input),"Set an absolute DEALDESK_DATA_DIR for the private server volume.");
  const resolved=path.resolve(input);assert(resolved!==path.parse(resolved).root,"Use a dedicated private data directory.");
  mkdirSync(resolved,{recursive:true,mode:0o700});const data=realpathSync(resolved);
  assert(data!==root&&!data.startsWith(root+path.sep)&&!root.startsWith(data+path.sep),"Keep the private server volume outside the source checkout.");
  process.env.DEALDESK_DATA_DIR=data;
  const marker=path.join(data,"rideshare-server.json");
  const previous=existsSync(marker)?JSON.parse(readFileSync(marker,"utf8")):null;
  if(previous){
    assert(previous.version===1&&previous.kind==="rideshare-tax-firm"&&previous.origin===url.origin&&["initializing","ready"].includes(previous.status),"Existing server setup differs. Review it before making changes.");
  }else assert(readdirSync(data).length===0,"Refusing to initialize an existing data directory. Its files were preserved.");
  chmodSync(data,0o700);
  const receipt=(status:string)=>({version:1,kind:"rideshare-tax-firm",origin:url.origin,status});
  const save=(status:string)=>{const temporary=path.join(data,`rideshare-server-${randomUUID()}.tmp`);writeFileSync(temporary,JSON.stringify(receipt(status),null,2),{mode:0o600,flag:"wx"});renameSync(temporary,marker);};
  if(previous?.status==="ready"){
    assert(setting("WORKSPACE_OWNER_PASSWORD_HASH")&&getBranding().industrySetup?.industryId==="tax-firm","Existing server setup needs review; no settings were replaced.");
    console.log(JSON.stringify({ok:true,existing:true,origin:url.origin,clientPath:"/api/website/customer"}));return;
  }
  save("initializing");
  if(!setting("WORKSPACE_OWNER_PASSWORD_HASH")){
    const configuredOwner=spawnSync(process.execPath,["--import","tsx",path.join(root,"scripts/workspace-setup.ts")],{cwd:root,env:process.env,stdio:"inherit"});
    assert(configuredOwner.status===0,"Owner setup is incomplete. Retry initialization to continue without resetting an existing password.");
  }
  if(!existsSync(path.join(data,"branding.json")))importBusinessTemplate(gigTaxProsTemplate);
  assert(getBranding().industrySetup?.industryId==="tax-firm","Existing business branding differs; it was preserved.");
  saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
  save("ready");
  console.log(JSON.stringify({ok:true,existing:false,origin:url.origin,clientPath:"/api/website/customer",ownerSignInConfigured:true}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Server setup failed.");process.exitCode=1;});
