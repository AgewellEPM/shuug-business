import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticClientOnlyFixture} from '../client-only-interop-fixture.mjs';
import {PROFILE,openClientOnlyEnvelope} from '../client-only.mjs';
import {signClientOnlyEnrollment} from '../client-only-signing.mjs';
import {decode64,encode64,generateRecipientKeyPair,publicKeyId} from '../envelope.mjs';
import {VaultClient,encodeJson} from '../browser/client.mjs';
import {validateTrustedConfig} from '../browser/config.mjs';

class MemoryStorage{
  keys=new Map();bindings=new Map();
  async putKey(v){this.keys.set(v.keyId,structuredClone(v));}
  async getKey(id){return structuredClone(this.keys.get(id));}
  async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
  async getBinding(id){return structuredClone(this.bindings.get(id));}
  async putBinding(v){this.bindings.set(v.id,structuredClone(v));}
  async updateBinding(id,update){const next=structuredClone(update(structuredClone(this.bindings.get(id))));this.bindings.set(id,next);return structuredClone(next);}
}
async function privateKey(scalar,publicKey,signing=false){
  const p=decode64(publicKey,65);
  return crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(p.slice(1,33)),y:encode64(p.slice(33)),d:scalar},signing?{name:'ECDSA',namedCurve:'P-256'}:{name:'ECDH',namedCurve:'P-256'},false,signing?['sign']:['deriveBits']);
}
async function fixture(){
  const f=await createSyntheticClientOnlyFixture(),storage=new MemoryStorage(),keyId=f.manifest.client.keyId;
  const config={...f.pins,uiOrigin:'https://synthetic-client.example',apiOrigin:'https://synthetic-api.example'};
  const identity={accountId:f.expected.accountId,clientId:f.expected.clientId},key=await privateKey(f.clientPrivateKey,f.clientPublicKey);
  await storage.putKey({keyId,publicKey:f.clientPublicKey,privateKey:key});
  let status={profile:PROFILE,enrolled:true,identity,manifest:f.manifest},sequence=0,loseRenewal=false;
  const rows=new Map(),calls=[],reply=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
  const receipt=v=>({objectId:v.objectId,revision:v.revision,sequence:v.sequence,deleted:v.deleted});
  const fetcher=async(url,options)=>{
    calls.push({url,options:structuredClone(options)});
    const path=new URL(url).pathname;assert.ok(path.startsWith('/api/website/customer/client-only/'));
    const id=decodeURIComponent(path.split('/').at(-1));
    if(id==='status')return reply(status);
    if(id==='enrollment-renewal'){
      if(options.method==='GET')return reply({profile:PROFILE,identity,manifest:status.manifest});
      status={...status,manifest:JSON.parse(options.body).manifest};
      if(loseRenewal){loseRenewal=false;throw new TypeError('Synthetic lost renewal acknowledgment');}
      return reply({profile:PROFILE,renewed:true,enrolled:true,identity,manifest:status.manifest});
    }
    if(id==='objects'){
      const after=Number(new URL(url).searchParams.get('after')),changes=[...rows.values()].filter(v=>v.sequence>after).map(receipt);
      return reply({changes,cursor:changes.at(-1)?.sequence??after,hasMore:false});
    }
    if(options.method==='GET')return reply(rows.get(id));
    const body=JSON.parse(options.body);
    if(options.method==='PUT'){
      const row={objectId:id,revision:body.envelope.context.revision,sequence:++sequence,deleted:false,envelope:body.envelope};
      rows.set(id,row);return reply(receipt(row));
    }
    if(options.method==='DELETE'){
      const row={objectId:id,revision:rows.get(id).revision+1,sequence:++sequence,deleted:true};rows.set(id,row);return reply(receipt(row));
    }
    throw new Error('Unexpected synthetic API route');
  };
  const vault=await VaultClient.create(config,config.uiOrigin,{storage,fetcher});
  await vault.connect();await vault.unlock(keyId);
  return {...f,vault,keyId,key,storage,config,rows,calls,fetcher,setStatus:v=>{status=v;},loseRenewal:()=>{loseRenewal=true;},identity};
}

