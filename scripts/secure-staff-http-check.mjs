/** Compiled synthetic encrypted-staff proof. Never uses the installed data.
 * Browser code uses explicit HTTPS test origins mapped to this owned loopback
 * HTTP fixture; this does not establish public TLS or physical offhost custody. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {configureOwnerPassword,signInOwner} from '../src/lib/auth/owner-session.ts';
import {createEmployeeAccount,issueEmployeeInvitation,acceptEmployeeInvitation,setEmployeeEnabled} from '../src/lib/auth/employees.ts';
import {addMember} from '../src/lib/team/store.ts';
import {assignRole} from '../src/lib/permissions/store.ts';
import {saveBusinessRecord} from '../src/lib/workspace/store.ts';
import {enrollSecureTaxAccount} from '../src/lib/secure-tax/store.ts';
import {workspaceDatabase} from '../src/lib/workspace/database.ts';
import {importBusinessTemplate} from '../src/lib/branding/templates.ts';
import {gigTaxProsTemplate} from '../src/lib/industry/rideshare-tax-pros.ts';
import {createLinkedCustomer,saveCustomerSettings} from '../src/lib/customer-access/service.ts';
import {acceptCustomerInvitation,issueCustomerInvitation,signInCustomer} from '../src/lib/customer-access/accounts.ts';
import {totp} from '../src/lib/auth/mfa/crypto.ts';
import {backupWorkspace,restoreWorkspace} from '../src/lib/workspace/backup.ts';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../packages/secure-tax-client/firm-recovery.mjs';
import {signStaffGrant,createStaffCapsule} from '../packages/secure-tax-client/firm-staff.mjs';
import {generateRecipientKeyPair,publicKeyId,sealEnvelope,openEnvelope,decode64} from '../packages/secure-tax-client/envelope.mjs';
import {openStaffCapsule} from '../packages/secure-tax-client/staff-grants.mjs';
import {StaffVaultClient} from '../packages/secure-tax-client/browser/staff-client.mjs';
import {VaultClient} from '../packages/secure-tax-client/browser/client.mjs';
import {PortalUploadQueue,PortalRefresh,portalSnapshot} from '../packages/secure-tax-client/browser/client-portal.mjs';
import {mountStaffUpdates} from '../packages/secure-tax-client/browser/staff-updates.mjs';
import {saveReturn} from '../packages/secure-tax-client/browser/return-save.mjs';
import {newReturn,calculateReturn} from '../packages/tax-engine/index.mjs';
import {generateDraftPdf} from '../packages/tax-engine/pdf.mjs';
import {approveReturnEdit} from '../packages/secure-tax-client/firm-return-edits.mjs';
import {privateReturnReviewCommitment} from '../packages/secure-tax-client/return-proposals.mjs';
import {approveReturnCreation} from '../packages/secure-tax-client/firm-return-creations.mjs';
import {privateReturnCreationReviewCommitment} from '../packages/secure-tax-client/return-creations.mjs';
import {approveCaseTransition} from '../packages/secure-tax-client/firm-cases.mjs';
import {privateCaseReviewCommitment} from '../packages/secure-tax-client/case-proposals.mjs';
import {caseSnapshot} from '../packages/secure-tax-client/case-model.mjs';
import {OFFICE_ACTIONS} from '../packages/secure-tax-client/office-model.mjs';
import {proveClientFinance,verifyRestoredFinance} from './secure-finance-http-proof.mjs';
import {proveAuthorizationEvidence,verifyRestoredAuthorizations} from './secure-authorization-http-proof.mjs';
import {DEFAULT_BOOK_ACCOUNTS,BOOK_ACTIONS,replayCaseBooks,caseBookReport} from '../packages/secure-tax-client/case-books.mjs';
import {renderCase} from '../packages/secure-tax-client/browser/case-view.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {JSDOM} from 'jsdom';

class MemoryKeys {
  keys=new Map();bindings=new Map();
  async putKey(value){this.keys.set(value.keyId,structuredClone(value));}
  async getKey(id){return this.keys.get(id);}
  async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
  async putBinding(value){this.bindings.set(value.id,structuredClone(value));}
  async getBinding(id){return structuredClone(this.bindings.get(id));}
  async updateBinding(id,mutate){const next=mutate(structuredClone(this.bindings.get(id)));this.bindings.set(id,structuredClone(next));return structuredClone(next);}
}
async function freePort(){const s=createServer();await new Promise((ok,bad)=>{s.once('error',bad);s.listen(0,'127.0.0.1',ok);});const port=s.address().port;await new Promise(ok=>s.close(ok));return port;}
async function stop(child){if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit'),timer=setTimeout(()=>child.kill('SIGKILL'),5000);child.kill('SIGTERM');try{await exited;}finally{clearTimeout(timer);}}
const root=mkdtempSync(`${tmpdir()}/shuug-secure-staff-proof-`),host=path.join(root,'host'),trusted=path.join(root,'trusted');
mkdirSync(host,{mode:0o700});mkdirSync(trusted,{mode:0o700});
let child,log='',checks=0,grantPageRequests=0,staffApiRequests=0,customerApiRequests=0,largeGrantList=null,returnProof=null,caseProof=null,booksProof=null,financeProof=null,authorizationProof=null,workspaceBuilder=null;
try{
  process.env.DEALDESK_DATA_DIR=host;process.env.DEMO_DATA='false';process.env.DATABASE_URL='';process.env.SHUUG_REQUIRE_MFA='false';
  const password=`Synthetic-password-${randomUUID()}`,firmPassphrase=`Synthetic offhost backup ${randomUUID()}`,backupPassword=`Synthetic device backup ${randomUUID()}`;
  configureOwnerPassword(password);importBusinessTemplate(gigTaxProsTemplate);
  saveCustomerSettings({enabled:true,pricing:false,ordering:false,orderStatus:false,servicePortal:true,booking:false});
  const member=addMember({name:'Synthetic encrypted preparer',email:'protected-staff@example.invalid',role:'Manager'});assignRole(member.id,'Manager');
  const employee=createEmployeeAccount({memberId:member.id,name:member.name,email:member.email});acceptEmployeeInvitation(issueEmployeeInvitation(employee.id),password);
  const client=saveBusinessRecord({kind:'client',title:'Synthetic protected household',fields:{email:'protected-client@example.invalid'}},'workspace-owner');
  const account=await createLinkedCustomer({name:'Synthetic protected household',email:'protected-client@example.invalid',clientId:client.id,customerId:null});
  acceptCustomerInvitation(issueCustomerInvitation(account.id),password);
  const clientToken=signInCustomer(account.email,password),weakOwnerToken=signInOwner(password);
  const {bundle,publicPins}=await createFirmBundle(randomUUID(),firmPassphrase),firm=await unlockFirmBundle(bundle,firmPassphrase,publicPins),clientKey=await generateRecipientKeyPair();
  writeFileSync(path.join(trusted,'firm.json'),JSON.stringify(bundle),{mode:0o600});writeFileSync(path.join(trusted,'pins.json'),JSON.stringify(publicPins),{mode:0o600});
  const manifest=await signEnrollmentRequest({version:1,workspaceId:publicPins.workspaceId,accountId:account.id,clientId:client.id,client:{keyId:await publicKeyId(clientKey.publicKey),publicKey:clientKey.publicKey}},firm,{epoch:1});
  const base=`http://127.0.0.1:${await freePort()}`,uiOrigin='https://trusted-staff.example.invalid';
  const config={version:1,uiOrigin,apiOrigin:'https://ciphertext-api.example.invalid',...publicPins};
  const env={...process.env,NODE_ENV:'production',APP_BASE_URL:base,AUTH_ENABLED:'true',WORKSPACE_ACCESS_TOKEN:`Synthetic-host-token-${randomUUID()}`,BACKEND_ACCESS_TOKEN:`Synthetic-backend-token-${randomUUID()}`,PPC_WORKSPACE_ACCESS_TOKEN:'',
    SHUUG_SECURE_TAX_TRUSTED_ORIGIN:uiOrigin,SHUUG_SECURE_TAX_WORKSPACE_ID:publicPins.workspaceId,SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY:publicPins.signerPublicKey,SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY:publicPins.firmRecoveryPublicKey};
  const prefix='/api/website/customer/secure';
  async function request(route,{token,method='GET',body,origin=uiOrigin}={}){return fetch(base+prefix+route,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  async function json(route,options={},status=200){const response=await request(route,options),value=await response.json();assert.equal(response.status,status,value.error);checks++;return value;}
  async function start(){
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(base).port],{env,stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log=(log+String(data)).slice(-4000);});
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/auth/login')).ok)return;}catch{}assert.equal(child.exitCode,null,log);await new Promise(ok=>setTimeout(ok,100));}throw new Error('Owned encrypted-staff server did not start.');
  }
  const tokens=new Map();
  async function vault(label,storage=new MemoryKeys()){
    const fetcher=async(url,options)=>{
      const u=new URL(url);assert.equal(u.origin,config.apiOrigin);
      staffApiRequests++;
      if(u.pathname.endsWith('/staff/grants')&&options.method==='GET'&&u.searchParams.get('limit')==='25')grantPageRequests++;
      if(options.headers.Authorization)tokens.set(label,options.headers.Authorization.slice(7));
      return fetch(base+u.pathname+u.search,{...options,headers:{...options.headers,Origin:uiOrigin}});
    };
    return {storage,client:await StaffVaultClient.create(config,uiOrigin,{storage,fetcher})};
  }
  async function login(v,email,code){assert.deepEqual(await v.signIn(email,password),{mfaRequired:true});const pending=v.pendingMfa;const result=await v.verifySignIn(code??totp(pending.secret,Math.floor(Date.now()/30000)));checks++;return result;}
  // Historical fixture restoration is not a new plaintext-account activation.
  for(const name of ['SHUUG_SECURE_TAX_WORKSPACE_ID','SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY','SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY'])process.env[name]=env[name];
  workspaceDatabase(db=>enrollSecureTaxAccount(db,{id:account.id,clientId:client.id},manifest),true);
  await start();
  await json('/staff/status',{token:weakOwnerToken},401);
  await json('/staff/status',{token:env.WORKSPACE_ACCESS_TOKEN},401);
  await json('/staff/session',{method:'POST',body:{email:member.email,password},origin:'https://untrusted.example.invalid'},403);
  const owner=await vault('owner'),ownerSession=await login(owner.client,'');assert(owner.client.isOwner);assert.equal(ownerSession.mfaVerified,true);
  const first=await vault('first'),firstSession=await login(first.client,member.email);assert.equal(firstSession.mfaVerified,true);
  const device=await first.client.createKey(backupPassword);await first.client.unlock(device.keyId);
  const deviceBackup=await first.client.encryptedBackup(device.keyId),deviceRequest=first.client.publicRequest();
  const grant=await signStaffGrant({...deviceRequest,accountId:account.id,clientId:client.id},firm,{epoch:1,domains:['tax-document','driver-record']});
  await json('/enroll',{token:clientToken,method:'POST',body:manifest});
  const marker=`SYNTHETIC PRIVATE TAX DATA ${randomUUID()}`,bookBytes=new TextEncoder().encode(JSON.stringify({type:'synthetic-protected-books',privateNote:marker,cashCents:12345})),pdfBytes=new TextEncoder().encode(`%PDF-1.7\n${marker}\n%%EOF`);
  const recipients={clientPublicKey:clientKey.publicKey,firmRecoveryPublicKey:publicPins.firmRecoveryPublicKey};
  const objects=[];
  for(const [domain,bytes] of [['driver-record',bookBytes],['tax-document',pdfBytes]]){
    const context={workspaceId:publicPins.workspaceId,accountId:account.id,objectId:randomUUID(),revision:1,domain};
    const envelope=await sealEnvelope(bytes,context,recipients,'client',clientKey.privateKey);
    await json(`/objects/${context.objectId}`,{token:clientToken,method:'PUT',body:{mutationId:randomUUID(),expectedRevision:0,envelope}});
    objects.push({context,envelope,bytes});
  }
  const ungrantedContext={workspaceId:publicPins.workspaceId,accountId:account.id,objectId:randomUUID(),revision:1,domain:'driver-state'};
  const ungrantedEnvelope=await sealEnvelope(new TextEncoder().encode(marker),ungrantedContext,recipients,'client',clientKey.privateKey);
  await json(`/objects/${ungrantedContext.objectId}`,{token:clientToken,method:'PUT',body:{mutationId:randomUUID(),expectedRevision:0,envelope:ungrantedEnvelope}});
  const expected=(grant,object)=>({accountId:account.id,clientId:client.id,staffAccountId:employee.id,staffKeyId:grant.staff.keyId,minimumGrantEpoch:grant.epoch,minimumManifestEpoch:1,objectId:object.context.objectId,revision:object.context.revision,domain:object.context.domain});
  await owner.client.installGrant(grant);checks++;
  for(const object of objects){object.capsule=await createStaffCapsule(object.envelope,manifest,grant,firm,expected(grant,object));await owner.client.installCapsule(object.capsule);checks++;}
  await first.client.selectGrant(grant.grantId);assert.equal((await first.client.sync()).items,2);
  assert(!first.client.records.has(ungrantedContext.objectId));checks++;
  for(const object of objects)assert.deepEqual(first.client.records.get(object.context.objectId).plaintext,object.bytes);checks++;
  assert.equal((await request('/staff/objects/'+objects[0].context.objectId+'?grantId='+grant.grantId,{token:tokens.get('owner')})).status,403);checks++;
  const recovered=await vault('backup-recovered');await login(recovered.client,member.email,firstSession.recoveryCodes[0]);
  await recovered.client.importKey(deviceBackup,backupPassword);await recovered.client.unlock(device.keyId);await recovered.client.selectGrant(grant.grantId);
  assert.equal((await recovered.client.sync()).items,2);checks++;
  const replacement=await vault('replacement');await login(replacement.client,member.email,firstSession.recoveryCodes[1]);
  const newDevice=await replacement.client.createKey(backupPassword);await replacement.client.unlock(newDevice.keyId);
  const replacementRequest={...replacement.client.publicRequest(),accountId:account.id,clientId:client.id};
  for(const [name,value] of Object.entries({prior:grant,request:replacementRequest,manifest,envelope:objects[0].envelope,expected:expected({staff:{keyId:newDevice.keyId},epoch:1},objects[0])}))writeFileSync(path.join(trusted,name+'.json'),JSON.stringify(value),{mode:0o600});
  const offline=spawn(process.execPath,['packages/secure-tax-client/staff-offline-cli.mjs','recover-device','--confirm-off-host','--passphrase-fd','3','--bundle',path.join(trusted,'firm.json'),'--public-pins',path.join(trusted,'pins.json'),'--prior-grant',path.join(trusted,'prior.json'),'--request',path.join(trusted,'request.json'),'--epoch','1','--manifest',path.join(trusted,'manifest.json'),'--envelope',path.join(trusted,'envelope.json'),'--expected',path.join(trusted,'expected.json'),'--grant-out',path.join(trusted,'new-grant.json'),'--capsule-out',path.join(trusted,'new-capsule.json'),'--revoke-out',path.join(trusted,'revoked.json')],{stdio:['ignore','pipe','pipe','pipe']});
  let offlineError='';offline.stderr.on('data',data=>{offlineError+=String(data);});offline.stdio[3].end(firmPassphrase);
  const timer=setTimeout(()=>offline.kill('SIGKILL'),30000);let offlineResult;
  try{[offlineResult]=await once(offline,'exit');}finally{clearTimeout(timer);}
  assert.equal(offlineResult,0,offlineError);checks++;
  const newGrant=JSON.parse(readFileSync(path.join(trusted,'new-grant.json'),'utf8')),revoked=JSON.parse(readFileSync(path.join(trusted,'revoked.json'),'utf8'));
  await owner.client.installGrant(revoked);checks++;
  await owner.client.installGrant(newGrant);checks++;
  for(const [index,object] of objects.entries()){const capsule=index===0?JSON.parse(readFileSync(path.join(trusted,'new-capsule.json'),'utf8')):await createStaffCapsule(object.envelope,manifest,newGrant,firm,expected(newGrant,object));await owner.client.installCapsule(capsule);checks++;
    await assert.rejects(openStaffCapsule(capsule,object.envelope,manifest,newGrant,expected(newGrant,object),publicPins,(await first.storage.getKey(device.keyId)).privateKey));checks++;}
  await replacement.client.selectGrant(newGrant.grantId);assert.equal((await replacement.client.sync()).items,2);checks++;
  await json('/staff/objects/'+objects[0].context.objectId+'?grantId='+grant.grantId,{token:tokens.get('replacement')},403);
  await json('/staff/grants',{token:tokens.get('owner'),method:'POST',body:grant},409);
  const changed=objects[0];changed.context={...changed.context,revision:2};changed.bytes=new TextEncoder().encode(JSON.stringify({type:'synthetic-protected-books',privateNote:marker,cashCents:45678}));
  changed.envelope=await sealEnvelope(changed.bytes,changed.context,recipients,'client',clientKey.privateKey);
  await json(`/objects/${changed.context.objectId}`,{token:clientToken,method:'PUT',body:{mutationId:randomUUID(),expectedRevision:1,envelope:changed.envelope}});
  await assert.rejects(replacement.client.sync());assert.equal(replacement.client.records.size,0);checks++;
  const fresh=await createStaffCapsule(changed.envelope,manifest,newGrant,firm,expected(newGrant,changed));await owner.client.installCapsule(fresh);checks++;
  await replacement.client.unlock(newDevice.keyId);await replacement.client.selectGrant(newGrant.grantId);assert.equal((await replacement.client.sync()).items,2);
  assert.deepEqual(replacement.client.records.get(changed.context.objectId).plaintext,changed.bytes);checks++;
  await stop(child);child=null;
  const copied=backupWorkspace(host,path.join(root,'backup')),restored=path.join(root,'restored');restoreWorkspace(path.join(root,'backup'),restored);
  env.DEALDESK_DATA_DIR=restored;process.env.DEALDESK_DATA_DIR=restored;await start();
  const afterRestore=await vault('after-restore',replacement.storage);await login(afterRestore.client,member.email,firstSession.recoveryCodes[2]);
  await afterRestore.client.unlock(newDevice.keyId);await afterRestore.client.selectGrant(newGrant.grantId);assert.equal((await afterRestore.client.sync()).items,2);checks++;
  assert.deepEqual(afterRestore.client.records.get(changed.context.objectId).plaintext,changed.bytes);checks++;
  await json('/staff/objects/'+changed.context.objectId+'?grantId='+grant.grantId,{token:tokens.get('after-restore')},403);
  setEmployeeEnabled(employee.id,false);await assert.rejects(afterRestore.client.sync());assert.equal(afterRestore.client.records.size,0);checks++;
  const customerKeyId=await publicKeyId(clientKey.publicKey),customerStorage=new MemoryKeys(),putBodies=new Map();let loseReceipt=true;
  await customerStorage.putKey({keyId:customerKeyId,publicKey:clientKey.publicKey,privateKey:clientKey.privateKey});
  async function customerVault(label,storage){
    const fetcher=async(url,options)=>{const u=new URL(url);assert.equal(u.origin,config.apiOrigin);customerApiRequests++;if(options.headers.Authorization)tokens.set(label,options.headers.Authorization.slice(7));
      const response=await fetch(base+u.pathname+u.search,{...options,headers:{...options.headers,Origin:uiOrigin}});
      if(label==='portal'&&options.method==='PUT'){const previous=putBodies.get(u.pathname);if(previous)assert.equal(options.body,previous);else putBodies.set(u.pathname,options.body);
        if(loseReceipt){loseReceipt=false;assert(response.ok);await response.arrayBuffer();throw new Error('Synthetic lost upload receipt after the server committed.');}}
      return response;};
    const customer=await VaultClient.create(config,uiOrigin,{storage,fetcher});let session=await customer.signIn(account.email,password);
    if(session.mfaRequired){session=await customer.verifySignIn(totp(customer.pendingMfa.secret,Math.floor(Date.now()/30000)));}
    await customer.unlock(customerKeyId);await customer.sync();return customer;
  }
  const portal=await customerVault('portal',customerStorage),queue=new PortalUploadQueue(portal),uploaded=[];
  const samples=[{name:'Sample statement.csv',type:'text/csv',bytes:new TextEncoder().encode(`date,description,amount\n2026-11-01,${marker},12.00`),purpose:'bank-statement',category:'banking'},
    {name:'Sample receipt.jpg',type:'image/jpeg',bytes:new Uint8Array([255,216,255,...new TextEncoder().encode(marker)]),purpose:'receipt',category:'purchases'},
    {name:'Sample client invoice.pdf',type:'application/pdf',bytes:new TextEncoder().encode(`%PDF-1.7\n${marker}\n%%EOF`),purpose:'invoice',category:'sales'}];
  for(const sample of samples)queue.add([new File([sample.bytes],sample.name,{type:sample.type})],{purpose:sample.purpose,category:sample.category,notes:marker});
  await queue.flush();assert.equal(queue.rows.filter(row=>row.status==='failed').length,1);assert.equal(queue.rows.filter(row=>row.status==='complete').length,2);checks++;
  assert.equal((await portal.pendingUploads()).length,1);assert(!JSON.stringify([...customerStorage.bindings.values()]).includes(marker));checks++;
  const retriedQueue=new PortalUploadQueue(portal);await retriedQueue.restore();assert.equal(retriedQueue.rows.length,1);await retriedQueue.flush();
  assert.equal(retriedQueue.rows[0].status,'complete');assert.equal((await portal.pendingUploads()).length,0);checks++;
  await portal.sync();let dashboard=portalSnapshot(portal.records);assert.equal(dashboard.counts.statements,1);assert.equal(dashboard.counts.receipts,1);assert.equal(dashboard.counts.invoices,1);assert.equal(dashboard.totals.length,0);checks++;
  for(const item of portal.records.values()){
    let payload;try{payload=JSON.parse(new TextDecoder().decode(item.plaintext));}catch{continue;}if(payload.type!=='private-file')continue;
    const source=samples.find(sample=>sample.name===payload.filename);assert(source);assert.deepEqual(decode64(payload.data,1,10*1024*1024),source.bytes);
    const served=await json(`/objects/${item.objectId}`,{token:tokens.get('portal')});uploaded.push({context:served.envelope.context,envelope:served.envelope,bytes:item.plaintext});checks++;
  }
  const remoteStorage=new MemoryKeys();await remoteStorage.putKey({keyId:customerKeyId,publicKey:clientKey.publicKey,privateKey:clientKey.privateKey});
  const remote=await customerVault('portal-remote',remoteStorage),noteBytes=new TextEncoder().encode(JSON.stringify({version:1,type:'business-note',title:marker,date:'2026-11-08'}));
  const note=await remote.save('driver-record',noteBytes);const noteObject=await json(`/objects/${note.objectId}`,{token:tokens.get('portal-remote')});
  uploaded.push({context:noteObject.envelope.context,envelope:noteObject.envelope,bytes:noteBytes});
  let scheduled,cleared=false;const refresh=new PortalRefresh({eligible:()=>portal.unlocked&&portal.canWrite,refresh:()=>portal.sync(),setTimer:callback=>{scheduled=callback;return 1;},clearTimer:()=>{cleared=true;}});
  refresh.start();assert.equal(typeof scheduled,'function');assert.equal(await refresh.tick(),true);assert.equal(portalSnapshot(portal.records).counts.notes,1);assert(refresh.state.lastUpdated);refresh.stop({clear:true});assert(cleared);checks++;
  setEmployeeEnabled(employee.id,true);acceptEmployeeInvitation(issueEmployeeInvitation(employee.id),password);
  await login(afterRestore.client,member.email,firstSession.recoveryCodes[3]);await afterRestore.client.unlock(newDevice.keyId);
  const portalGrant=await signStaffGrant({...replacementRequest},firm,{grantId:newGrant.grantId,epoch:newGrant.epoch+1,domains:['tax-document','driver-record','driver-receipt']});
  await owner.client.installGrant(portalGrant);
  for(const object of [...objects,...uploaded])await owner.client.installCapsule(await createStaffCapsule(object.envelope,manifest,portalGrant,firm,expected(portalGrant,object)));
  await afterRestore.client.selectGrant(portalGrant.grantId);assert.equal((await afterRestore.client.sync()).items,6);
  for(const object of uploaded)assert.deepEqual(afterRestore.client.records.get(object.context.objectId).plaintext,object.bytes);checks++;
  const staffDom=new JSDOM('<!doctype html><body><section id="shared-records"></section></body>'),staffDocument=staffDom.window.document,sharedRecords=staffDocument.querySelector('#shared-records');
  Object.defineProperty(staffDocument,'hidden',{value:false,configurable:true});let staffWorking=false,staffView=0;
  const staffUpdates=mountStaffUpdates(staffDocument,sharedRecords,{getClient:()=>afterRestore.client,isWorking:()=>staffWorking,setWorking:value=>{staffWorking=value;},captureScope:()=>staffView,isCurrentScope:value=>value===staffView,onLocked:()=>{staffView++;staffUpdates.clear();},timers:{setTimer:()=>1,clearTimer:()=>{}}});
  try{
    assert.equal(await staffUpdates.check(),true);assert.match(sharedRecords.textContent,/Shared business records/);checks++;
    const incomeBytes=cents=>new TextEncoder().encode(JSON.stringify({version:1,type:'driver-record',record:{kind:'income',body:{amountCents:cents,currency:'USD',description:marker}}}));
    const income=await remote.save('driver-record',incomeBytes(7777));await portal.sync();assert.equal(portalSnapshot(portal.records).totals[0].incomeCents,7777);checks++;
    assert.equal(await staffUpdates.poller.tick(),false);assert.equal(sharedRecords.childElementCount,0);assert.equal(afterRestore.client.unlocked,false);checks++;
    async function shareIncome(){const current=await json(`/objects/${income.objectId}`,{token:tokens.get('portal-remote')});await owner.client.installCapsule(await createStaffCapsule(current.envelope,manifest,portalGrant,firm,expected(portalGrant,{context:current.envelope.context})));}
    await shareIncome();await afterRestore.client.unlock(newDevice.keyId);await afterRestore.client.selectGrant(portalGrant.grantId);
    assert.equal(await staffUpdates.check(),true);assert.match(sharedRecords.textContent,/entered income 77\.77/);assert.match(sharedRecords.textContent,/not automatically posted receivables/);checks++;
    await remote.save('driver-record',incomeBytes(9900),income.objectId);await shareIncome();assert.equal(await staffUpdates.poller.tick(),true);assert.match(sharedRecords.textContent,/entered income 99\.00/);assert(!sharedRecords.textContent.includes('77.77'));checks++;
    staffDom.window.dispatchEvent(new staffDom.window.Event('pagehide'));assert.equal(sharedRecords.childElementCount,0);assert.equal(afterRestore.client.records.size,0);assert.equal(afterRestore.client.unlocked,false);checks++;
    await afterRestore.client.unlock(newDevice.keyId);await afterRestore.client.selectGrant(portalGrant.grantId);
  }finally{staffUpdates.destroy();staffDom.window.close();}
  const taxReturns=[];
  for(const year of [2025,2023,2024])for(const kind of ['1040','1065','1120S','1120']){
    const input=newReturn(kind,year);Object.assign(input.party,{name:'Synthetic Return',taxId:'000123456',street:'1 Example St',city:'Hartford',state:'CT',zip:'06103'});input.notes=marker;for(const key of Object.keys(input.review))input.review[key]=true;
    if(input.individual)input.individual.w2s=[{id:randomUUID(),owner:'taxpayer',employer:'Synthetic employer',wagesCents:22000000,socialSecurityWagesCents:22000000,medicareWagesCents:22000000,federalWithholdingCents:500000,medicareTaxWithheldCents:337000}];
    else{Object.assign(input.entity,{businessName:'Synthetic business',businessCode:'541219',receiptsCents:10000000});if(kind!=='1120')input.entity.owners=[{id:'owner-a',name:'Synthetic Owner A',taxId:'000111111',shareBps:5000},{id:'owner-b',name:'Synthetic Owner B',taxId:'000222222',shareBps:5000}];}
    const creationKit=await afterRestore.client.prepareNewReturn(input);assert.equal(creationKit.privateReview.before,null);assert.equal(await privateReturnCreationReviewCommitment(creationKit.privateReview),creationKit.proposal.reviewCommitment);checks++;
    const creationPacket=await approveReturnCreation({proposal:creationKit.proposal,manifest:creationKit.manifest,grant:creationKit.grant,expected:creationKit.expected,reviewedCommitment:creationKit.proposal.reviewCommitment,reviewReference:'synthetic-reviewed-initial-return',unlocked:firm});
    const beforePrivate=staffApiRequests;await assert.rejects(()=>owner.client.installApprovedReturnCreation(creationKit));assert.equal(staffApiRequests,beforePrivate);checks++;
    await json('/staff/return-creations',{token:tokens.get('after-restore'),method:'POST',body:creationPacket},403);
    const receipt=await owner.client.installApprovedReturnCreation(creationPacket);assert.equal(receipt.duplicate,false);assert.equal((await owner.client.installApprovedReturnCreation(creationPacket)).duplicate,true);checks++;
    await portal.sync();const opened=JSON.parse(new TextDecoder().decode(portal.records.get(receipt.objectId).plaintext));assert.deepEqual(opened,input);checks++;
    if(kind==='1040'){const result=calculateReturn(opened);assert.equal(result.summary.additionalMedicareTaxCents,18000);assert.equal(result.summary.additionalMedicareWithholdingCents,18000);assert.equal(result.summary.paymentsCents,518000);assert(result.forms.some(form=>form.form==='f8959'));checks++;}
    const object=await json(`/objects/${receipt.objectId}`,{token:tokens.get('portal-remote')});assert.equal(object.envelope.author.role,'firm-recovery');assert.equal(object.envelope.context.revision,1);
    taxReturns.push({year,kind,objectId:receipt.objectId,input});
  }
  assert.equal((await afterRestore.client.sync()).items,7+taxReturns.length);await remote.sync();checks++;
  const exported=[];
  for(const saved of taxReturns){const input=JSON.parse(new TextDecoder().decode(afterRestore.client.records.get(saved.objectId).plaintext));assert.deepEqual(input,saved.input);const packet=await generateDraftPdf(input,{loadTemplate:(id,year)=>new Uint8Array(readFileSync(`packages/tax-engine/forms/${year}/${id}.pdf`))});assert(packet.bytes.length>1000);assert.equal(packet.result.filingReady,false);exported.push({year:saved.year,kind:saved.kind,formCopies:packet.audit.length,bytes:packet.bytes.length});packet.bytes.fill(0);checks++;}
  const corrected=taxReturns.find(item=>item.kind==='1120');corrected.input.entity.receiptsCents=20000000;await saveReturn(remote,corrected.input,corrected.objectId);
  await assert.rejects(()=>afterRestore.client.sync());assert.equal(afterRestore.client.records.size,0);checks++;
  const correction=await json(`/objects/${corrected.objectId}`,{token:tokens.get('portal-remote')});await owner.client.installCapsule(await createStaffCapsule(correction.envelope,manifest,portalGrant,firm,expected(portalGrant,{context:correction.envelope.context})));
  await afterRestore.client.unlock(newDevice.keyId);await afterRestore.client.selectGrant(portalGrant.grantId);await afterRestore.client.sync();await portal.sync();assert.equal(calculateReturn(JSON.parse(new TextDecoder().decode(portal.records.get(corrected.objectId).plaintext))).summary.totalTaxCents,4200000);checks++;
  const staffInput=structuredClone(corrected.input);staffInput.entity.receiptsCents=25000000;
  const kit=await afterRestore.client.prepareReturnCorrection(corrected.objectId,staffInput);assert.equal(await privateReturnReviewCommitment(kit.privateReview),kit.proposal.reviewCommitment);checks++;
  const publicPacket=await approveReturnEdit({proposal:kit.proposal,envelope:kit.sourceEnvelope,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment:await privateReturnReviewCommitment(kit.privateReview),reviewReference:'synthetic-reviewed-staff-correction',unlocked:firm});
  await json('/staff/return-edits',{token:tokens.get('after-restore'),method:'POST',body:publicPacket},403);
  const requestsBeforePrivateKit=staffApiRequests;await assert.rejects(()=>owner.client.installApprovedReturnEdit(kit));assert.equal(staffApiRequests,requestsBeforePrivateKit);checks++;
  assert.equal((await owner.client.installApprovedReturnEdit(publicPacket)).duplicate,false);assert.equal((await owner.client.installApprovedReturnEdit(publicPacket)).duplicate,true);checks++;
  await portal.sync();assert.equal(calculateReturn(JSON.parse(new TextDecoder().decode(portal.records.get(corrected.objectId).plaintext))).summary.totalTaxCents,5250000);checks++;
  const staffCorrection=await json(`/objects/${corrected.objectId}`,{token:tokens.get('portal-remote')});assert.equal(staffCorrection.envelope.author.role,'firm-recovery');
  assert.equal((await afterRestore.client.sync()).items,7+taxReturns.length);assert.equal(calculateReturn(JSON.parse(new TextDecoder().decode(afterRestore.client.records.get(corrected.objectId).plaintext))).summary.totalTaxCents,5250000);checks++;corrected.input=staffInput;
  returnProof={years:[2023,2024,2025],kinds:taxReturns.map(item=>item.kind),staffOriginatedKinds:taxReturns.map(item=>item.kind),initialReturnRequiresFirmApproval:true,initialPrivateReviewRefusedBeforeUpload:true,initialRevisionSharedAtomically:true,encryptedSaveClientReopenStaffRead:true,exported,unsharedRevisionClearsStaffView:true,correctedClientInputVisibleAfterSharing:true,staffReturnCorrectionProposalVerified:true,privateReviewRefusedBeforeUpload:true,ownerMfaAndFirmApprovalPublicationVerified:true,clientSeesApprovedStaffCorrection:true,approvedRevisionSharedAtomically:true,staffDirectWritesEnabled:false,productionFilingPerformed:false};
  const removed=await saveReturn(remote,corrected.input);await remote.remove(removed.objectId);
  const tombstone=await json(`/objects/${removed.objectId}`,{token:tokens.get('portal-remote')});assert.equal(tombstone.deleted,true);
  const resurrectionContext={workspaceId:publicPins.workspaceId,accountId:account.id,objectId:removed.objectId,revision:tombstone.revision+1,domain:'tax-document'},resurrection=await sealEnvelope(new TextEncoder().encode(JSON.stringify(corrected.input)),resurrectionContext,recipients,'client',clientKey.privateKey);
  await json(`/objects/${removed.objectId}`,{token:tokens.get('portal-remote'),method:'PUT',body:{mutationId:randomUUID(),expectedRevision:tombstone.revision,envelope:resurrection}},409);
  assert.deepEqual(await json(`/objects/${removed.objectId}`,{token:tokens.get('portal-remote')}),tombstone);returnProof.terminalDeletionVerified=true;
  const statement=uploaded.find(item=>{try{return JSON.parse(new TextDecoder().decode(item.bytes)).purpose==='bank-statement';}catch{return false;}});assert(statement);
  const caseIds=[];let caseTransitions=0;
  const reference=id=>{const item=afterRestore.client.records.get(id);assert(item);return {objectId:id,revision:item.revision,envelopeDigest:item.envelopeDigest,domain:item.domain};};
  async function caseAction(id,type,input,evidenceId=null){
    const command={actionId:randomUUID(),type,input},reviewKit=await afterRestore.client.prepareCaseAction(id,command,evidenceId);assert.equal(await privateCaseReviewCommitment(reviewKit.privateReview),reviewKit.proposal.reviewCommitment);checks++;
    const packet=await approveCaseTransition({proposal:reviewKit.proposal,envelope:reviewKit.sourceEnvelope,manifest:reviewKit.manifest,grant:reviewKit.grant,expected:reviewKit.expected,reviewedCommitment:reviewKit.proposal.reviewCommitment,reviewReference:'synthetic-reviewed-case',unlocked:firm});
    const beforePrivate=staffApiRequests;await assert.rejects(()=>owner.client.installApprovedCase(reviewKit));assert.equal(staffApiRequests,beforePrivate);checks++;
    if(!caseTransitions){
      await json('/staff/cases',{token:tokens.get('after-restore'),method:'POST',body:packet},403);
      await json(`/objects/${packet.envelope.context.objectId}`,{token:tokens.get('portal-remote'),method:'PUT',body:{mutationId:randomUUID(),expectedRevision:0,envelope:packet.envelope}},403);
      const privateBytes=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',clientKey.privateKey);try{
        const reencrypted=await sealEnvelope(privateBytes,packet.envelope.context,recipients,'client',clientKey.privateKey);await json(`/objects/${packet.envelope.context.objectId}`,{token:tokens.get('portal-remote'),method:'PUT',body:{mutationId:randomUUID(),expectedRevision:0,envelope:reencrypted}},403);
      }finally{privateBytes.fill(0);}
    }
    const receipt=await owner.client.installApprovedCase(packet);assert.equal(receipt.duplicate,false);assert.equal((await owner.client.installApprovedCase(packet)).duplicate,true);caseTransitions++;checks++;
    await portal.sync();await remote.sync();await afterRestore.client.sync();const customerCase=portal.records.get(receipt.objectId),staffCase=afterRestore.client.records.get(receipt.objectId);assert.deepEqual(customerCase.verifiedCase??customerCase.verifiedOffice,reviewKit.privateReview.after);assert.deepEqual(staffCase.verifiedCase??staffCase.verifiedOffice,customerCase.verifiedCase??customerCase.verifiedOffice);checks++;
    assert(!JSON.stringify(packet).includes(marker));assert(!Object.hasOwn(packet.approval,'command'));return receipt.objectId;
  }
  async function shareLatest(id){const object=await json(`/objects/${id}`,{token:tokens.get('portal-remote')});await owner.client.installCapsule(await createStaffCapsule(object.envelope,manifest,portalGrant,firm,expected(portalGrant,{context:object.envelope.context})));await portal.sync();await afterRestore.client.sync();}
  const annualCaseIds=[];
  for(const year of [2023,2024])for(const kind of ['1040','1120']){
    const id=await caseAction(null,'case.create',{title:`Synthetic annual ${year} case`,year,kind}),draft=taxReturns.find(item=>item.kind===kind&&item.year===year);
    await caseAction(id,'draft.link',{document:reference(draft.objectId),notes:'Synthetic same-year draft'},draft.objectId);annualCaseIds.push({id,year,kind});
    for(const reader of [portal,afterRestore.client]){const body=reader.records.get(id).verifiedCase;assert.equal(body.year,year);assert.equal(caseSnapshot(body,reader.records).draft.freshness,'current');}checks++;
  }
  returnProof.annualCaseBindings=annualCaseIds.map(({year,kind})=>({year,kind}));
  for(const kind of ['1040','1120']){
    const id=await caseAction(null,'case.create',{title:`Synthetic ${kind} case ${marker}`,year:2025,kind}),requestId=randomUUID();caseIds.push({id,kind,requestId});
    await caseAction(id,'request.add',{requestId,title:'Bank statement',due:'2026-12-01',notes:marker});
    await caseAction(id,'document.review',{requestId,document:reference(statement.context.objectId),decision:'reviewed',notes:marker},statement.context.objectId);
    assert.equal(caseSnapshot(portal.records.get(id).verifiedCase,portal.records).requests[0].ready,true);checks++;
    if(kind==='1040'){
      const payload=JSON.parse(new TextDecoder().decode(afterRestore.client.records.get(statement.context.objectId).plaintext));payload.notes=marker+' revised metadata';await remote.save(statement.context.domain,new TextEncoder().encode(JSON.stringify(payload)),statement.context.objectId);await shareLatest(statement.context.objectId);
      for(const reader of [portal,afterRestore.client]){const status=caseSnapshot(reader.records.get(id).verifiedCase,reader.records);assert.equal(status.requests[0].freshness,'stale');assert.equal(status.ready,false);}checks++;
      await caseAction(id,'document.review',{requestId,document:reference(statement.context.objectId),decision:'replacement_requested',notes:'Synthetic client-visible replacement note'},statement.context.objectId);
    }
    const draft=taxReturns.find(item=>item.kind===kind);await caseAction(id,'draft.link',{document:reference(draft.objectId),notes:'Synthetic linked draft'},draft.objectId);
    if(kind==='1120'){
      assert.equal(caseSnapshot(portal.records.get(id).verifiedCase,portal.records).ready,true);
      corrected.input.notes=marker+' changed linked draft';await saveReturn(remote,corrected.input,corrected.objectId);await shareLatest(corrected.objectId);
      for(const reader of [portal,afterRestore.client]){const status=caseSnapshot(reader.records.get(id).verifiedCase,reader.records);assert.equal(status.draft.freshness,'stale');assert.equal(status.ready,false);}checks++;
      await caseAction(id,'draft.link',{document:reference(corrected.objectId),notes:'Synthetic reviewed replacement draft link'},corrected.objectId);
    }
  }
  const selectedCase=caseIds[1],replacementPayload=JSON.parse(new TextDecoder().decode(afterRestore.client.records.get(statement.context.objectId).plaintext));await remote.remove(statement.context.objectId);await portal.sync();await afterRestore.client.sync();
  for(const reader of [portal,afterRestore.client]){const status=caseSnapshot(reader.records.get(selectedCase.id).verifiedCase,reader.records);assert.equal(status.requests[0].freshness,'unavailable');assert.equal(status.ready,false);}checks++;
  const newStatement=await remote.save('tax-document',new TextEncoder().encode(JSON.stringify(replacementPayload)));await shareLatest(newStatement.objectId);
  await caseAction(selectedCase.id,'document.review',{requestId:selectedCase.requestId,document:reference(newStatement.objectId),decision:'reviewed',notes:'Synthetic reviewed replacement source'},newStatement.objectId);
  assert.equal(caseSnapshot(portal.records.get(selectedCase.id).verifiedCase,portal.records).ready,true);assert.equal(caseSnapshot(portal.records.get(caseIds[0].id).verifiedCase,portal.records).ready,false);checks++;
  const preserved=portal.records.get(selectedCase.id).verifiedCase;assert(preserved.history.some(event=>event.type==='document.review'&&event.input.document.objectId===statement.context.objectId));assert(preserved.history.some(event=>event.type==='document.review'&&event.input.document.objectId===newStatement.objectId));checks++;
  const caseDom=new JSDOM('<!doctype html><body></body>');try{for(const item of caseIds){const view=renderCase(caseDom.window.document,portal.records.get(item.id),portal.records);assert.equal(view.dataset.caseReady,String(item.kind==='1120'));caseDom.window.document.body.append(view);}}finally{caseDom.window.close();}checks++;
  const bookLine=(accountNumber,debitCents,creditCents)=>({accountNumber,debitCents,creditCents});
  for(const item of caseIds){
    await caseAction(item.id,'books.open',{title:`Synthetic working ledger ${marker}`,currency:'USD',from:'2025-01-01',through:'2025-12-31',accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:marker});
    await caseAction(item.id,'books.account.add',{account:{number:1050,name:`Synthetic additional bank ${marker}`,classification:'bank'},notes:''});
    const document=item.kind==='1120'?reference(newStatement.objectId):null;
    await caseAction(item.id,'books.journal.post',{date:'2025-01-01',memo:`Synthetic received revenue ${marker}`,lines:[bookLine(1050,12345,0),bookLine(4000,0,12345)],document,notes:marker},document?.objectId??null);
    await caseAction(item.id,'books.journal.post',{date:'2025-01-02',memo:`Synthetic expense ${marker}`,lines:[bookLine(6000,2345,0),bookLine(1050,0,2345)],document:null,notes:marker});
    const expenseId=replayCaseBooks(portal.records.get(item.id).verifiedCase.history,2025).entries.at(-1).id;
    await caseAction(item.id,'books.journal.reverse',{entryId:expenseId,date:'2025-01-03',reason:`Synthetic corrected expense ${marker}`,notes:marker});
    await caseAction(item.id,'books.journal.post',{date:'2025-01-04',memo:`Synthetic replacement expense ${marker}`,lines:[bookLine(6000,345,0),bookLine(1050,0,345)],document:null,notes:marker});
    await caseAction(item.id,'books.period.close',{through:'2025-01-31',notes:`Synthetic reconciled period ${marker}`});
    for(const reader of [portal,afterRestore.client]){
      const status=caseSnapshot(reader.records.get(item.id).verifiedCase,reader.records);assert.equal(status.draft.booksFreshness,'stale');assert.equal(status.ready,false);assert.equal(status.books.report.bankCents,12000);assert.equal(status.books.report.netIncomeCents,12000);assert.equal(status.books.entries.length,4);assert.equal(status.books.closedThrough,'2025-01-31');
      assert.equal(caseBookReport(status.books,{through:'2025-01-02'}).bankCents,10000);assert.equal(caseBookReport(status.books,{from:'2025-02-01'}).netIncomeCents,0);
    }checks++;
    const draft=taxReturns.find(value=>value.kind===item.kind),book=replayCaseBooks(portal.records.get(item.id).verifiedCase.history,2025);
    await caseAction(item.id,'draft.link',{document:reference(draft.objectId),notes:'Synthetic reviewed current books and draft',booksVersion:book.version},draft.objectId);
    for(const reader of [portal,afterRestore.client]){const status=caseSnapshot(reader.records.get(item.id).verifiedCase,reader.records);assert.equal(status.draft.booksFreshness,'current');assert.equal(status.ready,item.kind==='1120');}checks++;
  }
  const beforeClosedAttempt=staffApiRequests;await assert.rejects(()=>afterRestore.client.prepareCaseAction(selectedCase.id,{actionId:randomUUID(),type:'books.journal.post',input:{date:'2025-01-31',memo:'Synthetic closed period denial',lines:[bookLine(1050,1,0),bookLine(4000,0,1)],document:null,notes:''}}),/closed/);assert(staffApiRequests>beforeClosedAttempt);assert.equal(afterRestore.client.unlocked,false);checks++;
  await afterRestore.client.unlock(newDevice.keyId);await afterRestore.client.selectGrant(portalGrant.grantId);await afterRestore.client.sync();
  booksProof={kinds:caseIds.map(item=>item.kind),approvedBookActions:14,clientAndStaffBankCents:12000,clientAndStaffNetIncomeCents:12000,classifiedCustomBankIncluded:true,retainedReversalAndEarlierBalances:true,closedPeriodRejected:true,ledgerChangesInvalidateDraftReview:true,exactBookVersionRelinkVerified:true,caseScoped:true,legacyBooksImported:false,firmBillingImplemented:false};
  const finance=await proveClientFinance({scope:{workspaceId:publicPins.workspaceId,accountId:account.id,clientId:client.id},readers:[portal,afterRestore.client],caseIds,taxReturns,caseAction,reference,marker});financeProof=finance.proof;checks++;
  const duplicateFinance=await afterRestore.client.prepareCaseAction(null,{actionId:randomUUID(),type:'office.create',input:{title:'Synthetic duplicate finance record',notes:''}});
  const duplicateFinancePacket=await approveCaseTransition({proposal:duplicateFinance.proposal,envelope:null,manifest:duplicateFinance.manifest,grant:duplicateFinance.grant,expected:duplicateFinance.expected,reviewedCommitment:duplicateFinance.proposal.reviewCommitment,reviewReference:'synthetic-duplicate-denial',unlocked:firm});
  await json('/staff/cases',{token:tokens.get('owner'),method:'POST',body:duplicateFinancePacket},409);await portal.sync();assert.deepEqual(portal.records.get(finance.id).verifiedOffice,finance.body);financeProof.duplicateCanonicalCreationRejected=true;checks++;

  authorizationProof=await proveAuthorizationEvidence({scope:{workspaceId:publicPins.workspaceId,accountId:account.id,clientId:client.id},readers:[portal,afterRestore.client],remote,caseIds,taxReturns,sourceId:newStatement.objectId,finance,caseAction,reference,shareLatest,restoreStaff:async()=>{await afterRestore.client.unlock(newDevice.keyId);await afterRestore.client.selectGrant(portalGrant.grantId);await afterRestore.client.sync();},marker});checks++;
  const protectedCase=portal.records.get(selectedCase.id),clientAttempt=new TextEncoder().encode(JSON.stringify({version:1,type:'business-note',title:'Synthetic forbidden case replacement'})),beforeClientAttempt=customerApiRequests;
  await assert.rejects(()=>portal.save('tax-document',clientAttempt,protectedCase.objectId));await assert.rejects(()=>portal.remove(protectedCase.objectId));assert.equal(customerApiRequests,beforeClientAttempt);checks++;
  const forbiddenContext={workspaceId:publicPins.workspaceId,accountId:account.id,objectId:protectedCase.objectId,revision:protectedCase.revision+1,domain:'tax-document'},forbiddenEnvelope=await sealEnvelope(clientAttempt,forbiddenContext,recipients,'client',clientKey.privateKey);
  await json(`/objects/${protectedCase.objectId}`,{token:tokens.get('portal-remote'),method:'PUT',body:{mutationId:randomUUID(),expectedRevision:protectedCase.revision,envelope:forbiddenEnvelope}},403);await json(`/objects/${protectedCase.objectId}`,{token:tokens.get('portal-remote'),method:'DELETE',body:{expectedRevision:protectedCase.revision}},403);
  const expectedCaseBodies=[...caseIds,...annualCaseIds].map(item=>({id:item.id,body:structuredClone(portal.records.get(item.id).verifiedCase)}));
  const caseAudits=workspaceDatabase(db=>db.prepare("SELECT snapshot FROM audit WHERE action='secure-tax.case.approved'").all());assert.equal(caseAudits.length,caseTransitions);for(const row of caseAudits){const value=JSON.parse(row.snapshot);assert.deepEqual(Object.keys(value).sort(),['approval','sharingCapsuleId']);for(const privateId of [statement.context.objectId,newStatement.objectId,...taxReturns.map(item=>item.objectId)])assert(!row.snapshot.includes(privateId));assert(!row.snapshot.includes(marker));}checks++;
  caseProof={kinds:caseIds.map(item=>item.kind),approvedTransitions:caseTransitions,privateKitsRefusedBeforeUpload:true,clientAndStaffVerifyPrivateFirmCertificates:true,changedEvidenceInvalidatesReview:true,deletedEvidenceInvalidatesReview:true,replacementHistoryPreserved:true,changedDraftInvalidatesLink:true,currentAndIncompleteCasesRendered:true,genericClientWriteAndDeleteRefused:true,unpublishedCaseEnvelopeAndClientReencryptionRefused:true,privateDependenciesAndActionsAbsentFromHostMetadata:true,filingAuthorizationImplemented:false};
  const expectedPortalItems=portal.records.size,expectedStaffItems=afterRestore.client.records.size;
  await stop(child);child=null;const portalBackup=backupWorkspace(restored,path.join(root,'portal-backup')),portalRestored=path.join(root,'portal-restored');restoreWorkspace(path.join(root,'portal-backup'),portalRestored);
  env.DEALDESK_DATA_DIR=portalRestored;process.env.DEALDESK_DATA_DIR=portalRestored;await start();await portal.connect();await portal.unlock(customerKeyId);assert.equal((await portal.sync()).items,expectedPortalItems);
  assert.equal(portalSnapshot(portal.records).counts.statements,1);assert.equal(portalSnapshot(portal.records).totals[0].incomeCents,9900);assert.equal((await afterRestore.client.sync()).items,expectedStaffItems);assert.equal(calculateReturn(JSON.parse(new TextDecoder().decode(afterRestore.client.records.get(corrected.objectId).plaintext))).summary.totalTaxCents,5250000);checks++;
  for(const item of expectedCaseBodies){assert.deepEqual(portal.records.get(item.id).verifiedCase,item.body);assert.deepEqual(afterRestore.client.records.get(item.id).verifiedCase,item.body);}await json(`/objects/${selectedCase.id}`,{token:tokens.get('portal-remote'),method:'DELETE',body:{expectedRevision:protectedCase.revision}},403);caseProof.certifiedCasesAndOwnershipSurviveRestore=true;checks++;
  for(const item of caseIds)for(const reader of [portal,afterRestore.client]){const status=caseSnapshot(reader.records.get(item.id).verifiedCase,reader.records);assert.equal(status.books.report.bankCents,12000);assert.equal(status.books.closedThrough,'2025-01-31');assert.equal(status.draft.booksFreshness,'current');}booksProof.cleanRestoreVerified=true;verifyRestoredFinance(finance,[portal,afterRestore.client]);verifyRestoredAuthorizations(caseIds,[portal,afterRestore.client],authorizationProof);checks++;
  portal.lock();assert.equal(portal.records.size,0);assert.equal(queue.clear().unpreparedDiscarded,0);retriedQueue.clear();remote.lock();checks++;
  for(let index=0;index<130;index++)await owner.client.installGrant(await signStaffGrant({...replacementRequest},firm,{grantId:`synthetic-paged-access-${String(index).padStart(3,'0')}`,epoch:1,domains:['tax-document']}));
  const beforePages=grantPageRequests,completeGrants=await afterRestore.client.refreshGrants();assert(completeGrants.length>=131);checks++;
  const pagesRead=grantPageRequests-beforePages;assert(pagesRead>=6);largeGrantList={activeGrants:completeGrants.length,pagesRead,boundedPageBytes:65536,completeSnapshotVerified:true};checks++;
  const mcp=new Client({name:'shuug-tax-completion-proof',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','scripts/mcp-server.ts'],cwd:process.cwd(),env:{...env,SHUUG_BACKEND_URL:base,SHUUG_BACKEND_TOKEN:env.BACKEND_ACCESS_TOKEN},stderr:'pipe'});
  try{
    await mcp.connect(transport);const call=async(name,args={})=>{const reply=await mcp.callTool({name,arguments:args});assert(!reply.isError);return JSON.parse(reply.content.find(block=>block.type==='text').text);};
    const tools=(await mcp.listTools()).tools;await call('business_capabilities');const catalog=await call('workspace_catalog');assert.equal(catalog.capabilities.find(item=>item.id==='tax-return-calculation').status,'partial');
    const plan=JSON.parse(readFileSync('examples/workspaces/tax-accounting.sample.json','utf8')),preview=await call('workspace_preview',plan);assert.equal(preview.requestedGoalComplete,false);const applied=await call('workspace_apply',{plan,currentDigest:preview.currentDigest,proposedDigest:preview.proposedDigest});assert.equal(applied.applied,true);assert.equal(applied.requestedGoalComplete,false);
    const current=await call('workspace_catalog');assert.equal(current.current.businessName,plan.businessName);workspaceBuilder={realStdioMcp:true,compiledBackend:true,tools:tools.length,previewAndApplyVerified:true,partialTaxPreparationReported:true,requestedGoalComplete:false};checks++;
  }finally{await mcp.close();}
  await stop(child);child=null;
  function hostFiles(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?hostFiles(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
  const files=hostFiles(env.DEALDESK_DATA_DIR);
  for(const filename of files){const bytes=readFileSync(filename);assert(!bytes.includes(Buffer.from(marker)), 'Host copy contains protected plaintext.');for(const action of ['case.create','request.add','document.review','draft.link','books.link','authorization.review',...BOOK_ACTIONS,...OFFICE_ACTIONS])assert(!bytes.includes(Buffer.from(`"${action}"`)),'Host copy contains a private case action.');assert(!filename.startsWith(trusted));}
  checks++;
  console.log(JSON.stringify({ok:true,checks,buildId:readFileSync('.next/BUILD_ID','utf8').trim(),syntheticWorkspace:true,freshClientHadNoLegacyBooks:true,mandatoryStaffMfaVerifiedWithGlobalFlagOff:true,
    originalV2ClientEnvelopesPreserved:true,staffOpenedProtectedBooksAndDocumentBytes:true,encryptedDeviceBackupRecovered:true,newDeviceGrantedAfterOriginalRevocation:true,
    oldDeviceCannotOpenReplacementCapsules:true,newProcessFirmRecoveryCliVerified:true,staleRevisionFailsClosed:true,restoredDataAndRevocationVerified:true,backupFiles:copied.files,copiedHostPlaintextMarkerAbsent:true,
    portal:{multiFileUploads:3,exactBytesOpened:true,lostReceiptRetryUsesSameCiphertext:true,encryptedPendingQueueRestored:true,localDashboardDistinguishesUploadedInvoicesFromLedgerAmounts:true,authorizedClientRefreshVerified:true,staffSeesFilesAfterSignedSharing:true,automaticStaffRefreshAndSharedSummaryVerified:true,unsharedNewItemClearsStaffView:true,approvedRevisionRefreshVerified:true,pageExitClearsStaffView:true,cleanRestoreVerified:true,restoreFiles:portalBackup.files,instantPushVerified:false,staffReturnCorrectionsRequireFirmApproval:true,fullStaffEditingImplemented:false},
    largeGrantList,returnProof,caseProof,booksProof,financeProof,authorizationProof,workspaceBuilder,realOffhostCustodyVerified:false,publicTlsVerified:false,transport:'Explicit HTTPS-origin adapter to owned loopback HTTP fixture',realClientDataUsed:false,installedServiceChanged:false},null,2));
}catch(error){console.error('Owned fixture diagnostics:\n'+log);throw error;}
finally{await stop(child);rmSync(root,{recursive:true,force:true});}
