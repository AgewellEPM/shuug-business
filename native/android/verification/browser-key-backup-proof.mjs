// Actual browser custody implementation may be selected for cross-repo qualification.
// The fallback uses standards-based WebCrypto only, never customer credentials.
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const passphrase='Synthetic browser backup 🔐 passphrase';
const actual=process.env.GIGTAX_BROWSER_CUSTODY_MODULE;
if(actual) {
  const {createClientKey}=await import(actual);
  const entry=await createClientKey(passphrase);
  process.stdout.write(JSON.stringify({syntheticOnly:true,passphrase,backup:entry.backup}));
} else {
  const encode=bytes=>Buffer.from(bytes).toString('base64url');
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const publicKey=encode(await crypto.subtle.exportKey('raw',pair.publicKey));
  const keyId=encode(await crypto.subtle.digest('SHA-256',Buffer.from(publicKey,'base64url')));
  const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt},material,{name:'AES-GCM',length:256},false,['wrapKey']);
  const ciphertext=encode(await crypto.subtle.wrapKey('pkcs8',pair.privateKey,key,{name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(JSON.stringify([1,'shuug-client-key-backup',keyId,publicKey])),tagLength:128}));
  process.stdout.write(JSON.stringify({syntheticOnly:true,passphrase,backup:{version:1,type:'shuug-client-key-backup',keyId,publicKey,kdf:{name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:encode(salt)},cipher:{name:'AES-256-GCM',nonce:encode(nonce),ciphertext}}}));
}
