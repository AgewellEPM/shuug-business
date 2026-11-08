import { encode64, decode64, publicKeyId } from '../envelope.mjs';

const utf8 = new TextEncoder(), ITERATIONS = 600000;
const fail = () => { throw new Error('The encrypted client-key backup or passphrase is invalid.'); };
const exact = (value, keys) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail(); };
function passphrase(value) { if (typeof value !== 'string' || value.length < 16 || value.length > 1024) throw new Error('Use a separate backup passphrase of 16 to 1,024 characters. Keep it outside this browser and do not reuse your account password.'); return value; }
async function wrappingKey(value, salt, usages) {
  const bytes = utf8.encode(passphrase(value));
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS}, material, {name:'AES-GCM',length:256}, false, usages);
  } finally { bytes.fill(0); }
}
const backupAAD = bundle => utf8.encode(JSON.stringify([1,'shuug-client-key-backup',bundle.keyId,bundle.publicKey]));
export function assertPrivateKey(key) {
  if (!key || key.type !== 'private' || key.extractable !== false || key.algorithm?.name !== 'ECDH' || key.algorithm?.namedCurve !== 'P-256' || key.usages.length !== 1 || key.usages[0] !== 'deriveBits') throw new Error('Only a nonextractable client agreement key can be saved in this browser.');
}
async function assertPair(privateKey, publicKey) {
  const pub = await crypto.subtle.importKey('raw', decode64(publicKey,65), {name:'ECDH',namedCurve:'P-256'}, false, []);
  const peer = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'}, false, ['deriveBits']);
  const first = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer.publicKey},privateKey,256));
  const second = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:pub},peer.privateKey,256));
  try { let difference=0; for(let i=0;i<32;i++) difference|=first[i]^second[i]; if(difference) fail(); }
  finally { first.fill(0); second.fill(0); }
}
export async function importEncryptedBackup(bundle, value) {
  exact(bundle,['version','type','keyId','publicKey','kdf','cipher']);
  exact(bundle.kdf,['name','hash','iterations','salt']); exact(bundle.cipher,['name','nonce','ciphertext']);
  if(bundle.version!==1 || bundle.type!=='shuug-client-key-backup' || bundle.kdf.name!=='PBKDF2' || bundle.kdf.hash!=='SHA-256' || bundle.kdf.iterations!==ITERATIONS || bundle.cipher.name!=='AES-256-GCM' || await publicKeyId(bundle.publicKey)!==bundle.keyId) fail();
  const salt=decode64(bundle.kdf.salt,16), nonce=decode64(bundle.cipher.nonce,12), wrapped=decode64(bundle.cipher.ciphertext,32,1024);
  const key=await wrappingKey(value,salt,['unwrapKey']);
  let privateKey;
  try { privateKey=await crypto.subtle.unwrapKey('pkcs8',wrapped,key,{name:'AES-GCM',iv:nonce,additionalData:backupAAD(bundle),tagLength:128},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']); }
  catch { fail(); }
  assertPrivateKey(privateKey); await assertPair(privateKey,bundle.publicKey);
  return {keyId:bundle.keyId,publicKey:bundle.publicKey,privateKey,backup:structuredClone(bundle)};
}
export async function createClientKey(value) {
  passphrase(value);
  // One transient extractable handle is wrapped directly by WebCrypto. No raw
  // private-key bytes enter application JS, a file, IndexedDB or the network.
  let temporary=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const publicKey=encode64(new Uint8Array(await crypto.subtle.exportKey('raw',temporary.publicKey)));
  const bundle={version:1,type:'shuug-client-key-backup',keyId:await publicKeyId(publicKey),publicKey,kdf:{name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:encode64(crypto.getRandomValues(new Uint8Array(16)))},cipher:{name:'AES-256-GCM',nonce:encode64(crypto.getRandomValues(new Uint8Array(12))),ciphertext:''}};
  try {
    const key=await wrappingKey(value,decode64(bundle.kdf.salt,16),['wrapKey']);
    bundle.cipher.ciphertext=encode64(new Uint8Array(await crypto.subtle.wrapKey('pkcs8',temporary.privateKey,key,{name:'AES-GCM',iv:decode64(bundle.cipher.nonce,12),additionalData:backupAAD(bundle),tagLength:128})));
  } finally { temporary=null; }
  return importEncryptedBackup(bundle,value);
}
export class BrowserKeyStore {
  #database; #name;
  constructor({databaseName='shuug-secure-tax-client-v1'}={}){
    if(!['shuug-secure-tax-client-v1','shuug-secure-tax-staff-v1'].includes(databaseName))throw new Error('Use a supported private browser key namespace.');
    this.#name=databaseName;
  }
  async #open() {
    if(this.#database) return this.#database;
    if(!globalThis.indexedDB) throw new Error('This browser cannot persist nonextractable keys. No key has been uploaded.');
    this.#database=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.#name,1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('keys',{keyPath:'keyId'});request.result.createObjectStore('bindings',{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Close other vault tabs before opening browser key storage.'));
    });
    return this.#database;
  }
  async #request(store,method,value) {
    const db=await this.#open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(store,method==='getAll'||method==='get'?'readonly':'readwrite');
      const request=transaction.objectStore(store)[method](value); let result;
      request.onsuccess=()=>{result=request.result;}; request.onerror=()=>reject(request.error);
      transaction.oncomplete=()=>resolve(result); transaction.onabort=()=>reject(transaction.error ?? new Error('Browser key storage did not complete.'));
    });
  }
  async putKey(entry) { assertPrivateKey(entry.privateKey); if(await publicKeyId(entry.publicKey)!==entry.keyId) fail(); await this.#request('keys','put',entry); }
  async getKey(keyId) { const entry=await this.#request('keys','get',keyId); if(entry) assertPrivateKey(entry.privateKey); return entry; }
  async listKeys() { return (await this.#request('keys','getAll')).map(({keyId,publicKey})=>({keyId,publicKey})); }
  async getBinding(id) { return this.#request('bindings','get',id); }
  async putBinding(value) { return this.#request('bindings','put',value); }
  /** One read/write transaction serializes the queue across browser tabs. The
   * updater is synchronous so IndexedDB cannot commit between its get and put. */
  async updateBinding(id,update) {
    const db=await this.#open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('bindings','readwrite'),store=transaction.objectStore('bindings'),request=store.get(id);let next,failure;
      request.onsuccess=()=>{
        try{next=update(request.result);if(!next||next.id!==id||typeof next.then==='function')throw new Error('Use a synchronous update for the same private browser binding.');store.put(next);}
        catch(error){failure=error;transaction.abort();}
      };
      request.onerror=()=>{failure=request.error;};
      transaction.oncomplete=()=>resolve(next);
      transaction.onabort=()=>reject(failure??transaction.error??new Error('The atomic private browser update did not complete.'));
    });
  }
}
