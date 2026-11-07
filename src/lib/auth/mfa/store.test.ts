// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { configureOwnerPassword, ownerSessionValid, signInOwner } from "../owner-session";
import { acceptEmployeeInvitation, createEmployeeAccount, employeeSession, issueEmployeeInvitation, setEmployeeEnabled, signInEmployee } from "../employees";
import { acceptCustomerInvitation, createCustomerAccount, customerSession, issueCustomerInvitation, signInCustomer } from "../../customer-access/accounts";
import { saveBusinessRecord } from "../../workspace/store";
import { workspaceDatabase } from "../../workspace/database";
import { completeLoginFactor, loginFactorView } from "./store";
import { MfaChallengeError, type MfaAudience, type MfaChallenge } from "./model";
import { totp } from "./crypto";
let directory: string;
const password = "Synthetic-owner-password-12345";
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/shuug-mfa-`);
  vi.stubEnv("DEALDESK_DATA_DIR", directory); vi.stubEnv("SHUUG_REQUIRE_MFA", "true"); vi.stubEnv("DEMO_DATA", "false");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory,{recursive:true,force:true}); });
function challenge(login: () => string): MfaChallenge {
  try { login(); throw new Error("Password alone unexpectedly issued a session"); }
  catch (error) { expect(error).toBeInstanceOf(MfaChallengeError); return (error as MfaChallengeError).challenge; }
}
function enroll(login: () => string, audience: MfaAudience) {
  const pending = challenge(login), view = loginFactorView(pending.challengeToken,audience);
  expect(view.enrollmentRequired).toBe(true); expect(view.secret).toMatch(/^[A-Z2-7]{32}$/);
  return { secret: view.secret!, result: completeLoginFactor(pending.challengeToken,totp(view.secret!,Math.floor(Date.now()/30000)),audience) };
}
it("requires owner enrollment before access and consumes challenges and codes once", () => {
  configureOwnerPassword(password); const pending=challenge(()=>signInOwner(password));
  expect(ownerSessionValid(pending.challengeToken)).toBe(false);
  const view=loginFactorView(pending.challengeToken,"staff"), code=totp(view.secret!,Math.floor(Date.now()/30000));
  expect(()=>completeLoginFactor(pending.challengeToken,"bad-code","staff")).toThrow(/incorrect/);
  const result=completeLoginFactor(pending.challengeToken,code,"staff");
  expect(ownerSessionValid(result.token)).toBe(true); expect(result.recoveryCodes).toHaveLength(10);
  expect(()=>completeLoginFactor(pending.challengeToken,code,"staff")).toThrow(/expired/);
  const again=challenge(()=>signInOwner(password));expect(again.enrollmentRequired).toBe(false);
  expect(loginFactorView(again.challengeToken,"staff").secret).toBeNull();
  expect(()=>completeLoginFactor(again.challengeToken,code,"staff")).toThrow(/already used/);
  vi.advanceTimersByTime(30000);
  expect(ownerSessionValid(completeLoginFactor(again.challengeToken,totp(view.secret!,Math.floor(Date.now()/30000)),"staff").token)).toBe(true);
  workspaceDatabase(db=>{
    expect(JSON.stringify(db.prepare("SELECT * FROM mfa_factors").all())).not.toContain(view.secret!);
    expect(JSON.stringify(db.prepare("SELECT * FROM mfa_recovery").all())).not.toContain(result.recoveryCodes[0].replaceAll("-",""));
    expect(JSON.stringify(db.prepare("SELECT * FROM audit").all())).not.toContain(view.secret!);
  });
});
it("uses recovery once and revokes prior grants without bypassing the password", () => {
  configureOwnerPassword(password); const first=enroll(()=>signInOwner(password),"staff").result;
  expect(()=>signInOwner("incorrect-password")).toThrow(/Incorrect/);
  const next=challenge(()=>signInOwner(password));
  const recovered=completeLoginFactor(next.challengeToken,first.recoveryCodes[0],"staff");
  expect(ownerSessionValid(first.token)).toBe(false); expect(ownerSessionValid(recovered.token)).toBe(true);
  const retry=challenge(()=>signInOwner(password));expect(()=>completeLoginFactor(retry.challengeToken,first.recoveryCodes[0],"staff")).toThrow(/already used/);
});
it("rejects stale password proofs and expires pending setup", () => {
  configureOwnerPassword(password);const pending=challenge(()=>signInOwner(password));
  configureOwnerPassword("A-different-synthetic-password",true);
  expect(()=>loginFactorView(pending.challengeToken,"staff")).toThrow(/account changed/);
  const other=challenge(()=>signInOwner("A-different-synthetic-password"));vi.advanceTimersByTime(300001);
  expect(()=>loginFactorView(other.challengeToken,"staff")).toThrow(/expired/);
});
it("retains throttling across challenges and independent reads", () => {
  configureOwnerPassword(password); const pending=challenge(()=>signInOwner(password));
  for(let i=0;i<8;i++)expect(()=>completeLoginFactor(pending.challengeToken,"bad-code","staff")).toThrow(/incorrect/);
  expect(()=>signInOwner(password)).toThrow(/Too many/);expect(()=>loginFactorView(pending.challengeToken,"staff")).toThrow(/Too many/);
  vi.advanceTimersByTime(900001);expect(challenge(()=>signInOwner(password)).enrollmentRequired).toBe(true);
});
it("isolates staff and client challenges and rechecks account revocation", () => {
  const staff=createEmployeeAccount({memberId:"synthetic-staff",name:"Synthetic",email:"staff@example.invalid"});acceptEmployeeInvitation(issueEmployeeInvitation(staff.id),password);
  const s=enroll(()=>signInEmployee(staff.email,password),"staff");expect(employeeSession(s.result.token)?.id).toBe(staff.id);
  const pending=challenge(()=>signInEmployee(staff.email,password));
  expect(()=>completeLoginFactor(pending.challengeToken,s.result.recoveryCodes[0],"customer")).toThrow(/expired/);
  setEmployeeEnabled(staff.id,false);expect(employeeSession(s.result.token)).toBeNull();
  expect(()=>completeLoginFactor(pending.challengeToken,s.result.recoveryCodes[0],"staff")).toThrow(/account changed/);
  const client=saveBusinessRecord({kind:"client",title:"Synthetic",fields:{email:"client@example.invalid"}},"owner");
  const account=createCustomerAccount({name:"Synthetic client",email:"client@example.invalid",clientId:client.id,customerId:null});acceptCustomerInvitation(issueCustomerInvitation(account.id),password);
  const c=enroll(()=>signInCustomer(account.email,password),"customer");expect(customerSession(c.result.token)?.id).toBe(account.id);
  expect(employeeSession(c.result.token)).toBeNull();expect(ownerSessionValid(c.result.token)).toBe(false);
});
it("invalidates existing password-only sessions when enforcement is enabled", () => {
  vi.stubEnv("SHUUG_REQUIRE_MFA","false");configureOwnerPassword(password);const old=signInOwner(password);expect(ownerSessionValid(old)).toBe(true);
  vi.stubEnv("SHUUG_REQUIRE_MFA","true");expect(ownerSessionValid(old)).toBe(false);
});
