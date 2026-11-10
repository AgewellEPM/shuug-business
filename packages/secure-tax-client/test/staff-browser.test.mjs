import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { generateRecipientKeyPair, publicKeyId, sealEnvelope } from '../envelope.mjs';
import { createFirmBundle, unlockFirmBundle, signEnrollmentRequest } from '../firm-recovery.mjs';
import { signStaffGrant, createStaffCapsule, revokeStaffGrant } from '../firm-staff.mjs';
import { StaffVaultClient } from '../browser/staff-client.mjs';
import { createClientKey, BrowserKeyStore } from '../browser/custody.mjs';
import { renderStaffRecords } from '../browser/staff-view.mjs';
import { mountStaffUpdates } from '../browser/staff-updates.mjs';
import { renderPortalDashboard } from '../browser/client-portal-view.mjs';
import { prepareBrowser } from '../prepare-browser.mjs';

const encode=value=>new TextEncoder().encode(JSON.stringify(value));
class MemoryStorage{
  keys=new Map();bindings=new Map();
  async putKey(value){this.keys.set(value.keyId,structuredClone(value));}async getKey(id){return structuredClone(this.keys.get(id));}
  async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
  async putBinding(value){this.bindings.set(value.id,structuredClone(value));}async getBinding(id){return structuredClone(this.bindings.get(id));}
}
async function fixture({staffAccountId='synthetic-staff',objectId='synthetic-private-item'}={}){
  const {bundle,publicPins}=await createFirmBundle('synthetic-staff-workspace','Synthetic firm passphrase only for tests.');
  const unlocked=await unlockFirmBundle(bundle,'Synthetic firm passphrase only for tests.',publicPins);
  const clientKey=await generateRecipientKeyPair(),staffKey=await createClientKey('Synthetic staff device backup passphrase.');
  const scope={accountId:'synthetic-client-account',clientId:'synthetic-client',staffAccountId,staffKeyId:staffKey.keyId};
  const config={version:1,uiOrigin:'https://staff.example',apiOrigin:'https://ciphertext.example',...publicPins};
  const manifest=await signEnrollmentRequest({version:1,workspaceId:publicPins.workspaceId,accountId:scope.accountId,clientId:scope.clientId,client:{keyId:await publicKeyId(clientKey.publicKey),publicKey:clientKey.publicKey}},unlocked,{epoch:1});
  const grantRequest={version:1,workspaceId:publicPins.workspaceId,accountId:scope.accountId,clientId:scope.clientId,staffAccountId,staff:{keyId:staffKey.keyId,publicKey:staffKey.publicKey}};
  const grant=await signStaffGrant(grantRequest,unlocked,{grantId:'synthetic-grant',epoch:1,domains:['tax-identity']});
  const context={workspaceId:config.workspaceId,accountId:scope.accountId,objectId,revision:1,domain:'tax-identity'};
  const plaintext=encode({version:1,type:'tax-identity',legalName:'SYNTHETIC PRIVATE CLIENT',ssn:'000123456'});
  const envelope=await sealEnvelope(plaintext,context,{clientPublicKey:clientKey.publicKey,firmRecoveryPublicKey:publicPins.firmRecoveryPublicKey},'client',clientKey.privateKey);
  const capsule=await createStaffCapsule(envelope,manifest,grant,unlocked,{...scope,objectId:context.objectId,revision:1,domain:context.domain});
  let grants=[grant],object={objectId:context.objectId,revision:1,sequence:1,deleted:false,envelope,manifest,capsule,grant},available=true,hook=null;
  const storage=new MemoryStorage(),calls=[],respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  await storage.putKey(staffKey);await storage.putBinding({id:`staff-local-key:${staffKey.keyId}`,purpose:'staff-device',keyId:staffKey.keyId});
  const fetcher=async(url,options)=>{
    calls.push({url,options:structuredClone(options)});const parsed=new URL(url),route=parsed.pathname;
    if(hook){const value=await hook(url,options);if(value)return value;}
    if(route.endsWith('/session')){
      if(options.method==='DELETE')return respond({ok:true});
      const input=JSON.parse(options.body);if(input.password)return respond({apiVersion:1,mfaRequired:true,challengeToken:'a'.repeat(64),enrollmentRequired:false,expiresAt:new Date(Date.now()+300000).toISOString()},428);
      assert.deepEqual(input,{challengeToken:'a'.repeat(64),code:'123456'});return respond({apiVersion:1,token:'synthetic-staff-session-token',expiresAt:new Date(Date.now()+3600000).toISOString(),identity:{staffAccountId}});
    }
    if(route.endsWith('/status'))return respond({apiVersion:1,identity:{staffAccountId},mfaVerified:true});
    if(route.endsWith('/grants'))return respond(options.method==='GET'?{grants}: {ok:true});
    if(route.endsWith('/capsules'))return respond({ok:true});
    const chosen=grants.find(value=>value.grantId===parsed.searchParams.get('grantId'));
    if(!chosen)return respond({error:'Revoked'},403);
    if(route.endsWith('/objects'))return respond({changes:[{objectId:object.objectId,revision:object.revision,sequence:object.sequence,deleted:object.deleted,available}],cursor:object.sequence,hasMore:false});
    return respond(object);
  };
  const vault=await StaffVaultClient.create(config,config.uiOrigin,{storage,fetcher});
  await vault.signIn(staffAccountId==='workspace-owner'?'':'staff@example.invalid','Synthetic staff password');await vault.verifySignIn('123456');await vault.unlock(staffKey.keyId);await vault.selectGrant(grant.grantId);
  return {vault,config,storage,calls,scope,grant,grantRequest,staffKey,unlocked,manifest,envelope,capsule,plaintext,respond,setGrants:value=>{grants=value;},setObject:value=>{object=value;},setAvailable:value=>{available=value;},setHook:value=>{hook=value;}};
}

