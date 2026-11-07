/** Read-only runtime verification. Owner password and cookies are never logged. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  const install=JSON.parse(readFileSync(path.join(homedir(),"Library/Application Support/Shuug/Rideshare Tax Pros/installation.json"),"utf8"));
  assert.equal(install.source,root);
  const base="http://127.0.0.1:3126";
  assert.equal(install.base,base);
  assert.equal(install.buildId,readFileSync(path.join(root,".next/BUILD_ID"),"utf8").trim());
  const get=(route:string,headers:HeadersInit={})=>fetch(base+route,{headers,redirect:"manual",signal:AbortSignal.timeout(15_000)});
  assert((await (await get("/api/website/customer/driver/health")).json()).ready);
  assert.equal((await get("/api/setup/driver-connections")).status,403);
  assert.equal((await get("/api/website/customer/connections/argyle/summary")).status,401);
  const form=await get("/api/auth/login"),csrf=(await form.text()).match(/name="csrf" value="([a-f0-9]+)"/)?.[1];
  assert(csrf);
  const password=execFileSync("/usr/bin/security",["find-generic-password","-a","owner","-s",install.keychainService,"-w"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  const login=await fetch(base+"/api/auth/login",{method:"POST",redirect:"manual",signal:AbortSignal.timeout(15_000),
    headers:{Origin:base,"Content-Type":"application/x-www-form-urlencoded",cookie:form.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrf,password})});
  assert.equal(login.status,303);
  const cookie=login.headers.getSetCookie().find(c=>c.startsWith("dd_session="))?.split(";")[0];assert(cookie);
  const response=await get("/api/setup/driver-connections",{cookie});assert.equal(response.status,200);
  const status=(await response.json()).argyle;
  const page=await get("/setup/driver-connections",{cookie});assert.equal(page.status,200);
  assert((await page.text()).includes("Save Argyle settings privately"));
  assert(status.workerRunning);
  const worker=execFileSync("/bin/launchctl",["print",`gui/${process.getuid!()}/com.shuug.rideshare-tax-pros.gig-telemetry`],{encoding:"utf8"});
  const workerPID=Number(worker.match(/\n\s*pid = (\d+)/)?.[1]);assert(workerPID>0);process.kill(workerPID,0);
  const receipt={ok:true,verifiedAt:new Date().toISOString(),source:root,buildId:install.buildId,
    ownerSetupPageVerified:true,anonymousAccessDenied:true,workerProcessVerified:true,workerPID,
    argyle:{environment:status.environment,apiKeyIdConfigured:status.apiKeyIdConfigured,apiKeySecretConfigured:status.apiKeySecretConfigured,
      publicWorkspace:status.publicWorkspace,ready:status.ready,workerLastSeenAt:status.workerLastSeenAt},
    realArgyleDataVerified:false,publicHostingVerified:false};
  writeFileSync(path.join(root,"docs/deployments/gig-tax-pros-telemetry-installed-verification-20261107.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify(receipt,null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Installed verification failed.");process.exitCode=1;});
