import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticClientOnlyFixture} from '../client-only-interop-fixture.mjs';
import {signClientOnlyEnrollment} from '../client-only-signing.mjs';
import {PROFILE} from '../client-only.mjs';
import {decode64,encode64} from '../envelope.mjs';
import {VaultClient,encodeJson} from '../browser/client.mjs';

const prefix='auto-tax-retry-archive:',clone=value=>structuredClone(value);
class Storage {
  keys=new Map();bindings=new Map();locks=new Map();failArchive=false;unconfirmed=false;beforeArchiveUpdate=null;beforeArchiveRead=null;
  async getKey(id){return this.keys.get(id);}
  async getBinding(id){if(id.startsWith(prefix))await this.beforeArchiveRead?.();return clone(this.bindings.get(id));}
  async putBinding(value){this.bindings.set(value.id,clone(value));}
  async updateBinding(id,update){
    const running=(this.locks.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
      if(id.startsWith(prefix))await this.beforeArchiveUpdate?.();
      const next=update(clone(this.bindings.get(id)));
      if(id.startsWith(prefix)&&this.failArchive)throw new Error('Synthetic archive quota failure');
      this.bindings.set(id,clone(next));return id.startsWith(prefix)&&this.unconfirmed?undefined:clone(next);
    });
    this.locks.set(id,running);try{return await running;}finally{if(this.locks.get(id)===running)this.locks.delete(id);}
  }
}
async function importedKey(scalar,publicKey,signing=false){
  const p=decode64(publicKey,65);
  return crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(p.slice(1,33)),y:encode64(p.slice(33)),d:scalar},signing?{name:'ECDSA',namedCurve:'P-256'}:{name:'ECDH',namedCurve:'P-256'},false,signing?['sign']:['deriveBits']);
}
async function fixture(){
  const f=await createSyntheticClientOnlyFixture(),storage=new Storage(),keyId=f.manifest.client.keyId;
  storage.keys.set(keyId,{keyId,publicKey:f.clientPublicKey,privateKey:await importedKey(f.clientPrivateKey,f.clientPublicKey)});
  const config={...f.pins,uiOrigin:'https://synthetic-client.example',apiOrigin:'https://synthetic-api.example'},identity={accountId:f.request.accountId,clientId:f.request.clientId},calls=[];
  async function make({manifest=f.manifest,identity:account=identity}={}){
    const fetcher=async(url,options)=>{calls.push({url,options:clone(options)});assert.equal(options.method,'GET');assert.ok(url.endsWith('/client-only/status'));return new Response(JSON.stringify({profile:PROFILE,enrolled:true,identity:account,manifest}),{headers:{'Content-Type':'application/json'}});};
    const client=await VaultClient.create(config,config.uiOrigin,{storage,fetcher});await client.connect();await client.unlock(keyId);return client;
  }
  const client=await make(),pendingId=`portal-uploads:${PROFILE}|${config.workspaceId}|${identity.accountId}|${identity.clientId}|${keyId}`,archiveId=prefix+pendingId;
  const packet=(extra={})=>({version:1,type:'client-auto-tax-draft',profile:PROFILE,scope:{workspaceId:config.workspaceId,...identity},year:2025,input:{privateName:'SYNTHETIC PRIVATE ARCHIVED INPUT'},...extra});
  async function prepare(extra={},domain='tax-document',objectId='synthetic-auto-tax-draft'){
    const bytes=encodeJson(packet(extra));try{return await client.prepareSave(domain,bytes,objectId);}finally{bytes.fill(0);}
  }
  return {...f,client,storage,config,identity,keyId,calls,make,prepare,packet,pendingId,archiveId};
}

test('archive preserves exact client ciphertext across reopen without dispatch or removing the active retry',async()=>{
  const f=await fixture(),prepared=await f.prepare();await f.client.keepPendingUpload(prepared);const before=f.calls.length;
  await f.client.archivePendingUpload(prepared);
  assert.equal(f.calls.length,before);assert.deepEqual(await f.client.pendingUploads(),[prepared]);
  assert.deepEqual(await f.storage.getBinding(f.archiveId),{id:f.archiveId,version:1,entries:[prepared]});
  const persisted=JSON.stringify([...f.storage.bindings.values()]);assert(!persisted.includes('SYNTHETIC PRIVATE'));assert(!persisted.includes('client-auto-tax-draft'));
  const detached=await f.client.archivedPendingUploads();detached[0].envelope.ciphertext='changed caller copy';
  assert.deepEqual(await f.client.archivedPendingUploads(),[prepared]);
  await f.client.forgetPendingUpload(prepared.mutationId);assert.deepEqual(await f.client.pendingUploads(),[]);
  const reopened=await f.make();assert.deepEqual(await reopened.archivedPendingUploads(),[prepared]);assert.deepEqual(await reopened.pendingUploads(),[]);
  const bytes=await reopened.previewPrepared((await reopened.archivedPendingUploads())[0]);
  try{assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.packet());}finally{bytes.fill(0);}
});

