import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { generateRecipientKeyPair, encode64, decode64, publicKeyId, sealEnvelope, openEnvelope } from '../envelope.mjs';
import { validateTrustedConfig } from '../browser/config.mjs';
import { createClientKey, importEncryptedBackup, BrowserKeyStore } from '../browser/custody.mjs';
import { VaultClient, encodeJson } from '../browser/client.mjs';
import { JOURNAL_FIELDS, journalSections, renderJournal } from '../browser/journal-view.mjs';
import { JSDOM } from 'jsdom';
import { prepareBrowser } from '../prepare-browser.mjs';
import { buildFormPayload, documentPayload, formType, maskedDisplay, mountForms, validatedWorkURL } from '../browser/forms.mjs';

class MemoryStorage {
  keys=new Map();bindings=new Map();
  async putKey(value){this.keys.set(value.keyId,structuredClone(value));}
  async getKey(id){return structuredClone(this.keys.get(id));}
  async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
  async getBinding(id){return structuredClone(this.bindings.get(id));}
  async putBinding(value){this.bindings.set(value.id,structuredClone(value));}
}
async function fixture({enrolled=true}={}){
  const client=await generateRecipientKeyPair(),firm=await generateRecipientKeyPair(),signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const signerPublicKey=encode64(new Uint8Array(await crypto.subtle.exportKey('raw',signer.publicKey)));
  const config={version:1,uiOrigin:'https://private.example',apiOrigin:'https://api.example',workspaceId:'workspace-synthetic',signerPublicKey,firmRecoveryPublicKey:firm.publicKey};
  const identity={accountId:'account-alpha',clientId:'client-alpha'},keyId=await publicKeyId(client.publicKey);
  const manifest={version:1,manifestId:'manifest-synthetic',workspaceId:config.workspaceId,...identity,epoch:1,client:{keyId,publicKey:client.publicKey},firmRecovery:{keyId:await publicKeyId(firm.publicKey),publicKey:firm.publicKey},issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),signature:{algorithm:'ES256-P1363',signerKeyId:await publicKeyId(signerPublicKey),value:''}};
  const sign=async value=>{
    const canonical=[1,'shuug/secure-tax-manifest',value.manifestId,value.workspaceId,value.accountId,value.clientId,value.epoch,value.client.keyId,value.client.publicKey,value.firmRecovery.keyId,value.firmRecovery.publicKey,value.issuedAt,value.expiresAt];
    value.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,encodeJson(canonical))));return value;
  };await sign(manifest);
  const storage=new MemoryStorage();await storage.putKey({keyId,publicKey:client.publicKey,privateKey:client.privateKey});
  const objects=new Map(),calls=[];let sequence=0,replyHook=null,status={enrolled,identity,manifest,legacyMigrationRequired:true,legacyProviderAuthorizationPresent:true};
  const receipt=value=>({objectId:value.objectId,revision:value.revision,sequence:value.sequence,deleted:value.deleted});
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const fetcher=async(url,options)=>{
    calls.push({url,options:structuredClone(options)});
    if(replyHook){const reply=await replyHook(url,options);if(reply)return reply;}
    const route=new URL(url),id=decodeURIComponent(route.pathname.split('/').at(-1));
    if(id==='session')return respond(options.method==='POST'?{apiVersion:1,token:'synthetic-session-token-12345',expiresAt:new Date(Date.now()+1000000).toISOString(),identity:status.identity}:{ok:true});
    if(id==='status')return respond(status);
    if(id==='objects'){const after=Number(route.searchParams.get('after')),changes=[...objects.values()].filter(value=>value.sequence>after).sort((a,b)=>a.sequence-b.sequence).map(receipt);return respond({changes,cursor:changes.at(-1)?.sequence??after,hasMore:false});}
    if(options.method==='GET'){const value=objects.get(id);return respond(value.deleted?receipt(value):value);}
    const body=JSON.parse(options.body),prior=objects.get(id);
    assert.equal(body.expectedRevision,prior?.revision??0);
    if(options.method==='PUT'){const value={objectId:id,revision:body.envelope.context.revision,sequence:++sequence,deleted:false,envelope:body.envelope};objects.set(id,value);return respond({...receipt(value),duplicate:false});}
    if(options.method==='DELETE'){const value={objectId:id,revision:prior.revision+1,sequence:++sequence,deleted:true};objects.set(id,value);return respond({...value,liveCiphertextPurged:true,backupRetention:'Backups may retain ciphertext.'});}
    throw new Error('Unexpected API route');
  };
  const vault=await VaultClient.create(config,config.uiOrigin,{storage,fetcher});
  await vault.connect();await vault.unlock(keyId);
  return {vault,storage,config,keyId,client,firm,manifest,identity,objects,calls,sign,respond,setStatus:value=>{status=value;},setHook:value=>{replyHook=value;}};
}

