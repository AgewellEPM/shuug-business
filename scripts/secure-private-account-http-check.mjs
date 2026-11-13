/** Real compiled route proof against disposable synthetic data. No installed
 * workspace, public TLS, filing provider or physical offhost custody is tested. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {configureOwnerPassword} from '../src/lib/auth/owner-session.ts';
import {importBusinessTemplate} from '../src/lib/branding/templates.ts';
import {gigTaxProsTemplate} from '../src/lib/industry/rideshare-tax-pros.ts';
import {saveCustomerSettings} from '../src/lib/customer-access/service.ts';
import {workspaceDatabase} from '../src/lib/workspace/database.ts';
import {backupWorkspace,restoreWorkspace} from '../src/lib/workspace/backup.ts';
import {totp} from '../src/lib/auth/mfa/crypto.ts';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../packages/secure-tax-client/firm-recovery.mjs';
import {signStaffGrant,createStaffCapsule} from '../packages/secure-tax-client/firm-staff.mjs';
import {VaultClient} from '../packages/secure-tax-client/browser/client.mjs';
import {StaffVaultClient} from '../packages/secure-tax-client/browser/staff-client.mjs';

class MemoryKeys {
  keys=new Map();bindings=new Map();
  async putKey(value){this.keys.set(value.keyId,structuredClone(value));}
  async getKey(id){return structuredClone(this.keys.get(id));}
  async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
  async putBinding(value){this.bindings.set(value.id,structuredClone(value));}
  async getBinding(id){return structuredClone(this.bindings.get(id));}
  async updateBinding(id,update){const value=update(await this.getBinding(id));await this.putBinding(value);return structuredClone(value);}
}
async function freePort(){const server=createServer();await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});const port=server.address().port;await new Promise(ok=>server.close(ok));return port;}
async function stop(child){if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;const exit=once(child,'exit'),timer=setTimeout(()=>child.kill('SIGKILL'),5000);child.kill('SIGTERM');try{await exit;}finally{clearTimeout(timer);}}
const root=mkdtempSync(path.join(tmpdir(),'shuug-private-account-http-')),host=path.join(root,'host');mkdirSync(host,{mode:0o700});
let child,log='',checks=0;
try{
  Object.assign(process.env,{DEALDESK_DATA_DIR:host,DEMO_DATA:'false',DATABASE_URL:'',SHUUG_REQUIRE_MFA:'false'});
  importBusinessTemplate(gigTaxProsTemplate);saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
  const password=`Synthetic account password ${randomUUID()}`,backupPassword=`Synthetic separate client backup ${randomUUID()}`;configureOwnerPassword(password);
  const created=await createFirmBundle(randomUUID(),`Synthetic firm ${password}`),firm=await unlockFirmBundle(created.bundle,`Synthetic firm ${password}`,created.publicPins);
  const uiOrigin='https://private-client.example.invalid',apiOrigin='https://ciphertext.example.invalid',base=`http://127.0.0.1:${await freePort()}`,prefix='/api/website/customer/secure';
  const config={version:1,uiOrigin,apiOrigin,...created.publicPins},env={...process.env,NODE_ENV:'production',APP_BASE_URL:base,AUTH_ENABLED:'true',WORKSPACE_ACCESS_TOKEN:`Synthetic-${randomUUID()}`,BACKEND_ACCESS_TOKEN:`Synthetic-${randomUUID()}`,PPC_WORKSPACE_ACCESS_TOKEN:'',SHUUG_SECURE_TAX_TRUSTED_ORIGIN:uiOrigin,SHUUG_SECURE_TAX_WORKSPACE_ID:config.workspaceId,SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY:config.signerPublicKey,SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY:config.firmRecoveryPublicKey};
  const calls=[],tokens=new Map();
  const fetcher=label=>async(url,options)=>{const u=new URL(url);assert.equal(u.origin,apiOrigin);calls.push({path:u.pathname,body:options.body??''});if(options.headers.Authorization)tokens.set(label,options.headers.Authorization.slice(7));return fetch(base+u.pathname+u.search,{...options,headers:{...options.headers,Origin:uiOrigin},signal:AbortSignal.timeout(15000)});};
  async function start(){child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(base).port],{env,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log=(log+data).slice(-4000);});for(let i=0;i<150;i++){try{if((await fetch(base+'/api/auth/login')).ok)return;}catch{}assert.equal(child.exitCode,null,log);await new Promise(ok=>setTimeout(ok,100));}throw new Error('Compiled private-account fixture failed to start.');}
  async function raw(route,body,token,origin=uiOrigin,method='POST'){return fetch(base+prefix+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
  await start();
  const owner=await StaffVaultClient.create(config,uiOrigin,{storage:new MemoryKeys(),fetcher:fetcher('owner')});assert.deepEqual(await owner.signIn('',password),{mfaRequired:true});const ownerSession=await owner.verifySignIn(totp(owner.pendingMfa.secret,Math.floor(Date.now()/30000)));assert(owner.isOwner);checks+=2;
  const invitation=await owner.createClientInvitation();assert.equal(invitation.type,'shuug-private-account-invitation');checks++;
  assert.equal((await raw('/staff/client-invitations',{email:'forbidden@example.invalid'},tokens.get('owner'))).status,400);assert.equal((await raw('/staff/client-invitations',{},undefined)).status,401);checks+=2;
  const storage=new MemoryKeys(),client=await VaultClient.create(config,uiOrigin,{storage,fetcher:fetcher('client')}),key=await client.createKey(backupPassword),backup=await client.encryptedBackup(key.keyId);
  const manifest=await signEnrollmentRequest(await client.newEnrollmentRequest(invitation,key.keyId),firm,{epoch:1}),profile={legalName:`SYNTHETIC PRIVATE NAME ${randomUUID()}`,email:`${randomUUID()}@example.invalid`,phone:`synthetic-phone-${randomUUID()}`,mailingAddress:`Synthetic address ${randomUUID()}`};
  assert.equal((await raw('/activation/challenge',{token:invitation.token,manifest},undefined,base)).status,403);checks++;
  assert.equal((await client.activateNewAccount({invitation,manifest,keyId:key.keyId,password,profile})).accountCode,invitation.accountId);checks++;
  const activation=JSON.parse(calls.find(call=>call.path.endsWith('/activation')).body);assert.equal((await raw('/activation',activation)).status,409);checks++;
  assert.deepEqual(await client.signInWithCode(invitation.accountId,password),{mfaRequired:true});assert.equal(client.identity,null);checks+=2;
  const pending=client.pendingMfa;assert.equal((await raw('/session',{challengeToken:pending.challengeToken,code:totp(pending.secret,Math.floor(Date.now()/30000))})).status,401);checks++;
  const session=await client.verifySignIn(totp(pending.secret,Math.floor(Date.now()/30000)));assert.equal(session.recoveryCodes.length,10);await client.unlock(key.keyId);assert.equal((await client.sync()).items,1);assert.equal(client.status.legacyMigrationRequired,false);checks+=3;
  const opened=[...client.records.values()][0];assert.deepEqual(JSON.parse(new TextDecoder().decode(opened.plaintext)),{version:1,type:'client-profile',...profile});checks++;
  const staffKey=await owner.createKey(backupPassword);await owner.unlock(staffKey.keyId);const grant=await signStaffGrant({...owner.publicRequest(),accountId:invitation.accountId,clientId:invitation.clientId},firm,{epoch:1,domains:['tax-identity']});await owner.installGrant(grant);
  const objectResponse=await fetch(`${base}${prefix}/objects/${opened.objectId}`,{headers:{Origin:uiOrigin,Authorization:`Bearer ${tokens.get('client')}`}});assert.equal(objectResponse.status,200);const object=await objectResponse.json();
  const expected={accountId:invitation.accountId,clientId:invitation.clientId,staffAccountId:'workspace-owner',staffKeyId:staffKey.keyId,minimumGrantEpoch:1,minimumManifestEpoch:1,objectId:opened.objectId,revision:1,domain:'tax-identity'};
  await owner.installCapsule(await createStaffCapsule(object.envelope,manifest,grant,firm,expected));await owner.selectGrant(grant.grantId);assert.equal((await owner.sync()).items,1);assert.deepEqual(owner.records.get(opened.objectId).plaintext,opened.plaintext);checks+=3;
  workspaceDatabase(db=>{assert.equal(db.prepare('SELECT count(*) AS n FROM secure_tax_accounts').get().n,1);assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE kind='client'").get().n,0);assert(!db.prepare("SELECT 1 FROM sqlite_schema WHERE name='customer_accounts'").get()||db.prepare('SELECT count(*) AS n FROM customer_accounts').get().n===0);});checks+=3;
  for(const value of Object.values(profile)){assert(!JSON.stringify(calls).includes(value));for(const file of readdirSync(host).filter(name=>!name.endsWith('-shm')))assert(!readFileSync(path.join(host,file)).includes(Buffer.from(value)));}checks+=4;
  await client.signOut();await assert.rejects(client.sync());checks++;
  const revoked=await owner.createClientInvitation();assert.equal((await owner.revokeClientInvitation(revoked.invitationId)).revoked,true);const revokedManifest=await signEnrollmentRequest(await client.newEnrollmentRequest(revoked,key.keyId),firm,{epoch:1});assert.equal((await raw('/activation/challenge',{token:revoked.token,manifest:revokedManifest})).status,409);checks+=2;
  await stop(child);child=null;const saved=backupWorkspace(host,path.join(root,'backup')),restored=path.join(root,'restored');restoreWorkspace(path.join(root,'backup'),restored);env.DEALDESK_DATA_DIR=restored;process.env.DEALDESK_DATA_DIR=restored;await start();
  const recovered=await VaultClient.create(config,uiOrigin,{storage:new MemoryKeys(),fetcher:fetcher('recovered')});await recovered.importKey(backup,backupPassword);assert.deepEqual(await recovered.signInWithCode(invitation.accountId,password),{mfaRequired:true});await recovered.verifySignIn(session.recoveryCodes[0]);await recovered.unlock(key.keyId);assert.equal((await recovered.sync()).items,1);assert.deepEqual(JSON.parse(new TextDecoder().decode([...recovered.records.values()][0].plaintext)),{version:1,type:'client-profile',...profile});checks+=3;
  await recovered.signOut();await recovered.signInWithCode(invitation.accountId,password);await assert.rejects(recovered.verifySignIn(session.recoveryCodes[0]));await recovered.verifySignIn(session.recoveryCodes[1]);checks+=2;
  await recovered.unlock(key.keyId);await recovered.sync();
  const resumedOwner=await StaffVaultClient.create(config,uiOrigin,{storage:new MemoryKeys(),fetcher:fetcher('resumed-owner')});await resumedOwner.signIn('',password);await resumedOwner.verifySignIn(ownerSession.recoveryCodes[0]);
  await resumedOwner.setClientAccess(invitation.accountId,false);assert.equal((await fetch(`${base}${prefix}/staff/objects/${opened.objectId}?grantId=${grant.grantId}`,{headers:{Origin:uiOrigin,Authorization:`Bearer ${tokens.get('resumed-owner')}`}})).status,403);checks++;await assert.rejects(recovered.sync());assert.equal(recovered.identity,null);await assert.rejects(recovered.signInWithCode(invitation.accountId,password));checks+=3;
  await resumedOwner.setClientAccess(invitation.accountId,true);await recovered.signInWithCode(invitation.accountId,password);await recovered.verifySignIn(session.recoveryCodes[2]);await recovered.unlock(key.keyId);assert.equal((await recovered.sync()).items,1);checks++;
  await recovered.changeAccountPassword(password,password+' changed');assert.equal(recovered.identity,null);await assert.rejects(recovered.signInWithCode(invitation.accountId,password));await recovered.signInWithCode(invitation.accountId,password+' changed');assert.equal(recovered.pendingMfa.enrollmentRequired,false);await recovered.verifySignIn(session.recoveryCodes[3]);await recovered.unlock(key.keyId);assert.equal((await recovered.sync()).items,1);checks+=4;
  await recovered.revokeAllSessions();assert.equal(recovered.identity,null);checks++;
  assert(ownerSession.recoveryCodes.length===10);console.log(JSON.stringify({version:1,kind:'synthetic-compiled-private-account-proof',buildId:readFileSync('.next/BUILD_ID','utf8').trim(),checks,httpRequests:calls.length,invitationActivation:true,requiredMfa:true,opaqueAccounts:true,encryptedContactProfile:true,firmProfileReview:true,encryptedKeyBackupRecovery:true,hostBackupRestore:true,singleUseMfaRecovery:true,passwordChangeRevokesSessions:true,ownerSuspensionVerified:true,revokeAllSessionsVerified:true,backupFiles:saved.files,liveInstalledWorkspace:false,physicalOffhostCustody:false,visualAcceptance:false},null,2));
}catch(error){console.error(error);if(log)console.error(log);process.exitCode=1;}
finally{await stop(child);rmSync(root,{recursive:true,force:true});}
