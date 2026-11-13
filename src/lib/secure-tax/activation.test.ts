// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync,readdirSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {importBusinessTemplate} from "../branding/templates";
import {gigTaxProsTemplate} from "../industry/rideshare-tax-pros";
import {saveCustomerSettings} from "../customer-access/service";
import {workspaceDatabase} from "../workspace/database";
import {configureOwnerPassword,signInOwner} from "../auth/owner-session";
import {MfaChallengeError} from "../auth/mfa/model";
import {completeLoginFactor,loginFactorView} from "../auth/mfa/store";
import {totp} from "../auth/mfa/crypto";
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from "../../../packages/secure-tax-client/firm-recovery.mjs";
import {signStaffGrant} from "../../../packages/secure-tax-client/firm-staff.mjs";
import {generateRecipientKeyPair,publicKeyId} from "../../../packages/secure-tax-client/envelope.mjs";
import {VaultClient} from "../../../packages/secure-tax-client/browser/client.mjs";
import {publishStaffGrant,readStaffScope} from "./staff-store";
import {privateTaxSession} from "./private-accounts";
import {customerSession} from "../customer-access/accounts";
import {POST as invite,DELETE as revoke} from "@/app/api/website/customer/secure/staff/client-invitations/route";
import {POST as challenge} from "@/app/api/website/customer/secure/activation/challenge/route";
import {POST as activate} from "@/app/api/website/customer/secure/activation/route";
import {POST as signIn,DELETE as signOut} from "@/app/api/website/customer/secure/session/route";
import {GET as status} from "@/app/api/website/customer/secure/status/route";
import {GET as changes} from "@/app/api/website/customer/secure/objects/route";
import {GET as object} from "@/app/api/website/customer/secure/objects/[id]/route";

import {POST as accountPassword,DELETE as accountSessions} from "@/app/api/website/customer/secure/account/route";
import {POST as accountAccess} from "@/app/api/website/customer/secure/staff/client-access/route";

import {approvePasswordRecovery} from "../../../packages/secure-tax-client/firm-password-recovery.mjs";
import {POST as requestRecovery,DELETE as revokeRecovery} from "@/app/api/website/customer/secure/staff/password-recovery/route";
import {POST as recoveryChallenge} from "@/app/api/website/customer/secure/password-recovery/challenge/route";
import {POST as recoverPassword} from "@/app/api/website/customer/secure/password-recovery/route";

import {renewFirmEnrollment} from "../../../packages/secure-tax-client/firm-enrollment-renewal.mjs";
import {GET as clientRenewalRequest,POST as clientRenewal} from "@/app/api/website/customer/secure/enrollment-renewal/route";
import {GET as ownerRenewalRequest,POST as ownerRenewal} from "@/app/api/website/customer/secure/staff/enrollment-renewal/route";

import {approveAuthenticatorRecovery} from "../../../packages/secure-tax-client/firm-authenticator-recovery.mjs";
import {openAuthenticatorRecoveryChallenge} from "../../../packages/secure-tax-client/authenticator-recovery-proof.mjs";
import {POST as requestAuthenticatorRecovery,DELETE as revokeAuthenticatorRecovery} from "@/app/api/website/customer/secure/staff/authenticator-recovery/route";
import {POST as authenticatorChallenge} from "@/app/api/website/customer/secure/authenticator-recovery/challenge/route";
import {POST as recoverAuthenticator} from "@/app/api/website/customer/secure/authenticator-recovery/route";

