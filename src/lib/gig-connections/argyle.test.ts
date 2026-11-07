// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac,randomUUID } from "node:crypto";
import { importBusinessTemplate } from "../branding/templates";
import { rideshareTaxProsTemplate } from "../industry/rideshare-tax-pros";
import { saveBusinessRecord } from "../workspace/store";
import { createLinkedCustomer,saveCustomerSettings } from "../customer-access/service";
import { acceptCustomerInvitation,issueCustomerInvitation,signInCustomer,signOutCustomer } from "../customer-access/accounts";
import { workspaceDatabase } from "../workspace/database";
import { readDriverRecords } from "../rideshare-driver/store";
import { argyleSummary,createArgyleLink,queueArgyleSync,runArgyleWorkerOnce,acceptArgyleWebhook,disconnectArgyle,recoverArgyleUsers } from "./argyle-service";
import { saveArgyleSetup,argyleSetupStatus,checkArgyleAccess } from "./argyle-setup";
import { GET,POST } from "@/app/api/website/customer/connections/argyle/[[...action]]/route";
import { POST as webhook } from "@/app/api/integrations/argyle/webhook/route";
let directory:string, alpha:{id:string;clientId:string;token:string},beta:typeof alpha;
let userId:string,providerAccount:string,jobId:string,income:string,sourceUpdated:string,failPage:boolean,foreign:boolean,maliciousNext:boolean,missingAccount:boolean,missingGig:boolean,revokeFails:boolean,afterGigs:(()=>Promise<void>)|undefined;
const base="https://workspace.example.com",endpoint=`${base}/api/website/customer/connections/argyle`,secret="synthetic-signing-secret-0123456789-0123456789";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const context=(action:string)=>({params:Promise.resolve({action:action?[action]:undefined})});
const headers=(token=alpha.token)=>({Cookie:`shuug_customer=${token}`,Origin:base,Accept:"application/json","Content-Type":"application/json"});
beforeEach(async()=>{
  directory=mkdtempSync(path.join(tmpdir(),"gigtax-cloud-"));
  for(const [key,value] of Object.entries({DEALDESK_DATA_DIR:directory,DATABASE_URL:"",DEMO_DATA:"false",APP_BASE_URL:base,ARGYLE_ENV:"production",ARGYLE_ENABLED:"true",ARGYLE_API_KEY_ID:"synthetic-key-id",ARGYLE_API_KEY_SECRET:"synthetic-key-secret",ARGYLE_WEBHOOK_SECRET:secret}))vi.stubEnv(key,value);
  importBusinessTemplate(rideshareTaxProsTemplate);
  saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
  async function account(name:string){
    const client=saveBusinessRecord({kind:"client",title:name,fields:{email:`${name}@example.com`}},"owner");
    const user=await createLinkedCustomer({name,email:`${name}@example.com`,clientId:client.id,customerId:null});
    acceptCustomerInvitation(issueCustomerInvitation(user.id),"Synthetic-client-password");
    return{id:user.id,clientId:client.id,token:signInCustomer(user.email,"Synthetic-client-password")};
  }
  alpha=await account("Alpha");beta=await account("Beta");userId=randomUUID();providerAccount=randomUUID();jobId=randomUUID();income="42.35";sourceUpdated=new Date(Date.now()-60000).toISOString();failPage=false;foreign=false;maliciousNext=false;missingAccount=false;missingGig=false;revokeFails=false;afterGigs=undefined;
  vi.stubGlobal("fetch",vi.fn(async(input:string|URL,init?:RequestInit)=>{
    const url=new URL(String(input));expect(url.origin).toBe("https://api.argyle.com");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Basic ${Buffer.from("synthetic-key-id:synthetic-key-secret").toString("base64")}`);
    if(url.pathname==="/v2/users"&&init?.method==="POST")return json({id:userId,user_token:"synthetic-user-token"});
    if(url.pathname==="/v2/users"&&init?.method==="GET")return json({next:null,results:[{id:userId,external_id:url.searchParams.get("external_id")}]});
    if(url.pathname==="/v2/user-tokens")return json({user_token:"synthetic-new-user-token"});
    if(url.pathname===`/v2/users/${userId}`&&init?.method==="DELETE")return new Response(null,{status:revokeFails?503:204});
    if(url.pathname==="/v2/accounts"){expect(url.searchParams.get("user")).toBe(userId);return json({next:null,results:missingAccount?[]:[{id:providerAccount,user:foreign?randomUUID():userId,item:"item_000000001",connection:{status:"connected"},PRIVATE_SSN:"PRIVATE-DO-NOT-KEEP"}]});}
    if(url.pathname==="/v2/items/item_000000001")return json({id:"item_000000001",name:"Lyft test source",status:"healthy",known_limitations:"Synthetic source; no live access established",features:{data_retrieval:{refresh_frequency:"5h"},field_coverage:{gigs:{status:{supported:true},income:{supported:true}}}}});
    if(url.pathname==="/v2/items")return json({next:null,results:[]});
    if(url.pathname==="/v2/gigs"){
      expect(url.searchParams.get("account")).toBe(providerAccount);
      if(afterGigs){const callback=afterGigs;afterGigs=undefined;await callback();}
      if(failPage)return json({next:"https://api.argyle.com/v2/gigs?cursor=missing",results:[]});
      const updated=sourceUpdated;
      return json({next:maliciousNext?"https://attacker.example/v2/gigs?cursor=x":null,results:missingGig?[]:[{id:jobId,account:providerAccount,employer:"Lyft test source",status:"completed",updated_at:updated,start_datetime:updated,income:{currency:"USD",total:income,fees:"2.15",tips:null},all_datetimes:{request_at:updated,accept_at:updated},PRIVATE_SSN:"PRIVATE-DO-NOT-KEEP"}]});
    }
    throw new Error(`Unexpected synthetic provider request: ${url.pathname}`);
  }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
async function connectAndSync(){await createArgyleLink(alpha.token);queueArgyleSync(alpha.token);expect(await runArgyleWorkerOnce()).toMatchObject({processed:1,records:1});}
it("requires client authentication, origin protection and complete provider setup before creating a link",async()=>{
  expect((await GET(new Request(endpoint),context("summary"))).status).toBe(401);
  expect((await POST(new Request(endpoint+"/link",{method:"POST",headers:{...headers(),Origin:"https://attacker.example"},body:"{}"}),context("link"))).status).toBe(403);
  vi.stubEnv("ARGYLE_ENABLED","false");await expect(createArgyleLink(alpha.token)).rejects.toThrow("finish");expect(fetch).not.toHaveBeenCalled();
});
it("binds one provider user to one invited client and returns a short-lived provider token without exposing keys",async()=>{
  expect(await createArgyleLink(alpha.token)).toMatchObject({userToken:"synthetic-user-token",sandbox:false});
  expect(await createArgyleLink(alpha.token)).toMatchObject({userToken:"synthetic-new-user-token"});
  expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url)==="https://api.argyle.com/v2/users")).toHaveLength(1);
  expect(argyleSummary(beta.token).records).toHaveLength(0);expect(JSON.stringify(argyleSummary(alpha.token))).not.toContain("synthetic-key");
});
it("stores genuine-shaped structured work records idempotently, measures delay and leaves entered tax income untouched",async()=>{
  await connectAndSync();let result=argyleSummary(alpha.token);
  expect(result).toMatchObject({connected:true,incomingOfferFeed:false,environment:"production"});
  expect(result.accounts[0]).toMatchObject({name:"Lyft test source",refreshFrequency:"5h"});
  expect(result.records[0]).toMatchObject({income:{total:"42.35",currency:"USD"},deliveryDelaySeconds:expect.any(Number)});
  expect(result.records[0].deliveryDelaySeconds).toBeGreaterThanOrEqual(60);
  income="45.10";queueArgyleSync(alpha.token);await runArgyleWorkerOnce();result=argyleSummary(alpha.token);
  expect(result.records).toHaveLength(1);expect(result.records[0].income?.total).toBe("45.10");expect(readDriverRecords(alpha.token).records).toHaveLength(0);
  const bytes=readFileSync(path.join(directory,"workspace.sqlite"));expect(bytes.includes(Buffer.from("42.35"))).toBe(false);expect(bytes.includes(Buffer.from("PRIVATE-DO-NOT-KEEP"))).toBe(false);
});
it("accepts signed webhooks into durable work queues without trusting financial fields in their payload",async()=>{
  await createArgyleLink(alpha.token);
  const raw=Buffer.from(JSON.stringify({event:"gigs.updated",data:{user:userId,account:providerAccount,income:{total:"999999"}}}));
  const signature=createHmac("sha512",secret).update(raw).digest("hex");
  expect(()=>acceptArgyleWebhook(raw,signature.slice(1))).toThrow("signature");
  expect(acceptArgyleWebhook(raw,signature)).toMatchObject({queued:true});
  expect(argyleSummary(alpha.token).records).toHaveLength(0);
  expect((await webhook(new Request(base+"/api/integrations/argyle/webhook",{method:"POST",headers:{"x-argyle-signature":signature},body:raw}))).status).toBe(200);
  await runArgyleWorkerOnce();expect(argyleSummary(alpha.token).records[0].income?.total).toBe("42.35");
});
it("rejects cross-account provider responses, hostile pagination and incomplete pages without replacing the last good snapshot",async()=>{
  await connectAndSync();foreign=true;queueArgyleSync(alpha.token);expect(await runArgyleWorkerOnce()).toMatchObject({failed:true});
  foreign=false;failPage=true;queueArgyleSync(alpha.token);expect(await runArgyleWorkerOnce()).toMatchObject({failed:true});
  failPage=false;maliciousNext=true;queueArgyleSync(alpha.token);expect(await runArgyleWorkerOnce()).toMatchObject({failed:true});
  expect(argyleSummary(alpha.token).records[0].income?.total).toBe("42.35");expect(argyleSummary(alpha.token).lastError).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.every(([url])=>new URL(String(url)).origin==="https://api.argyle.com")).toBe(true);
});
it("makes a native-to-browser handoff single-use and rechecks the original signed-in session",async()=>{
  const response=await POST(new Request(endpoint+"/handoff",{method:"POST",headers:{Authorization:`Bearer ${alpha.token}`,"Content-Type":"application/json"},body:"{}"}),context("handoff"));
  const {url}=await response.json();expect(url).not.toContain(alpha.token);
  const redeemed=await GET(new Request(url),context("handoff"));expect(redeemed.status).toBe(303);expect(redeemed.headers.get("set-cookie")).toContain("HttpOnly");
  expect((await GET(new Request(url),context("handoff"))).status).toBe(400);
  const next=await POST(new Request(endpoint+"/handoff",{method:"POST",headers:headers(),body:"{}"}),context("handoff"));
  signOutCustomer(alpha.token);expect((await GET(new Request((await next.json()).url),context("handoff"))).status).toBe(401);
});
it("stops in-flight ingestion after disconnect without deleting previously received history",async()=>{
  await connectAndSync();afterGigs=async()=>{await disconnectArgyle(alpha.token);};queueArgyleSync(alpha.token);await runArgyleWorkerOnce();
  expect(argyleSummary(alpha.token)).toMatchObject({status:"disconnected",connected:false});expect(argyleSummary(alpha.token).records).toHaveLength(1);
  expect(await runArgyleWorkerOnce()).toMatchObject({processed:0});
});
it("fails closed for clients requiring off-host encryption before making a provider call",async()=>{
  workspaceDatabase(db=>{db.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT,clientId TEXT,status TEXT)");db.prepare("INSERT INTO secure_tax_enrollments VALUES(?,?,'active')").run(alpha.id,alpha.clientId);},true);
  expect(argyleSummary(alpha.token)).toMatchObject({ready:false,status:"protected",records:[]});await expect(createArgyleLink(alpha.token)).rejects.toThrow("offhost");expect(fetch).not.toHaveBeenCalled();
});
it("saves provider keys privately and does not allow an active client to cross production and sandbox identities",async()=>{
  saveArgyleSetup({provider:"argyle",environment:"production",apiKeyId:"synthetic-key-id",apiKeySecret:"synthetic-key-secret",enabled:true});
  expect(JSON.stringify(argyleSetupStatus())).not.toContain("synthetic-key-secret");
  expect(readFileSync(path.join(directory,"connections.enc")).includes(Buffer.from("synthetic-key-secret"))).toBe(false);
  await createArgyleLink(alpha.token);
  expect(()=>saveArgyleSetup({provider:"argyle",environment:"sandbox",apiKeyId:"other",apiKeySecret:"other",enabled:true})).toThrow("Disconnect");
});
it("can verify outbound API keys before public hosting is ready, without claiming a ready client connection",async()=>{
  vi.stubEnv("APP_BASE_URL","http://127.0.0.1:3000");expect(await checkArgyleAccess()).toMatchObject({ok:true});expect(argyleSummary(alpha.token).ready).toBe(false);
});
it("preserves the first receipt of an unchanged record across polling and measures its current source age separately",async()=>{
  await connectAndSync();
  const first=argyleSummary(alpha.token).records[0];
  workspaceDatabase(db=>db.prepare("UPDATE gig_cloud_records SET observedAt=? WHERE accountId=?").run(new Date(Date.parse(first.observedAt)-5000).toISOString(),alpha.id),true);
  const original=argyleSummary(alpha.token).records[0];
  queueArgyleSync(alpha.token);await runArgyleWorkerOnce();
  expect(argyleSummary(alpha.token).records[0]).toMatchObject({observedAt:original.observedAt,receivedAt:original.receivedAt,deliveryDelaySeconds:original.deliveryDelaySeconds,requestToReceiptSeconds:original.requestToReceiptSeconds});
});
it("marks removed source records and disconnected provider accounts without destroying saved evidence",async()=>{
  await connectAndSync();missingGig=true;queueArgyleSync(alpha.token);await runArgyleWorkerOnce();
  expect(argyleSummary(alpha.token).records[0].removedAt).toBeTruthy();
  missingGig=false;queueArgyleSync(alpha.token);await runArgyleWorkerOnce();expect(argyleSummary(alpha.token).records[0].removedAt).toBeNull();
  missingAccount=true;queueArgyleSync(alpha.token);await runArgyleWorkerOnce();
  expect(argyleSummary(alpha.token)).toMatchObject({connected:false,accounts:[{status:"disconnected"}]});
  expect(argyleSummary(alpha.token).records).toHaveLength(1);
});
it("retries failed provider revocation while paused, then supports a fresh connection with retained history",async()=>{
  await connectAndSync();revokeFails=true;await expect(disconnectArgyle(alpha.token)).rejects.toThrow();
  expect(argyleSummary(alpha.token)).toMatchObject({connected:false,status:"disconnecting",canDisconnect:true});
  vi.stubEnv("ARGYLE_ENABLED","false");revokeFails=false;await disconnectArgyle(alpha.token);
  vi.stubEnv("ARGYLE_ENABLED","true");await createArgyleLink(alpha.token);
  expect(argyleSummary(alpha.token).status).toBe("active");expect(argyleSummary(alpha.token).records).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url).endsWith("/users")&&init?.method==="POST")).toHaveLength(2);
});
it("records a worker heartbeat even when the provider is not configured",async()=>{
  vi.stubEnv("ARGYLE_ENABLED","false");expect(await runArgyleWorkerOnce()).toMatchObject({configured:false,processed:0});
  expect(argyleSetupStatus()).toMatchObject({workerRunning:true,workerLastSeenAt:expect.any(String),liveOffersVerified:false});
});
it("recovers an uncertain provider creation by exact external identity without creating a duplicate",async()=>{
  await createArgyleLink(alpha.token);
  workspaceDatabase(db=>db.prepare("UPDATE gig_cloud_users SET status='attention',providerUser=NULL,leaseUntil=0 WHERE accountId=?").run(alpha.id),true);
  expect(await recoverArgyleUsers()).toEqual({reconciled:1,needsReview:0});
  await createArgyleLink(alpha.token);
  expect(vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url).endsWith("/users")&&init?.method==="POST")).toHaveLength(1);
});
it("retains a webhook arriving during retrieval for a subsequent durable update",async()=>{
  await createArgyleLink(alpha.token);queueArgyleSync(alpha.token);
  afterGigs=async()=>{queueArgyleSync(alpha.token);};
  expect(await runArgyleWorkerOnce()).toMatchObject({processed:1});
  expect(await runArgyleWorkerOnce()).toMatchObject({processed:1});
  expect(await runArgyleWorkerOnce()).toMatchObject({processed:0});
});
