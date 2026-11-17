import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticClientOnlyFixture} from '../client-only-interop-fixture.mjs';
import {VaultClient,encodeJson} from '../browser/client.mjs';
import {decode64,encode64} from '../envelope.mjs';
import {openClientOnlyEnvelope} from '../client-only.mjs';
import {AutoTaxController,autoTaxObjectId,AUTO_TAX_TYPE} from '../browser/auto-tax-controller.mjs';
import {PortalUploadQueue} from '../browser/client-portal.mjs';
import {JSDOM} from 'jsdom';
import {renderReturn} from '../browser/return-view.mjs';

class Storage{
  keys=new Map();bindings=new Map();failPending=false;
  async getKey(id){return this.keys.get(id);}
  async getBinding(id){return structuredClone(this.bindings.get(id));}
  async putBinding(value){this.bindings.set(value.id,structuredClone(value));}
  async updateBinding(id,update){const next=update(structuredClone(this.bindings.get(id)));if(this.failPending&&next.entries?.length)throw new Error('Synthetic pending storage failure');this.bindings.set(id,structuredClone(next));return structuredClone(next);}
}
async function fixture(){
  const f=await createSyntheticClientOnlyFixture(),storage=new Storage(),pub=decode64(f.clientPublicKey,65);
  const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.slice(1,33)),y:encode64(pub.slice(33)),d:f.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  storage.keys.set(f.manifest.client.keyId,{keyId:f.manifest.client.keyId,publicKey:f.clientPublicKey,privateKey:key});
  const config={...f.pins,uiOrigin:'https://synthetic-client.example',apiOrigin:'https://synthetic-api.example'},identity={accountId:f.expected.accountId,clientId:f.expected.clientId},objects=new Map(),mutations=new Map(),calls=[];let sequence=0,hook=null;
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}),receipt=value=>({objectId:value.objectId,revision:value.revision,sequence:value.sequence,deleted:value.deleted});
  async function commit(url,options){
    const parsed=new URL(url),id=decodeURIComponent(parsed.pathname.split('/').at(-1));
    assert.ok(parsed.pathname.startsWith('/api/website/customer/client-only/'));
    if(id==='status')return respond({profile:'client-only-v1',enrolled:true,identity,manifest:f.manifest});
    if(id==='objects'){const after=Number(parsed.searchParams.get('after')),changes=[...objects.values()].filter(row=>row.sequence>after).sort((a,b)=>a.sequence-b.sequence).map(receipt);return respond({changes,cursor:changes.at(-1)?.sequence??after,hasMore:false});}
    if(options.method==='GET')return respond(objects.get(id));
    const body=JSON.parse(options.body);
    if(options.method==='PUT'){
      const prior=mutations.get(body.mutationId);if(prior){assert.equal(options.body,prior.body);return respond(receipt(prior.row));}
      if(body.expectedRevision!==(objects.get(id)?.revision??0))return respond({error:'Synthetic revision conflict'},409);
      const row={objectId:id,revision:body.expectedRevision+1,sequence:++sequence,deleted:false,envelope:body.envelope};objects.set(id,row);mutations.set(body.mutationId,{row,body:options.body});return respond(receipt(row));
    }
    if(options.method==='DELETE'){const row={objectId:id,revision:objects.get(id).revision+1,sequence:++sequence,deleted:true};objects.set(id,row);return respond(receipt(row));}
    throw new Error('Unexpected synthetic route');
  }
  const fetcher=async(url,options)=>{calls.push({url,options:structuredClone(options)});if(hook){const reply=await hook(url,options);if(reply)return reply;}return commit(url,options);};
  const make=async()=>{const client=await VaultClient.create(config,config.uiOrigin,{storage,fetcher});await client.connect();await client.unlock(f.manifest.client.keyId);await client.sync();return client;};
  const client=await make(),controller=new AutoTaxController({getClient:()=>client,defaultYear:2025});
  return {...f,storage,config,identity,objects,calls,commit,make,client,controller,setHook:value=>{hook=value;}};
}
const income=(amount=2000000)=>({id:'11111111-1111-4111-8111-111111111111',kind:'income',revision:1,deleted:false,body:{date:'2025-05-06',platform:'uber',description:'SYNTHETIC PRIVATE GROSS RECEIPTS',amountCents:amount,currency:'USD',notes:''}});
const expense=()=>({id:'22222222-2222-4222-8222-222222222222',kind:'expense',revision:1,deleted:false,body:{date:'2025-05-06',merchant:'SYNTHETIC PRIVATE FEE',category:'fees',amountCents:50000,currency:'USD',classification:'business',businessUsePercent:100,businessPurpose:'Synthetic platform fee',notes:'',receiptId:null}});
async function journal(f,records,client=f.client){const objectId='33333333-3333-4333-8333-333333333333',bytes=encodeJson({version:1,type:'driver-journal',binding:{workspaceId:f.config.workspaceId,...f.identity,objectId},capturedAt:Date.now(),journal:{version:1,entries:records.map(record=>({record}))}});try{await client.save('driver-state',bytes,objectId);}finally{bytes.fill(0);}}

