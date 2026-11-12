import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {StaffVaultClient} from '../browser/staff-client.mjs';
import {VaultClient} from '../browser/client.mjs';
import {createClientKey} from '../browser/custody.mjs';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {signStaffGrant,createStaffCapsule} from '../firm-staff.mjs';
import {sealEnvelope,openEnvelope} from '../envelope.mjs';
import {approveCaseTransition} from '../firm-cases.mjs';
import {portalFilePayload} from '../browser/client-portal.mjs';
import {caseSnapshot} from '../case-model.mjs';
import {renderCase} from '../browser/case-view.mjs';
import {renderStaffRecords} from '../browser/staff-view.mjs';
import {mountCaseEditor} from '../browser/case-editor.mjs';
import {mountStaffUpdates} from '../browser/staff-updates.mjs';
import {renderPortalDashboard} from '../browser/client-portal-view.mjs';
import {newReturn} from '../../tax-engine/index.mjs';
import {CASE_OBJECT_PREFIX,isCaseObjectId} from '../case-contract.mjs';
import {DEFAULT_BOOK_ACCOUNTS,replayCaseBooks} from '../case-books.mjs';
const encode=value=>new TextEncoder().encode(JSON.stringify(value)),command=(type,input)=>({actionId:crypto.randomUUID(),type,input});
const ref=record=>({objectId:record.objectId,revision:record.revision,envelopeDigest:record.envelopeDigest,domain:record.domain});
class MemoryStore{
  keys=new Map();bindings=new Map();
  async putKey(value){this.keys.set(value.keyId,structuredClone(value));}async getKey(id){return structuredClone(this.keys.get(id));}async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
  async putBinding(value){this.bindings.set(value.id,structuredClone(value));}async getBinding(id){return structuredClone(this.bindings.get(id));}async updateBinding(id,mutate){const value=mutate(structuredClone(this.bindings.get(id)));this.bindings.set(id,structuredClone(value));return structuredClone(value);}
}
async function fixture(){
  const {bundle,publicPins}=await createFirmBundle('synthetic-case-browser','Synthetic case firm passphrase for test only.'),firm=await unlockFirmBundle(bundle,'Synthetic case firm passphrase for test only.',publicPins),clientKey=await createClientKey('Synthetic client key passphrase for case tests.'),staffKey=await createClientKey('Synthetic staff key passphrase for case tests.');
  const binding={accountId:'synthetic-case-account',clientId:'synthetic-case-client',staffAccountId:'workspace-owner',staffKeyId:staffKey.keyId},config={version:1,uiOrigin:'https://case-client.example.invalid',apiOrigin:'https://case-api.example.invalid',...publicPins};
  const manifest=await signEnrollmentRequest({version:1,workspaceId:publicPins.workspaceId,accountId:binding.accountId,clientId:binding.clientId,client:{keyId:clientKey.keyId,publicKey:clientKey.publicKey}},firm,{epoch:1});
  const grant=await signStaffGrant({version:1,workspaceId:publicPins.workspaceId,accountId:binding.accountId,clientId:binding.clientId,staffAccountId:binding.staffAccountId,staff:{keyId:staffKey.keyId,publicKey:staffKey.publicKey}},firm,{epoch:1,domains:['tax-document','driver-receipt']}),objects=new Map(),calls=[],staffStore=new MemoryStore(),clientStore=new MemoryStore();let sequence=0,hook=null,grants=[grant];
  await staffStore.putKey(staffKey);await staffStore.putBinding({id:`staff-local-key:${staffKey.keyId}`,purpose:'staff-device'});await clientStore.putKey(clientKey);
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}),store=(envelope,capsule)=>{const row={objectId:envelope.context.objectId,revision:envelope.context.revision,sequence:++sequence,deleted:false,envelope,manifest,capsule,grant};objects.set(row.objectId,row);return row;};
  const fetcher=staff=>async(url,options)=>{
    const parsed=new URL(url),route=parsed.pathname;calls.push({staff,url,options:structuredClone(options)});if(hook){const value=await hook(url,options,staff);if(value)return value;}
    if(staff&&route.endsWith('/session')){const input=JSON.parse(options.body);return input.password?respond({apiVersion:1,mfaRequired:true,challengeToken:'a'.repeat(64),enrollmentRequired:false,expiresAt:new Date(Date.now()+300000).toISOString()},428):respond({apiVersion:1,token:'synthetic-case-owner-session',expiresAt:new Date(Date.now()+3600000).toISOString(),identity:{staffAccountId:binding.staffAccountId}});}
    if(route.endsWith('/status'))return respond(staff?{apiVersion:1,mfaVerified:true,identity:{staffAccountId:binding.staffAccountId}}:{enrolled:true,identity:{accountId:binding.accountId,clientId:binding.clientId},manifest});
    if(staff&&route.endsWith('/grants'))return respond({grants,revocations:[]});
    if(staff&&route.endsWith('/cases')&&options.method==='POST'){const packet=JSON.parse(options.body),row=store(packet.envelope,packet.capsule);return respond({objectId:row.objectId,revision:row.revision,sequence:row.sequence,deleted:false,duplicate:false});}
    if(staff&&!grants.some(value=>value.grantId===parsed.searchParams.get('grantId')))return respond({error:'revoked'},403);
    if(staff&&route.endsWith('/scope'))return respond({grant,manifest});
    if(route.endsWith('/objects')){const rows=[...objects.values()].filter(row=>row.sequence>Number(parsed.searchParams.get('after')??0)).sort((a,b)=>a.sequence-b.sequence);return respond({changes:rows.map(row=>({objectId:row.objectId,revision:row.revision,sequence:row.sequence,deleted:row.deleted,...(staff&&!row.deleted?{available:true}:{})})),cursor:rows.at(-1)?.sequence??sequence,hasMore:false});}
    const id=decodeURIComponent(route.split('/').at(-1));if(options.method!=='GET')throw new Error('A generic client write must not reach this fixture.');return objects.has(id)?respond(objects.get(id)):respond({error:'missing'},404);
  };
  const staff=await StaffVaultClient.create(config,config.uiOrigin,{storage:staffStore,fetcher:fetcher(true)});await staff.signIn('','Synthetic staff account password');await staff.verifySignIn('123456');await staff.unlock(staffKey.keyId);await staff.selectGrant(grant.grantId);
  const client=await VaultClient.create(config,config.uiOrigin,{storage:clientStore,fetcher:fetcher(false)});await client.connect();await client.unlock(clientKey.keyId);
  async function put(payload,id,revision=1,domain='tax-document'){
    const envelope=await sealEnvelope(encode(payload),{workspaceId:publicPins.workspaceId,accountId:binding.accountId,objectId:id,revision,domain},{clientPublicKey:clientKey.publicKey,firmRecoveryPublicKey:publicPins.firmRecoveryPublicKey},'client',clientKey.privateKey),capsule=await createStaffCapsule(envelope,manifest,grant,firm,{...binding,objectId:id,revision,domain});return store(envelope,capsule);
  }
  async function apply(id,action,evidence=null){const kit=await staff.prepareCaseAction(id,action,evidence),packet=await approveCaseTransition({proposal:kit.proposal,envelope:kit.sourceEnvelope,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment:kit.proposal.reviewCommitment,reviewReference:'synthetic-case-operator-review',unlocked:firm});await staff.installApprovedCase(packet);await staff.sync();await client.sync();return {kit,packet,id:kit.proposal.objectId};}
  return {staff,client,config,binding,manifest,grant,firm,clientKey,staffKey,staffStore,clientStore,objects,calls,put,apply,store,respond,setHook:value=>{hook=value;},setGrants:value=>{grants=value;},remove:id=>{const old=objects.get(id);objects.set(id,{objectId:id,revision:old.revision+1,sequence:++sequence,deleted:true});}};
}
async function privateFile(){const bytes=new TextEncoder().encode('%PDF-1.7\nSYNTHETIC PRIVATE CASE SOURCE\n%%EOF');return (await portalFilePayload({name:'synthetic-case-source.pdf',type:'application/pdf',size:bytes.length,arrayBuffer:async()=>bytes.buffer},{purpose:'tax-document',category:'tax',notes:'SYNTHETIC PRIVATE CASE NOTES'})).payload;}
test('certified cases connect requests, reviewed files and drafts for both families, while changed sources remain visibly stale',async()=>{
  for(const kind of ['1040','1120']){
    const f=await fixture(),created=await f.apply(null,command('case.create',{title:'SYNTHETIC PRIVATE TAX CASE',year:2025,kind})),id=created.id;assert(isCaseObjectId(id));assert(id.startsWith(CASE_OBJECT_PREFIX));assert.equal(f.staff.records.get(id).verifiedCase.title,'SYNTHETIC PRIVATE TAX CASE');assert(Object.isFrozen(f.client.records.get(id).verifiedCase));
    const requestId=crypto.randomUUID();await f.apply(id,command('request.add',{requestId,title:'Income documents',due:'2026-12-01',notes:'Client-visible request note'}));
    const source=await privateFile();await f.put(source,'synthetic-evidence');const draft=newReturn(kind);draft.party.name='SYNTHETIC PRIVATE DRAFT';await f.put(draft,'synthetic-draft');await f.staff.sync();await f.client.sync();
    await f.apply(id,command('document.review',{requestId,document:ref(f.staff.records.get('synthetic-evidence')),decision:'reviewed',notes:'Client-visible reviewed note'}),'synthetic-evidence');await f.apply(id,command('draft.link',{document:ref(f.staff.records.get('synthetic-draft')),notes:'Draft linked for source review'}),'synthetic-draft');
    const dom=new JSDOM('<!doctype html><body></body>'),document=dom.window.document;
    try{
      for(const controller of [f.client,f.staff]){const record=controller.records.get(id);assert.equal(caseSnapshot(record.verifiedCase,controller.records).ready,true);const rendered=renderCase(document,record,controller.records);assert.equal(rendered.dataset.caseReady,'true');assert.match(rendered.textContent,/Reviewed — current exact revision/);assert.match(rendered.textContent,/client authorization and filing still need/);}
      await f.put({...source,notes:'SYNTHETIC PRIVATE REPLACED SOURCE'},'synthetic-evidence',2);await f.staff.sync();await f.client.sync();
      for(const controller of [f.client,f.staff]){const rendered=renderCase(document,controller.records.get(id),controller.records);assert.equal(rendered.dataset.caseReady,'false');assert.match(rendered.textContent,/Changed since review — needs review again/);assert(!rendered.textContent.includes('Reviewed — current exact revision'));const dashboard=renderPortalDashboard(document,controller.records,{staff:controller===f.staff});assert.equal(dashboard.querySelector('.portal-case-work [data-case-ready]').dataset.caseReady,'false');assert.match(dashboard.textContent,/Changed since review/);}
      await f.apply(id,command('document.review',{requestId,document:ref(f.staff.records.get('synthetic-evidence')),decision:'replacement_requested',notes:'Please replace this source'}),'synthetic-evidence');assert.equal(f.staff.records.get(id).verifiedCase.history.filter(event=>event.type==='document.review').length,2);
      assert.match(renderCase(document,f.client.records.get(id),f.client.records).textContent,/Replacement requested/);
      await f.put(draft,'synthetic-draft',2);await f.staff.sync();await f.client.sync();assert.match(renderCase(document,f.client.records.get(id),f.client.records).textContent,/Linked draft changed/);
      f.remove('synthetic-evidence');await f.staff.sync();await f.client.sync();assert.match(renderCase(document,f.client.records.get(id),f.client.records).textContent,/Referenced document unavailable/);
      const staffView=renderStaffRecords(document,f.staff.records,{workspaceId:f.config.workspaceId,...f.binding});assert.match(staffView.textContent,/Firm-reviewed case decisions/);assert.equal(staffView.querySelectorAll('input,textarea').length,0);
    }finally{dom.window.close();}
    const wire=JSON.stringify(f.calls);assert(!wire.includes('SYNTHETIC PRIVATE TAX CASE'));assert(!wire.includes('SYNTHETIC PRIVATE CASE SOURCE'));assert(!wire.includes('SYNTHETIC PRIVATE CASE NOTES'));assert(!JSON.stringify([...f.staffStore.bindings.values()]).includes('SYNTHETIC PRIVATE TAX CASE'));f.staff.lock();f.client.lock();
  }
});
test('private case kits and altered approvals are rejected before upload, and client generic writes cannot replace or delete certified cases',async()=>{
  const f=await fixture(),action=command('case.create',{title:'Private certified case',year:2025,kind:'1120'}),kit=await f.staff.prepareCaseAction(null,action),calls=f.calls.length;
  await assert.rejects(()=>f.staff.installApprovedCase(kit));await assert.rejects(()=>f.staff.installApprovedReturnCreation(kit));await assert.rejects(()=>f.staff.installApprovedReturnEdit(kit));assert.equal(f.calls.length,calls);
  const created=await f.apply(null,action),id=created.id,count=f.calls.length;await assert.rejects(()=>f.client.save('tax-document',encode({type:'business-note',title:'Overwrite'}),id),/firm workflow/);await assert.rejects(()=>f.client.remove(id),/cannot be deleted/);assert.equal(f.calls.length,count);
  await assert.rejects(()=>f.client.save('tax-document',encode({version:1,type:'tax-case',body:{title:'FORGED REVIEWED CASE'},certificate:{}}),'synthetic-forged-case'));assert.equal(f.calls.length,count);
  const changed=structuredClone(created.packet);changed.approval.reviewReference='another-review';await assert.rejects(()=>f.staff.installApprovedCase(changed));assert.equal(f.calls.length,count);
});
test('even valid unpublished firm-reviewed cases cannot use generic client creation or a prepared retry',async()=>{
  const f=await fixture(),kit=await f.staff.prepareCaseAction(null,command('case.create',{title:'Reviewed but unpublished case',year:2025,kind:'1040'})),packet=await approveCaseTransition({proposal:kit.proposal,envelope:null,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment:kit.proposal.reviewCommitment,reviewReference:'synthetic-unpublished-review',unlocked:f.firm}),recipients={clientPublicKey:f.clientKey.publicKey,firmRecoveryPublicKey:f.config.firmRecoveryPublicKey},plaintext=await openEnvelope(packet.envelope,packet.envelope.context,recipients,'client',f.clientKey.privateKey),count=f.calls.length;
  try{
    await assert.rejects(()=>f.client.save('tax-document',plaintext,kit.proposal.objectId),/firm workflow/);assert.equal(f.calls.length,count);
    const envelope=await sealEnvelope(plaintext,packet.envelope.context,recipients,'client',f.clientKey.privateKey),prepared={version:1,type:'shuug-prepared-client-write',scope:f.client.scope,objectId:kit.proposal.objectId,domain:'tax-document',expectedRevision:0,mutationId:crypto.randomUUID(),envelope};
    await assert.rejects(()=>f.client.savePrepared(prepared),/firm workflow/);assert.equal(f.calls.length,count);assert.equal(f.client.records.size,0);
    const unregistered=CASE_OBJECT_PREFIX+crypto.randomUUID();await assert.rejects(()=>f.client.save('tax-document',encode({version:1,type:'business-note',title:'Reserved ID is not a client document'}),unregistered),/firm workflow/);await assert.rejects(()=>f.client.remove(unregistered),/cannot be deleted/);assert.equal(f.calls.length,count);
  }finally{plaintext.fill(0);f.client.lock();f.staff.lock();}
});
test('reserved case IDs cannot be replaced by an ordinary client-authenticated file to hide reviewed work',async()=>{
  const f=await fixture(),created=await f.apply(null,command('case.create',{title:'Protected reviewed work',year:2025,kind:'1120'})),id=created.id;await f.put(await privateFile(),id,f.objects.get(id).revision);
  await assert.rejects(()=>f.staff.sync());assert.equal(f.staff.records.size,0);assert.equal(f.staff.unlocked,false);await assert.rejects(()=>f.client.sync());assert.equal(f.client.records.size,0);assert.equal(f.client.unlocked,false);
});
test('a client-authenticated envelope and signed sharing capsule do not make forged case review state trusted',async()=>{
  const f=await fixture(),created=await f.apply(null,command('case.create',{title:'Verified original case',year:2025,kind:'1040'})),id=created.id,original=f.objects.get(id),bytes=await openEnvelope(original.envelope,original.envelope.context,{clientPublicKey:f.clientKey.publicKey,firmRecoveryPublicKey:f.config.firmRecoveryPublicKey},'client',f.clientKey.privateKey);
  let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}finally{bytes.fill(0);}payload.body.title='FORGED PRIVATE CASE STATUS';await f.put(payload,id,original.revision);
  await assert.rejects(()=>f.staff.sync());assert.equal(f.staff.records.size,0);assert.equal(f.staff.unlocked,false);
  await assert.rejects(()=>f.client.sync());assert.equal(f.client.records.size,0);assert.equal(f.client.unlocked,false);
  const dom=new JSDOM('<!doctype html><body></body>');try{const view=renderCase(dom.window.document,{plaintext:encode(payload)},new Map());assert.match(view.textContent,/firm review could not be verified/);assert(!view.textContent.includes('FORGED PRIVATE'));}finally{dom.window.close();}
});
test('case preparation rejects stale selected evidence and revoked or locked scope without returning a review kit',async()=>{
  const f=await fixture(),created=await f.apply(null,command('case.create',{title:'Source-bound case',year:2025,kind:'1120'})),id=created.id,requestId=crypto.randomUUID();await f.apply(id,command('request.add',{requestId,title:'Source',due:'',notes:''}));const file=await privateFile();await f.put(file,'case-evidence');await f.staff.sync();
  const originalRef=ref(f.staff.records.get('case-evidence'));await f.put(file,'case-evidence',2);await assert.rejects(()=>f.staff.prepareCaseAction(id,command('document.review',{requestId,document:originalRef,decision:'reviewed',notes:''}),'case-evidence'),/changed/);assert.equal(f.staff.records.size,0);assert.equal(f.staff.unlocked,false);
  await f.staff.unlock(f.staffKey.keyId);await f.staff.selectGrant(f.grant.grantId);f.setGrants([]);await assert.rejects(()=>f.staff.prepareCaseAction(null,command('case.create',{title:'Revoked case',year:2025,kind:'1120'})));assert.equal(f.staff.unlocked,false);
  f.setGrants([f.grant]);await f.staff.unlock(f.staffKey.keyId);await f.staff.selectGrant(f.grant.grantId);let entered,release;const waiting=new Promise(resolve=>{entered=resolve;});f.setHook(async url=>{if(new URL(url).pathname.endsWith('/scope')){entered();await new Promise(resolve=>{release=resolve;});}});const pending=f.staff.prepareCaseAction(null,command('case.create',{title:'Locked case',year:2025,kind:'1040'}));await waiting;f.staff.lock();release();await assert.rejects(()=>pending,/changed/);assert.equal(f.staff.records.size,0);
});
test('ordinary case forms select verified cases and exact evidence, pause refresh and clear private notes on save/discard/lock',async()=>{
  const f=await fixture(),created=await f.apply(null,command('case.create',{title:'Readable case',year:2025,kind:'1120'})),id=created.id,requestId=crypto.randomUUID();await f.apply(id,command('request.add',{requestId,title:'Income source',due:'',notes:''}));await f.put(await privateFile(),'form-source');await f.staff.sync();
  const dom=new JSDOM('<!doctype html><body><div id="records"></div><main></main></body>',{pretendToBeVisual:true}),document=dom.window.document,saved=[];let pending,editor,working=false;
  const run=action=>{working=true;editor.setEnabled(false);pending=action().finally(()=>{working=false;editor.setEnabled(true);});return pending;};editor=mountCaseEditor(document,document.querySelector('main'),{getClient:()=>f.staff,run,confirm:()=>true,onSave:async(...args)=>saved.push(args)});editor.setEnabled(true);editor.refresh();const updates=mountStaffUpdates(document,document.querySelector('#records'),{getClient:()=>f.staff,isWorking:()=>working,canRefresh:()=>!editor.dirty,timers:{setTimer:()=>1,clearTimer:()=>{}}});
  const set=(id,value)=>{const input=document.getElementById(id);input.value=value;input.dispatchEvent(new dom.window.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};const click=text=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent===text);assert(button,text);button.click();};
  try{
    set('case-title','PRIVATE CASE FORM TITLE');assert.equal(await updates.check(),false);click('Discard case input');assert.equal(editor.dirty,false);assert.equal(document.getElementById('case-title').value,'');
    set('case-choice',id);set('case-action','document.review');set('case-document','form-source');set('case-request',requestId);set('case-decision','replacement_requested');set('case-review-notes','CLIENT VISIBLE PRIVATE REVIEW NOTE');assert.equal(editor.dirty,true);assert.match(document.body.textContent,/Client-visible review note/);click('Save private case review kit');await pending;assert.equal(saved.length,1);assert.equal(saved[0][0],id);assert.equal(saved[0][1].type,'document.review');assert.deepEqual(saved[0][1].input.document,ref(f.staff.records.get('form-source')));assert.equal(saved[0][2],'form-source');assert.equal(editor.dirty,false);assert.equal(document.getElementById('case-review-notes').value,'');
    set('case-action','request.add');set('case-request-title','PRIVATE UNSAVED REQUEST');editor.clear();editor.setEnabled(false);assert.equal(editor.dirty,false);assert(!document.body.textContent.includes('Readable case'));assert([...editor.element.querySelectorAll('input,textarea,select,button')].every(control=>control.disabled));assert(![...editor.element.querySelectorAll('input,textarea')].some(control=>control.value.includes('PRIVATE')));
  }finally{updates.destroy();dom.window.close();f.staff.lock();f.client.lock();}
});
test('ordinary ledger forms produce approved encrypted journals and matching client/staff reports, then clear private input',async()=>{
  const f=await fixture(),created=await f.apply(null,command('case.create',{title:'Synthetic book form case',year:2025,kind:'1120'})),id=created.id;
  const dom=new JSDOM('<!doctype html><body><main></main></body>'),document=dom.window.document;let pending,editor;
  const run=action=>{editor.setEnabled(false);pending=action().finally(()=>editor.setEnabled(true));return pending;};
  editor=mountCaseEditor(document,document.querySelector('main'),{getClient:()=>f.staff,run,confirm:()=>true,onSave:async(...args)=>{await f.apply(args[0],args[1],args[2]);}});editor.setEnabled(true);editor.refresh();
  const set=(id,value)=>{const input=document.getElementById(id);assert(input,id);input.value=value;input.dispatchEvent(new dom.window.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const save=async()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='Save private case review kit').click();await pending;};
  try{
    set('case-choice',id);set('case-action','books.open');set('case-books-title','SYNTHETIC PRIVATE BOOK TITLE');await save();assert.equal(replayCaseBooks(f.client.records.get(id).verifiedCase.history,2025).title,'SYNTHETIC PRIVATE BOOK TITLE');
    // A completed action must switch to a valid form; it must not leave a second
    // "open books" form selected after the ledger has already been opened.
    assert.notEqual(document.getElementById('case-action').value,'');
    set('case-action','books.journal.post');set('case-books-date','2025-03-01');set('case-books-memo','SYNTHETIC PRIVATE REVENUE');set('case-books-line-1-account','1000');set('case-books-line-1-debit','123.45');set('case-books-line-2-account','4000');set('case-books-line-2-credit','123.45');assert.equal(editor.dirty,true);await save();assert.equal(editor.dirty,false);
    for(const controller of [f.staff,f.client]){const snapshot=caseSnapshot(controller.records.get(id).verifiedCase,controller.records);assert.equal(snapshot.books.report.bankCents,12345);assert.equal(snapshot.books.report.netIncomeCents,12345);const view=renderCase(document,controller.records.get(id),controller.records);assert.match(view.textContent,/Bank 123\.45/);assert.match(view.textContent,/not cash\/accrual reports/);assert.match(view.textContent,/no attached file/);document.querySelector('main').append(view);}
    assert.equal(document.getElementById('case-books-memo').value,'');set('case-books-memo','UNSAVED PRIVATE NOTE');editor.clear();editor.setEnabled(false);assert(![...editor.element.querySelectorAll('input,textarea')].some(input=>input.value.includes('PRIVATE')));
    const wire=JSON.stringify(f.calls);for(const marker of ['SYNTHETIC PRIVATE BOOK TITLE','SYNTHETIC PRIVATE REVENUE','books.journal.post'])assert(!wire.includes(marker));
  }finally{dom.window.close();f.staff.lock();f.client.lock();}
});
test('encrypted book revisions invalidate prior draft review and stale source posts cannot hide behind a current case certificate',async()=>{
  const f=await fixture(),created=await f.apply(null,command('case.create',{title:'Synthetic protected books',year:2025,kind:'1040'})),id=created.id;
  try{
    await f.apply(id,command('books.open',{title:'Synthetic book',currency:'USD',from:'2025-01-01',through:'2025-12-31',accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:''}));
    await f.put(await privateFile(),'book-evidence');await f.put(newReturn('1040'),'book-draft');await f.staff.sync();await f.client.sync();
    const version=replayCaseBooks(f.staff.records.get(id).verifiedCase.history,2025).version;await f.apply(id,command('draft.link',{document:ref(f.staff.records.get('book-draft')),notes:'Reviewed books',booksVersion:version}),'book-draft');
    await f.apply(id,command('books.journal.post',{date:'2025-07-01',memo:'Synthetic certified posting',lines:[{accountNumber:1000,debitCents:500,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:500}],document:ref(f.staff.records.get('book-evidence')),notes:''}),'book-evidence');
    for(const controller of [f.client,f.staff]){const status=caseSnapshot(controller.records.get(id).verifiedCase,controller.records);assert.equal(status.draft.booksFreshness,'stale');assert.equal(status.books.sourcesCurrent,true);}
    await f.put(await privateFile(),'book-evidence',2);await f.client.sync();await f.staff.sync();for(const controller of [f.client,f.staff]){const status=caseSnapshot(controller.records.get(id).verifiedCase,controller.records);assert.equal(status.books.sourcesCurrent,false);assert.equal(status.books.sources[0].freshness,'stale');assert.equal(status.books.report.bankCents,500);}
  }finally{f.staff.lock();f.client.lock();}
});