test('MFA separates password proof from sessions and clears pending setup on lock',async()=>{
  const f=await fixture(),challengeToken='a'.repeat(64),secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  let finished=false;
  f.setHook((url,options)=>{
    if(!url.endsWith('/session')||options.method!=='POST')return;
    const body=JSON.parse(options.body);
    if(body.password)return new Response(JSON.stringify({apiVersion:1,mfaRequired:true,challengeToken,enrollmentRequired:true,secret,expiresAt:new Date(Date.now()+300000).toISOString()}),{status:428,headers:{'Content-Type':'application/json'}});
    assert.deepEqual(body,{challengeToken,code:'123456'});finished=true;
    return f.respond({apiVersion:1,token:'synthetic-session-token-12345',expiresAt:new Date(Date.now()+100000).toISOString(),identity:f.identity,recoveryCodes:['AAAAAA-BBBBBB-CCCCCC-DDDDDD']});
  });
  assert.deepEqual(await f.vault.signIn('synthetic@example.invalid','synthetic-password'),{mfaRequired:true});
  assert.equal(f.vault.identity,null);assert.equal(f.vault.canWrite,false);assert.equal(f.vault.pendingMfa.secret,secret);
  const result=await f.vault.verifySignIn('123456');assert.equal(finished,true);assert.equal(f.vault.pendingMfa,null);
  assert.deepEqual(result.recoveryCodes,['AAAAAA-BBBBBB-CCCCCC-DDDDDD']);assert.deepEqual(f.vault.identity,f.identity);
  await f.vault.signIn('synthetic@example.invalid','synthetic-password');f.vault.lock();assert.equal(f.vault.pendingMfa,null);
  await assert.rejects(()=>f.vault.verifySignIn('123456'),/expired/);
  assert.equal(JSON.stringify([...f.storage.keys,...f.storage.bindings]).includes(secret),false);
});

