/** Compiled HTTP acceptance with disposable identities and no external providers.
 * Does not access or restart the installed Shuug service. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { configureOwnerPassword } from "../src/lib/auth/owner-session";
import { importBusinessTemplate } from "../src/lib/branding/templates";
import { gigTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../src/lib/workspace/store";
import { createLinkedCustomer, saveCustomerSettings } from "../src/lib/customer-access/service";
import { acceptCustomerInvitation, issueCustomerInvitation } from "../src/lib/customer-access/accounts";
import { totp } from "../src/lib/auth/mfa/crypto";
import { officeAccountingHttpCheck } from "./office-accounting-http-check";

async function freePort() {
  const server=createServer();await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const port=(server.address() as {port:number}).port;
  await new Promise<void>(resolve=>server.close(()=>resolve()));return port;
}
async function stop(child: ChildProcess) {
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
  const ended=once(child,"exit");child.kill("SIGTERM");
  const timer=setTimeout(()=>child.kill("SIGKILL"),5000);
  try{await ended;}finally{clearTimeout(timer);}
}
async function check(directory:string,base:string) {
  const password=`Synthetic-${randomUUID()}`;
  process.env.DEALDESK_DATA_DIR=directory;
  configureOwnerPassword(password);importBusinessTemplate(gigTaxProsTemplate);
  saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
  const client=saveBusinessRecord({kind:"client",title:"Synthetic MFA client",fields:{email:"mfa-client@example.invalid"}},"owner");
  const account=await createLinkedCustomer({name:"Synthetic MFA client",email:"mfa-client@example.invalid",clientId:client.id,customerId:null});
  acceptCustomerInvitation(issueCustomerInvitation(account.id),password);
  const env={...process.env};
  for(const filename of [".env",".env.local",".env.production",".env.production.local"]){
    if(existsSync(filename))for(const line of readFileSync(filename,"utf8").split("\n")){const key=line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1];if(key)env[key]="";}
  }
  Object.assign(env,{NODE_ENV:"production",APP_BASE_URL:base,DEALDESK_DATA_DIR:directory,DEMO_DATA:"false",DATABASE_URL:"",AUTH_ENABLED:"true",SHUUG_REQUIRE_MFA:"true",WORKSPACE_ACCESS_TOKEN:"",PPC_WORKSPACE_ACCESS_TOKEN:"",BACKEND_ACCESS_TOKEN:"",SHOPIFY_BACKEND_ENABLED:"false",SHUUG_SECURE_TAX_TRUSTED_ORIGIN:"https://private.example.invalid"});
  let child:ChildProcess|undefined,log="",startupError:Error|undefined;let checks=0;
  const request=(route:string,init:RequestInit={})=>fetch(base+route,{...init,redirect:"manual",signal:AbortSignal.timeout(15000)});
  const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  async function start(){
    child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",new URL(base).port],{env,stdio:["ignore","pipe","pipe"]});
    child.once("error",error=>{startupError=error;});
    child.stdout?.on("data",data=>{log=(log+String(data)).slice(-4000);});child.stderr?.on("data",data=>{log=(log+String(data)).slice(-4000);});
    for(let i=0;i<100;i++){
      try{const r=await request("/api/auth/login");if(r.ok)return;}catch{}
      assert(!startupError&&child.exitCode===null,`Diagnostic server exited: ${startupError?.message??log}`);await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error(`Diagnostic server did not become ready: ${log}`);
  }
  const form=(values:Record<string,string>,cookie="")=>({method:"POST",headers:{Origin:base,Cookie:cookie,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(values)});
  async function staffLogin(email=""){
    const page=await request("/api/auth/login"),html=await page.text(),csrf=html.match(/name="csrf" value="([a-f0-9]+)"/)?.[1];assert(csrf);
    const cookie=cookies(page),r=await request("/api/auth/login",form({email,password,csrf},cookie));
    const text=await r.text(),challenge=text.match(/name="challenge" value="([a-f0-9]{64})"/)?.[1];assert(challenge);
    assert(!r.headers.getSetCookie().some(c=>c.startsWith("dd_session=")));checks++;
    return {csrf,cookie,challenge,text};
  }
  try{
    await start();
    const anonymous=await request("/accounting");assert.equal(anonymous.status,307);checks++;
    const first=await staffLogin(),secret=first.text.match(/<code>([A-Z2-7]{32})<\/code>/)?.[1];assert(secret);
    assert.equal((await request("/api/accounting/books",{headers:{Cookie:`dd_session=${first.challenge}`}})).status,403);checks++;
    const foreign=await request("/api/auth/login",{...form({csrf:first.csrf,challenge:first.challenge,code:"123456"},first.cookie),headers:{...form({},first.cookie).headers,Origin:"https://evil.example.invalid"}});assert.equal(foreign.status,403);checks++;
    const completed=await request("/api/auth/login",form({csrf:first.csrf,challenge:first.challenge,code:totp(secret,Math.floor(Date.now()/30000))},first.cookie));
    const recoveryHtml=await completed.text(),ownerCookie=completed.headers.getSetCookie().find(c=>c.startsWith("dd_session="))?.split(";")[0];assert(ownerCookie);assert.match(recoveryHtml,/Save your recovery codes/);
    const ownerRecovery=recoveryHtml.match(/[A-F0-9]{6}(?:-[A-F0-9]{6}){3}/g)!;assert.equal(ownerRecovery.length,10);checks++;
    assert.equal((await request("/api/accounting/books",{headers:{Cookie:ownerCookie}})).status,200);checks++;
    assert.equal((await request("/api/auth/login",form({csrf:first.csrf,challenge:first.challenge,code:ownerRecovery[0]},first.cookie))).status,400);checks++;

    const employee=await request("/api/workspace/employees",{method:"POST",headers:{Origin:base,Cookie:ownerCookie,"Content-Type":"application/json"},body:JSON.stringify({action:"create",name:"Synthetic preparer",email:"mfa-staff@example.invalid",role:"Employee"})});
    assert.equal(employee.status,200);const employeeData=await employee.json(),inviteURL=new URL(employeeData.inviteUrl),activation=await request(inviteURL.pathname+inviteURL.search),activationHtml=await activation.text();
    const activateCsrf=activationHtml.match(/name="csrf" value="([a-f0-9]+)"/)?.[1];assert(activateCsrf);
    const activated=await request("/api/auth/activate",form({csrf:activateCsrf,token:inviteURL.searchParams.get("token")!,password,confirm:password},cookies(activation)));assert.equal(activated.status,200);
    const staff=await staffLogin("mfa-staff@example.invalid"),staffSecret=staff.text.match(/<code>([A-Z2-7]{32})<\/code>/)?.[1];assert(staffSecret);
    const staffFinished=await request("/api/auth/login",form({csrf:staff.csrf,challenge:staff.challenge,code:totp(staffSecret,Math.floor(Date.now()/30000))},staff.cookie)),staffCookie=staffFinished.headers.getSetCookie().find(c=>c.startsWith("dd_session="))?.split(";")[0];assert(staffCookie);
    assert.equal((await request("/api/workspace/me",{headers:{Cookie:staffCookie}})).status,200);checks++;
    assert.equal((await request("/api/workspace/employees",{headers:{Cookie:staffCookie}})).status,403);checks++;
    const staffAccount=employeeData.accounts.find((account:{email:string})=>account.email==="mfa-staff@example.invalid");assert(staffAccount);
    const accounting=await officeAccountingHttpCheck(base,ownerCookie,staffCookie,staffAccount.id,client.id);

    const native=await request("/api/website/customer/driver/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:account.email,password})});assert.equal(native.status,428);
    const challenge=await native.json();assert.equal(challenge.mfaRequired,true);assert.equal(challenge.token,undefined);assert.equal(native.headers.get("Cache-Control"),"private, no-store");checks++;
    const nativeFinished=await request("/api/website/customer/driver/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challengeToken:challenge.challengeToken,code:totp(challenge.secret,Math.floor(Date.now()/30000))})});
    assert.equal(nativeFinished.status,200);const nativeSession=await nativeFinished.json();assert.equal(nativeSession.account.id,account.id);assert.equal(nativeSession.recoveryCodes.length,10);checks++;
    assert.equal((await request("/api/website/customer/driver/profile",{headers:{Authorization:`Bearer ${nativeSession.token}`}})).status,200);checks++;
    assert.equal((await request("/api/accounting/books",{headers:{Cookie:`dd_session=${nativeSession.token}`}})).status,403);checks++;
    const portal=await request("/api/website/customer",form({action:"login",email:account.email,password})),portalHtml=await portal.text();assert.match(portalHtml,/Verify your sign-in/);assert(!portalHtml.includes(challenge.secret));checks++;
    const portalChallenge=portalHtml.match(/name="challenge" value="([a-f0-9]{64})"/)?.[1];assert(portalChallenge);
    const portalFinished=await request("/api/website/customer",form({action:"mfa",challenge:portalChallenge,code:nativeSession.recoveryCodes[0]}));assert.equal(portalFinished.status,303);assert(cookies(portalFinished).startsWith("shuug_customer="));checks++;
    assert.equal((await request("/api/website/customer/driver/profile",{headers:{Authorization:`Bearer ${nativeSession.token}`}})).status,401);checks++;
    await stop(child!);await start();
    assert.equal((await request("/api/accounting/books",{headers:{Cookie:ownerCookie}})).status,200);checks++;
    const afterRestart=await staffLogin();assert(!afterRestart.text.includes(secret));
    const recovered=await request("/api/auth/login",form({csrf:afterRestart.csrf,challenge:afterRestart.challenge,code:ownerRecovery[0]},afterRestart.cookie));assert.equal(recovered.status,303);checks++;
    assert.equal((await request("/api/accounting/books",{headers:{Cookie:ownerCookie}})).status,403);checks++;
    const wp=(input:unknown,token?:string)=>request("/api/wordpress",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input)});
    const wpStart=await wp({operation:"session.login",input:{email:"",password}});assert.equal(wpStart.status,200);
    const wpChallenge=(await wpStart.json()).data;assert.equal(wpChallenge.mfaRequired,true);assert.equal(wpChallenge.token,undefined);checks++;
    const wpFinished=await wp({operation:"session.login",input:{challengeToken:wpChallenge.challengeToken,code:ownerRecovery[1]}});assert.equal(wpFinished.status,200);
    const wpSession=(await wpFinished.json()).data;assert.equal(wpSession.user.isOwner,true);assert.match(wpSession.token,/^[a-f0-9]{64}$/);checks++;
    assert.equal((await wp({operation:"workspace",input:{}},wpSession.token)).status,200);checks++;
    const secure=(input:unknown)=>request("/api/website/customer/secure/session",{method:"POST",headers:{Origin:"https://private.example.invalid","Content-Type":"application/json"},body:JSON.stringify(input)});
    const secureStart=await secure({email:account.email,password});assert.equal(secureStart.status,428);assert.equal(secureStart.headers.get("Access-Control-Allow-Origin"),"https://private.example.invalid");
    const secureChallenge=await secureStart.json();assert.equal(secureChallenge.secret,null);checks++;
    const wrongAudience=await wp({operation:"session.login",input:{challengeToken:secureChallenge.challengeToken,code:nativeSession.recoveryCodes[1]}});assert.equal(wrongAudience.status,401);checks++;
    const secureFinished=await secure({challengeToken:secureChallenge.challengeToken,code:nativeSession.recoveryCodes[1]});assert.equal(secureFinished.status,200);
    const secureSession=await secureFinished.json();assert.deepEqual(secureSession.identity,{accountId:account.id,clientId:client.id});assert.equal(secureSession.secret,undefined);assert.equal(secureSession.name,undefined);checks++;
    console.log(JSON.stringify({ok:true,checks,mappedAccounting:accounting,buildId:readFileSync(".next/BUILD_ID","utf8").trim(),syntheticWorkspace:true,covered:["owner enrollment and protected route","CSRF/origin denial","challenge replay rejection","staff enrollment and least privilege","native client MFA API","portal MFA and recovery revocation","persistent grants across server restart","WordPress relay MFA API","independent browser origin and audience separation"]},null,2));
  }catch(error){console.error(`Disposable server diagnostics:\n${log}`);throw error;}
  finally{
    if(child)await stop(child);
  }
}
async function main(){
  assert(existsSync(".next/BUILD_ID"),"Run npm run build first.");
  const base=`http://127.0.0.1:${await freePort()}`;
  const directory=mkdtempSync(`${tmpdir()}/shuug-mfa-http-`),previous=process.env.DEALDESK_DATA_DIR;
  try{await check(directory,base);}
  finally{
    if(previous===undefined)delete process.env.DEALDESK_DATA_DIR;else process.env.DEALDESK_DATA_DIR=previous;
    rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