test('the actual browser save/sync path sends only v3 client ciphertext and another client instance can open it',async()=>{
  const f=await fixture(),body={version:1,type:'business-note',title:'SYNTHETIC PRIVATE CLIENT RECORD'};
  await f.vault.save('driver-record',encodeJson(body),'synthetic-browser-record');
  const sent=f.calls.find(v=>v.options.method==='PUT'),packet=JSON.parse(sent.options.body);
  assert.equal(packet.envelope.version,3);assert.equal(packet.envelope.profile,PROFILE);
  assert.equal(packet.envelope.author.role,'client');assert.equal(packet.envelope.recipients.length,1);
  assert.equal(packet.envelope.recipients[0].publicKey,f.clientPublicKey);
  assert.equal(sent.options.body.includes(body.title),false);assert.equal(sent.options.body.includes(f.unrelatedFirmPublicKey),false);
  for(const [scalar,pub] of [[f.unrelatedFirmPrivateKey,f.unrelatedFirmPublicKey],[f.signerPrivateKey,f.signerPublicKey]]){
    const wrong=await privateKey(scalar,pub);
    await assert.rejects(()=>openClientOnlyEnvelope(packet.envelope,packet.envelope.context,{clientPublicKey:f.clientPublicKey},'client',wrong));
  }
  const other=await VaultClient.create(f.config,f.config.uiOrigin,{storage:f.storage,fetcher:f.fetcher});
  await other.connect();await other.unlock(f.keyId);await other.sync();
  assert.deepEqual(JSON.parse(new TextDecoder().decode(other.records.get('synthetic-browser-record').plaintext)),body);
  const binding=f.storage.bindings.get(`${PROFILE}|${f.config.workspaceId}|${f.identity.accountId}`);
  assert.equal(binding.profile,PROFILE);assert.equal(binding.keyId,f.keyId);
});

test('legacy retries and acknowledgments are preserved outside the new profile and cannot be sent',async()=>{
  const f=await fixture(),oldId=`${f.config.workspaceId}|${f.identity.accountId}`;
  const old={id:oldId,keyId:f.keyId,minimumEpoch:50,versions:{'synthetic-retry':{revision:50,deleted:false}}};
  await f.storage.putBinding(old);
  const prepared=await f.vault.prepareSave('driver-record',encodeJson({title:'SYNTHETIC retry'}),'synthetic-retry');
  assert.equal(prepared.expectedRevision,0);assert.equal(prepared.scope.profile,PROFILE);
  const legacy=structuredClone(prepared);legacy.envelope.version=2;delete legacy.envelope.profile;
  legacy.envelope.recipients.push({...legacy.envelope.recipients[0],role:'firm-recovery',publicKey:f.unrelatedFirmPublicKey});
  const before=f.calls.length;
  await assert.rejects(()=>f.vault.savePrepared(legacy),/not client-only/);
  await assert.rejects(()=>f.vault.keepPendingUpload(legacy),/not client-only/);
  assert.equal(f.calls.length,before);assert.deepEqual(await f.storage.getBinding(oldId),old);
  await f.vault.keepPendingUpload(prepared);
  const ids=[...f.storage.bindings.keys()];assert.ok(ids.some(v=>v.startsWith(`portal-uploads:${PROFILE}|`)));
  await f.vault.savePrepared(prepared);assert.equal(f.rows.get(prepared.objectId).envelope.version,3);
});

