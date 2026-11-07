/** Real production HTTP, disposable synthetic workspace, no browser or provider calls. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { rideshareTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { moduleById } from "../src/lib/sdk/registry";
import { addRecord, updateRecord } from "../src/lib/sdk/records";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer();await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;
}
async function main() {
  assert(existsSync(".next/BUILD_ID"), "Build Shuug before this production check.");
  const directory=mkdtempSync(`${tmpdir()}/shuug-tax-client-http-`);
  const port=await freePort(), base=`http://127.0.0.1:${port}`, password=`Synthetic-only-${randomUUID()}`;
  process.env.DEALDESK_DATA_DIR=directory;process.env.DEMO_DATA="false";process.env.DATABASE_URL="";process.env.APP_BASE_URL=base;
  const checks:string[]=[];
  let child:ReturnType<typeof spawn>|undefined, cleaned=false, helperPid:number|undefined;
  try {
    importBusinessTemplate(rideshareTaxProsTemplate);configureOwnerPassword(password);
    const clients=["Alpha","Beta"].map(name=>saveBusinessRecord({kind:"client",title:`Synthetic ${name}`,fields:{email:`${name.toLowerCase()}@example.com`}},"owner"));
    const add=(moduleId:string,values:Record<string,string|number|boolean>)=>addRecord(moduleId,moduleById(moduleId)!.fields,values);
    const engagements=clients.map((client,index)=>add("tax-engagements",{name:index===0?"Alpha 2025 preparation":"BETA-PRIVATE-ENGAGEMENT",client_id:client.id,tax_year:2025,stage:"Awaiting documents",client_visible:false,notes:"INTERNAL-STAFF-NOTES",agreement_id:"INTERNAL-AGREEMENT-REF",accountant:"INTERNAL-ASSIGNEE"}));
    add("tax-document-requests",{name:"Annual platform summary",client_id:clients[0].id,engagement_id:engagements[0].id,status:"Requested",client_visible:true,due:"2026-12-10",secure_reference:"PRIVATE-VAULT-REF"});
    add("tax-document-requests",{name:"WRONG-CLIENT-DOCUMENT",client_id:clients[1].id,engagement_id:engagements[0].id,status:"Requested",client_visible:true});
    add("tax-quarterly-reviews",{name:"Year-end review",client_id:clients[0].id,tax_year:2026,quarter:"Q4",due:"2026-12-11",status:"Scheduled",client_visible:true,advice_reference:"PRIVATE-ADVICE-REF"});
    const env={...process.env};
    for(const filename of [".env",".env.local",".env.production",".env.production.local"]){
      if(existsSync(filename)) for(const line of readFileSync(filename,"utf8").split("\n")){const key=line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1];if(key)env[key]="";}
    }
    Object.assign(env,{NODE_ENV:"production",APP_BASE_URL:base,DEALDESK_DATA_DIR:directory,DATABASE_URL:"",DEMO_DATA:"false",AUTH_ENABLED:"true",WORKSPACE_ACCESS_TOKEN:"",PPC_WORKSPACE_ACCESS_TOKEN:"",NEXT_TELEMETRY_DISABLED:"1"});
    child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env,stdio:"ignore"});helperPid=child.pid;
    const stop=()=>child?.kill("SIGTERM");process.once("SIGINT",stop);process.once("SIGTERM",stop);
    const request=(route:string,init:RequestInit={})=>fetch(base+route,{...init,redirect:"manual",signal:AbortSignal.timeout(15000)});
    let ready=false;
    for(let i=0;i<60;i++){try{ready=(await request("/api/auth/login")).ok;if(ready)break;}catch{}assert(child.exitCode===null,"The production fixture exited early.");await pause(200);}
    assert(ready,"Production fixture did not become ready.");
    const form=await request("/api/auth/login"),formHtml=await form.text(),csrf=formHtml.match(/name="csrf" value="([a-f0-9]+)"/)?.[1];assert(csrf,"Owner CSRF token missing.");
    const signed=await request("/api/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/x-www-form-urlencoded",Cookie:form.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrf,password})});
    const ownerCookie=signed.headers.getSetCookie().find(c=>c.startsWith("dd_session="))?.split(";")[0];assert.equal(signed.status,303);assert(ownerCookie);
    async function owner(input:unknown){const response=await request("/api/setup/customers",{method:"POST",headers:{Cookie:ownerCookie!,Origin:base,"Content-Type":"application/json"},body:JSON.stringify(input)});const result=await response.json();assert(response.ok,result.error||"Owner customer setup failed.");return result;}
    await owner({action:"settings",input:{enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false}});
    const post=(body:Record<string,string>,cookie="",origin=base)=>request("/api/website/customer",{method:"POST",headers:{Cookie:cookie,Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body)});
    const sessions:string[]=[];
    const accountIds:string[]=[];
    for(const client of clients){
      const {account}=await owner({action:"create",input:{name:client.title,email:client.fields.email,clientId:client.id,customerId:null}});accountIds.push(account.id);
      const {url}=await owner({action:"invite",input:{id:account.id}});
      const invite=new URL(url).searchParams.get("invite");assert(invite);
      assert((await(await request(`/api/website/customer?invite=${invite}`)).text()).includes("Rideshare Tax Pros"));
      const activated=await post({action:"activate",invite,password,confirmation:password});assert.equal(activated.status,303);
      const cookie=activated.headers.getSetCookie().find(c=>c.startsWith("shuug_customer="))?.split(";")[0];assert(cookie);sessions.push(cookie);
    }
    checks.push("owner CSRF sign-in, real invitation activation and two separate customer sessions");
    const view=async(index=0,suffix="?year=2025")=>{const response=await request("/api/website/customer"+suffix,{headers:{Cookie:sessions[index]}});return{response,html:await response.text()};};
    let current=await view();assert(current.html.includes("Your tax work"));assert(!current.html.includes("Alpha 2025 preparation"));assert(!current.html.includes("Annual platform summary"));checks.push("unshared engagement and its shared child remain private");
    for(const engagement of engagements) updateRecord("tax-engagements",engagement.id,moduleById("tax-engagements")!.fields,{...engagement.values,client_visible:true});
    current=await view(0,`?year=2025&client_id=${clients[1].id}`);assert(current.response.ok);assert(current.html.includes("Alpha 2025 preparation")&&current.html.includes("Annual platform summary"));
    assert((await view(0,"?year=2026")).html.includes("Year-end review"));checks.push("client year selection includes shared engagement and quarterly-review years");
    for(const value of ["BETA-PRIVATE-ENGAGEMENT","WRONG-CLIENT-DOCUMENT","INTERNAL-","PRIVATE-VAULT-REF","PRIVATE-ADVICE-REF"])assert(!current.html.includes(value),"Private tax data crossed the customer boundary.");
    assert(current.response.headers.get("cache-control")?.includes("private, no-store"));assert(current.response.headers.get("referrer-policy")==="no-referrer");checks.push("live staff share reaches the correct client without internal fields or forged client selection");
    const beta=await view(1);assert(beta.html.includes("BETA-PRIVATE-ENGAGEMENT")&&!beta.html.includes("Alpha 2025 preparation"));
    assert.equal((await request("/api/v1/m/tax-engagements",{headers:{Cookie:sessions[0]}})).status,403);assert.equal((await request("/api/setup/customers",{headers:{Cookie:sessions[0]}})).status,403);checks.push("client sessions cannot open staff tax APIs or owner administration");
    assert.equal((await post({action:"logout"},sessions[0],"https://attacker.example.com")).status,403);assert((await view()).html.includes("Alpha 2025 preparation"));checks.push("cross-origin customer actions are rejected");
    updateRecord("tax-engagements",engagements[0].id,moduleById("tax-engagements")!.fields,{...engagements[0].values,client_visible:false});current=await view();assert(!current.html.includes("Alpha 2025 preparation")&&!current.html.includes("Annual platform summary"));checks.push("withdrawing a share removes the engagement and document requests immediately");
    await owner({action:"enable",input:{id:accountIds[0],enabled:false}});current=await view();assert(current.html.includes("Client sign-in")&&!current.html.includes('id="tax-work"'));checks.push("account revocation invalidates an existing customer session");
    const modulePage=await request("/m/tax-engagements",{headers:{Cookie:ownerCookie}});assert(modulePage.ok&&(await modulePage.text()).includes("Share safe status with linked client"));checks.push("installed staff record editor exposes the sharing control");
    process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null){
      const exit=once(child,"exit");child.kill("SIGTERM");await Promise.race([exit,pause(4000)]);
      if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await exit;}
    }
    if(helperPid){let running=false;try{process.kill(helperPid,0);running=true;}catch{}assert(!running,"Owned diagnostic server is still running.");}
    rmSync(directory,{recursive:true,force:true});cleaned=true;
  }
  console.log(JSON.stringify({ok:true,verifiedAt:new Date().toISOString(),scope:"Production HTTP with disposable synthetic client accounts",buildId:readFileSync(".next/BUILD_ID","utf8").trim(),checks,diagnosticServerStopped:cleaned,helperPid,realClientDataUsed:false,visualAcceptance:"Pending Luke screenshots"},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Tax client production verification failed.");process.exitCode=1;});