test('a failed or unconfirmed archive write retains the exact active encrypted retry',async()=>{
  const f=await fixture(),prepared=await f.prepare();await f.client.keepPendingUpload(prepared);
  f.storage.failArchive=true;await assert.rejects(()=>f.client.archivePendingUpload(prepared),/quota failure/);
  assert.deepEqual(await f.client.pendingUploads(),[prepared]);assert.equal(f.storage.bindings.has(f.archiveId),false);
  f.storage.failArchive=false;f.storage.unconfirmed=true;
  await assert.rejects(()=>f.client.archivePendingUpload(prepared),/did not confirm a durable/);
  assert.deepEqual(await f.client.pendingUploads(),[prepared]);assert.deepEqual(await f.client.archivedPendingUploads(),[prepared]);
  f.storage.unconfirmed=false;await f.client.archivePendingUpload(prepared);assert.deepEqual(await f.client.archivedPendingUploads(),[prepared]);
});

test('concurrent clients merge archive copies atomically and a mutation can never replace its archived bytes',async()=>{
  const f=await fixture(),one=await f.prepare(),two=await f.prepare({input:{privateName:'SYNTHETIC SECOND PRIVATE INPUT'}}),other=await f.make();
  await f.client.keepPendingUpload(one);await f.client.keepPendingUpload(two);
  await Promise.all([f.client.archivePendingUpload(one),other.archivePendingUpload(two)]);
  const entries=await f.client.archivedPendingUploads();assert.equal(entries.length,2);assert.deepEqual(new Map(entries.map(entry=>[entry.mutationId,entry])),new Map([one,two].map(entry=>[entry.mutationId,entry])));
  assert.deepEqual(await f.client.pendingUploads(),[one,two]);
  await f.client.forgetPendingUpload(one.mutationId);
  const different=await f.prepare({input:{privateName:'SYNTHETIC REPLACEMENT MUST FAIL'}});different.mutationId=one.mutationId;
  const outcomes=await Promise.allSettled([f.client.archivePendingUpload(one),other.archivePendingUpload(different)]);
  assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.match(outcomes[1].reason.message,/original bytes/);
  assert.deepEqual(await f.client.archivedPendingUploads(),entries);
});

test('archive snapshots input before awaiting and rejects disagreement with an active retry',async()=>{
  const f=await fixture(),prepared=await f.prepare(),original=clone(prepared);await f.client.keepPendingUpload(prepared);
  const saving=f.client.archivePendingUpload(prepared);prepared.scope.accountId='different-account';prepared.envelope.ciphertext='caller mutation';await saving;
  assert.deepEqual(await f.client.archivedPendingUploads(),[original]);assert.deepEqual(await f.client.pendingUploads(),[original]);
  const changed=await f.prepare({input:{privateName:'SYNTHETIC DIFFERENT ACTIVE COPY'}});changed.mutationId=original.mutationId;
  await assert.rejects(()=>f.client.archivePendingUpload(changed),/original bytes/);assert.deepEqual(await f.client.pendingUploads(),[original]);
});