const origin="https://trusted.example.net",base="https://workspace.example.com",password="Synthetic private account password",prefix="/api/website/customer/secure";
let directory:string,owner:string,config:any,firm:any,client:any,keys:any,calls:{path:string;body:string}[],alterActivation:((body:any)=>any)|undefined,alterRecovery:((body:any)=>any)|undefined;
const request=(path:string,body?:unknown,token?:string,method="POST",from=origin)=>new Request(base+prefix+path,{method,headers:{Origin:from,...(body===undefined?{}:{"Content-Type":"application/json"}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
beforeEach(async()=>{
 directory=mkdtempSync(`${tmpdir()}/shuug-private-activation-`);for(const [key,value]of Object.entries({DEALDESK_DATA_DIR:directory,DATABASE_URL:"",DEMO_DATA:"false",APP_BASE_URL:base,SHUUG_SECURE_TAX_TRUSTED_ORIGIN:origin,SHUUG_REQUIRE_MFA:"false"}))vi.stubEnv(key,value);
 importBusinessTemplate(gigTaxProsTemplate);saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});configureOwnerPassword(password);let factor="";
 try{signInOwner(password,true);}catch(error){expect(error).toBeInstanceOf(MfaChallengeError);factor=(error as MfaChallengeError).challenge.challengeToken;}
 owner=completeLoginFactor(factor,totp(loginFactorView(factor,"staff").secret!,Math.floor(Date.now()/30000)),"staff").token;
 const created=await createFirmBundle("synthetic-private-enrollment","Synthetic separate firm passphrase");firm=await unlockFirmBundle(created.bundle,"Synthetic separate firm passphrase",created.publicPins);config={version:1,uiOrigin:origin,apiOrigin:base,...created.publicPins};delete config.signerKeyId;delete config.firmRecoveryKeyId;
 vi.stubEnv("SHUUG_SECURE_TAX_WORKSPACE_ID",config.workspaceId);vi.stubEnv("SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY",config.signerPublicKey);vi.stubEnv("SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY",config.firmRecoveryPublicKey);
 keys={keys:new Map(),bindings:new Map(),async putKey(value:any){this.keys.set(value.keyId,value);},async getKey(id:string){return this.keys.get(id);},async listKeys(){return [...this.keys.values()];},async putBinding(value:any){this.bindings.set(value.id,value);},async getBinding(id:string){return this.bindings.get(id);}};calls=[];alterActivation=undefined;alterRecovery=undefined;
 const pair=await generateRecipientKeyPair();await keys.putKey({...pair,keyId:await publicKeyId(pair.publicKey)});
 client=await VaultClient.create(config,origin,{storage:keys,fetcher:async(url:string,options:any={})=>{
   const path=new URL(url).pathname.slice(prefix.length),req=new Request(url,{...options,headers:{...options.headers,Origin:origin}});calls.push({path,body:options.body??""});
   if(path==="/authenticator-recovery/challenge")return authenticatorChallenge(req);if(path==="/authenticator-recovery")return recoverAuthenticator(req);
   if(path==="/enrollment-renewal")return options.method==="POST"?clientRenewal(req):clientRenewalRequest(req);if(path==="/password-recovery/challenge")return recoveryChallenge(req);if(path==="/password-recovery")return recoverPassword(alterRecovery?request(path,alterRecovery(JSON.parse(options.body))):req);if(path==="/activation/challenge")return challenge(req);if(path==="/activation")return activate(alterActivation?request(path,alterActivation(JSON.parse(options.body))):req);if(path==="/session")return options.method==="DELETE"?signOut(req):signIn(req);if(path==="/account")return options.method==="DELETE"?accountSessions(req):accountPassword(req);if(path==="/status")return status(req);if(path==="/objects")return changes(req);if(path.startsWith('/objects/'))return object(req,{params:Promise.resolve({id:path.slice('/objects/'.length)})});throw new Error('Unexpected request '+path);
 }});
});
afterEach(()=>{client?.lock();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
async function setup(options:any={}){const response=await invite(request('/staff/client-invitations',{},owner));expect(response.status).toBe(200);const invitation=await response.json(),keyId=[...keys.keys.keys()][0],publicRequest=await client.newEnrollmentRequest(invitation,keyId),manifest=await signEnrollmentRequest(publicRequest,firm,{epoch:1,...options});return {invitation,keyId,manifest};}
async function enrolledAuthenticator(){const f=await setup();await client.activateNewAccount({...f,password,profile:{legalName:'Synthetic authenticator recovery client',email:'',phone:'',mailingAddress:''}});await client.signInWithCode(f.invitation.accountId,password);const secret=client.pendingMfa.secret,session=await client.verifySignIn(totp(secret,Math.floor(Date.now()/30000)));await client.unlock(f.keyId);await client.sync();const original=new Uint8Array([...client.records.values()][0].plaintext),invitation=await (await requestAuthenticatorRecovery(request('/staff/authenticator-recovery',{accountCode:f.invitation.accountId},owner))).json(),approval=await approveAuthenticatorRecovery(invitation.request,invitation.manifest,firm,{identityAndKeyReviewed:true});return {...f,secret,session,original,recovery:{invitation,approval,keyId:f.keyId,password}};}
it('replaces a lost authenticator only after key and new-code proofs, preserving encrypted data and revoking old sessions/codes',async()=>{
 const f=await enrolledAuthenticator(),oldToken=workspaceDatabase(db=>db.prepare("SELECT tokenHash FROM secure_tax_sessions WHERE accountId=?").get(f.invitation.accountId)) as any;
 const setup=await client.beginAuthenticatorRecovery(f.recovery);expect(setup.secret).not.toBe(f.secret);expect(client.identity).toBeNull();expect(workspaceDatabase(db=>db.prepare("SELECT revision FROM mfa_factors WHERE kind='secure-customer' AND account_id=?").get(f.invitation.accountId))).toMatchObject({revision:1});
 let wrong='000000';const valid=new Set([-1,0,1].map(offset=>totp(setup.secret,Math.floor(Date.now()/30000)+offset)));while(valid.has(wrong))wrong=String(Number(wrong)+1).padStart(6,'0');await expect(client.finishAuthenticatorRecovery(wrong)).rejects.toThrow();expect(workspaceDatabase(db=>db.prepare("SELECT revision FROM mfa_factors WHERE kind='secure-customer' AND account_id=?").get(f.invitation.accountId))).toMatchObject({revision:1});
 const result=await client.finishAuthenticatorRecovery(totp(setup.secret,Math.floor(Date.now()/30000)));expect(result.recoveryCodes).toHaveLength(10);expect(result.oldRecoveryCodesRevoked).toBe(true);
 expect(workspaceDatabase(db=>db.prepare("SELECT 1 FROM secure_tax_sessions WHERE tokenHash=?").get(oldToken.tokenHash))).toBeUndefined();
 const complete=JSON.parse(calls.filter(call=>call.path==='/authenticator-recovery').at(-1)!.body);expect((await recoverAuthenticator(request('/authenticator-recovery',complete))).status).toBe(409);
 await client.signInWithCode(f.invitation.accountId,password);await expect(client.verifySignIn(f.session.recoveryCodes[0])).rejects.toThrow();await client.verifySignIn(totp(setup.secret,Math.floor(Date.now()/30000)+1));await client.unlock(f.keyId);await client.sync();expect([...client.records.values()][0].plaintext).toEqual(f.original);
 await client.signOut();await client.signInWithCode(f.invitation.accountId,password);await client.verifySignIn(result.recoveryCodes[0]);expect(client.identity.accountId).toBe(f.invitation.accountId);
});
it('authenticator recovery rejects another purpose, wrong passwords, key proofs, review and revocation without clearing the old factor',async()=>{
 const f=await enrolledAuthenticator(),path='/authenticator-recovery/challenge',body={token:f.recovery.invitation.token,approval:f.recovery.approval,password};
 await expect(approveAuthenticatorRecovery(f.recovery.invitation.request,f.manifest,firm)).rejects.toThrow();expect((await requestAuthenticatorRecovery(request('/staff/authenticator-recovery',{accountCode:f.invitation.accountId}))).status).toBe(401);
 expect((await authenticatorChallenge(request(path,{...body,password:'wrong'}))).status).toBe(403);
 const passwordInvitation=await(await requestRecovery(request('/staff/password-recovery',{accountCode:f.invitation.accountId},owner))).json(),passwordApproval=await approvePasswordRecovery(passwordInvitation.request,f.manifest,firm,{identityAndKeyReviewed:true});expect((await authenticatorChallenge(request(path,{...body,approval:passwordApproval}))).status).toBe(403);
 const setup=await(await authenticatorChallenge(request(path,body))).json(),finish={token:body.token,approval:body.approval,challengeId:setup.challenge.challengeId,answer:'A'.repeat(43),code:totp(setup.secret,Math.floor(Date.now()/30000))};expect((await recoverAuthenticator(request('/authenticator-recovery',finish))).status).toBe(409);
 const answer=await openAuthenticatorRecoveryChallenge(setup.challenge,f.manifest,{accountId:f.invitation.accountId,clientId:f.invitation.clientId},config,keys.keys.get(f.keyId).privateKey);expect((await recoverAuthenticator(request('/authenticator-recovery',{...finish,answer}))).status).toBe(409);
 await revokeAuthenticatorRecovery(request('/staff/authenticator-recovery',{requestId:f.recovery.invitation.request.requestId},owner,'DELETE'));expect((await authenticatorChallenge(request(path,body))).status).toBe(409);
 expect(workspaceDatabase(db=>db.prepare("SELECT revision FROM mfa_factors WHERE kind='secure-customer' AND account_id=?").get(f.invitation.accountId))).toMatchObject({revision:1});
});
it('authenticator recovery respects password changes, owner suspension, superseding requests and lock before completion',async()=>{
 const f=await enrolledAuthenticator();await client.changeAccountPassword(password,password+' changed');await expect(client.beginAuthenticatorRecovery({...f.recovery,password:password+' changed'})).rejects.toThrow();
 const issue=async()=>{const invitation=await(await requestAuthenticatorRecovery(request('/staff/authenticator-recovery',{accountCode:f.invitation.accountId},owner))).json();return {invitation,approval:await approveAuthenticatorRecovery(invitation.request,f.manifest,firm,{identityAndKeyReviewed:true}),keyId:f.keyId,password:password+' changed'};};
 const first=await issue(),second=await issue();await expect(client.beginAuthenticatorRecovery(first)).rejects.toThrow();const prepared=await client.beginAuthenticatorRecovery(second);client.lock();await expect(client.finishAuthenticatorRecovery(totp(prepared.secret,Math.floor(Date.now()/30000)))).rejects.toThrow(/cleared/);
 await accountAccess(request('/staff/client-access',{accountCode:f.invitation.accountId,enabled:false},owner));await accountAccess(request('/staff/client-access',{accountCode:f.invitation.accountId,enabled:true},owner));await expect(client.beginAuthenticatorRecovery(second)).rejects.toThrow();
});
it('authenticator replacement expires and limits both password guesses and new-factor code guesses without removing MFA',async()=>{
 const f=await enrolledAuthenticator(),body={token:f.recovery.invitation.token,approval:f.recovery.approval,password},path='/authenticator-recovery/challenge';
 const setup=await(await authenticatorChallenge(request(path,body))).json(),answer=await openAuthenticatorRecoveryChallenge(setup.challenge,f.manifest,{accountId:f.invitation.accountId,clientId:f.invitation.clientId},config,keys.keys.get(f.keyId).privateKey),finish={token:body.token,approval:body.approval,challengeId:setup.challenge.challengeId,answer,code:totp(setup.secret,Math.floor(Date.now()/30000))};
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+6*60000);try{expect((await recoverAuthenticator(request('/authenticator-recovery',finish))).status).toBe(409);}finally{clock.mockRestore();}
 const second=await(await authenticatorChallenge(request(path,body))).json(),secondAnswer=await openAuthenticatorRecoveryChallenge(second.challenge,f.manifest,{accountId:f.invitation.accountId,clientId:f.invitation.clientId},config,keys.keys.get(f.keyId).privateKey);let wrong='000000';const valid=new Set([-1,0,1].map(offset=>totp(second.secret,Math.floor(Date.now()/30000)+offset)));while(valid.has(wrong))wrong=String(Number(wrong)+1).padStart(6,'0');
 for(let i=0;i<5;i++)expect((await recoverAuthenticator(request('/authenticator-recovery',{...finish,challengeId:second.challenge.challengeId,answer:secondAnswer,code:wrong}))).status).toBe(400);
 expect((await recoverAuthenticator(request('/authenticator-recovery',{...finish,challengeId:second.challenge.challengeId,answer:secondAnswer,code:totp(second.secret,Math.floor(Date.now()/30000))}))).status).toBe(409);
 for(let i=0;i<8;i++)expect((await authenticatorChallenge(request(path,{...body,password:'wrong'}))).status).toBe(403);expect((await authenticatorChallenge(request(path,body))).status).toBe(403);
 expect(workspaceDatabase(db=>db.prepare("SELECT revision FROM mfa_factors WHERE kind='secure-customer' AND account_id=?").get(f.invitation.accountId))).toMatchObject({revision:1});
});
it('ordinary controller activates a new opaque account, requires MFA, decrypts its private profile and supports firm grants',async()=>{
 const f=await setup(),profile={legalName:'SYNTHETIC PRIVATE CLIENT NAME',email:'private-profile@example.invalid',phone:'555-0109',mailingAddress:'Synthetic private mailing address'};
 const result=await client.activateNewAccount({...f,password,profile});expect(result.accountCode).toBe(f.invitation.accountId);
 expect(await client.signInWithCode(result.accountCode,password)).toEqual({mfaRequired:true});expect(client.identity).toBeNull();const pending=client.pendingMfa;
 const cross=await signIn(request('/session',{challengeToken:pending.challengeToken,code:totp(pending.secret,Math.floor(Date.now()/30000))}));expect(cross.status).toBe(401);
 const session=await client.verifySignIn(totp(pending.secret,Math.floor(Date.now()/30000)));expect(session.recoveryCodes).toHaveLength(10);await client.unlock(f.keyId);expect((await client.sync()).items).toBe(1);expect(client.status.legacyMigrationRequired).toBe(false);
 expect(JSON.parse(new TextDecoder().decode([...client.records.values()][0].plaintext))).toMatchObject(profile);
 const device=await generateRecipientKeyPair(),grant=await signStaffGrant({version:1,workspaceId:config.workspaceId,accountId:f.invitation.accountId,clientId:f.invitation.clientId,staffAccountId:'workspace-owner',staff:{keyId:await publicKeyId(device.publicKey),publicKey:device.publicKey}},firm,{epoch:1,domains:['tax-identity'],now:Date.now()-1000});publishStaffGrant(owner,grant);expect(readStaffScope(owner,{grantId:grant.grantId}).manifest.accountId).toBe(f.invitation.accountId);
 workspaceDatabase(db=>{expect(db.prepare('SELECT count(*) AS n FROM secure_tax_accounts').get()).toMatchObject({n:1});expect(db.prepare("SELECT count(*) AS n FROM records WHERE kind='client'").get()).toMatchObject({n:0});const token='a'.repeat(64);expect(privateTaxSession(db,token)).toBeNull();});
 expect(customerSession('a'.repeat(64))).toBeNull();for(const value of Object.values(profile)){expect(JSON.stringify(calls)).not.toContain(value);for(const file of readdirSync(directory).filter(name=>!name.endsWith('-shm')))expect(readFileSync(`${directory}/${file}`).includes(Buffer.from(value))).toBe(false);}
 await client.signOut();expect(client.identity).toBeNull();expect(client.records.size).toBe(0);
});
it('invitation and activation boundaries reject metadata, a different key/scope, revoked invitations and bad origins',async()=>{
 expect((await invite(request('/staff/client-invitations',{name:'not permitted'},owner))).status).toBe(400);expect((await invite(request('/staff/client-invitations',{}))).status).toBe(401);
 const f=await setup(),profile={legalName:'Synthetic',email:'',phone:'',mailingAddress:''};const other=await generateRecipientKeyPair();await keys.putKey({...other,keyId:await publicKeyId(other.publicKey)});const count=calls.length;
 await expect(client.activateNewAccount({...f,keyId:await publicKeyId(other.publicKey),password,profile})).rejects.toThrow(/another client key/);expect(calls.length).toBe(count);
 expect((await challenge(request('/activation/challenge',{token:f.invitation.token,manifest:f.manifest},undefined,'POST',base))).status).toBe(403);
 expect((await challenge(request('/activation/challenge',{token:f.invitation.token,manifest:{...f.manifest,accountId:randomUUID()}}))).status).toBe(403);
 expect((await revoke(request('/staff/client-invitations',{invitationId:f.invitation.invitationId},owner,'DELETE'))).status).toBe(200);expect((await challenge(request('/activation/challenge',{token:f.invitation.token,manifest:f.manifest}))).status).toBe(409);
 expect(workspaceDatabase(db=>db.prepare('SELECT count(*) AS n FROM secure_tax_accounts').get())).toMatchObject({n:0});
});

it('wrong possession proof is consumed and cannot activate or be replayed',async()=>{
 const f=await setup();alterActivation=body=>({...body,answer:'A'.repeat(43)});
 await expect(client.activateNewAccount({...f,password,profile:{legalName:'Synthetic',email:'',phone:'',mailingAddress:''}})).rejects.toThrow();
 const original=JSON.parse(calls.find(call=>call.path==='/activation')!.body);
 expect((await activate(request('/activation',original))).status).toBe(409);
 expect(workspaceDatabase(db=>db.prepare('SELECT count(*) AS n FROM secure_tax_accounts').get())).toMatchObject({n:0});
 expect(workspaceDatabase(db=>db.prepare('SELECT count(*) AS n FROM secure_tax_activation_challenges').get())).toMatchObject({n:0});
 alterActivation=undefined;expect((await client.activateNewAccount({...f,password,profile:{legalName:'Synthetic',email:'',phone:'',mailingAddress:''}})).accountCode).toBe(f.invitation.accountId);
 expect((await activate(request('/activation',original))).status).toBe(409);
});
it('invalid private codes never cross the connection and plaintext profile input is rejected',async()=>{
 const f=await setup(),count=calls.length;
 await expect(client.signInWithCode('person@example.invalid',password)).rejects.toThrow();expect(calls.length).toBe(count);
 alterActivation=body=>({...body,email:'plaintext@example.invalid'});
 await expect(client.activateNewAccount({...f,password,profile:{legalName:'Synthetic',email:'',phone:'',mailingAddress:''}})).rejects.toThrow();
 expect(workspaceDatabase(db=>db.prepare('SELECT count(*) AS n FROM secure_tax_accounts').get())).toMatchObject({n:0});
});

it('password changes and owner suspension revoke sessions and pending login without resetting MFA',async()=>{
 const f=await setup();await client.activateNewAccount({...f,password,profile:{legalName:'Synthetic',email:'',phone:'',mailingAddress:''}});
 await client.signInWithCode(f.invitation.accountId,password);const session=await client.verifySignIn(totp(client.pendingMfa.secret,Math.floor(Date.now()/30000)));await client.unlock(f.keyId);
 await expect(client.changeAccountPassword('wrong password',password+' changed')).rejects.toThrow();expect(client.identity).not.toBeNull();
 const pendingResponse=await signIn(request('/session',{accountCode:f.invitation.accountId,password}));expect(pendingResponse.status).toBe(428);const pending=await pendingResponse.json();
 expect(await client.changeAccountPassword(password,password+' changed')).toMatchObject({passwordChanged:true,sessionsRevoked:true});expect(client.identity).toBeNull();
 expect((await signIn(request('/session',{challengeToken:pending.challengeToken,code:session.recoveryCodes[0],privateAccount:true}))).status).toBe(401);
 await expect(client.signInWithCode(f.invitation.accountId,password)).rejects.toThrow();await client.signInWithCode(f.invitation.accountId,password+' changed');expect(client.pendingMfa.enrollmentRequired).toBe(false);await client.verifySignIn(session.recoveryCodes[0]);await client.unlock(f.keyId);
 expect((await accountAccess(request('/staff/client-access',{accountCode:f.invitation.accountId,enabled:false}))).status).toBe(401);
 expect((await accountAccess(request('/staff/client-access',{accountCode:f.invitation.accountId,enabled:false},owner))).status).toBe(200);
 await expect(client.sync()).rejects.toThrow();expect(client.identity).toBeNull();await expect(client.signInWithCode(f.invitation.accountId,password+' changed')).rejects.toThrow();
 expect((await accountAccess(request('/staff/client-access',{accountCode:f.invitation.accountId,enabled:true},owner))).status).toBe(200);
 await client.signInWithCode(f.invitation.accountId,password+' changed');await client.verifySignIn(session.recoveryCodes[1]);await client.unlock(f.keyId);expect((await client.sync()).items).toBe(1);
 expect(await client.revokeAllSessions()).toMatchObject({sessionsRevoked:true});expect(client.identity).toBeNull();
 expect(workspaceDatabase(db=>db.prepare('SELECT count(*) AS n FROM secure_tax_sessions').get())).toMatchObject({n:0});
});

async function activeRecovery(){
 const f=await setup();await client.activateNewAccount({...f,password,profile:{legalName:'Synthetic recovery client',email:'',phone:'',mailingAddress:''}});await client.signInWithCode(f.invitation.accountId,password);const session=await client.verifySignIn(totp(client.pendingMfa.secret,Math.floor(Date.now()/30000)));await client.unlock(f.keyId);
 const response=await requestRecovery(request('/staff/password-recovery',{accountCode:f.invitation.accountId},owner));expect(response.status).toBe(200);const invitation=await response.json(),approval=await approvePasswordRecovery(invitation.request,invitation.manifest,firm,{identityAndKeyReviewed:true});return {f,session,invitation,approval,keyId:f.keyId};
}
it('separately approved forgotten-password recovery preserves authenticator and encrypted profile, consumes its permit and revokes prior sessions',async()=>{
 const r=await activeRecovery(),next=password+' recovered';expect((await client.recoverAccountPassword({...r,newPassword:next})).authenticatorPreserved).toBe(true);expect(client.identity).toBeNull();
 const body=JSON.parse(calls.find(call=>call.path==='/password-recovery')!.body);expect((await recoverPassword(request('/password-recovery',body))).status).toBe(409);
 await expect(client.signInWithCode(r.f.invitation.accountId,password)).rejects.toThrow();await client.signInWithCode(r.f.invitation.accountId,next);expect(client.pendingMfa.enrollmentRequired).toBe(false);await client.verifySignIn(r.session.recoveryCodes[0]);await client.unlock(r.keyId);expect((await client.sync()).items).toBe(1);expect(JSON.parse(new TextDecoder().decode([...client.records.values()][0].plaintext)).legalName).toBe('Synthetic recovery client');
 expect(workspaceDatabase(db=>db.prepare('SELECT status FROM secure_tax_password_recovery').get())).toMatchObject({status:'used'});
});
it('password recovery refuses wrong keys, forged approval, revoked requests and consumed incorrect proofs',async()=>{
 const r=await activeRecovery(),newPassword=password+' recovered',before=calls.length;
 await expect(client.recoverAccountPassword({...r,keyId:'wrong-key',newPassword})).rejects.toThrow(/existing enrolled/);expect(calls.length).toBe(before);
 const forged=structuredClone(r.approval);forged.request.accountId=randomUUID();expect((await recoveryChallenge(request('/password-recovery/challenge',{token:r.invitation.token,approval:forged}))).status).toBe(403);
 alterRecovery=body=>({...body,answer:'A'.repeat(43)});await expect(client.recoverAccountPassword({...r,newPassword})).rejects.toThrow();const body=JSON.parse(calls.find(call=>call.path==='/password-recovery')!.body);expect((await recoverPassword(request('/password-recovery',body))).status).toBe(409);
 expect((await revokeRecovery(request('/staff/password-recovery',{requestId:r.invitation.request.requestId},owner,'DELETE'))).status).toBe(200);alterRecovery=undefined;await expect(client.recoverAccountPassword({...r,newPassword})).rejects.toThrow();
 await client.signInWithCode(r.f.invitation.accountId,password);await client.verifySignIn(r.session.recoveryCodes[0]);await client.unlock(r.keyId);expect((await client.sync()).items).toBe(1);
});
it('changing a password or suspending an account invalidates pending firm-approved recovery',async()=>{
 const r=await activeRecovery();await client.changeAccountPassword(password,password+' changed');await expect(client.recoverAccountPassword({...r,newPassword:password+' recovered'})).rejects.toThrow();
 const response=await requestRecovery(request('/staff/password-recovery',{accountCode:r.f.invitation.accountId},owner)),invitation=await response.json(),approval=await approvePasswordRecovery(invitation.request,invitation.manifest,firm,{identityAndKeyReviewed:true});
 for(const enabled of [false,true])expect((await accountAccess(request('/staff/client-access',{accountCode:r.f.invitation.accountId,enabled},owner))).status).toBe(200);
 expect((await recoveryChallenge(request('/password-recovery/challenge',{token:invitation.token,approval}))).status).toBe(409);
});

it('expired enrollment permits MFA sign-in and public renewal while protected data stays blocked until the same-key renewal is installed',async()=>{
 const f=await setup({validDays:1,now:Date.now()-86340000});await client.activateNewAccount({...f,password,profile:{legalName:'Synthetic renewal client',email:'',phone:'',mailingAddress:''}});await client.signInWithCode(f.invitation.accountId,password);const session=await client.verifySignIn(totp(client.pendingMfa.secret,Math.floor(Date.now()/30000)));await client.unlock(f.keyId);await client.sync();const original=[...client.records.values()][0],plaintext=new Uint8Array(original.plaintext);await client.signOut();
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+120000);
 try{
  await client.signInWithCode(f.invitation.accountId,password);await client.verifySignIn(session.recoveryCodes[0]);expect(client.status.renewalRequired).toBe(true);await expect(client.unlock(f.keyId)).rejects.toThrow();await expect(client.sync()).rejects.toThrow();
  const selected=await client.renewalRequest(f.keyId),packet=await renewFirmEnrollment(selected,firm,{identityAndKeyReviewed:true});expect(packet.manifest.client).toEqual(f.manifest.client);expect(packet.manifest.epoch).toBe(2);
  expect(await client.installEnrollmentRenewal(packet,f.keyId)).toMatchObject({renewed:true});expect(client.unlocked).toBe(false);await client.unlock(f.keyId);expect((await client.sync()).items).toBe(1);expect([...client.records.values()][0].plaintext).toEqual(plaintext);expect([...client.records.values()][0].revision).toBe(original.revision);expect(client.status.renewalRequired).toBe(false);
  const replay=await ownerRenewal(request('/staff/enrollment-renewal',packet,owner));expect(replay.status).toBe(200);expect((await replay.json()).duplicate).toBe(true);
 }finally{clock.mockRestore();}
});
it('owner renewal handles an expired account without its password, rejects key changes and stale publication, and reopens forgotten-password recovery',async()=>{
 const f=await setup({validDays:1,now:Date.now()-86340000});await client.activateNewAccount({...f,password,profile:{legalName:'Synthetic',email:'',phone:'',mailingAddress:''}});
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+120000);
 try{
  const path='/staff/enrollment-renewal?accountId='+f.invitation.accountId;expect((await ownerRenewalRequest(request(path,undefined,undefined,'GET'))).status).toBe(401);
  const response=await ownerRenewalRequest(request(path,undefined,owner,'GET'));expect(response.status).toBe(200);const selected=await response.json(),packet=await renewFirmEnrollment(selected,firm,{identityAndKeyReviewed:true});
  const other=await generateRecipientKeyPair(),changed=await signEnrollmentRequest({version:1,workspaceId:config.workspaceId,accountId:f.invitation.accountId,clientId:f.invitation.clientId,client:{keyId:await publicKeyId(other.publicKey),publicKey:other.publicKey}},firm,{epoch:2});expect((await ownerRenewal(request(path,{...packet,manifest:changed},owner))).status).toBe(409);
  expect((await ownerRenewal(request(path,packet,owner))).status).toBe(200);
  expect((await requestRecovery(request('/staff/password-recovery',{accountCode:f.invitation.accountId},owner))).status).toBe(200);
  const next=await renewFirmEnrollment({version:1,type:'shuug-enrollment-renewal-request',manifest:packet.manifest},firm,{identityAndKeyReviewed:true});expect((await ownerRenewal(request(path,next,owner))).status).toBe(200);expect((await ownerRenewal(request(path,packet,owner))).status).toBe(409);
  const bad=structuredClone(next);bad.manifest.signature.value='A'.repeat(86);expect((await ownerRenewal(request(path,bad,owner))).status).not.toBe(200);
  expect(workspaceDatabase(db=>db.prepare('SELECT status FROM secure_tax_password_recovery').get())).toMatchObject({status:'revoked'});
 }finally{clock.mockRestore();}
});
