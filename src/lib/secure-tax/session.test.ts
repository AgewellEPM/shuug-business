// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {importBusinessTemplate} from "../branding/templates";
import {gigTaxProsTemplate} from "../industry/rideshare-tax-pros";
import {saveBusinessRecord} from "../workspace/store";
import {createLinkedCustomer,saveCustomerSettings} from "../customer-access/service";
import {acceptCustomerInvitation,issueCustomerInvitation,customerSession} from "../customer-access/accounts";
import {secureSignIn,secureSignOut} from "./session";
import {secureOptions} from "./http";
const origin="https://trusted.example.net",base="https://workspace.example.com",password="Synthetic-secure-browser-password";
let directory:string,identity:{accountId:string,clientId:string};
const request=(from:string|undefined=origin,body:unknown={email:"synthetic@example.com",password},method="POST",token?:string)=>new Request(`${base}/api/website/customer/secure/session`,{method,headers:{...(from?{Origin:from}:{}),...(body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
beforeEach(async()=>{
 directory=mkdtempSync(`${tmpdir()}/shuug-secure-session-`);vi.stubEnv("DEALDESK_DATA_DIR",directory);vi.stubEnv("DATABASE_URL","");vi.stubEnv("DEMO_DATA","false");vi.stubEnv("APP_BASE_URL",base);vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN",origin);
 importBusinessTemplate(gigTaxProsTemplate);saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
 const client=saveBusinessRecord({kind:"client",title:"Synthetic",fields:{email:"synthetic@example.com"}},"owner");
 const account=await createLinkedCustomer({name:"Synthetic",email:"synthetic@example.com",clientId:client.id,customerId:null});acceptCustomerInvitation(issueCustomerInvitation(account.id),password);identity={accountId:account.id,clientId:client.id};
});
afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
it("only the independently configured browser can sign in and receive an opaque account binding",async()=>{
 const response=await secureSignIn(request());expect(response.status).toBe(200);expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);expect(response.headers.get("Cache-Control")).toContain("no-store");
 const body=await response.json();expect(body.identity).toEqual(identity);expect(customerSession(body.token)?.id).toBe(identity.accountId);expect(body).not.toHaveProperty("name");expect(JSON.stringify(body)).not.toContain(password);
 const out=await secureSignOut(request(origin,undefined,"DELETE",body.token));expect(out.status).toBe(200);expect(customerSession(body.token)).toBeNull();
});
it("rejects foreign, missing and same-host origins before credential processing and exposes no permissive CORS",async()=>{
 for(const from of ["https://evil.example",base]){const response=await secureSignIn(request(from));expect(response.status).toBe(403);expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();}
 const withoutOrigin=new Request(`${base}/api/website/customer/secure/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"synthetic@example.com",password})});
 expect((await secureSignIn(withoutOrigin)).status).toBe(403);
 expect(secureOptions(request(origin,undefined,"OPTIONS")).headers.get("Access-Control-Allow-Origin")).toBe(origin);
 vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN",base);expect((await secureSignIn(request(base))).status).toBe(503);
});
it("keeps existing login attempt limits and rejects client binding injection",async()=>{
 expect((await secureSignIn(request(origin,{email:"synthetic@example.com",password,clientId:"foreign"}))).status).toBe(400);
 for(let i=0;i<8;i++)expect((await secureSignIn(request(origin,{email:"synthetic@example.com",password:"wrong"}))).status).toBe(401);
 const limited=await secureSignIn(request());expect(limited.status).toBe(401);expect(await limited.json()).toEqual({error:"Sign-in failed. Check your account details or try again later."});
});
