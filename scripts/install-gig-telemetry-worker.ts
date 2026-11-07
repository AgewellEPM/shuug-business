/** Install the automatic worker beside the already installed private workspace. */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."));
const data=path.join(os.homedir(),"Library/Application Support/Shuug/Rideshare Tax Pros");
const installation=JSON.parse(readFileSync(path.join(data,"installation.json"),"utf8"));
if(process.platform!=="darwin"||realpathSync(installation.source)!==root) throw new Error("Install this exact backend source before installing its connected-work worker.");
const label="com.shuug.rideshare-tax-pros.gig-telemetry",plistPath=path.join(os.homedir(),"Library/LaunchAgents",`${label}.plist`);
const xml=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
const args=[process.execPath,"--import","tsx",path.join(root,"scripts/gig-telemetry-worker.ts")];
const env={NODE_ENV:"production",DEMO_DATA:"false",DEALDESK_DATA_DIR:data,APP_BASE_URL:installation.base};
const plist=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a=>`<string>${xml(a)}</string>`).join("")}</array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join("")}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer><key>StandardOutPath</key><string>${xml(path.join(data,"logs/gig-telemetry.log"))}</string><key>StandardErrorPath</key><string>${xml(path.join(data,"logs/gig-telemetry-error.log"))}</string></dict></plist>`;
if(existsSync(plistPath)&&readFileSync(plistPath,"utf8")!==plist) throw new Error("An existing connected-work worker differs. Stop and preserve it before replacing its definition.");
mkdirSync(path.dirname(plistPath),{recursive:true});mkdirSync(path.join(data,"logs"),{recursive:true,mode:0o700});
if(!existsSync(plistPath))writeFileSync(plistPath,plist,{mode:0o600});
const domain=`gui/${process.getuid!()}`;
if(spawnSync("/bin/launchctl",["print",`${domain}/${label}`],{stdio:"pipe"}).status!==0) execFileSync("/bin/launchctl",["bootstrap",domain,plistPath],{stdio:"pipe"});
console.log(JSON.stringify({installed:true,label,source:root,dataDirectory:data,providerAccess:"Configure and verify separately in owner settings."}));
