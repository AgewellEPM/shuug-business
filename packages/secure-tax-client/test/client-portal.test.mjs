import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {generateRecipientKeyPair,publicKeyId,encode64,decode64} from '../envelope.mjs';
import {VaultClient,encodeJson} from '../browser/client.mjs';
import {PortalUploadQueue,PortalRefresh,portalFilePayload,portalSnapshot,formatPortalMoney} from '../browser/client-portal.mjs';
import {mountClientPortal,renderPortalDashboard} from '../browser/client-portal-view.mjs';
import {buildFormPayload,formType,mountForms} from '../browser/forms.mjs';
import {saveReturn} from '../browser/return-save.mjs';
import {newReturn,calculateReturn} from '@shuug/tax-engine';

class MemoryStorage{
  keys=new Map();bindings=new Map();failPending=false;
  async putKey(value){this.keys.set(value.keyId,structuredClone(value));}async getKey(id){return structuredClone(this.keys.get(id));}
  async getBinding(id){return structuredClone(this.bindings.get(id));}
  async putBinding(value){if(this.failPending&&value.id.startsWith('portal-uploads:'))throw new Error('Synthetic browser storage unavailable.');this.bindings.set(value.id,structuredClone(value));}
  async updateBinding(id,update){const next=update(structuredClone(this.bindings.get(id)));await this.putBinding(next);return structuredClone(next);}
}
const file=(name,content,type='application/pdf')=>{const bytes=typeof content==='string'?new TextEncoder().encode(content):content;return {name,size:bytes.length,type,arrayBuffer:async()=>bytes.slice().buffer};};
const details={purpose:'bank-statement',category:'banking',notes:'SYNTHETIC private upload notes 000-12-3456'};
async function fixture({enrolled=true}={}){
  const client=await generateRecipientKeyPair(),firm=await generateRecipientKeyPair(),signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const config={version:1,workspaceId:'synthetic-portal-workspace',uiOrigin:'https://trusted-portal.example',apiOrigin:'https://opaque-api.example',signerPublicKey:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',signer.publicKey))),firmRecoveryPublicKey:firm.publicKey};
  const identity={accountId:'synthetic-portal-account',clientId:'synthetic-portal-client'},keyId=await publicKeyId(client.publicKey),storage=new MemoryStorage(),calls=[],objects=new Map(),mutations=new Map();let sequence=0,hook=null;
  const sign=async manifest=>{const canonical=[1,'shuug/secure-tax-manifest',manifest.manifestId,manifest.workspaceId,manifest.accountId,manifest.clientId,manifest.epoch,manifest.client.keyId,manifest.client.publicKey,manifest.firmRecovery.keyId,manifest.firmRecovery.publicKey,manifest.issuedAt,manifest.expiresAt];manifest.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,encodeJson(canonical))));return manifest;};
  const manifest=await sign({version:1,manifestId:'synthetic-portal-manifest',workspaceId:config.workspaceId,...identity,epoch:1,client:{keyId,publicKey:client.publicKey},firmRecovery:{keyId:await publicKeyId(firm.publicKey),publicKey:firm.publicKey},issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),signature:{algorithm:'ES256-P1363',signerKeyId:await publicKeyId(config.signerPublicKey),value:''}});
  let status={enrolled,identity,manifest};await storage.putKey({keyId,publicKey:client.publicKey,privateKey:client.privateKey});
  const respond=(value,code=200)=>new Response(JSON.stringify(value),{status:code,headers:{'Content-Type':'application/json'}});
  const receipt=value=>({objectId:value.objectId,revision:value.revision,sequence:value.sequence,deleted:value.deleted});
  async function commit(url,options){
    const parsed=new URL(url),id=decodeURIComponent(parsed.pathname.split('/').at(-1));
    if(id==='status')return respond(status);
    if(id==='objects'){const after=Number(parsed.searchParams.get('after')),changes=[...objects.values()].filter(item=>item.sequence>after).sort((a,b)=>a.sequence-b.sequence).map(receipt);return respond({changes,cursor:changes.at(-1)?.sequence??after,hasMore:false});}
    if(options.method==='GET')return respond(objects.get(id));
    if(options.method==='PUT'){
      const body=JSON.parse(options.body),prior=mutations.get(body.mutationId);
      if(prior){assert.equal(prior.body,options.body);return respond({...receipt(prior.value),duplicate:true});}
      assert.equal(body.expectedRevision,objects.get(id)?.revision??0);
      const value={objectId:id,revision:body.expectedRevision+1,sequence:++sequence,deleted:false,envelope:body.envelope};objects.set(id,value);mutations.set(body.mutationId,{body:options.body,value});return respond({...receipt(value),duplicate:false});
    }
    return respond({ok:true});
  }
  const fetcher=async(url,options)=>{calls.push({url,options:structuredClone(options)});if(hook){const value=await hook(url,options);if(value)return value;}return commit(url,options);};
  const make=async()=>{const vault=await VaultClient.create(config,config.uiOrigin,{storage,fetcher});await vault.connect();await vault.unlock(status.manifest.client.keyId);return vault;};
  const vault=await make();return {vault,make,config,storage,calls,objects,mutations,keyId,manifest,client,firm,sign,respond,commit,setHook:value=>{hook=value;},setStatus:value=>{status=value;}};
}