test('independent configuration fails closed before any network call',async()=>{
  const f=await fixture();let fetched=false;
  for(const config of [null,{...f.config,apiOrigin:f.config.uiOrigin},{...f.config,apiOrigin:'http://api.example'},{...f.config,apiOrigin:'https://api.example/path'},{...f.config,workspaceId:'workspace\n'},{...f.config,privateKey:'forbidden'},{...f.config,firmRecoveryPublicKey:f.config.signerPublicKey}])await assert.rejects(()=>VaultClient.create(config,f.config.uiOrigin,{fetcher:()=>{fetched=true;}}));
  await assert.rejects(()=>validateTrustedConfig(f.config,'https://other.example'));
  assert.equal(fetched,false);
});
test('client backup is encrypted, authenticated and reimports only nonextractable matching keys',async()=>{
  const passphrase='synthetic separate passphrase only',entry=await createClientKey(passphrase);
  assert.equal(entry.privateKey.extractable,false);await assert.rejects(()=>crypto.subtle.exportKey('pkcs8',entry.privateKey));
  assert.equal(Object.hasOwn(entry.backup,'privateKey'),false);assert.equal(JSON.stringify(entry.backup).includes(passphrase),false);
  const imported=await importEncryptedBackup(entry.backup,passphrase);assert.equal(imported.keyId,entry.keyId);assert.equal(imported.privateKey.extractable,false);
  await assert.rejects(()=>importEncryptedBackup(entry.backup,'wrong synthetic passphrase only'));
  const tampered=structuredClone(entry.backup),bytes=decode64(tampered.cipher.ciphertext,32,1024);bytes[0]^=1;tampered.cipher.ciphertext=encode64(bytes);await assert.rejects(()=>importEncryptedBackup(tampered,passphrase));
  const f=await fixture(),envelope=await sealEnvelope(encodeJson({synthetic:'backup proof'}),{workspaceId:'workspace-synthetic',accountId:'account-alpha',objectId:'backup-proof',revision:1,domain:'tax-identity'},{clientPublicKey:entry.publicKey,firmRecoveryPublicKey:f.firm.publicKey},'client',imported.privateKey);
  const opened=await openEnvelope(envelope,envelope.context,{clientPublicKey:entry.publicKey,firmRecoveryPublicKey:f.firm.publicKey},'client',entry.privateKey);assert.deepEqual(JSON.parse(new TextDecoder().decode(opened)),{synthetic:'backup proof'});
  if(!globalThis.indexedDB)await assert.rejects(()=>new BrowserKeyStore().listKeys(),/persist nonextractable/);
});
test('setup stages independently signed manifest without enrollment or plaintext upload',async()=>{
  const f=await fixture({enrolled:false});
  f.setStatus({enrolled:false,identity:{...f.identity,unexpectedPrivateAlias:'must not persist'}});await f.vault.connect();await f.vault.unlock(f.keyId);
  assert.deepEqual(f.vault.publicRequest(),{version:1,workspaceId:f.config.workspaceId,...f.identity,client:f.manifest.client});
  assert.deepEqual(await f.vault.stageManifest(f.manifest),{manifestId:f.manifest.manifestId,epoch:1,activationAvailable:false});
  await assert.rejects(()=>f.vault.save('tax-identity',encodeJson({ssn:'000-12-3456'})),/activation is unavailable/);
  assert.equal(f.calls.some(call=>call.url.endsWith('/enroll')),false);assert.equal(f.calls.some(call=>call.options.body),false);
  const downgraded=await f.sign({...structuredClone(f.manifest),epoch:2});await f.vault.stageManifest(downgraded);await assert.rejects(()=>f.vault.stageManifest(f.manifest));
});
test('save/open/delete uses only authenticated opaque envelopes, preserves revision tombstones',async()=>{
  const f=await fixture(),plaintext=encodeJson({version:1,ssn:'000-12-3456',filename:'SYNTHETIC-only.pdf',notes:'private synthetic proof'});
  await f.vault.save('tax-identity',plaintext,'synthetic-item');
  const wire=f.calls.find(call=>call.options.method==='PUT');assert.equal(wire.options.body.includes('000-12-3456'),false);assert.equal(wire.options.body.includes('SYNTHETIC-only.pdf'),false);assert.equal(wire.options.redirect,'error');
  assert.equal(wire.options.referrerPolicy,'no-referrer');assert.deepEqual(Object.keys(JSON.parse(wire.options.body)).sort(),['envelope','expectedRevision','mutationId']);
  assert.equal(JSON.stringify([...f.storage.bindings.values()]).includes('private synthetic proof'),false);
  f.vault.lock();assert.equal(f.vault.records.size,0);await f.vault.unlock(f.keyId);await f.vault.sync();assert.deepEqual(f.vault.records.get('synthetic-item').plaintext,plaintext);
  await f.vault.save('tax-identity',encodeJson({version:1,updated:true}),'synthetic-item');assert.equal(f.vault.records.get('synthetic-item').revision,2);
  await f.vault.remove('synthetic-item');assert.equal(f.vault.records.size,0);assert.equal(Object.hasOwn(f.objects.get('synthetic-item'),'envelope'),false);
  await assert.rejects(()=>f.vault.save('tax-identity',plaintext,'synthetic-item'),/resurrected/);
  f.vault.lock();await f.vault.unlock(f.keyId);await f.vault.sync();assert.equal(f.vault.records.size,0);
  f.objects.clear();f.vault.lock();await f.vault.unlock(f.keyId);await assert.rejects(()=>f.vault.sync(),/missing/);
});
test('forged account envelope and unused recovery-slot corruption never become visible',async()=>{
  const f=await fixture();await f.vault.save('driver-state',encodeJson({synthetic:'private'}),'synthetic-item');
  const original=structuredClone(f.objects.get('synthetic-item'));f.objects.get('synthetic-item').envelope.context.accountId='account-beta';f.vault.lock();await f.vault.unlock(f.keyId);await assert.rejects(()=>f.vault.sync());assert.equal(f.vault.records.size,0);
  f.objects.set('synthetic-item',structuredClone(original));const slot=f.objects.get('synthetic-item').envelope.recipients[1],bytes=decode64(slot.wrappedKey,48);bytes[0]^=1;slot.wrappedKey=encode64(bytes);await assert.rejects(()=>f.vault.sync());assert.equal(f.vault.records.size,0);
});
test('valid IDs that coincide with object prototype names retain normal revision behavior',async()=>{
  const f=await fixture();await f.vault.save('driver-state',encodeJson({synthetic:true}),'constructor');f.vault.lock();await f.vault.unlock(f.keyId);await f.vault.sync();assert.equal(f.vault.records.get('constructor').revision,1);await f.vault.remove('constructor');assert.equal(f.vault.records.size,0);
});
test('stale async sync and changed account discard opened results',async()=>{
  const f=await fixture();await f.vault.save('driver-state',encodeJson({synthetic:'private'}),'synthetic-item');f.vault.lock();await f.vault.unlock(f.keyId);
  let release,started;const pending=new Promise(resolve=>{started=resolve;});
  f.setHook(async url=>{if(url.includes('/objects?')){started();await new Promise(resolve=>{release=resolve;});}});
  const syncing=f.vault.sync();await pending;f.vault.lock();release();await assert.rejects(()=>syncing,/connection changed/);assert.equal(f.vault.records.size,0);
  f.setHook(null);f.setStatus({enrolled:true,identity:{accountId:'account-beta',clientId:'client-beta'},manifest:f.manifest});await f.vault.connect();await assert.rejects(()=>f.vault.unlock(f.keyId));assert.equal(f.vault.unlocked,false);
});
test('credential sign-in retains token only in memory and clears opened state on revocation',async()=>{
  const f=await fixture();await f.vault.signIn('synthetic@example.invalid','synthetic account password');await f.vault.unlock(f.keyId);await f.vault.save('driver-state',encodeJson({synthetic:'private'}),'synthetic-item');
  const wire=f.calls.findLast(call=>call.options.method==='PUT');assert.equal(wire.options.credentials,'omit');assert.equal(wire.options.headers.Authorization,'Bearer synthetic-session-token-12345');
  const storageText=JSON.stringify([...f.storage.bindings.values(),...f.storage.keys.values()]);assert.equal(storageText.includes('synthetic-session-token'),false);assert.equal(storageText.includes('synthetic account password'),false);
  f.setHook(async()=>new Response('{}',{status:401,headers:{'Content-Type':'application/json'}}));await assert.rejects(()=>f.vault.sync());assert.equal(f.vault.unlocked,false);assert.equal(f.vault.records.size,0);assert.equal(f.vault.identity,null);
});
test('Journal snapshot projects all25 areas from native shapes with explicit missing-byte boundaries',()=>{
  const binding={workspaceId:'workspace-synthetic',accountId:'account-alpha',clientId:'client-alpha',objectId:'snapshot-synthetic'},snapshot={version:1,type:'driver-journal',binding,capturedAt:Date.now(),journal:{version:1,entries:[{record:{id:'trip1',kind:'trip',deleted:false,body:{purpose:'Airport',distanceMeters:1609.344,earningsCents:5000,classification:'business'}}},{record:{id:'income1',kind:'income',deleted:false,body:{description:'Entered payout',currency:'USD',amountCents:2000}}},{record:{id:'expense1',kind:'expense',deleted:false,body:{merchant:'Fuel',amountCents:500}}}],receipts:[{id:'receipt1',mime:'image/jpeg',uploaded:true}],goals:{dailyNetCents:15000},reserveSettings:{taxPercent:25,vehiclePercent:10},mission:{destination:'Synthetic home'},gigOffers:[{platform:'uber',missingFields:['pickup'],source:'manual'}],gigDecisions:[{action:'consider'}],gigCommitments:[{status:'accepted'}],gigOfferLogs:[{message:'Observed'}],observedOffers:[{platform:'uber'}],missionOffers:[{label:'Compared'}],driverAlerts:[{title:'Review'}],assistance:{enabled:true},placePrompts:[{merchant:'Fuel'}],bankTransactions:[{name:'Statement item',reviewedRecordId:'expense1'}],pickupWaits:[{name:'Airport',minutes:4}]}};
  const sections=journalSections(snapshot,{...binding,domain:'driver-state'});assert.equal(sections.length,25);assert.equal(sections.find(group=>group.id==='trips').rows[0].heading,'Airport');assert.equal(sections.find(group=>group.id==='offers').rows.length,1);assert.equal(sections.find(group=>group.id==='work').rows.length,2);assert.equal(sections.find(group=>group.id==='review').rows[1].summary,'USD 20.00');assert.match(sections.find(group=>group.id==='receipts').note,/Metadata only/);assert.match(sections.find(group=>group.id==='routes').note,/excludes route points/);
  assert.throws(()=>journalSections(snapshot,{...binding,accountId:'account-beta',domain:'driver-state'}),/different account/);
});
test('static artifact uses local lock-pinned vendors and disabled independent config by default',async()=>{
  const output=await mkdtemp(path.join(tmpdir(),'shuug-browser-artifact-')),result=await prepareBrowser({output});assert.equal(result.configured,false);assert.equal(result.activationAvailable,false);
  const html=await readFile(path.join(output,'index.html'),'utf8');assert.match(html,/type="importmap"/);assert.match(html,/script-src 'self' 'sha256-/);assert.match(html,/connect-src 'self';/);assert.equal(html.includes('unsafe-inline'),false);assert.equal(html.includes('<form'),false);assert.match(await readFile(path.join(output,'browser/trusted-config.mjs'),'utf8'),/export default null/);assert.ok((await readdir(path.join(output,'vendor/@hpke/core/esm'))).includes('mod.js'));
  const app=await readFile(path.join(output,'browser/app.mjs'),'utf8');assert.equal(app.includes('innerHTML'),false);assert.equal(app.includes('localStorage'),false);assert.match(app,/visibilitychange/);await assert.rejects(()=>prepareBrowser({output}),/empty artifact/);
  const vercel=JSON.parse(await readFile(path.join(output,'vercel.json'),'utf8')),headers=Object.fromEntries(vercel.headers[0].headers.map(value=>[value.key,value.value]));assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);assert.match(headers['Content-Security-Policy'],/connect-src 'self';/);assert.equal(headers['Referrer-Policy'],'no-referrer');
  const f=await fixture(),configuredOutput=await mkdtemp(path.join(tmpdir(),'shuug-browser-configured-'));await prepareBrowser({output:configuredOutput,config:f.config});const configuredHeaders=JSON.parse(await readFile(path.join(configuredOutput,'vercel.json'),'utf8'));assert.match(configuredHeaders.headers[0].headers.find(value=>value.key==='Content-Security-Policy').value,/connect-src 'self' https:\/\/api.example/);assert.match(await readFile(path.join(configuredOutput,'browser/trusted-config.mjs'),'utf8'),/https:\/\/private.example/);
});
test('readable native details paginate and render untrusted text without HTML execution',()=>{
  const dom=new JSDOM('<!doctype html><body></body>'),document=dom.window.document;
  const rows=Array.from({length:21},(_,i)=>({heading:i===0?'<img src=x onerror=alert(1)>':`Trip ${i+1}`,summary:'Recorded data',details:{purpose:'<script>bad()</script>',startedAt:Date.now(),classification:'business',earningsCents:2000}}));
  document.body.append(renderJournal(document,[{label:'Trips',rows,note:'Read only'}]));
  assert.equal(document.querySelectorAll('.journal-row').length,20);assert.equal(document.querySelectorAll('img,script').length,0);assert.match(document.body.textContent,/<script>bad/);assert.match(document.body.textContent,/USD 20.00/);
  const next=[...document.querySelectorAll('button')].find(button=>button.textContent==='Next');assert.equal(next.disabled,false);next.click();assert.equal(document.querySelectorAll('.journal-row').length,1);assert.match(document.body.textContent,/Trip 21/);assert.equal([...document.querySelectorAll('button')].find(button=>button.textContent==='Next').disabled,true);dom.window.close();
});
test('ordinary forms preserve unknown record fields, currency and unknown-vs-zero without tax math',()=>{
  const identity=buildFormPayload('identity',{legalName:'Synthetic Client',taxYear:'2026',ssn:'000-12-3456'});assert.equal(identity.domain,'tax-identity');assert.equal(identity.payload.ssn,'000123456');assert.equal(maskedDisplay(identity.payload).ssn,'•••-••-3456');
  const kept=buildFormPayload('identity',{legalName:'New name',taxYear:'',ssn:''},identity.payload);assert.equal(kept.payload.ssn,'000123456');assert.equal(Object.hasOwn(kept.payload,'taxYear'),false);assert.throws(()=>buildFormPayload('identity',{legalName:'Synthetic',taxYear:'2026',ssn:'123'}));
  const original={version:1,type:'driver-record',record:{id:'synthetic-record',kind:'income',revision:4,deleted:false,body:{currency:'CAD',bankReference:{transactionId:'source1'},futurePrivateField:'preserved'}}};
  const income=buildFormPayload('income',{date:'2026-11-07',amount:'12.34',notes:'saved',platform:'synthetic',description:'Separate payout'},original);assert.equal(income.payload.record.body.amountCents,1234);assert.equal(income.payload.record.body.currency,'CAD');assert.equal(income.payload.record.body.futurePrivateField,'preserved');assert.equal(income.payload.record.body.bankReference.transactionId,'source1');
  const trip=buildFormPayload('trip',{startedAt:'2026-11-07T10:00',endedAt:'2026-11-07T11:00',miles:'1',purpose:'Synthetic',notes:'',classification:'business',fare:'',fees:'0',platform:'synthetic'});assert.equal(trip.payload.record.body.distanceMeters,1609.344);assert.equal(Object.hasOwn(trip.payload.record.body,'earningsCents'),false);assert.equal(trip.payload.record.body.platformFeesCents,0);
  const reserves=buildFormPayload('reserves',{taxPercent:'25',vehiclePercent:'10'});assert.equal(reserves.payload.reserveSettings.taxPercent,25);assert.throws(()=>buildFormPayload('reserves',{taxPercent:'101',vehiclePercent:'10'}));
  const goals=buildFormPayload('goals',{dailyNetCents:'150',weeklyNetCents:'',targetHourlyCents:'20',vehicleCostCentsPerMile:'0.30'});assert.equal(goals.payload.goals.dailyNetCents,15000);assert.equal(goals.payload.goals.vehicleCostCentsPerMile,30);assert.equal(Object.hasOwn(goals.payload.goals,'weeklyNetCents'),false);
});
test('masked identity form removal invokes whole-object deletion and clears saved SSN controls',async()=>{
  const dom=new JSDOM('<!doctype html><body><main></main></body>'),document=dom.window.document,pending=[],deleted=[],saved=[];
  const editor=mountForms(document,document.querySelector('main'),{onSave:async value=>saved.push(value),onDelete:async id=>deleted.push(id),run:operation=>{const promise=operation();pending.push(promise);return promise;}});
  editor.setEnabled(true);editor.edit({version:1,type:'tax-identity',legalName:'Synthetic Client',ssn:'000123456'},'identity-item');
  const input=document.querySelector('#private-ssn');assert.equal(input.type,'password');assert.equal(input.value,'');assert.match(input.placeholder,/3456/);assert.equal(document.body.textContent.includes('000123456'),false);
  const previousConfirm=globalThis.confirm;globalThis.confirm=()=>true;
  try{[...document.querySelectorAll('button')].find(button=>button.textContent.startsWith('Remove SSN')).click();await Promise.all(pending);}finally{globalThis.confirm=previousConfirm;}
  assert.deepEqual(deleted,['identity-item']);assert.equal(saved.length,0);assert.equal(document.querySelector('#private-ssn').value,'');assert.equal(document.body.textContent.includes('3456'),false);dom.window.close();
});
test('document preparation bounds bytes and discards async results when account scope changes',async()=>{
  const file={name:'Synthetic private document.pdf',type:'application/pdf',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
  const result=await documentPayload(file);assert.equal(result.payload.filename,file.name);assert.deepEqual(decode64(result.payload.data,3),new Uint8Array([1,2,3]));await assert.rejects(()=>documentPayload({...file,size:11*1024*1024}));
  const dom=new JSDOM('<!doctype html><body><main></main></body>'),document=dom.window.document;let scope=1,release,saved=false,operation;
  const delayed={...file,arrayBuffer:()=>new Promise(resolve=>{release=()=>resolve(new Uint8Array([1,2,3]).buffer);})};
  const editor=mountForms(document,document.querySelector('main'),{captureScope:()=>scope,isCurrentScope:value=>value===scope,onSave:async()=>{saved=true;},onDelete:async()=>{},run:run=>{operation=run();}});editor.setEnabled(true);
  Object.defineProperty(document.querySelector('#private-file'),'files',{value:[delayed]});[...document.querySelectorAll('button')].find(button=>button.textContent==='Encrypt and save').click();scope++;editor.clear();release();await assert.rejects(()=>operation,/account view changed/);assert.equal(saved,false);dom.window.close();
});
test('real native full-Journal ciphertext opens into readable browser module sections',{skip:!existsSync('/private/tmp/native-secure-tax-snapshot-proof')},async()=>{
  const fixture=JSON.parse(execFileSync('/private/tmp/native-secure-tax-snapshot-proof',['fixture'],{encoding:'utf8',maxBuffer:1024*1024}));assert.equal(fixture.syntheticOnly,true);
  const raw=decode64(fixture.clientPublicKey,65),privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(raw.slice(1,33)),y:encode64(raw.slice(33)),d:fixture.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const plaintext=await openEnvelope(fixture.envelope,fixture.envelope.context,{clientPublicKey:fixture.clientPublicKey,firmRecoveryPublicKey:fixture.firmRecoveryPublicKey},'client',privateKey),payload=JSON.parse(new TextDecoder().decode(plaintext));assert.deepEqual(payload,fixture.payload);assert.equal(Object.keys(payload.journal).length,32);assert.deepEqual(Object.keys(payload.journal).sort(),[...JOURNAL_FIELDS].sort());
  assert.equal(payload.journal.reputationState.ratings[0].score,4.8);assert.equal(payload.journal.reputationOutbox.length,2);assert.ok(payload.journal.entries.some(entry=>entry.record.body.rideRole==='shopping'));
  const sections=journalSections(payload,{...payload.binding,domain:'driver-state'});assert.equal(sections.length,25);for(const id of ['trips','expenses','income','receipts','goals','reserves','mission','offers','work','comparisons','capture','assistance','bank-review','coach-history','coach-preparation','work-settings','reputation'])assert.ok(sections.find(section=>section.id===id).rows.length>0,`${id} should contain actual native fixture data`);
  const history=sections.find(section=>section.id==='coach-history');assert.ok(history.rows.some(row=>row.heading==='Pending question'));assert.match(history.note,/does not run coach inference/);assert.match(sections.find(section=>section.id==='coach-preparation').note,/never filing/);assert.equal(sections.find(section=>section.id==='work-settings').rows.length,2);
  const dom=new JSDOM('<!doctype html><body></body>');dom.window.document.body.append(renderJournal(dom.window.document,sections));assert.match(dom.window.document.body.textContent,/SYNTHETIC SNAPSHOT ONLY/);assert.match(dom.window.document.body.textContent,/Synthetic shopping/);assert.match(dom.window.document.body.textContent,/Synthetic jurisdiction/);assert.equal(dom.window.document.querySelectorAll('.journal>.area').length,25);plaintext.fill(0);dom.window.close();
});
test('tax-prep and universal settings forms preserve confirmed fields without queued action or provider authority',async()=>{
  const intake=buildFormPayload('intake',{taxYear:'2026',jurisdiction:'Québec',businessType:'sole-proprietor'},{version:1,type:'coach-intake',coachIntake:{futureConfirmedField:'preserve'}});assert.equal(formType(intake.payload),'intake');assert.deepEqual(intake.payload.coachIntake,{futureConfirmedField:'preserve',taxYear:2026,jurisdiction:'Québec',businessType:'sole-proprietor'});
  const cleared=buildFormPayload('intake',{taxYear:'',jurisdiction:'',businessType:'unsure'},intake.payload);assert.equal(Object.hasOwn(cleared.payload.coachIntake,'taxYear'),false);assert.equal(Object.hasOwn(cleared.payload.coachIntake,'jurisdiction'),false);
  for(const values of [{taxYear:'2026.1',jurisdiction:'California',businessType:'unsure'},{taxYear:'2026',jurisdiction:'California000123456',businessType:'unsure'},{taxYear:'2026',jurisdiction:'California',businessType:'invented'}])assert.throws(()=>buildFormPayload('intake',values));
  for(const value of ['javascript:alert(1)','http://work.example','https://user:password@work.example','https://work.example:444','https://127.0.0.1','https://[::1]','https://company.local','https://company.internal','https://company.localhost'])assert.throws(()=>validatedWorkURL(value));
  const settings=buildFormPayload('work-settings',{deliveryLabel:'My delivery work',deliveryURL:'https://delivery.example/jobs',shoppingLabel:'My shopping work',shoppingURL:''},{version:1,type:'universal-gig-settings',universalGigSettings:{delivery:{futurePrivateField:'preserve'},shopping:{appURL:'https://old.example'}}});assert.equal(formType(settings.payload),'work-settings');assert.equal(settings.payload.universalGigSettings.delivery.futurePrivateField,'preserve');assert.equal(Object.hasOwn(settings.payload.universalGigSettings.shopping,'appURL'),false);
  const f=await fixture();await f.vault.save(intake.domain,encodeJson(intake.payload),'confirmed-intake');await f.vault.save(settings.domain,encodeJson(settings.payload),'work-preferences');assert.equal(f.calls.some(call=>call.url.includes('/coach')),false);for(const call of f.calls.filter(call=>call.options.method==='PUT')){assert.equal(call.options.body.includes('Québec'),false);assert.equal(call.options.body.includes('My delivery work'),false);assert.equal(call.options.body.includes('https://delivery.example'),false);assert.equal(JSON.parse(call.options.body).envelope.context.domain,'driver-state');}
  const dom=new JSDOM('<!doctype html><body><main></main></body>'),document=dom.window.document,editor=mountForms(document,document.querySelector('main'),{onSave:async()=>{},onDelete:async()=>{},run:operation=>operation()});editor.setEnabled(true);assert.equal(editor.edit(intake.payload,'intake-item'),true);assert.equal(document.querySelector('#private-jurisdiction').value,'Québec');assert.match(document.body.textContent,/No coach inference/);editor.edit(settings.payload,'settings-item');assert.equal(document.querySelector('#private-deliveryLabel').value,'My delivery work');assert.match(document.body.textContent,/do not authorize a provider/);dom.window.close();
});
test('completed shopping work form retains zero miles and actual payout separately from income',()=>{
  const result=buildFormPayload('trip',{startedAt:'2026-11-07T10:00',endedAt:'2026-11-07T11:00',miles:'0',purpose:'Actual shopping work',notes:'',classification:'business',fare:'25',fees:'0',platform:'My shopping work',rideRole:'shopping'});assert.equal(result.payload.record.kind,'trip');assert.equal(result.payload.record.body.rideRole,'shopping');assert.equal(result.payload.record.body.distanceMeters,0);assert.equal(result.payload.record.body.earningsCents,2500);assert.equal(result.payload.record.body.platformFeesCents,0);
});
