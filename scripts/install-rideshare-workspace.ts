/** Private local installation. The owner credential is stored in macOS Keychain, never in source or logs. */
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync, realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { setting } from "../src/lib/connections/vault";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { getBranding } from "../src/lib/branding/store";
import { rideshareTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";

const root=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."));
const data=path.join(os.homedir(),"Library/Application Support/Shuug/Rideshare Tax Pros");
const service="com.shuug.rideshare-tax-pros.owner";
const label="com.shuug.rideshare-tax-pros";
const base="http://127.0.0.1:3126";
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const xml=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
async function main(){
  assert(process.platform==='darwin','This local installer requires macOS.');
  assert(existsSync(path.join(root,'.next/BUILD_ID')),'Build Shuug before installing.');
  mkdirSync(data,{recursive:true,mode:0o700});chmodSync(data,0o700);process.env.DEALDESK_DATA_DIR=data;
  if(!setting('WORKSPACE_OWNER_PASSWORD_HASH')){
    const password=randomBytes(30).toString('base64url');
    const saved=spawnSync('/usr/bin/security',['-i'],{input:`add-generic-password -a owner -s ${service} -w ${password}\n`,encoding:'utf8'});
    assert(saved.status===0,'Could not save the owner credential in macOS Keychain. No password was logged.');
    configureOwnerPassword(password);
  }
  if(!existsSync(path.join(data,'branding.json'))) importBusinessTemplate(rideshareTaxProsTemplate);
  assert(getBranding().businessName==='Rideshare Tax Pros','Existing workspace branding differs; review it before reconfiguration.');
  const logs=path.join(data,'logs');mkdirSync(logs,{recursive:true,mode:0o700});
  const plistPath=path.join(os.homedir(),'Library/LaunchAgents',`${label}.plist`);mkdirSync(path.dirname(plistPath),{recursive:true});
  const args=[process.execPath,path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3126'];
  const env={NODE_ENV:'production',AUTH_ENABLED:'true',DEMO_DATA:'false',APP_BASE_URL:base,DEALDESK_DATA_DIR:data,NEXT_TELEMETRY_DISABLED:'1'};
  const plist=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a=>`<string>${xml(a)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer><key>StandardOutPath</key><string>${xml(path.join(logs,'server.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(logs,'server-error.log'))}</string></dict></plist>`;
  const existing=existsSync(plistPath)?readFileSync(plistPath,'utf8'):null;
  assert(!existing||existing===plist,'An existing service definition differs. Review it before replacement.');
  if(!existing)writeFileSync(plistPath,plist,{mode:0o600});
  const uid=process.getuid!(); const running=spawnSync('/bin/launchctl',['print',`gui/${uid}/${label}`],{encoding:'utf8'}).status===0;
  if(!running){
    try{await fetch(base,{signal:AbortSignal.timeout(500)});throw new Error('Port 3126 is occupied by another service.');}catch(error){if(error instanceof Error&&error.message.includes('occupied'))throw error;}
    execFileSync('/bin/launchctl',['bootstrap',`gui/${uid}`,plistPath],{stdio:'pipe'});
  }
  const manifest={base,source:root,dataDirectory:data,keychainService:service,buildId:readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),service:label,plistSha256:createHash('sha256').update(readFileSync(plistPath)).digest('hex')};
  writeFileSync(path.join(data,'installation.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  let ready=false;for(let i=0;i<40;i++){try{const response=await fetch(base+'/api/auth/login',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert(ready,'Installed service has not become ready; inspect private service logs.');
  const anonymous=await fetch(base+'/',{redirect:'manual'});assert(anonymous.status===307||anonymous.status===303,'Anonymous workspace access was not gated.');
  const form=await fetch(base+'/api/auth/login');const html=await form.text();const csrf=html.match(/name="csrf" value="([a-f0-9]+)"/)?.[1];assert(csrf,'Owner sign-in form lacks its CSRF token.');
  const password=execFileSync('/usr/bin/security',['find-generic-password','-a','owner','-s',service,'-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const login=await fetch(base+'/api/auth/login',{method:'POST',redirect:'manual',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded',cookie:form.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')},body:new URLSearchParams({csrf,password})});
  assert(login.status===303,'Installed owner sign-in failed.');const cookie=login.headers.getSetCookie().find(c=>c.startsWith('dd_session='))?.split(';')[0];assert(cookie,'Owner session was not established.');
  const checked=[];for(const [route,marker] of [['/','Rideshare Tax Pros'],['/m/tax-engagements','Tax engagements'],['/m/rideshare-tax-records','Rideshare tax records'],['/m/tax-document-requests','Tax document requests'],['/m/tax-quarterly-reviews','Quarterly tax reviews'],['/api/v1/m/tax-engagements','tax-engagements']]){const response=await fetch(base+route,{headers:{cookie}});assert(response.ok&&(await response.text()).includes(marker),`Installed route failed: ${route}`);checked.push(route);}
  writeFileSync(path.join(data,'verification.json'),JSON.stringify({ok:true,verifiedAt:new Date().toISOString(),base,ownerSignIn:true,anonymousDenied:true,routes:checked,visualAcceptance:'Pending Luke screenshots'},null,2),{mode:0o600});
  console.log(JSON.stringify({ok:true,...manifest,verifiedRoutes:checked,ownerCredential:'Stored in macOS Keychain; not printed.'},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Local installation failed.');process.exitCode=1;});
