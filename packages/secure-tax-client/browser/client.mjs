import { DOMAINS, MAX_CIPHERTEXT_BYTES, openEnvelope, sealEnvelope, validateContext, verifyEnrollmentManifest } from '../envelope.mjs';
import { BrowserKeyStore, assertPrivateKey, createClientKey, importEncryptedBackup } from './custody.mjs';
import { validateTrustedConfig } from './config.mjs';

const prefix='/api/website/customer/secure', encoder=new TextEncoder();
const validId=value=>typeof value==='string' && value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===value;
const integer=(value,min=1,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const stale=()=>{throw new Error('The connection changed. Unlock the current account again.');};
const clone=value=>structuredClone(value);
const ownVersion=(versions,id)=>Object.hasOwn(versions,id)?versions[id]:undefined;
const validReceipt=value=>value && validId(value.objectId) && integer(value.revision,1,1e9+1) && integer(value.sequence) && typeof value.deleted==='boolean';
async function responseJson(response,maximum,allowChallenge=false) {
  if(!response.ok&&!(allowChallenge&&response.status===428)) throw new Error(response.status===401||response.status===403?'Sign-in verification failed. Check your code or sign in again.':'The ciphertext API rejected this request. Refresh before retrying.');
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('The ciphertext API did not return JSON.');
  const declared=Number(response.headers.get('content-length'));
  if(declared>maximum) throw new Error('The ciphertext response is too large.');
  if(!response.body) throw new Error('The ciphertext API returned an empty response.');
  const reader=response.body.getReader(), chunks=[]; let length=0;
  try { for(;;) { const {done,value}=await reader.read(); if(done)break; length+=value.byteLength; if(length>maximum) throw new Error('The ciphertext response is too large.'); chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const bytes=new Uint8Array(length); let offset=0; for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('The ciphertext API returned invalid JSON.');}
}

// Only public routing/revision metadata and nonextractable key handles persist.
// Decrypted records exist in this controller's memory until lock/account change.
export class VaultClient {
  #config; #storage; #fetch; #generation=0; #key; #verified; #binding; #cursor=0; #busy=false; #token; #expiresAt; #mfa=null;
  status=null; identity=null; records=new Map();
  static async create(config,origin,options={}) {
    return new VaultClient(await validateTrustedConfig(config,origin),options);
  }
  constructor(config,{storage=new BrowserKeyStore(),fetcher=globalThis.fetch}={}) { this.#config=config;this.#storage=storage;this.#fetch=fetcher; }
  get config(){return this.#config;}
  get unlocked(){return !!this.#key;}
  get enrolled(){return this.status?.enrolled===true;}
  get keyId(){return this.#key?.keyId;}
  get canWrite(){return this.enrolled && !!this.#verified && !!this.#key;}
  get pendingMfa(){return this.#mfa?clone(this.#mfa):null;}
  #same(generation){if(generation!==this.#generation)stale();}
  #bindingId(){return `${this.#config.workspaceId}|${this.identity.accountId}`;}
  #reset(){this.#generation++;this.#mfa=null;this.#key=null;this.#verified=null;this.#binding=null;this.#cursor=0;for(const item of this.records.values())item.plaintext.fill(0);this.records.clear();}
  lock(){this.#reset();}
  async #request(path,method='GET',body,maximum=64*1024,allowChallenge=false){
    const generation=this.#generation;
    if(this.#token&&this.#expiresAt<=Date.now()){this.#token=null;this.#reset();this.identity=null;this.status=null;throw new Error('Your API session expired. Sign in again.');}
    const response=await this.#fetch(`${this.#config.apiOrigin}${prefix}${path}`,{method,credentials:this.#token?'omit':'include',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.#token?{Authorization:`Bearer ${this.#token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if((response.status===401||response.status===403)&&generation===this.#generation&&!allowChallenge){this.#token=null;this.#reset();this.identity=null;this.status=null;}
    return responseJson(response,maximum,allowChallenge);
  }
  async signIn(email,password){
    this.#token=null;this.#expiresAt=null;this.#reset();this.status=null;this.identity=null;const generation=this.#generation;
    if(typeof email!=='string'||email.length>160||typeof password!=='string'||password.length>200)throw new Error('Enter the invited account email and password.');
    const session=await this.#request('/session','POST',{email,password},8192,true);this.#same(generation);
    if(session?.mfaRequired===true){
      if(session.apiVersion!==1||typeof session.challengeToken!=='string'||!/^[a-f0-9]{64}$/.test(session.challengeToken)||typeof session.enrollmentRequired!=='boolean'||!Number.isFinite(Date.parse(session.expiresAt))||Date.parse(session.expiresAt)<=Date.now()||Date.parse(session.expiresAt)>Date.now()+6*60000||session.enrollmentRequired&&!/^[A-Z2-7]{32}$/.test(session.secret))throw new Error('The API did not return valid sign-in verification.');
      this.#mfa={challengeToken:session.challengeToken,enrollmentRequired:session.enrollmentRequired,expiresAt:session.expiresAt,secret:session.enrollmentRequired?session.secret:null};
      return {mfaRequired:true};
    }
    return this.#acceptSession(session,generation);
  }
  async verifySignIn(code){
    if(!this.#mfa||Date.parse(this.#mfa.expiresAt)<=Date.now()){this.#mfa=null;throw new Error('Verification expired. Sign in with your password again.');}
    if(typeof code!=='string'||!code.trim()||code.length>40)throw new Error('Enter your authenticator or unused recovery code.');
    const generation=this.#generation,session=await this.#request('/session','POST',{challengeToken:this.#mfa.challengeToken,code:code.trim()},8192,true);this.#same(generation);
    return this.#acceptSession(session,generation);
  }
  async #acceptSession(session,generation){
    if(session?.apiVersion!==1||typeof session.token!=='string'||session.token.length<16||session.token.length>4096||session.token.match(/^[A-Za-z0-9._~-]+$/)?.[0]!==session.token||!validId(session.identity?.accountId)||!validId(session.identity?.clientId)||!Number.isFinite(Date.parse(session.expiresAt))||Date.parse(session.expiresAt)<=Date.now())throw new Error('The API did not return a valid private session.');
    this.#token=session.token;this.#expiresAt=Date.parse(session.expiresAt);
    try{const status=await this.connect();if(status.identity.accountId!==session.identity.accountId||status.identity.clientId!==session.identity.clientId)throw new Error('The authenticated identity changed during sign-in.');
      const recoveryCodes=session.recoveryCodes??[];if(!Array.isArray(recoveryCodes)||recoveryCodes.length>10||recoveryCodes.some(code=>typeof code!=='string'||!/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/.test(code)))throw new Error('The API returned invalid recovery codes.');
      return {...status,recoveryCodes};}
    catch(error){await this.signOut().catch(()=>{});throw error;}
  }
  async signOut(){
    const pending=this.#request('/session','DELETE');this.#token=null;this.#expiresAt=null;this.#reset();this.status=null;this.identity=null;
    try{await pending;}catch{throw new Error('Local session cleared. The API could not confirm revocation; use the account portal to revoke remaining sessions.');}
  }
  async connect(){
    this.#reset();this.status=null;this.identity=null;const generation=this.#generation;
    const status=await this.#request('/status');this.#same(generation);
    if(!status || typeof status.enrolled!=='boolean' || !validId(status.identity?.accountId) || !validId(status.identity?.clientId)) throw new Error('The API did not provide a usable authenticated account binding.');
    this.identity={accountId:status.identity.accountId,clientId:status.identity.clientId};this.status=status;
    return status;
  }
  async keys(){return this.#storage.listKeys();}
  async createKey(passphrase){
    const entry=await createClientKey(passphrase);await this.#storage.putKey(entry);
    return {keyId:entry.keyId,publicKey:entry.publicKey,backup:clone(entry.backup)};
  }
  async importKey(bundle,passphrase){
    const entry=await importEncryptedBackup(bundle,passphrase);await this.#storage.putKey(entry);
    return {keyId:entry.keyId,publicKey:entry.publicKey};
  }
  async encryptedBackup(keyId){
    const entry=await this.#storage.getKey(keyId);if(!entry?.backup)throw new Error('This browser has no encrypted backup for that key.');
    return clone(entry.backup);
  }
  async #verify(manifest,binding,key){
    const verified=await verifyEnrollmentManifest(manifest,{...this.identity,minimumEpoch:binding?.minimumEpoch??1},this.#config);
    if(manifest.client.keyId!==key.keyId || manifest.client.publicKey!==key.publicKey) throw new Error('The signed manifest is for a different client key.');
    if(binding?.minimumEpoch===manifest.epoch && binding.manifest && JSON.stringify(binding.manifest)!==JSON.stringify(manifest)) throw new Error('A different manifest reused the locally recorded epoch. Obtain a newer signed manifest.');
    return verified;
  }
  async unlock(keyId){
    if(!this.identity)throw new Error('Connect the signed-in API account first.');
    this.#reset();const generation=this.#generation, entry=await this.#storage.getKey(keyId);this.#same(generation);
    if(!entry)throw new Error('Import the encrypted backup for this account, or create a client key for setup.');
    assertPrivateKey(entry.privateKey);
    const binding=await this.#storage.getBinding(this.#bindingId());this.#same(generation);
    if(binding && (binding.keyId!==entry.keyId || binding.clientId!==this.identity.clientId || binding.workspaceId!==this.#config.workspaceId || binding.accountId!==this.identity.accountId)) throw new Error('The local key binding differs from this account. Use the original key and contact the firm for a reviewed migration.');
    let verified=null;
    if(this.enrolled){verified=await this.#verify(this.status.manifest,binding,entry);this.#same(generation);}
    this.#key=entry;this.#verified=verified;this.#binding=binding??{id:this.#bindingId(),workspaceId:this.#config.workspaceId,...this.identity,keyId:entry.keyId,minimumEpoch:0,versions:{}};
    if(verified){this.#binding={...this.#binding,minimumEpoch:verified.epoch,manifest:clone(this.status.manifest)};await this.#storage.putBinding(this.#binding);this.#same(generation);}
    return {keyId:entry.keyId,publicKey:entry.publicKey,enrolled:this.enrolled};
  }
  publicRequest(){
    if(!this.#key||!this.identity)throw new Error('Connect and unlock a client key first.');
    return {version:1,workspaceId:this.#config.workspaceId,...this.identity,client:{keyId:this.#key.keyId,publicKey:this.#key.publicKey}};
  }
  async stageManifest(manifest){
    if(!this.#key||!this.identity)throw new Error('Connect and unlock a client key first.');
    const generation=this.#generation, verified=await this.#verify(manifest,this.#binding,this.#key);this.#same(generation);
    const binding={...this.#binding,minimumEpoch:verified.epoch,manifest:clone(manifest)};
    await this.#storage.putBinding(binding);this.#same(generation);this.#binding=binding;
    // Staging does not change API enrollment or enable writes for an unenrolled account.
    return {manifestId:verified.manifestId,epoch:verified.epoch,activationAvailable:false};
  }
  #guard(){
    if(!this.canWrite)throw new Error('Encrypted sync is available only for a previously enrolled account with its verified client key. New activation is unavailable until the migration workflow is ready.');
    if(Date.parse(this.status.manifest.expiresAt)<=Date.now())throw new Error('The signed manifest expired. Obtain a renewed manifest before continuing.');
    return this.#generation;
  }
  async #exclusive(operation){
    if(this.#busy)throw new Error('Wait for the current ciphertext operation to finish.');this.#busy=true;
    try{return await operation();}finally{this.#busy=false;}
  }
  #context(objectId,revision,domain){return {workspaceId:this.#config.workspaceId,accountId:this.identity.accountId,objectId,revision,domain};}
  async #remember(versions,generation){
    const binding={...this.#binding,versions};await this.#storage.putBinding(binding);this.#same(generation);this.#binding=binding;
  }
  async sync(){return this.#exclusive(async()=>{
    const generation=this.#guard(), records=new Map(this.records), versions=clone(this.#binding.versions??{}), seen=new Set(),opened=[];let committed=false;
    try{
    let cursor=this.#cursor, pages=0, full=cursor===0, more;
    do{
      if(++pages>1001)throw new Error('This sync exceeds the supported item limit.');
      const page=await this.#request(`/objects?after=${cursor}&limit=100`);this.#same(generation);
      if(!Array.isArray(page.changes)||page.changes.length>100||!integer(page.cursor,0)||page.cursor<cursor||typeof page.hasMore!=='boolean')throw new Error('Invalid ciphertext change feed.');
      let previousSequence=cursor;
      for(const change of page.changes){
        if(!validReceipt(change)||change.sequence<=previousSequence||change.sequence>page.cursor||seen.has(change.objectId))throw new Error('Invalid ciphertext revision order.');
        previousSequence=change.sequence;seen.add(change.objectId);
        const prior=ownVersion(versions,change.objectId);
        if(prior && (change.revision<prior.revision || (prior.deleted&&!change.deleted)))throw new Error('The API returned an older or resurrected item.');
        if(change.deleted){records.delete(change.objectId);versions[change.objectId]={revision:change.revision,deleted:true};continue;}
        const item=await this.#request(`/objects/${encodeURIComponent(change.objectId)}`,'GET',undefined,24*1024*1024);this.#same(generation);
        if(!validReceipt(item)||item.objectId!==change.objectId||item.revision<change.revision||item.sequence<change.sequence)throw new Error('The ciphertext item does not match its change record.');
        if(item.deleted){records.delete(item.objectId);versions[item.objectId]={revision:item.revision,deleted:true};continue;}
        const context=this.#context(item.objectId,item.revision,item.envelope?.context?.domain);validateContext(context);
        const plaintext=await openEnvelope(item.envelope,context,this.#verified.recipients,'client',this.#key.privateKey);opened.push(plaintext);this.#same(generation);
        records.set(item.objectId,{objectId:item.objectId,revision:item.revision,domain:context.domain,plaintext});
        versions[item.objectId]={revision:item.revision,deleted:false};
      }
      if(page.changes.length && page.cursor!==previousSequence)throw new Error('The change cursor skipped an item.');
      if(page.hasMore&&page.cursor===cursor)throw new Error('The change cursor did not advance.');
      cursor=page.cursor;more=page.hasMore;
    }while(more);
    if(full)for(const id of Object.keys(this.#binding.versions??{}))if(!seen.has(id))throw new Error('A previously recorded item or tombstone is missing from the API.');
    if(Object.keys(versions).length>100000)throw new Error('The account exceeds the supported revision-history limit.');
    if(records.size>10000||[...records.values()].reduce((sum,item)=>sum+item.plaintext.length,0)>64*1024*1024)throw new Error('This browser view is limited to 10,000 items and 64 MiB of opened content. Larger accounts need a paged client before use.');
    await this.#remember(versions,generation);this.#same(generation);
    for(const [id,item] of this.records)if(records.get(id)!==item)item.plaintext.fill(0);
    this.records=records;this.#cursor=cursor;committed=true;
    return {items:records.size,cursor};
    }finally{if(!committed)for(const bytes of opened)bytes.fill(0);}
  });}
  async save(domain,plaintext,objectId=crypto.randomUUID()){return this.#exclusive(async()=>{
    const generation=this.#guard();
    if(!DOMAINS.includes(domain)||!(plaintext instanceof Uint8Array)||plaintext.length>MAX_CIPHERTEXT_BYTES-16||!validId(objectId))throw new Error('Choose a supported domain and a bounded encrypted payload.');
    const prior=ownVersion(this.#binding.versions??{},objectId), current=this.records.get(objectId);
    if(this.records.size+(current?0:1)>10000||[...this.records.values()].reduce((sum,item)=>sum+item.plaintext.length,0)-(current?.plaintext.length??0)+plaintext.length>64*1024*1024)throw new Error('This browser preview is limited to 10,000 opened items and 64 MiB.');
    if(prior?.deleted)throw new Error('Deleted items cannot be resurrected. Create a new item.');
    if(prior&&!current)throw new Error('Sync this item before editing it.');
    if(current&&current.domain!==domain)throw new Error('An existing item keeps its encrypted domain.');
    const expectedRevision=prior?.revision??0, context=this.#context(objectId,expectedRevision+1,domain);
    const envelope=await sealEnvelope(plaintext,context,this.#verified.recipients,'client',this.#key.privateKey);this.#same(generation);
    const receipt=await this.#request(`/objects/${encodeURIComponent(objectId)}`,'PUT',{mutationId:crypto.randomUUID(),expectedRevision,envelope});this.#same(generation);
    if(!validReceipt(receipt)||receipt.objectId!==objectId||receipt.revision!==context.revision||receipt.deleted)throw new Error('The API did not confirm the expected encrypted revision. Refresh before retrying.');
    await this.#remember({...this.#binding.versions,[objectId]:{revision:receipt.revision,deleted:false}},generation);
    this.records.set(objectId,{objectId,revision:receipt.revision,domain,plaintext:plaintext.slice()});return receipt;
  });}
  async remove(objectId){return this.#exclusive(async()=>{
    const generation=this.#guard(), item=this.records.get(objectId);if(!item)throw new Error('Sync the item before deleting it.');
    const receipt=await this.#request(`/objects/${encodeURIComponent(objectId)}`,'DELETE',{expectedRevision:item.revision});this.#same(generation);
    if(!validReceipt(receipt)||receipt.objectId!==objectId||receipt.revision!==item.revision+1||!receipt.deleted)throw new Error('The API did not confirm the deletion. Refresh before retrying.');
    await this.#remember({...this.#binding.versions,[objectId]:{revision:receipt.revision,deleted:true}},generation);
    item.plaintext.fill(0);this.records.delete(objectId);return receipt;
  });}
}
export const encodeJson=value=>encoder.encode(JSON.stringify(value));