test('profile, account, key, encrypted domain, and decrypted packet authority fail closed',async()=>{
  const f=await fixture(),prepared=await f.prepare();
  for(const mutate of [v=>{delete v.scope.profile;},v=>{v.scope.workspaceId='other-workspace';},v=>{v.scope.accountId='other-account';},v=>{v.scope.clientId='other-client';},v=>{v.scope.keyId='other-key';},v=>{v.envelope.profile='firm-recovery-v1';}]){
    const wrong=clone(prepared);mutate(wrong);await assert.rejects(()=>f.client.archivePendingUpload(wrong));
  }
  const wrongDomain=await f.prepare({},'driver-record');await assert.rejects(()=>f.client.archivePendingUpload(wrongDomain),/Only an encrypted automatic tax draft/);
  for(const extra of [{type:'business-note'},{version:2},{profile:'firm-recovery-v1'},{scope:{workspaceId:f.config.workspaceId,...f.identity,accountId:'other-account'}},{scope:{workspaceId:f.config.workspaceId,...f.identity,keyId:f.keyId}}]){
    const wrong=await f.prepare(extra);await f.client.keepPendingUpload(wrong);await assert.rejects(()=>f.client.archivePendingUpload(wrong),/Only this account/);assert.ok((await f.client.pendingUploads()).some(entry=>entry.mutationId===wrong.mutationId));
  }
  const malformed=await f.client.prepareSave('tax-document',new TextEncoder().encode('{invalid JSON'),'synthetic-invalid-draft');
  await f.client.keepPendingUpload(malformed);await assert.rejects(()=>f.client.archivePendingUpload(malformed));assert.equal(f.storage.bindings.has(f.archiveId),false);
  const {profile,...rest}=f.config,legacy=await VaultClient.create({...rest,version:1,firmRecoveryPublicKey:f.unrelatedFirmPublicKey},f.config.uiOrigin,{storage:f.storage,fetcher:()=>{throw new Error('No legacy request permitted');}});
  await assert.rejects(()=>legacy.archivePendingUpload(prepared),/requires the client-only profile/);await assert.rejects(()=>legacy.archivedPendingUploads(),/requires the client-only profile/);
});

test('archive enumeration remains isolated by account and client key',async()=>{
  const f=await fixture(),prepared=await f.prepare();await f.client.archivePendingUpload(prepared);
  const identity={accountId:'synthetic-other-account',clientId:'synthetic-other-client'},signer=await importedKey(f.signerPrivateKey,f.signerPublicKey,true);
  const manifest=await signClientOnlyEnrollment({publicPins:f.pins,signing:signer},{...f.request,...identity}),other=await f.make({identity,manifest});
  assert.deepEqual(await other.archivedPendingUploads(),[]);await assert.rejects(()=>other.archivePendingUpload(prepared),/another account, key/);
  const differentKey=await fixture();differentKey.storage.bindings.set(f.archiveId,await f.storage.getBinding(f.archiveId));
  assert.deepEqual(await differentKey.client.archivedPendingUploads(),[]);await assert.rejects(()=>differentKey.client.archivePendingUpload(prepared),/another account, key/);
  assert.deepEqual(await f.client.archivedPendingUploads(),[prepared]);
});

test('account lock during archive update or enumeration cannot commit or expose stale state',async()=>{
  const f=await fixture(),prepared=await f.prepare();await f.client.keepPendingUpload(prepared);
  let entered,release;const waiting=new Promise(resolve=>{entered=resolve;});
  f.storage.beforeArchiveUpdate=async()=>{entered();await new Promise(resolve=>{release=resolve;});};
  const saving=f.client.archivePendingUpload(prepared);await waiting;f.client.lock();release();await assert.rejects(()=>saving,/connection changed/);
  assert.equal(f.storage.bindings.has(f.archiveId),false);assert.deepEqual((await f.storage.getBinding(f.pendingId)).entries,[prepared]);
  f.storage.beforeArchiveUpdate=null;const other=await f.make();await other.archivePendingUpload(prepared);
  const reading=new Promise(resolve=>{entered=resolve;});f.storage.beforeArchiveRead=async()=>{entered();await new Promise(resolve=>{release=resolve;});};
  const listing=other.archivedPendingUploads();await reading;other.lock();release();await assert.rejects(()=>listing,/connection changed/);
});

test('archive entry and byte bounds preserve active retries and never evict older encrypted copies',async()=>{
  const f=await fixture(),prepared=await f.prepare();await f.client.keepPendingUpload(prepared);
  const entries=Array.from({length:50},()=>({...clone(prepared),mutationId:crypto.randomUUID()}));
  f.storage.bindings.set(f.archiveId,{id:f.archiveId,version:1,entries});
  await assert.rejects(()=>f.client.archivePendingUpload(prepared),/invalid or full/);
  assert.deepEqual(await f.client.archivedPendingUploads(),entries);assert.deepEqual(await f.client.pendingUploads(),[prepared]);
  const oversized=clone(prepared);oversized.envelope.ciphertext='a'.repeat(48*1024*1024);
  f.storage.bindings.set(f.archiveId,{id:f.archiveId,version:1,entries:[oversized]});
  await assert.rejects(()=>f.client.archivedPendingUploads(),/invalid or full/);await assert.rejects(()=>f.client.archivePendingUpload(prepared),/invalid or full/);
  assert.deepEqual(await f.client.pendingUploads(),[prepared]);assert.equal(f.storage.bindings.get(f.archiveId).entries[0].envelope.ciphertext.length,48*1024*1024);
});