test('a valid owner-signed replacement key and server privacy downgrade cannot replace the local client',async()=>{
  const f=await fixture(),replacement=await generateRecipientKeyPair();
  const request={...f.request,client:{keyId:await publicKeyId(replacement.publicKey),publicKey:replacement.publicKey}};
  const signer=await privateKey(f.signerPrivateKey,f.signerPublicKey,true);
  const manifest=await signClientOnlyEnrollment({publicPins:f.pins,signing:signer},request,{epoch:2});
  f.setStatus({profile:PROFILE,enrolled:true,identity:f.identity,manifest});
  await f.vault.connect();await assert.rejects(()=>f.vault.unlock(f.keyId));assert.equal(f.vault.canWrite,false);
  assert.equal(f.calls.some(v=>v.options.method==='PUT'),false);
  f.setStatus({profile:'firm-recovery-v1',enrolled:true,identity:f.identity,manifest:f.manifest});
  await assert.rejects(()=>f.vault.connect(),/cannot downgrade/);assert.equal(f.vault.identity,null);
});

test('client-only configuration and methods reject escrow before any request',async()=>{
  const f=await fixture(),before=f.calls.length;
  for(const config of [{...f.config,firmRecoveryPublicKey:f.unrelatedFirmPublicKey},{...f.config,profile:'firm-recovery-v1'},{...f.config,profile:undefined}])await assert.rejects(()=>validateTrustedConfig(config,f.config.uiOrigin));
  await assert.rejects(()=>f.vault.requestClientKeyRecovery(f.keyId),/no firm recovery/);
  await assert.rejects(()=>f.vault.completeClientKeyRecovery({},f.keyId),/no firm recovery/);
  await assert.rejects(()=>f.vault.recoverAccountPassword({}),/no firm recovery/);
  await assert.rejects(()=>f.vault.beginAuthenticatorRecovery({}),/no firm recovery/);
  await assert.rejects(()=>f.vault.openLegacyExport({},{}),/no firm recovery/);
  assert.equal(f.calls.length,before);
});

test('failed durable anchor storage never leaves an unlocked writable client',async()=>{
  const f=await fixture(),other=await VaultClient.create(f.config,f.config.uiOrigin,{storage:f.storage,fetcher:f.fetcher});
  await other.connect();f.storage.updateBinding=async()=>{throw new Error('Synthetic storage quota failure');};
  const before=f.calls.length;
  await assert.rejects(()=>other.unlock(f.keyId),/quota/);assert.equal(other.canWrite,false);assert.equal(other.unlocked,false);
  await assert.rejects(()=>other.save('driver-record',encodeJson({title:'SYNTHETIC blocked'}),'synthetic-no-anchor'));
  assert.equal(f.calls.length,before);
});

test('a stale second tab cannot forget a tombstone or dispatch a resurrection',async()=>{
  const f=await fixture();await f.vault.save('driver-record',encodeJson({title:'SYNTHETIC retained'}),'synthetic-two-tabs');
  const other=await VaultClient.create(f.config,f.config.uiOrigin,{storage:f.storage,fetcher:f.fetcher});
  await other.connect();await other.unlock(f.keyId);await other.sync();await other.remove('synthetic-two-tabs');
  const prepared=await f.vault.prepareSave('driver-record',encodeJson({title:'SYNTHETIC stale edit'}),'synthetic-two-tabs'),before=f.calls.length;
  await assert.rejects(()=>f.vault.savePrepared(prepared),/newer or deleted/);
  assert.equal(f.calls.length,before);assert.equal(f.vault.canWrite,false);
  const binding=await f.storage.getBinding(`${PROFILE}|${f.config.workspaceId}|${f.identity.accountId}`);
  assert.deepEqual(binding.versions['synthetic-two-tabs'],{revision:2,deleted:true});
});

