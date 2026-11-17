// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { importBusinessTemplate } from "../../branding/templates";
import { gigTaxProsTemplate } from "../../industry/rideshare-tax-pros";
import { configureOwnerPassword, signInOwner } from "../owner-session";
import { MfaChallengeError } from "../mfa/model";
import { completeLoginFactor, loginFactorView } from "../mfa/store";
import { totp } from "../mfa/crypto";
import { workspaceDatabase } from "../../workspace/database";
import { initPrivateAccounts, signInPrivateTaxAccount } from "../../secure-tax/private-accounts";
import { hashPassword } from "../passwords";
import { randomUUID } from "node:crypto";
import { startSocialSignIn, finishSocialCallback, cancelSocialCallback, claimSocialResult, linkedSocialProviders, unlinkSocialProvider } from "./store";
const identity = vi.hoisted(() => ({ issuer: "https://accounts.google.com", subject: "synthetic-stable-subject", refreshToken: null }));
vi.mock("./providers", async importOriginal => ({ ...await importOriginal<typeof import("./providers")>(), exchangeAuthorizationCode: vi.fn(async () => identity) }));
let directory: string, owner: string;
const verifier = "v".repeat(43), challenge = createHash("sha256").update(verifier).digest("base64url");
beforeEach(() => {
  directory = mkdtempSync(`${tmpdir()}/gigtax-social-flow-`);
  for (const [key, value] of Object.entries({ DEALDESK_DATA_DIR: directory, DATABASE_URL: "", DEMO_DATA: "false", APP_BASE_URL: "https://workspace.example.com", SHUUG_REQUIRE_MFA: "true", GIGTAX_GOOGLE_SIGNIN_CLIENT_ID: "synthetic.apps.googleusercontent.com", GIGTAX_GOOGLE_SIGNIN_CLIENT_SECRET: "synthetic-secret" })) vi.stubEnv(key, value);
  importBusinessTemplate(gigTaxProsTemplate); configureOwnerPassword("Synthetic owner login password");
  try { signInOwner("Synthetic owner login password"); } catch (error) { expect(error).toBeInstanceOf(MfaChallengeError); const token = (error as MfaChallengeError).challenge.challengeToken; owner = completeLoginFactor(token, totp(loginFactorView(token, "staff").secret!, Math.floor(Date.now()/30000)), "staff").token; }
});
afterEach(() => {vi.unstubAllEnvs();rmSync(directory, {recursive:true, force:true});});
async function completed(purpose: "link" | "login", token?: string) {
  const flow = startSocialSignIn({provider:"google", audience:"owner",purpose,challenge}, token);
  await finishSocialCallback("google", new URL(flow.authorizationUrl).searchParams.get("state")!, "synthetic-code"); return flow;
}
it("requires current account authority to connect a verified identity, preserves MFA and consumes each proof once", async () => {
  expect(() => startSocialSignIn({provider:"google",audience:"owner",purpose:"link",challenge})).toThrow();
  const linked = await completed("link", owner);
  expect(() => claimSocialResult({requestId:linked.requestId,verifier:"w".repeat(43)},owner)).toThrow();
  expect(claimSocialResult({requestId:linked.requestId,verifier},owner)).toMatchObject({linked:true});
  expect(() => claimSocialResult({requestId:linked.requestId,verifier},owner)).toThrow();
  const login = await completed("login");const result = claimSocialResult({requestId:login.requestId,verifier});expect(result).toMatchObject({mfaRequired:true,audience:"owner",enrollmentRequired:false});expect(result).not.toHaveProperty("token");
  const stored = workspaceDatabase(db=>JSON.stringify(db.prepare("SELECT * FROM social_identities").all()));expect(stored).not.toContain(identity.subject);expect(stored).not.toContain("@example");
});
it("never links by email or returns a session for an unknown provider identity, and rejects callback replay", async () => {
  const flow = await completed("login");expect(() => claimSocialResult({requestId:flow.requestId,verifier})).toThrow("not connected");
  await expect(finishSocialCallback("google", new URL(flow.authorizationUrl).searchParams.get("state")!, "synthetic-code")).rejects.toThrow();
});
it("binds client linking to its original MFA-verified account and issues only that client audience", async () => {
  function account() {
    const id=randomUUID(),password="Synthetic client social password";
    workspaceDatabase(db=>{initPrivateAccounts(db);db.prepare("INSERT INTO secure_tax_accounts VALUES(?,?,'active',?,?,NULL)").run(id,randomUUID(),hashPassword(password),new Date().toISOString());},true);
    try {signInPrivateTaxAccount(id,password);}catch(error){expect(error).toBeInstanceOf(MfaChallengeError);const challenge=(error as MfaChallengeError).challenge.challengeToken;return {id,token:completeLoginFactor(challenge,totp(loginFactorView(challenge,"secure-customer").secret!,Math.floor(Date.now()/30000)),"secure-customer").token};}
    throw new Error("MFA was not required");
  }
  const first=account(),other=account();
  const flow=startSocialSignIn({provider:"google",audience:"secure-customer",purpose:"link",challenge},first.token);
  await finishSocialCallback("google",new URL(flow.authorizationUrl).searchParams.get("state")!,"synthetic-code");
  expect(()=>claimSocialResult({requestId:flow.requestId,verifier},other.token)).toThrow("account changed");
  expect(claimSocialResult({requestId:flow.requestId,verifier},first.token)).toMatchObject({linked:true});
  const login=startSocialSignIn({provider:"google",audience:"secure-customer",purpose:"login",challenge});await finishSocialCallback("google",new URL(login.authorizationUrl).searchParams.get("state")!,"synthetic-code");
  expect(claimSocialResult({requestId:login.requestId,verifier})).toMatchObject({mfaRequired:true,audience:"secure-customer"});
});
it("disconnects a provider only for its verified account and invalidates outstanding provider sign-ins",async()=>{
 const linked=await completed("link",owner);claimSocialResult({requestId:linked.requestId,verifier},owner);expect(linkedSocialProviders("owner",owner)).toEqual(["google"]);
 const waiting=await completed("login");await expect(unlinkSocialProvider({provider:"google",audience:"owner"},"a".repeat(64))).rejects.toThrow();
 expect(await unlinkSocialProvider({provider:"google",audience:"owner"},owner)).toMatchObject({disconnected:true});expect(linkedSocialProviders("owner",owner)).toEqual([]);
 expect(()=>claimSocialResult({requestId:waiting.requestId,verifier})).toThrow();
});
it("ends a cancelled provider flow immediately so the app can retry without waiting ten minutes",()=>{
 const flow=startSocialSignIn({provider:"google",audience:"owner",purpose:"login",challenge}),state=new URL(flow.authorizationUrl).searchParams.get("state")!;
 expect(claimSocialResult({requestId:flow.requestId,verifier})).toMatchObject({pending:true});cancelSocialCallback("google",state);
 expect(()=>claimSocialResult({requestId:flow.requestId,verifier})).toThrow();
});
