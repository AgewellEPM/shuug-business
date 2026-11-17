// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {importBusinessTemplate} from "../branding/templates";
import {gigTaxProsTemplate} from "../industry/rideshare-tax-pros";
import {saveCustomerSettings} from "../customer-access/service";
import {workspaceDatabase} from "../workspace/database";
import {hashPassword} from "../auth/passwords";
import {totp} from "../auth/mfa/crypto";
import {initPrivateAccounts,privateTaxSession} from "./private-accounts";
import {nativeSecureSignIn,nativeSecureSignOut} from "./session";

const base="https://workspace.example.com",password="Synthetic native private password";
let directory:string,accountId:string,clientId:string;
function request(body?:unknown,headers:Record<string,string>={},method="POST") {
  return new Request(base+"/api/website/customer/secure/native-session",{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
beforeEach(()=>{
  directory=mkdtempSync(`${tmpdir()}/gigtax-native-session-`);
  for(const [key,value] of Object.entries({DEALDESK_DATA_DIR:directory,DATABASE_URL:"",DEMO_DATA:"false",APP_BASE_URL:base,SHUUG_SECURE_TAX_TRUSTED_ORIGIN:"https://portal.example.net",SHUUG_REQUIRE_MFA:"true"}))vi.stubEnv(key,value);
  importBusinessTemplate(gigTaxProsTemplate);saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
  accountId=randomUUID();clientId=randomUUID();
  workspaceDatabase(db=>{initPrivateAccounts(db);db.prepare("INSERT INTO secure_tax_accounts VALUES(?,?,'active',?,?,NULL)").run(accountId,clientId,hashPassword(password),new Date().toISOString());},true);
});
afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
it("requires password and a verified authenticator before issuing a revocable opaque bearer session",async()=>{
  const first=await nativeSecureSignIn(request({accountCode:accountId,password}));expect(first.status).toBe(428);
  const challenge=await first.json();expect(challenge.enrollmentRequired).toBe(true);expect(challenge.token).toBeUndefined();
  const response=await nativeSecureSignIn(request({challengeToken:challenge.challengeToken,privateAccount:true,code:totp(challenge.secret,Math.floor(Date.now()/30000))}));
  expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toContain("no-store");expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  const session=await response.json();expect(session.identity).toEqual({accountId,clientId});expect(session).not.toHaveProperty("email");expect(session.recoveryCodes).toHaveLength(10);expect(workspaceDatabase(db=>privateTaxSession(db,session.token))?.id).toBe(accountId);
  expect((await nativeSecureSignOut(request(undefined,{Authorization:`Bearer ${session.token}`},"DELETE"))).status).toBe(200);
  expect(workspaceDatabase(db=>privateTaxSession(db,session.token))).toBeNull();
});
it("rejects browser and cookie requests before reading credentials and refuses legacy identifiers",async()=>{
  for(const headers of [{Origin:"null"},{Origin:"https://portal.example.net"},{"Sec-Fetch-Site":"none"},{Cookie:"session=synthetic"}]) {
    const req=request({accountCode:accountId,password},headers);expect((await nativeSecureSignIn(req)).status).toBe(403);expect(req.bodyUsed).toBe(false);
  }
  for(const body of [{email:"synthetic@example.net",password},{accountCode:accountId,password,clientId},{challengeToken:"a".repeat(64),code:"123456"}])expect((await nativeSecureSignIn(request(body))).status).toBe(400);
  expect((await nativeSecureSignIn(request({accountCode:accountId,password:"wrong"}))).status).toBe(401);
});