test('staff reader verifies MFA, signed grant and capsule before opening original client ciphertext',async()=>{
  const f=await fixture();assert.equal(f.vault.isOwner,false);assert.equal(f.vault.pendingMfa,null);
  assert.deepEqual(f.vault.publicRequest(),{version:1,workspaceId:f.config.workspaceId,staffAccountId:f.scope.staffAccountId,staff:{keyId:f.staffKey.keyId,publicKey:f.staffKey.publicKey}});
  assert.deepEqual(await f.vault.sync(),{items:1,grantId:f.grant.grantId,clientId:f.scope.clientId});assert.deepEqual(f.vault.records.get('synthetic-private-item').plaintext,f.plaintext);
  for(const call of f.calls){const wire=call.options.body??'';assert(!wire.includes('000123456'));assert(!wire.includes('SYNTHETIC PRIVATE CLIENT'));assert.equal(call.options.credentials,'omit');assert.equal(call.options.redirect,'error');}
  const persisted=JSON.stringify([...f.storage.bindings.values()]);assert(!persisted.includes('000123456'));assert(!persisted.includes('synthetic-staff-session-token'));assert.equal(f.staffKey.privateKey.extractable,false);
  await assert.rejects(()=>f.vault.installGrant(f.grant),/Only the firm owner/);await assert.rejects(()=>f.vault.installCapsule(f.capsule),/Only the firm owner/);
  const opened=f.vault.records.get('synthetic-private-item').plaintext;f.vault.lock();assert.equal(f.vault.records.size,0);assert(opened.every(value=>value===0));
});
test('a newer pending revision or revoked grant clears opened content and never opens old shared data',async()=>{
  const f=await fixture();await f.vault.sync();f.setAvailable(false);await assert.rejects(()=>f.vault.sync(),/awaiting/);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);
  await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(f.grant.grantId);f.setAvailable(true);await f.vault.sync();f.setGrants([]);await assert.rejects(()=>f.vault.sync(),/revoked|unavailable|changed/);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);
  const imported=await f.vault.importKey(f.staffKey.backup,'Synthetic staff device backup passphrase.');assert.equal(imported.keyId,f.staffKey.keyId);await f.vault.unlock(imported.keyId);await assert.rejects(()=>f.vault.selectGrant(f.grant.grantId),/unavailable|revoked/);
});
test('changed final authorization fails the in-flight sync and remembers the observed newer epoch',async()=>{
  const f=await fixture(),renewed=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['tax-identity']});let read=false;
  f.setHook((url)=>{if(new URL(url).pathname.endsWith('/synthetic-private-item'))read=true;else if(read&&new URL(url).pathname.endsWith('/grants'))f.setGrants([renewed]);});
  await assert.rejects(()=>f.vault.sync(),/authorization changed|grant changed|staff account, key or client changed/);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);
  f.setHook(null);f.setGrants([f.grant]);await f.vault.unlock(f.staffKey.keyId);await assert.rejects(()=>f.vault.refreshGrants());assert.equal(f.vault.records.size,0);
});
test('manual grant refresh clears revoked or changed selections, and signed revocation epochs survive backup import',async()=>{
  const f=await fixture();await f.vault.sync();f.setGrants([]);await assert.rejects(()=>f.vault.refreshGrants(),/revoked/);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);
  f.setGrants([f.grant]);await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(f.grant.grantId);await f.vault.sync();
  const renewed=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['tax-identity']});f.setGrants([renewed]);await assert.rejects(()=>f.vault.refreshGrants(),/changed/);assert.equal(f.vault.records.size,0);
  await f.vault.unlock(f.staffKey.keyId);const revoked=await revokeStaffGrant(renewed,f.unlocked,{epoch:3});const result=await f.vault.stageGrant(revoked);assert.equal(result.status,'revoked');assert.equal(result.apiActivationPerformed,false);assert.equal(f.vault.unlocked,false);
  await f.vault.importKey(f.staffKey.backup,'Synthetic staff device backup passphrase.');await f.vault.unlock(f.staffKey.keyId);await assert.rejects(()=>f.vault.refreshGrants());
});
test('distinct legitimate signed grants keep separate epoch history and client switches discard in-flight data',async()=>{
  const f=await fixture(),second=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:'synthetic-second-grant',epoch:1,domains:['tax-identity']});f.setGrants([f.grant,second]);
  const grants=await f.vault.refreshGrants();assert.equal(grants.length,2);await f.vault.selectGrant(second.grantId);assert.equal(f.vault.selectedGrant.grantId,second.grantId);
  await f.vault.selectGrant(f.grant.grantId);let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});
  f.setHook(async(url)=>{if(new URL(url).pathname.endsWith('/synthetic-private-item')){entered();await new Promise(resolve=>{release=resolve;});}});
  const pending=f.vault.sync();await waiting;await f.vault.selectGrant(second.grantId);release();await assert.rejects(()=>pending,/changed/);assert.equal(f.vault.records.size,0);assert.equal(f.vault.selectedGrant.grantId,second.grantId);
});
test('owner publication verifies public signatures locally and withdrawal uses an exact epoch',async()=>{
  const f=await fixture({staffAccountId:'workspace-owner'});await f.vault.installGrant(f.grant);await f.vault.installCapsule(f.capsule);await f.vault.withdrawGrant(f.grant.grantId,1);
  assert.deepEqual(JSON.parse(f.calls.at(-1).options.body),{grantId:f.grant.grantId,expectedEpoch:1});assert.equal(f.calls.at(-1).options.method,'DELETE');
  const bad=structuredClone(f.capsule);bad.wrap.wrappedKey=bad.wrap.wrappedKey.slice(0,-1)+(bad.wrap.wrappedKey.endsWith('A')?'B':'A');const count=f.calls.length;await assert.rejects(()=>f.vault.installCapsule(bad));assert.equal(f.calls.length,count);
});
test('staff views are read-only, mask taxpayer IDs and only download explicitly requested files',async()=>{
  const dom=new JSDOM('<!doctype html><body></body>'),document=dom.window.document,downloaded=[];
  const records=new Map([['identity',{objectId:'identity',revision:1,domain:'tax-identity',plaintext:encode({version:1,type:'tax-identity',legalName:'<script>untrusted()</script>',ssn:'000123456'})}],['document',{objectId:'document',revision:1,domain:'tax-document',plaintext:encode({version:1,type:'private-file',filename:'../../synthetic.pdf',mime:'application/pdf',data:'U1lOVEhFVElD'})}]]);
  document.body.append(renderStaffRecords(document,records,{workspaceId:'synthetic',accountId:'account',clientId:'client'},{download:(...args)=>downloaded.push(args)}));
  assert.equal(document.querySelectorAll('script,img,input,textarea,select').length,0);assert(!document.body.textContent.includes('000123456'));assert.match(document.body.textContent,/3456/);assert(!document.body.textContent.includes('Delete encrypted'));assert.equal(downloaded.length,0);
  const button=[...document.querySelectorAll('button')].find(value=>value.textContent==='Download readable file');button.click();assert.equal(downloaded.length,1);assert.equal(downloaded[0][0],'.._.._synthetic.pdf');dom.window.close();
});
test('staff artifact retains strict headers and excludes firm private-key tooling',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'shuug-staff-artifact-'));
  try{
    await prepareBrowser({output:directory});const html=await readFile(path.join(directory,'staff.html'),'utf8'),files=await readdir(directory);
    assert.match(html,/\.\/browser\/staff-app.mjs/);assert.match(html,/connect-src 'none'/);assert(!html.includes('unsafe-inline'));assert(!files.includes('firm-staff.mjs'));assert(!files.includes('firm-recovery.mjs'));
    const app=await readFile(path.join(directory,'browser/staff-app.mjs'),'utf8'),updates=await readFile(path.join(directory,'browser/staff-updates.mjs'),'utf8');assert(!app.includes('localStorage'));assert(!app.includes('innerHTML'));assert.match(app,/mountStaffUpdates/);assert.match(updates,/visibilitychange/);assert.match(updates,/pagehide/);assert.match(html,/No firm recovery or signing private key/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('staff and client summaries use the same recorded amounts within the selected read scope',()=>{
  const dom=new JSDOM('<!doctype html><body></body>'),document=dom.window.document;
  try{
    const records=new Map([
      ['income',{objectId:'income',revision:1,domain:'driver-record',plaintext:encode({version:1,type:'driver-record',record:{kind:'income',body:{amountCents:12345,currency:'USD'}}})}],
      ['expense',{objectId:'expense',revision:1,domain:'driver-record',plaintext:encode({version:1,type:'driver-record',record:{kind:'expense',body:{amountCents:2345,currency:'USD'}}})}],
      ['invoice',{objectId:'invoice',revision:1,domain:'tax-document',plaintext:encode({version:1,type:'private-file',filename:'SYNTHETIC invoice.pdf',purpose:'invoice',byteLength:100})}],
    ]);
    const customer=renderPortalDashboard(document,records),staff=renderStaffRecords(document,records,{workspaceId:'synthetic',accountId:'account',clientId:'client'});
    assert.deepEqual([...staff.querySelectorAll('.portal-card')].map(node=>node.textContent),[...customer.querySelectorAll('.portal-card')].map(node=>node.textContent));
    assert.match(staff.textContent,/entered income 123\.45 · entered expenses 23\.45/);assert.match(staff.textContent,/only part of the client/);assert.match(staff.textContent,/not automatically posted receivables/);
    assert.equal(staff.querySelectorAll('input,textarea,select').length,0);
  }finally{dom.window.close();}
});
test('automatic staff refresh opens new signed revisions and clears summaries when fresh sharing is missing',async()=>{
  const f=await fixture(),grant=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['driver-record']});
  async function revision(number,cents){
    const context={...f.envelope.context,domain:'driver-record',revision:number},plaintext=encode({version:1,type:'driver-record',record:{kind:'income',body:{amountCents:cents,currency:'USD',description:'SYNTHETIC shared business record'}}});
    const envelope=await sealEnvelope(plaintext,context,{clientPublicKey:f.manifest.client.publicKey,firmRecoveryPublicKey:f.config.firmRecoveryPublicKey},'firm-recovery',f.unlocked.recovery);
    const capsule=await createStaffCapsule(envelope,f.manifest,grant,f.unlocked,{...f.scope,objectId:context.objectId,revision:number,domain:context.domain});
    f.setObject({objectId:context.objectId,revision:number,sequence:number,deleted:false,envelope,manifest:f.manifest,capsule,grant});
  }
  f.setGrants([grant]);await f.vault.selectGrant(grant.grantId);await revision(1,12345);
  const dom=new JSDOM('<!doctype html><body><section id="records"></section></body>'),document=dom.window.document,target=document.querySelector('#records');
  Object.defineProperty(document,'hidden',{configurable:true,value:false});let working=false,generation=0,timer,interval,clears=0;const messages=[];
  const updates=mountStaffUpdates(document,target,{getClient:()=>f.vault,isWorking:()=>working,setWorking:value=>{working=value;},captureScope:()=>generation,isCurrentScope:value=>value===generation,onLocked:()=>{generation++;updates.clear();},onMessage:text=>messages.push(text),timers:{setTimer:(callback,delay)=>{timer=callback;interval=delay;return 1;},clearTimer:()=>{clears++;}}});
  try{
    assert.equal(await updates.check(),true);assert.equal(interval,60000);assert.equal(typeof timer,'function');assert.match(target.textContent,/entered income 123\.45/);assert(updates.poller.state.lastUpdated);
    await revision(2,54321);assert.equal(await updates.poller.tick(),true);assert.match(target.textContent,/entered income 543\.21/);assert(!target.textContent.includes('123.45'));
    working=true;const calls=f.calls.length;assert.equal(await updates.poller.tick(),false);assert.equal(f.calls.length,calls);working=false;
    f.setAvailable(false);assert.equal(await updates.poller.tick(),false);assert.equal(target.childElementCount,0);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);assert.equal(updates.poller.state.lastUpdated,null);assert(messages.some(text=>text.includes('awaiting')));assert(clears>0);
  }finally{updates.destroy();f.vault.lock();dom.window.close();}
});
test('staff updates discard late reads on scope changes and lock on tab hiding or page exit',async()=>{
  const f=await fixture(),dom=new JSDOM('<!doctype html><body><section id="records"></section></body>'),document=dom.window.document,target=document.querySelector('#records');
  Object.defineProperty(document,'hidden',{configurable:true,value:false});let generation=0,working=false,release,entered;
  const updates=mountStaffUpdates(document,target,{getClient:()=>f.vault,isWorking:()=>working,setWorking:value=>{working=value;},captureScope:()=>generation,isCurrentScope:value=>value===generation,onLocked:()=>{generation++;updates.clear();},timers:{setTimer:()=>1,clearTimer:()=>{}}});
  try{
    assert.equal(await updates.check(),true);assert(target.childElementCount>0);
    const waiting=new Promise(resolve=>{entered=resolve;});f.setHook(async url=>{if(new URL(url).pathname.endsWith('/synthetic-private-item')){entered();await new Promise(resolve=>{release=resolve;});}});
    const pending=updates.poller.tick();await waiting;generation++;f.vault.lock();updates.clear();release();assert.equal(await pending,false);assert.equal(target.childElementCount,0);
    f.setHook(null);await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(f.grant.grantId);assert.equal(await updates.check(),true);
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));assert.equal(target.childElementCount,0);assert.equal(f.vault.unlocked,false);assert.equal(updates.poller.state.lastUpdated,null);
    Object.defineProperty(document,'hidden',{configurable:true,value:false});await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(f.grant.grantId);assert.equal(await updates.check(),true);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));assert.equal(target.childElementCount,0);assert.equal(f.vault.unlocked,false);
  }finally{updates.destroy();f.vault.lock();dom.window.close();}
});
test('a malformed decrypted client view locks and clears its staff reader',async()=>{
  const f=await fixture(),payload=encode({version:1,type:'driver-journal',capturedAt:Date.now(),binding:{accountId:'a-different-client'},journal:{entries:[]}});
  const envelope=await sealEnvelope(payload,f.envelope.context,{clientPublicKey:f.manifest.client.publicKey,firmRecoveryPublicKey:f.config.firmRecoveryPublicKey},'firm-recovery',f.unlocked.recovery);
  const capsule=await createStaffCapsule(envelope,f.manifest,f.grant,f.unlocked,{...f.scope,objectId:envelope.context.objectId,revision:1,domain:envelope.context.domain});
  f.setObject({objectId:envelope.context.objectId,revision:1,sequence:1,deleted:false,envelope,manifest:f.manifest,capsule,grant:f.grant});
  const dom=new JSDOM('<!doctype html><body><section id="records"></section></body>'),document=dom.window.document,target=document.querySelector('#records');Object.defineProperty(document,'hidden',{value:false});
  const updates=mountStaffUpdates(document,target,{getClient:()=>f.vault,timers:{setTimer:()=>1,clearTimer:()=>{}}});
  try{assert.equal(await updates.check(),false);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);assert.equal(target.childElementCount,0);}finally{updates.destroy();dom.window.close();}
});
test('switching to an authenticator while no staff key is unlocked preserves pending MFA',async()=>{
  const f=await fixture();await f.vault.signIn('staff@example.invalid','Synthetic staff password');const challenge=f.vault.pendingMfa;assert(challenge);assert.equal(f.vault.unlocked,false);
  const dom=new JSDOM('<!doctype html><body><section id="records"></section></body>'),document=dom.window.document;Object.defineProperty(document,'hidden',{value:true});let locked=0;
  const updates=mountStaffUpdates(document,document.querySelector('#records'),{getClient:()=>f.vault,onLocked:()=>{locked++;},timers:{setTimer:()=>1,clearTimer:()=>{}}});
  try{document.dispatchEvent(new dom.window.Event('visibilitychange'));assert.deepEqual(f.vault.pendingMfa,challenge);assert.equal(locked,0);assert.equal(f.vault.records.size,0);}finally{updates.destroy();dom.window.close();}
});
test('staff and customer browser custody use distinct supported IndexedDB namespaces',async()=>{
  const previous=globalThis.indexedDB,names=[];
  globalThis.indexedDB={open:(name)=>{names.push(name);const request={error:new Error('Synthetic stop after observing database name')};queueMicrotask(()=>request.onerror());return request;}};
  try{await assert.rejects(()=>new BrowserKeyStore().listKeys());await assert.rejects(()=>new BrowserKeyStore({databaseName:'shuug-secure-tax-staff-v1'}).listKeys());assert.deepEqual(names,['shuug-secure-tax-client-v1','shuug-secure-tax-staff-v1']);assert.throws(()=>new BrowserKeyStore({databaseName:'unreviewed-store'}));}
  finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
});
test('the actual staff entrypoint wires updates and stays disabled without independent configuration',async()=>{
  const html=await readFile(new URL('../browser/staff.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url:'https://disabled-staff.example'}),saved=new Map();
  try{
    for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,location:dom.window.location})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}
    await import('../browser/staff-app.mjs?synthetic-disabled-staff-updates-proof');
    assert(dom.window.document.querySelector('#staff-freshness'));assert.match(dom.window.document.querySelector('#message').textContent,/no independently supplied/);
    for(const id of ['staff-email','staff-password','staff-signin','staff-sync'])assert.equal(dom.window.document.getElementById(id).disabled,true);
    assert.equal(dom.window.document.querySelector('#staff-records').childElementCount,0);
  }finally{for(const [name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];dom.window.close();}
});
test('opaque staff object IDs matching prototype names retain own revision entries',async()=>{
  for(const objectId of ['constructor','toString']){const f=await fixture({objectId});await f.vault.sync();assert.deepEqual(f.vault.records.get(objectId).plaintext,f.plaintext);await f.vault.sync();const binding=[...f.storage.bindings.values()].find(value=>value.versions&&Object.hasOwn(value.versions,objectId));assert(binding);assert.equal(binding.versions[objectId].revision,1);}
});
test('mixed-domain pages use the scanned account cursor, including pages without visible rows',async()=>{
  const f=await fixture(),pages=[];
  f.setHook((url)=>{
    const parsed=new URL(url);if(!parsed.pathname.endsWith('/objects'))return;
    const after=Number(parsed.searchParams.get('after'));pages.push(after);
    if(after===0)return f.respond({changes:[],cursor:1,hasMore:true});
    if(after===1)return f.respond({changes:[{objectId:'synthetic-private-item',revision:1,sequence:2,deleted:false,available:true}],cursor:3,hasMore:true});
    if(after===3)return f.respond({changes:[],cursor:4,hasMore:false});
    throw new Error('Unexpected source cursor');
  });
  f.setObject({objectId:'synthetic-private-item',revision:1,sequence:2,deleted:false,envelope:f.envelope,manifest:f.manifest,capsule:f.capsule,grant:f.grant});
  await f.vault.sync();assert.deepEqual(pages,[0,1,3]);assert.deepEqual(f.vault.records.get('synthetic-private-item').plaintext,f.plaintext);
  f.setHook((url)=>new URL(url).pathname.endsWith('/objects')?f.respond({changes:[],cursor:0,hasMore:true}):null);
  await assert.rejects(()=>f.vault.sync(),/did not advance/);assert.equal(f.vault.records.size,0);
});
test('signed narrowing and renewal reset required presence while retaining revision and tombstone history',async()=>{
  const f=await fixture();await f.vault.sync();
  f.setObject({objectId:'synthetic-private-item',revision:2,sequence:2,deleted:true});await f.vault.sync();
  const empty=(url)=>new URL(url).pathname.endsWith('/objects')?f.respond({changes:[],cursor:2,hasMore:false}):null;
  f.setHook(empty);await assert.rejects(()=>f.vault.sync(),/tombstone is missing/);
  const narrowed=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['tax-document']});f.setGrants([narrowed]);
  await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(narrowed.grantId);assert.equal((await f.vault.sync()).items,0);
  const binding=[...f.storage.bindings.values()].find(value=>value.grantDigest&&value.versions);
  assert.deepEqual(binding.versions['synthetic-private-item'],{revision:2,deleted:true});assert.deepEqual(binding.requiredPresence,[]);
  const renewed=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:3,domains:['tax-identity']});f.setGrants([renewed]);
  await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(renewed.grantId);f.setHook(null);
  f.setObject({objectId:'synthetic-private-item',revision:1,sequence:3,deleted:false});await assert.rejects(()=>f.vault.sync(),/older or resurrected/);
  await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(renewed.grantId);
  f.setObject({objectId:'synthetic-private-item',revision:3,sequence:3,deleted:false});await assert.rejects(()=>f.vault.sync(),/older or resurrected/);
});
test('same-scope signed renewal accepts a fresh view then enforces presence for its observed objects',async()=>{
  const f=await fixture();await f.vault.sync();
  const renewed=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:2,domains:['tax-identity']});
  const capsule=await createStaffCapsule(f.envelope,f.manifest,renewed,f.unlocked,{...f.scope,objectId:'synthetic-private-item',revision:1,domain:'tax-identity'});
  f.setGrants([renewed]);f.setObject({objectId:'synthetic-private-item',revision:1,sequence:1,deleted:false,envelope:f.envelope,manifest:f.manifest,capsule,grant:renewed});
  await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(renewed.grantId);assert.equal((await f.vault.sync()).items,1);
  f.setHook((url)=>new URL(url).pathname.endsWith('/objects')?f.respond({changes:[],cursor:1,hasMore:false}):null);
  await assert.rejects(()=>f.vault.sync(),/object or tombstone is missing/);assert.equal(f.vault.records.size,0);
});
test('API signed revocation checkpoints survive expiry, list withholding and old backup replay',async()=>{
  const f=await fixture();await f.vault.sync();
  const revoked=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:f.grant.grantId,epoch:2,status:'revoked',domains:['tax-identity'],now:Date.now()-2*86400000,validDays:1});
  f.setHook((url)=>new URL(url).pathname.endsWith('/grants')?f.respond({grants:[f.grant],revocations:[revoked]}):null);
  await assert.rejects(()=>f.vault.refreshGrants(),/changed/);assert.equal(f.vault.records.size,0);assert.equal(f.vault.unlocked,false);
  f.setHook(null);await f.vault.importKey(f.staffKey.backup,'Synthetic staff device backup passphrase.');await f.vault.unlock(f.staffKey.keyId);
  await assert.rejects(()=>f.vault.selectGrant(f.grant.grantId));assert.equal(f.vault.records.size,0);
  const second=await signStaffGrant(f.grantRequest,f.unlocked,{grantId:'synthetic-other-grant',epoch:1,domains:['tax-identity']});
  f.setHook((url)=>new URL(url).pathname.endsWith('/grants')?f.respond({grants:[second],revocations:[revoked]}):null);
  await f.vault.unlock(f.staffKey.keyId);await f.vault.selectGrant(second.grantId);assert.equal(f.vault.selectedGrant.grantId,second.grantId);
});