test('routine file payloads preserve exact PDF/CSV bytes and encrypt purpose/category metadata',async()=>{
  const csv=new TextEncoder().encode('\ufeffdate,description,amount\r\n2026-11-08,SYNTHETIC merchant,12.34\r\n');
  const result=await portalFilePayload(file('Synthetic statement.csv',csv,'text/csv'),details);
  assert.deepEqual(decode64(result.payload.data,1,2*1024*1024),csv);assert.equal(result.payload.purpose,'bank-statement');assert.equal(result.payload.category,'banking');assert.equal(result.domain,'tax-document');
  await assert.rejects(()=>portalFilePayload(file('fake.pdf','not a PDF'),details),/contents/);
  await assert.rejects(()=>portalFilePayload(file('program.exe','bytes','application/octet-stream'),details),/PDF/);
  await assert.rejects(()=>portalFilePayload(file('binary.csv',new Uint8Array([255]),'text/csv'),details),/UTF-8/);
  await assert.rejects(()=>portalFilePayload({name:'large.csv',size:2*1024*1024+1,type:'text/csv'},details),/2 MiB/);
});
test('partial queues retain each failed file and retry ambiguous commits with identical ciphertext and mutation IDs',async()=>{
  const f=await fixture(),queue=new PortalUploadQueue(f.vault);
  const csv=file('Private synthetic statement.csv','date,description,amount\n2026-11-08,PRIVATE PAYEE,42.00','text/csv');
  queue.add([file('Private synthetic invoice.pdf','%PDF-1.7\nSYNTHETIC PRIVATE DOCUMENT'),csv,file('unsupported.exe','never sent','application/octet-stream')],details);
  let firstCsv=true;
  f.setHook(async(url,options)=>{if(options.method!=='PUT')return;if(f.calls.filter(call=>call.options.method==='PUT').length===2&&firstCsv){firstCsv=false;await f.commit(url,options);throw new Error('Synthetic connection lost after commit.');}});
  const rows=await queue.flush();assert.deepEqual(rows.map(row=>row.status),['complete','failed','failed']);assert.equal(f.objects.size,2);assert.equal((await f.vault.pendingUploads()).length,1);
  const failedPut=f.calls.filter(call=>call.options.method==='PUT')[1].options.body;
  f.setHook(null);await queue.flush();const puts=f.calls.filter(call=>call.options.method==='PUT');assert.equal(puts[2].options.body,failedPut);assert.equal(f.objects.size,2);assert.equal((await f.vault.pendingUploads()).length,0);assert.deepEqual(queue.rows.map(row=>row.status),['complete','complete','failed']);
  for(const call of puts)for(const secret of ['Private synthetic','PRIVATE PAYEE','SYNTHETIC PRIVATE DOCUMENT',details.notes,'bank-statement'])assert(!call.options.body.includes(secret));
  const persisted=JSON.stringify([...f.storage.bindings.values()]);assert(!persisted.includes(details.notes));assert(!persisted.includes('Private synthetic'));assert.equal(queue.hasUnprepared,true);
});
test('encrypted pending queue survives lock and a fresh controller, with no plaintext file metadata persisted',async()=>{
  const f=await fixture(),queue=new PortalUploadQueue(f.vault);queue.add([file('Private restore invoice.pdf','%PDF-1.7\nEXACT ORIGINAL BYTES')],{purpose:'invoice',category:'sales',notes:'Private invoice memo'});
  f.setHook((url,options)=>{if(options.method==='PUT')throw new Error('Synthetic offline');});await queue.flush();
  const pending=await f.vault.pendingUploads(),serialized=JSON.stringify([...f.storage.bindings.values()]);assert.equal(pending.length,1);assert(!serialized.includes('Private restore'));assert(!serialized.includes('invoice memo'));assert(!serialized.includes('EXACT ORIGINAL'));
  assert.deepEqual(queue.clear(),{unpreparedDiscarded:0});f.vault.lock();assert.equal(f.vault.records.size,0);
  const restored=await f.make(),second=new PortalUploadQueue(restored);await second.restore();assert.equal(second.rows[0].name,'Private restore invoice.pdf');assert.equal(second.rows[0].purpose,'invoice');
  f.setHook(null);await second.flush();const puts=f.calls.filter(call=>call.options.method==='PUT');assert.equal(puts[0].options.body,puts[1].options.body);assert.equal((await restored.pendingUploads()).length,0);assert.equal(f.objects.size,1);
});
test('storage failure sends nothing, keeps raw selection visibly unsent and does not invent a retained retry',async()=>{
  const f=await fixture(),queue=new PortalUploadQueue(f.vault);queue.add([file('Storage failure.pdf','%PDF-1.7\nLOCAL ONLY')],details);f.storage.failPending=true;
  await queue.flush();assert.equal(queue.rows[0].status,'failed');assert.equal(queue.hasUnprepared,true);assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,0);
  assert.deepEqual(queue.clear(),{unpreparedDiscarded:1});f.storage.failPending=false;assert.equal((await f.vault.pendingUploads()).length,0);
});
test('lock during file reading cancels stale work and preserves the current account boundary',async()=>{
  const f=await fixture(),queue=new PortalUploadQueue(f.vault);let release,entered;
  const started=new Promise(resolve=>{entered=resolve;}),bytes=new TextEncoder().encode('%PDF-1.7\nSTALE FILE');
  queue.add([{name:'stale.pdf',size:bytes.length,type:'application/pdf',arrayBuffer:async()=>{entered();await new Promise(resolve=>{release=resolve;});return bytes.buffer;}}],details);
  const flushing=queue.flush();await started;f.vault.lock();assert.deepEqual(queue.clear(),{unpreparedDiscarded:1});release();await assert.rejects(()=>flushing,/changed/);
  assert.equal(queue.rows.length,0);assert.equal(f.objects.size,0);assert(bytes.every(value=>value===0));assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,0);
});
test('old, changed-scope and changed-key prepared writes fail closed while encrypted copies remain recoverable',async()=>{
  const f=await fixture(),bytes=encodeJson({version:1,type:'private-file',filename:'Pending.pdf',mime:'application/pdf',data:'JVBERi0='}),prepared=await f.vault.prepareSave('tax-document',bytes);bytes.fill(0);await f.vault.keepPendingUpload(prepared);
  const tampered=structuredClone(prepared);tampered.scope.clientId='different-client';const before=f.calls.length;await assert.rejects(()=>f.vault.savePrepared(tampered),/another account/);assert.equal(f.calls.length,before);
  const clock=Date.now;Date.now=()=>clock()+7200000;
  try{await assert.rejects(()=>f.vault.savePrepared(prepared),/expired/);}finally{Date.now=clock;}
  assert.equal(f.calls.length,before);
  const replacement=await generateRecipientKeyPair(),newId=await publicKeyId(replacement.publicKey),renewed=await f.sign({...f.manifest,epoch:2,manifestId:'synthetic-replacement-manifest',client:{keyId:newId,publicKey:replacement.publicKey}});
  f.setStatus({enrolled:true,identity:f.vault.identity,manifest:renewed});await f.storage.putKey({keyId:newId,publicKey:replacement.publicKey,privateKey:replacement.privateKey});
  // This isolated synthetic device has no previously observed account binding.
  const originalBinding=f.storage.bindings.get(`${f.config.workspaceId}|${f.vault.identity.accountId}`);f.storage.bindings.delete(originalBinding.id);
  const next=await f.make();assert.equal((await next.pendingUploads()).length,0);await assert.rejects(()=>next.savePrepared(prepared),/another account/);
  assert([...f.storage.bindings.values()].some(value=>value.entries?.[0]?.mutationId===prepared.mutationId));
});
test('queue bounds and selected-account guard reject oversize additions without losing existing rows',async()=>{
  const f=await fixture(),queue=new PortalUploadQueue(f.vault);queue.add([file('kept.pdf','%PDF-1.7\nKEPT')],details);
  assert.throws(()=>queue.add(Array(20).fill(file('other.pdf','%PDF-1.7')),details),/20 files/);assert.equal(queue.rows.length,1);
  assert.throws(()=>queue.add([{name:'big.pdf',type:'application/pdf',size:26*1024*1024}],details),/25 MiB/);assert.equal(queue.rows.length,1);
  f.vault.lock();assert.throws(()=>queue.add([file('other.pdf','%PDF-1.7')],details),/Unlock/);
});
test('concurrent controllers atomically retain unrelated queued uploads and deletions',async()=>{
  const f=await fixture(),other=await f.make(),bytes=encodeJson({version:1,type:'private-file',filename:'Atomic.pdf',mime:'application/pdf',data:'JVBERi0='});
  const first=await f.vault.prepareSave('tax-document',bytes),second=await other.prepareSave('tax-document',bytes);
  await Promise.all([f.vault.keepPendingUpload(first),other.keepPendingUpload(second)]);
  assert.equal((await f.vault.pendingUploads()).length,2);
  const third=await other.prepareSave('tax-document',bytes);
  await Promise.all([f.vault.forgetPendingUpload(first.mutationId),other.keepPendingUpload(third)]);
  assert.deepEqual((await f.vault.pendingUploads()).map(entry=>entry.mutationId).sort(),[second.mutationId,third.mutationId].sort());bytes.fill(0);
});
test('lock during an ambiguous PUT retains its encrypted retry without showing stale opened data',async()=>{
  const f=await fixture(),queue=new PortalUploadQueue(f.vault);let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});queue.add([file('Interrupted.pdf','%PDF-1.7\nINTERRUPTED')],details);
  f.setHook(async(url,options)=>{if(options.method==='PUT'){const result=await f.commit(url,options);entered();await new Promise(resolve=>{release=resolve;});return result;}});
  const pending=queue.flush();await started;f.vault.lock();queue.clear();release();await assert.rejects(()=>pending,/changed/);assert.equal(f.vault.records.size,0);
  f.setHook(null);const restored=await f.make(),second=new PortalUploadQueue(restored);await second.restore();await second.flush();assert.equal(f.objects.size,1);assert.equal((await restored.pendingUploads()).length,0);assert.equal(restored.records.size,1);
  const puts=f.calls.filter(call=>call.options.method==='PUT');assert.equal(puts[0].options.body,puts[1].options.body);
});
test('polling is eligibility-gated, non-overlapping and ignores completion after stop/account change',async()=>{
  let eligible=true,called=0,release;const timers=new Map(),states=[],errors=[];
  const poller=new PortalRefresh({eligible:()=>eligible,refresh:async()=>{called++;await new Promise(resolve=>{release=resolve;});return true;},setTimer:callback=>{timers.set(1,callback);return 1;},clearTimer:id=>timers.delete(id),now:()=>123456,onChange:state=>states.push(state),onError:error=>errors.push(error)});
  poller.start();poller.start();assert.equal(timers.size,1);eligible=false;assert.equal(await poller.tick(),false);assert.equal(called,0);eligible=true;
  const first=poller.tick();assert.equal(await poller.tick(),false);assert.equal(called,1);poller.stop({clear:true});assert.equal(timers.size,0);release();await first;assert.equal(poller.state.lastUpdated,null);assert.equal(poller.state.updatesPending,true);assert.equal(errors.length,0);
  poller.start();const second=poller.tick();release();await second;assert.equal(poller.state.lastUpdated,123456);assert.equal(poller.state.updatesPending,false);poller.stop();
});
test('refresh reads newly saved own records, reports failed updates and never invents accountant review',async()=>{
  const f=await fixture();await f.vault.sync();
  const other=await f.make();await other.save('driver-state',encodeJson({version:1,type:'business-note',title:'A current business update',date:'2026-11-08',notes:'Source fact'}));
  const poller=new PortalRefresh({eligible:()=>f.vault.canWrite,refresh:()=>f.vault.sync(),setTimer:()=>1,clearTimer:()=>{},now:()=>12345});
  poller.start();await poller.tick();assert.equal(f.vault.records.size,1);assert.equal(poller.state.lastUpdated,12345);assert.equal(poller.state.updatesPending,false);
  f.setHook((url,options)=>{if(options.method==='GET'&&new URL(url).pathname.endsWith('/objects'))throw new Error('Synthetic disconnected');});
  await poller.tick();assert.equal(poller.state.updatesPending,true);assert.equal(poller.state.lastUpdated,12345);assert.equal(f.vault.records.size,1);poller.stop();
});
test('dashboard derives only opened facts and safely marks overflowed totals unknown',()=>{
  const records=new Map(),put=(id,value,domain='driver-record')=>records.set(id,{objectId:id,revision:1,domain,plaintext:encodeJson(value)});
  put('invoice',{version:1,type:'private-file',filename:'<img src=x onerror=bad()>.pdf',purpose:'invoice',category:'sales',byteLength:100,data:'JVBERi0='},'tax-document');
  put('receipt',{version:1,type:'private-file',filename:'Receipt.pdf',purpose:'receipt',category:'purchases',byteLength:50,data:'JVBERi0='},'driver-receipt');
  put('income',{version:1,type:'driver-record',record:{kind:'income',body:{amountCents:12345,currency:'USD',date:'2026-11-08',description:'Actual entered amount'}}});
  put('snapshot',{version:1,type:'driver-journal',journal:{entries:[{record:{kind:'income',body:{amountCents:999999,currency:'USD'}}}]}},'driver-state');
  const summary=portalSnapshot(records);assert.equal(summary.counts.invoices,1);assert.equal(summary.counts.receipts,1);assert.equal(summary.counts.income,1);assert.equal(summary.totals[0].incomeCents,12345);
  assert.equal(formatPortalMoney(9007199254740990),'90071992547409.90');assert.equal(formatPortalMoney(-1),'-0.01');
  put('huge',{version:1,type:'driver-record',record:{kind:'income',body:{amountCents:Number.MAX_SAFE_INTEGER,currency:'USD'}}});const overflow=portalSnapshot(records).totals[0];assert.equal(overflow.known,false);assert.equal(overflow.incomeCents,null);
  const dom=new JSDOM('<!doctype html><body></body>');dom.window.document.body.append(renderPortalDashboard(dom.window.document,records));assert.equal(dom.window.document.querySelectorAll('img,script').length,0);assert.match(dom.window.document.body.textContent,/totals unavailable/);assert(!dom.window.document.body.textContent.includes('9999.99'));dom.window.close();
});
test('portal DOM supplies routine multi-file upload and clears file/note/dashboard/queue views on lock',async()=>{
  const f=await fixture(),dom=new JSDOM('<!doctype html><body><section id="existing"></section></body>',{url:f.config.uiOrigin}),document=dom.window.document;let working=false,editing=false,portal,tasks=[];
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  const run=operation=>{const task=(async()=>{working=true;try{await operation();}finally{working=false;portal.refresh();}})();tasks.push(task);return task;};
  try{
    portal=mountClientPortal(document,document.querySelector('#existing'),{getClient:()=>f.vault,run,isWorking:()=>working,setWorking:value=>{working=value;},canRefresh:()=>!editing,confirm:()=>true});await portal.activate();
    editing=true;portal.pending();assert.equal([...portal.element.querySelectorAll('button')].find(button=>button.textContent==='Check for updates now').disabled,true);const previous=f.calls.length;await portal.poller.tick();assert.equal(f.calls.length,previous);editing=false;portal.refresh();
    document.querySelector('#portal-purpose').value='invoice';document.querySelector('#portal-category').value='sales';document.querySelector('#portal-upload-notes').value='Synthetic invoice note';
    Object.defineProperty(document.querySelector('#portal-files'),'files',{configurable:true,value:[file('Invoice.pdf','%PDF-1.7\nSYNTHETIC INVOICE')]});
    [...portal.element.querySelectorAll('button')].find(button=>button.textContent==='Add selected files to queue').click();await tasks.at(-1);
    [...portal.element.querySelectorAll('button')].find(button=>button.textContent==='Encrypt and upload / retry pending files').click();await tasks.at(-1);
    assert.equal(f.objects.size,1);assert.match(document.querySelector('#portal-upload-queue').textContent,/Upload acknowledged/);assert.match(document.querySelector('#portal-dashboard').textContent,/Invoice documents/);assert.equal(document.querySelectorAll('#payload').length,0);
    f.vault.lock();portal.clear();assert.equal(document.querySelector('#portal-upload-notes').value,'');assert.equal(document.querySelector('#portal-files').value,'');assert.equal(document.querySelector('#portal-dashboard').childElementCount,0);assert.equal(document.querySelector('#portal-upload-queue').childElementCount,0);assert.equal(portal.poller.state.lastUpdated,null);
  }finally{portal?.stop();dom.window.close();}
});
test('ordinary business information form preserves unknown fields without raw JSON editing',()=>{
  const value=buildFormPayload('note',{title:'Business change',date:'2026-11-08',notes:'Changed trading hours'},{version:1,type:'business-note',privateExtension:{retained:true}});
  assert.equal(value.domain,'driver-state');assert.equal(formType(value.payload),'note');assert.deepEqual(value.payload.privateExtension,{retained:true});assert.equal(value.payload.notes,'Changed trading hours');
});
test('automatic refresh auth loss invokes global clearing for grouped data and both ordinary/advanced editors',async()=>{
  const f=await fixture(),dom=new JSDOM('<!doctype html><body><section id="existing"><div id="groups"><pre>SYNTHETIC OLD PRIVATE RECORD</pre></div><div id="form"></div><textarea id="advanced">SYNTHETIC OLD ADVANCED CONTENT</textarea></section></body>'),document=dom.window.document;let portal,cleared=0;
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  const editor=mountForms(document,document.querySelector('#form'),{onSave:async()=>{},onDelete:async()=>{},run:operation=>operation()});editor.setEnabled(true);editor.edit({version:1,type:'tax-identity',legalName:'SYNTHETIC OLD PRIVATE CLIENT',ssn:'000123456'},'synthetic-identity');
  try{
    portal=mountClientPortal(document,document.querySelector('#existing'),{getClient:()=>f.vault,run:operation=>operation(),onLocked:()=>{cleared++;portal.clear();document.querySelector('#groups').replaceChildren();document.querySelector('#advanced').value='';editor.clear();}});await portal.activate();
    f.setHook((url,options)=>options.method==='GET'&&new URL(url).pathname.endsWith('/objects')?f.respond({error:'Synthetic expired session'},401):null);
    await portal.poller.tick();assert.equal(cleared,1);assert.equal(f.vault.unlocked,false);assert.equal(f.vault.identity,null);assert.equal(f.vault.records.size,0);assert.equal(document.querySelector('#groups').childElementCount,0);assert.equal(document.querySelector('#advanced').value,'');assert(!document.body.textContent.includes('SYNTHETIC OLD PRIVATE RECORD'));assert(![...document.querySelectorAll('input')].some(input=>input.value==='SYNTHETIC OLD PRIVATE CLIENT'));assert.equal(document.querySelector('#portal-dashboard').childElementCount,0);assert.equal(portal.poller.state.lastUpdated,null);
  }finally{portal?.stop();dom.window.close();}
});
test('ordinary unsaved forms expose a refresh guard until explicitly saved or cleared',()=>{
  const dom=new JSDOM('<!doctype html><body><main></main></body>'),document=dom.window.document;
  try{const editor=mountForms(document,document.querySelector('main'),{onSave:async()=>{},onDelete:async()=>{},run:operation=>operation()});editor.setEnabled(true);assert.equal(editor.dirty,false);const choice=document.querySelector('#private-item-type');choice.value='note';choice.dispatchEvent(new dom.window.Event('change'));const input=document.querySelector('#private-title');input.value='Unsent edit';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(editor.dirty,true);editor.clear();assert.equal(editor.dirty,false);editor.edit({version:1,type:'business-note',title:'Saved note',date:'2026-11-08',notes:'A note'},'synthetic-note');assert.equal(editor.dirty,true);}finally{dom.window.close();}
});
test('actual customer entrypoint mounts the portal with disabled configuration and no network authority',async()=>{
  const html=await readFile(new URL('../browser/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url:'https://disabled-portal.example'}),saved=new Map();
  try{
    for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,location:dom.window.location})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}
    await import('../browser/app.mjs?synthetic-disabled-portal-proof');
    assert(dom.window.document.querySelector('#client-portal'));assert(dom.window.document.querySelector('#tax-preparation'));assert.equal(dom.window.document.querySelector('#return-kind').disabled,true);assert([...dom.window.document.querySelectorAll('#tax-preparation input,#tax-preparation button')].every(control=>control.disabled));assert.match(dom.window.document.querySelector('#message').textContent,/no independently supplied/);
    for(const id of ['portal-files','portal-purpose','portal-upload-notes','signin-password','create-key'])assert.equal(dom.window.document.getElementById(id).disabled,true);
    assert.equal(dom.window.document.querySelectorAll('script[src^="http"]').length,0);
  }finally{for(const [name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];dom.window.close();}
});
test('return saves survive a lost acknowledgment and reopen from identical encrypted retry bytes',async()=>{
  const f=await fixture(),input=newReturn('1120');input.party.name='SYNTHETIC ENCRYPTED RETURN';input.party.taxId='000123456';input.entity.receiptsCents=10000000;let failed=false,id;
  f.setHook(async(url,options)=>{if(options.method==='PUT'&&!failed){failed=true;await f.commit(url,options);throw new Error('Synthetic lost return acknowledgment.');}});
  await assert.rejects(()=>saveReturn(f.vault,input,undefined,{onPrepared:value=>{id=value;}}),/lost return acknowledgment/);assert(id);assert.equal(f.objects.size,1);assert.equal((await f.vault.pendingUploads()).length,1);
  const pending=JSON.stringify([...f.storage.bindings.values()]);assert(!pending.includes('SYNTHETIC ENCRYPTED RETURN'));assert(!pending.includes('000123456'));
  const changed=structuredClone(input);changed.entity.receiptsCents++;await assert.rejects(()=>saveReturn(f.vault,changed,id),/unresolved encrypted save/);assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,1);
  f.vault.lock();f.setHook(null);const reopened=await f.make(),queue=new PortalUploadQueue(reopened);await queue.restore();assert.equal(queue.rows[0].name,'2025 Form 1120 draft return');await queue.flush();assert.equal(queue.rows[0].status,'complete');assert.equal(f.objects.size,1);assert.equal((await reopened.pendingUploads()).length,0);
  const puts=f.calls.filter(call=>call.options.method==='PUT');assert.equal(puts[0].options.body,puts[1].options.body);await reopened.sync();const restored=JSON.parse(new TextDecoder().decode(reopened.records.get(id).plaintext));assert.deepEqual(restored,input);assert.equal(calculateReturn(restored).summary.totalTaxCents,2100000);
});
test('return storage failure or unsupported year sends no taxpayer write',async()=>{
  const f=await fixture(),input=newReturn();f.storage.failPending=true;await assert.rejects(()=>saveReturn(f.vault,input),/storage unavailable/);assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,0);f.storage.failPending=false;input.year=2028;await assert.rejects(()=>saveReturn(f.vault,input),/Correct the return/);assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,0);
});
test('validated 2026/2027 entity source intake encrypts and reopens while calculations remain unavailable',async()=>{
  const f=await fixture(),saved=[];let reopened;
  try{
    for(const year of [2026,2027])for(const kind of ['1065','1120S','1120']){
      const input=newReturn(kind,year);input.party.name='SYNTHETIC PRIVATE ANNUAL INTAKE';input.party.taxId='000123456';input.entity.receiptsCents=1234500;
      const result=calculateReturn(input);assert.equal(result.intakeAvailable,true);assert.equal(result.calculationAvailable,false);assert.equal(result.filingReady,false);
      const invalid=structuredClone(input);invalid.entity.receiptsCents=-1;const calls=f.calls.length;await assert.rejects(()=>saveReturn(f.vault,invalid),/Correct the return/);assert.equal(f.calls.length,calls);
      const receipt=await saveReturn(f.vault,input);saved.push({objectId:receipt.objectId,input});
    }
    assert.equal((await f.vault.pendingUploads()).length,0);f.vault.lock();reopened=await f.make();await reopened.sync();
    for(const {objectId,input}of saved){const value=JSON.parse(new TextDecoder().decode(reopened.records.get(objectId).plaintext));assert.deepEqual(value,input);assert.equal(calculateReturn(value).intakeAvailable,true);assert.equal(calculateReturn(value).calculationAvailable,false);}
    for(const call of f.calls){const wire=call.options.body??'';assert(!wire.includes('SYNTHETIC PRIVATE ANNUAL INTAKE'));assert(!wire.includes('000123456'));}
  }finally{f.vault.lock();reopened?.lock();}
});