test('app Journal automatically becomes one encrypted private draft, updates without a generate click, and never sends readable tax data',async()=>{
  const f=await fixture();await journal(f,[income(),expense()]);await f.client.sync();await f.controller.synchronized();
  const state=f.controller.state,id=await autoTaxObjectId(f.client.scope,2025),item=f.client.records.get(id),packet=JSON.parse(new TextDecoder().decode(item.plaintext));
  assert.equal(packet.type,AUTO_TAX_TYPE);assert.equal(packet.input.individual.businesses[0].receiptsCents,2000000);assert.equal(state.persisted,true);assert.equal(state.model.totals.profitCents,null);
  const firstRevision=item.revision;await f.controller.synchronized();assert.equal(f.client.records.get(id).revision,firstRevision);
  await journal(f,[income(2100000),expense()]);await f.client.sync();await f.controller.synchronized();assert.equal(f.client.records.get(id).revision,firstRevision+1);assert.equal(f.controller.state.model.totals.recordedIncomeCents,2100000);
  const puts=f.calls.filter(call=>call.options.method==='PUT');for(const call of puts){assert(!call.options.body.includes('SYNTHETIC PRIVATE'));const envelope=JSON.parse(call.options.body).envelope;assert.equal(envelope.version,3);assert.equal(envelope.recipients.length,1);assert.equal(envelope.recipients[0].publicKey,f.clientPublicKey);}
  const serialized=JSON.stringify([...f.storage.bindings.values()]);assert(!serialized.includes('SYNTHETIC PRIVATE'));assert(!serialized.includes('client-auto-tax-draft'));
  const saved=f.objects.get(id).envelope,pub=decode64(f.unrelatedFirmPublicKey,65),wrong=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.slice(1,33)),y:encode64(pub.slice(33)),d:f.unrelatedFirmPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  await assert.rejects(()=>openClientOnlyEnvelope(saved,saved.context,{clientPublicKey:f.clientPublicKey},'client',wrong));
});
test('a lost acknowledgment keeps the exact encrypted retry, survives reopen, and does not create a second draft',async()=>{
  const f=await fixture();await journal(f,[income()]);const id=await autoTaxObjectId(f.client.scope,2025);let lost=true;
  f.setHook(async(url,options)=>{if(options.method==='PUT'&&url.endsWith(id)&&lost){lost=false;await f.commit(url,options);throw new Error('Synthetic acknowledgment lost');}});
  await assert.rejects(()=>f.controller.synchronized(),/acknowledgment lost/);assert.equal((await f.client.pendingUploads()).length,1);const first=f.calls.filter(call=>call.options.method==='PUT'&&call.url.endsWith(id)).at(-1).options.body;
  const queue=new PortalUploadQueue(f.client);await queue.restore();assert.equal(queue.rows.length,0);
  f.client.lock();f.controller.clear();f.setHook(null);const other=await f.make(),second=new AutoTaxController({getClient:()=>other,defaultYear:2025});await second.synchronized();
  const puts=f.calls.filter(call=>call.options.method==='PUT'&&call.url.endsWith(id));assert.equal(puts[1].options.body,first);assert.equal(f.objects.get(id).revision,1);assert.equal((await other.pendingUploads()).length,0);assert.equal(second.state.persisted,true);
});
test('failed durable storage sends no tax draft and an empty account never creates a zero return',async()=>{
  const f=await fixture();await f.controller.synchronized();assert.equal(f.objects.size,0);assert.equal(f.controller.state.persisted,false);
  await journal(f,[income()]);const before=f.calls.filter(call=>call.options.method==='PUT').length;f.storage.failPending=true;
  await assert.rejects(()=>f.controller.synchronized(),/pending storage failure/);assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,before);assert.equal(f.controller.state.persisted,false);
});
test('new source data invalidates income confirmation while preserving private identity and other reviewed tax inputs',async()=>{
  const f=await fixture();await journal(f,[income(),expense()]);await f.controller.synchronized();
  await f.controller.updateSettings({businessConfirmed:true,vehicleMethod:'none'});const row=f.controller.state.model.source.records.find(row=>row.kind==='expense');await f.controller.reviewRecord('expense',row.id,{fingerprint:row.fingerprint,category:'commissions',deductibleCents:50000});await f.controller.updateSettings({incomeConfirmed:true});assert.equal(f.controller.state.model.incomeConfirmed,true);
  const input=structuredClone(f.controller.state.model.input);input.party.name='SYNTHETIC PRIVATE TAXPAYER';await f.controller.saveDetails(input);assert.equal(f.controller.state.model.input.party.name,input.party.name);
  await journal(f,[income(2200000),expense()]);await f.client.sync();await f.controller.synchronized();assert.equal(f.controller.state.model.incomeConfirmed,false);assert.equal(f.controller.state.model.input.party.name,input.party.name);assert.equal(f.controller.state.model.totals.profitCents,null);
});
test('a newer private-session edit is adopted and a stale local edit cannot overwrite it',async()=>{
  const f=await fixture();await journal(f,[income()]);await f.controller.synchronized();const other=await f.make(),second=new AutoTaxController({getClient:()=>other,defaultYear:2025});await second.synchronized();
  const input=structuredClone(second.state.model.input);input.party.name='NEWER PRIVATE CLIENT NAME';await second.saveDetails(input);
  await f.client.sync();await assert.rejects(()=>f.controller.updateSettings({businessConfirmed:true}),/Another private session/);
  const id=await autoTaxObjectId(other.scope,2025);assert.equal(JSON.parse(new TextDecoder().decode(f.client.records.get(id).plaintext)).input.party.name,input.party.name);
});
test('lock during an ambiguous save clears models and cannot restore the previous account view',async()=>{
  const f=await fixture();await journal(f,[income()]);const id=await autoTaxObjectId(f.client.scope,2025);let enter,release;const entered=new Promise(resolve=>{enter=resolve;});
  f.setHook(async(url,options)=>{if(options.method==='PUT'&&url.endsWith(id)){const result=await f.commit(url,options);enter();await new Promise(resolve=>{release=resolve;});return result;}});
  const running=f.controller.synchronized();await entered;f.client.lock();f.controller.clear();release();await assert.rejects(()=>running,/changed/);assert.equal(f.controller.state.phase,'locked');assert.equal(f.controller.state.model,null);assert.equal(f.client.records.size,0);
});
test('simultaneous first drafts preserve the losing encrypted save and resume from the current private revision',async()=>{
  const f=await fixture();await journal(f,[income()]);const other=await f.make(),second=new AutoTaxController({getClient:()=>other,defaultYear:2025}),id=await autoTaxObjectId(f.client.scope,2025);
  const outcomes=await Promise.allSettled([f.controller.synchronized(),second.synchronized()]);
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);assert.equal(outcomes.filter(row=>row.status==='rejected').length,1);
  const loser=outcomes[0].status==='rejected'?f.controller:second,client=outcomes[0].status==='rejected'?f.client:other;
  assert.equal((await client.pendingUploads()).filter(row=>row.objectId===id).length,1);
  await client.sync();await loser.synchronized();assert.equal(loser.state.persisted,true);assert.equal(loser.state.archivedCount,1);assert.equal((await client.pendingUploads()).length,0);
  assert.equal(f.objects.get(id).revision,1);assert.equal((await loser.priorInput()).individual.businesses[0].receiptsCents,2000000);
  const archived=JSON.stringify(await client.archivedPendingUploads());assert(!archived.includes('SYNTHETIC PRIVATE'));assert(!archived.includes('client-auto-tax-draft'));
});
test('changing the controller account clears public financial state before asynchronous loading',async()=>{
  const f=await fixture();await journal(f,[income()]);const emissions=[],controller=new AutoTaxController({getClient:()=>f.client,defaultYear:2025,onChange:state=>emissions.push(structuredClone(state))});await controller.synchronized();
  assert(controller.state.model);emissions.length=0;
  f.client.identity={...f.client.identity,accountId:'synthetic-other-account'};
  await assert.rejects(()=>controller.synchronized(),/binding|account/);
  assert(emissions.length>0);for(const value of emissions){assert.equal(value.model,null);assert.equal(value.settings,null);assert.equal(value.persisted,false);}
});
test('managed app amounts cannot be silently changed in the full editor and deleted drafts are never recreated',async()=>{
  const f=await fixture();await journal(f,[income()]);await f.controller.synchronized();const input=structuredClone(f.controller.state.model.input);input.individual.businesses[0].receiptsCents++;
  await assert.rejects(()=>f.controller.saveDetails(input),/receives its income and deductions/);
  const id=await autoTaxObjectId(f.client.scope,2025);await f.client.remove(id);const before=f.calls.filter(call=>call.options.method==='PUT').length;
  await assert.rejects(()=>f.controller.synchronized(),/deleted/);assert.equal(f.objects.get(id).deleted,true);assert.equal(f.calls.filter(call=>call.options.method==='PUT').length,before);
});
test('the full-editor PDF path validates its captured managed amounts before generating or downloading a file',async()=>{
  const f=await fixture();await journal(f,[income()]);await f.controller.synchronized();const input=structuredClone(f.controller.state.model.input);input.individual.businesses[0].receiptsCents++;
  const dom=new JSDOM('<main></main>');let task,downloads=0,error;
  try{
    const view=renderReturn(dom.window.document,input,{download:()=>{downloads++;},beforeExport:value=>f.controller.assertManagedInput(value),run:operation=>{task=operation().catch(value=>{error=value;});}});dom.window.document.querySelector('main').append(view);
    [...view.querySelectorAll('button')].find(node=>node.textContent.includes('Download draft')).click();await task;
    assert.match(error.message,/receives its income and deductions/);assert.equal(downloads,0);
  }finally{dom.window.close();}
});
test('a misplaced or malformed automatic-draft retry remains visible for review instead of disappearing from the general queue',async()=>{
  const f=await fixture();await journal(f,[income()]);await f.controller.synchronized();const id=await autoTaxObjectId(f.client.scope,2025),packet=f.client.records.get(id).plaintext;
  const misplaced=await f.client.prepareSave('tax-document',packet,'44444444-4444-4444-8444-444444444444');await f.client.keepPendingUpload(misplaced);
  const queue=new PortalUploadQueue(f.client);await queue.restore();assert.equal(queue.rows.length,1);assert.equal(queue.rows[0].status,'failed');assert.equal((await f.client.pendingUploads()).length,1);
});
