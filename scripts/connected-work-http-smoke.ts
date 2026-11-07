/** Compiled HTTP + actual WorkspaceClient proof. All accounts and provider records are synthetic. */
import assert from "node:assert/strict";
import { spawn,execFile } from "node:child_process";
import { randomUUID,createHash } from "node:crypto";
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer,saveCustomerSettings } from "../src/lib/customer-access/service";
import { acceptCustomerInvitation,issueCustomerInvitation,signInCustomer } from "../src/lib/customer-access/accounts";
import { workspaceDatabase } from "../src/lib/workspace/database";
import { sealSecret } from "../src/lib/connections/vault";
import { initArgyle } from "../src/lib/gig-connections/argyle-store";
import { argyleConfiguration } from "../src/lib/gig-connections/argyle-provider";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";

async function main() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),binary=process.argv[2];
  assert(binary?.startsWith("/private/tmp/"),"Provide the temporary compiled native probe.");
  const directory=mkdtempSync(path.join(tmpdir(),"gigtax-connected-http-")),checks:string[]=[];
  let child:ReturnType<typeof spawn>|undefined,closed:Promise<unknown>|undefined;
  try {
    const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
    const port=(listener.address() as {port:number}).port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
    const base=`http://127.0.0.1:${port}`,api="/api/website/customer/connections/argyle";
    Object.assign(process.env,{DEALDESK_DATA_DIR:directory,APP_BASE_URL:base,DEMO_DATA:"false",AUTH_ENABLED:"true",DATABASE_URL:"",
      ARGYLE_ENABLED:"false",ARGYLE_ENV:"sandbox",ARGYLE_API_KEY_ID:"",ARGYLE_API_KEY_SECRET:"",ARGYLE_WEBHOOK_SECRET:""});
    importBusinessTemplate(gigTaxProsTemplate);
    configureOwnerPassword("Synthetic-local-owner-password");
    saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
    const clients=[];
    for(const name of ["alpha","beta"]) {
      const client=saveBusinessRecord({kind:"client",title:`Synthetic telemetry ${name}`,fields:{email:`telemetry.${name}@example.com`}},"Synthetic owner");
      const account=await createLinkedCustomer({name,email:client.fields.email,clientId:client.id,customerId:null});
      acceptCustomerInvitation(issueCustomerInvitation(account.id),"Synthetic-telemetry-password");
      clients.push({...account,token:signInCustomer(account.email,"Synthetic-telemetry-password")});
    }
    const account=clients[0],providerUser=randomUUID(),providerAccount=randomUUID(),recordID=randomUUID();
    const observed=new Date().toISOString(),updated=new Date(Date.parse(observed)-60_000).toISOString();
    workspaceDatabase(db=>{
      initArgyle(db);
      db.prepare("INSERT INTO gig_cloud_users(accountId,clientId,providerUser,fingerprint,environment,generation,status) VALUES(?,?,?,?,?,?,'active')")
        .run(account.id,account.clientId,providerUser,argyleConfiguration().fingerprint,"sandbox",randomUUID());
      db.prepare("INSERT INTO gig_cloud_accounts VALUES(?,?,?,?,?,?)").run(providerAccount,account.id,account.clientId,"item_000000001",sealSecret(JSON.stringify({account:{id:providerAccount,user:providerUser,item:"item_000000001",connection:{status:"connected"}},item:{name:"Synthetic gig source",features:{data_retrieval:{refresh_frequency:"5h"}}}})),observed);
      db.prepare("INSERT INTO gig_cloud_records(accountId,clientId,providerAccount,kind,id,body,sourceUpdatedAt,receivedAt,observedAt) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(account.id,account.clientId,providerAccount,"gigs",recordID,sealSecret(JSON.stringify({id:recordID,account:providerAccount,employer:"Synthetic gig source",status:"completed",updated_at:updated,income:{currency:"USD",total:"42.35",tips:null},rating:"4.98"})),updated,observed,observed);
    },true);
    child=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:{...process.env,NODE_ENV:"production"},stdio:["ignore","pipe","pipe"]});
    closed=new Promise(resolve=>child!.once("close",resolve));let logs="";
    child.stdout?.on("data",b=>{logs=(logs+b).slice(-4000);});child.stderr?.on("data",b=>{logs=(logs+b).slice(-4000);});
    const request=(route:string,init:RequestInit={})=>fetch(base+route,{...init,redirect:"manual",signal:AbortSignal.timeout(10_000)});
    let ready=false;
    for(let i=0;i<100;i++){assert(child.exitCode===null,logs);try{if((await request("/api/website/customer/driver/health")).ok){ready=true;break;}}catch{}await pause(100);}
    assert(ready,logs);
    const headers={Cookie:`shuug_customer=${account.token}`,Origin:base,Accept:"application/json","Content-Type":"application/json"};
    assert.equal((await request(api+"/summary")).status,401);
    const response=await request(api+"/summary",{headers});assert.equal(response.status,200);
    assert(response.headers.get("cache-control")?.includes("no-store"));const summary=await response.json();
    assert.equal(summary.records[0].income.total,"42.35");assert.equal(summary.records[0].deliveryDelaySeconds,60);assert.equal(summary.incomingOfferFeed,false);assert.equal(summary.ready,false);
    const foreign=await request(api+"/summary",{headers:{...headers,Cookie:`shuug_customer=${clients[1].token}`}});assert.deepEqual((await foreign.json()).records,[]);
    checks.push("compiled API denies anonymous access and isolates invited accounts", "encrypted fixture records decode with original decimals, delivery delay and live-offer limits");
    const page=await request(api,{headers:{...headers,Accept:"text/html"}});assert.equal(page.status,200);assert((await page.text()).includes("Your connected work"));
    assert(page.headers.get("content-security-policy")?.includes("https://plugin.argyle.com"));
    assert((await (await request(api+"/client.js",{headers})).text()).includes("window.Argyle.create"));
    const handoff=await request(api+"/handoff",{method:"POST",headers,body:"{}"});assert.equal(handoff.status,200);const link=(await handoff.json()).url;
    const redeemed=await fetch(link,{redirect:"manual"});assert.equal(redeemed.status,303);assert(redeemed.headers.get("set-cookie")?.includes("HttpOnly"));assert.equal((await fetch(link,{redirect:"manual"})).status,400);
    assert.equal((await request(api+"/link",{method:"POST",headers:{...headers,Origin:"https://unrelated.example"},body:"{}"})).status,403);
    assert.equal((await request(api+"/link",{method:"POST",headers,body:"{}"})).status,503);
    checks.push("compiled browser portal and SDK script route load with private headers", "single-use native browser handoff issues only an HttpOnly client cookie", "cross-origin writes and unconfigured provider linking fail closed");
    const native=JSON.parse((await promisify(execFile)(binary,[base],{timeout:30_000})).stdout.trim());assert(native.ok);
    checks.push("actual compiled WorkspaceClient logs in, decodes connected work, validates handoff origin and queues sync");
    child.kill("SIGTERM");await closed;
    const receipt={ok:true,verifiedAt:new Date().toISOString(),buildID:readFileSync(path.join(root,".next/BUILD_ID"),"utf8").trim(),nativeProbeSHA256:createHash("sha256").update(readFileSync(binary)).digest("hex"),checks,providerData:"Synthetic encrypted fixtures only",realArgyleAccessVerified:false,physicalIPhoneVerified:false,diagnosticServerStopped:true,existingPort3126Touched:false};
    writeFileSync(path.join(root,"docs/deployments/gig-tax-pros-telemetry-http-verification-20261107.json"),JSON.stringify(receipt,null,2)+"\n");
    console.log(JSON.stringify(receipt,null,2));
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill("SIGTERM");await Promise.race([closed,pause(4000)]);if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await closed;}}
    if(child?.pid){let running=false;try{process.kill(child.pid,0);running=true;}catch{}assert(!running,"Owned diagnostic server remains running.");}
    rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Connected-work HTTP proof failed.");process.exitCode=1;});