test('another tab cannot regress a newer enrollment and a withheld full-feed item is detected',async()=>{
  const f=await fixture(),signer=await privateKey(f.signerPrivateKey,f.signerPublicKey,true);
  const manifest=await signClientOnlyEnrollment({publicPins:f.pins,signing:signer},f.request,{epoch:2});
  f.setStatus({profile:PROFILE,enrolled:true,identity:f.identity,manifest});
  const other=await VaultClient.create(f.config,f.config.uiOrigin,{storage:f.storage,fetcher:f.fetcher});
  await other.connect();await other.unlock(f.keyId);
  const before=f.calls.length;
  await assert.rejects(()=>f.vault.save('driver-record',encodeJson({title:'SYNTHETIC stale epoch'}),'synthetic-old-epoch'),/newer client-only enrollment/);
  assert.equal(f.calls.length,before);assert.equal(f.vault.canWrite,false);
  const missing=await VaultClient.create(f.config,f.config.uiOrigin,{storage:f.storage,fetcher:f.fetcher});
  await missing.connect();await missing.unlock(f.keyId);
  await other.save('driver-record',encodeJson({title:'SYNTHETIC known item'}),'synthetic-withheld');
  f.rows.delete('synthetic-withheld');
  await assert.rejects(()=>missing.sync(),/omitted a previously observed/);assert.equal(missing.canWrite,false);
});

test('an ambiguous successful same-key renewal is safe to retry after reconnect',async()=>{
  const f=await fixture(),signer=await privateKey(f.signerPrivateKey,f.signerPublicKey,true);
  const renewal=await f.vault.renewalRequest(f.keyId);
  assert.deepEqual(renewal.previous,f.vault.status.manifest);assert.equal(renewal.minimumEpoch,2);assert.deepEqual(renewal.request,f.request);
  const manifest=await signClientOnlyEnrollment({publicPins:f.pins,signing:signer},f.request,{epoch:2});f.loseRenewal();
  await assert.rejects(()=>f.vault.installEnrollmentRenewal({manifest},f.keyId),/lost renewal/);assert.equal(f.vault.canWrite,false);
  await f.vault.connect();assert.deepEqual(await f.vault.installEnrollmentRenewal({manifest},f.keyId),{renewed:true,staffSharingRefreshRequired:false});
  await f.vault.unlock(f.keyId);assert.equal(f.vault.canWrite,true);
  const binding=await f.storage.getBinding(`${PROFILE}|${f.config.workspaceId}|${f.identity.accountId}`);assert.equal(binding.minimumEpoch,2);
});

test('activation checks the existing local key anchor before any profile upload',async()=>{
  const f=await fixture(),signer=await privateKey(f.signerPrivateKey,f.signerPublicKey,true),accountId=crypto.randomUUID(),clientId=crypto.randomUUID();
  const original={...f.request,accountId,clientId},manifest=await signClientOnlyEnrollment({publicPins:f.pins,signing:signer},original);
  await f.storage.putBinding({id:`${PROFILE}|${f.config.workspaceId}|${accountId}`,profile:PROFILE,workspaceId:f.config.workspaceId,accountId,clientId,keyId:f.keyId,minimumEpoch:1,manifest,versions:{}});
  const replacement=await generateRecipientKeyPair(),keyId=await publicKeyId(replacement.publicKey);
  await f.storage.putKey({keyId,publicKey:replacement.publicKey,privateKey:replacement.privateKey});
  const changed=await signClientOnlyEnrollment({publicPins:f.pins,signing:signer},{...original,client:{keyId,publicKey:replacement.publicKey}});
  const invitation={version:2,profile:PROFILE,type:'gigtax-client-only-invitation',invitationId:crypto.randomUUID(),workspaceId:f.config.workspaceId,accountId,clientId,token:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()},before=f.calls.length;
  await assert.rejects(()=>f.vault.activateNewAccount({invitation,keyId,manifest:changed,password:'Synthetic account password only',profile:{legalName:'SYNTHETIC CLIENT',email:'',phone:'',mailingAddress:''}}),/already owns this local binding/);
  assert.equal(f.calls.length,before);assert.equal(f.vault.canWrite,false);
});

test('transport JSON property order cannot change the verified manifest identity',async()=>{
  const f=await fixture();
  const reordered=Object.fromEntries(Object.entries(f.manifest).reverse());
  reordered.signature=Object.fromEntries(Object.entries(reordered.signature).reverse());
  f.setStatus({profile:PROFILE,enrolled:true,identity:f.identity,manifest:reordered});
  await f.vault.connect();await f.vault.unlock(f.keyId);assert.equal(f.vault.canWrite,true);
});
