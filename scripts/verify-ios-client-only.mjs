// Synthetic-only, no real Keychain/account/UI/network. Existing installed tools
// and SDK are used; SwiftPM dependencies are the local DriverCore sources only.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cloud=path.resolve(process.argv[2]??'../GigTaxProsCloud-20261116');
const {createSyntheticClientOnlyFixture}=await import(pathToFileURL(path.join(cloud,'packages/secure-tax-client/client-only-interop-fixture.mjs')));
const {encode64,decode64}=await import(pathToFileURL(path.join(cloud,'packages/secure-tax-client/envelope.mjs')));
const f=await createSyntheticClientOnlyFixture();assert.equal(f.syntheticOnly,true);
const passphrase='SYNTHETIC ONLY · Unicode client 🔐 backup passphrase';
const pub=decode64(f.clientPublicKey,65),privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.subarray(1,33)),y:encode64(pub.subarray(33)),d:f.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
const wrapping=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['wrapKey']);
const aad=new TextEncoder().encode(JSON.stringify([1,'shuug-client-key-backup',f.manifest.client.keyId,f.clientPublicKey]));
const wrapped=await crypto.subtle.wrapKey('pkcs8',privateKey,wrapping,{name:'AES-GCM',iv:nonce,additionalData:aad,tagLength:128});
f.syntheticBackup={version:1,type:'shuug-client-key-backup',keyId:f.manifest.client.keyId,publicKey:f.clientPublicKey,kdf:{name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:encode64(salt)},cipher:{name:'AES-256-GCM',nonce:encode64(nonce),ciphertext:encode64(new Uint8Array(wrapped))}};
f.syntheticPassphrase=passphrase;
const work=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-client-only-ios-'));
try{
  const core=path.join(root,'native/ios/RideshareTaxPros/DriverCore');
  execFileSync('swift',['build','--package-path',core,'--scratch-path',path.join(work,'core')],{stdio:'pipe',maxBuffer:4*1024*1024});
  const bin=execFileSync('swift',['build','--package-path',core,'--scratch-path',path.join(work,'core'),'--show-bin-path'],{encoding:'utf8'}).trim();
  const objects=(await import('node:fs')).readdirSync(path.join(bin,'DriverCore.build')).filter(f=>f.endsWith('.swift.o')).map(f=>path.join(bin,'DriverCore.build',f));
  const app=path.join(root,'native/ios/RideshareTaxPros/App'),source=['SecureTaxEnvelope','SecureTaxManifest','SecureTaxDeviceKeys','SecureTaxEnrollmentClient','SecureTaxJournalSnapshot','SecureTaxSnapshotCheckpoint','SecureTaxObjectClient','SecureTaxTransportPolicy','PrivateTaxProtocol','PrivateTaxBackup','PrivateTaxHTTP','PrivateTaxSync','PrivateTaxSocialAuthorization'].map(f=>path.join(app,f+'.swift'));
  const executable=path.join(work,'proof');
  execFileSync('xcrun',['swiftc','-target','arm64-apple-macos14.0','-parse-as-library','-I',path.join(bin,'Modules'),...source,path.join(root,'scripts/native-client-only-ios-proof.swift'),...objects,'-o',executable],{stdio:'pipe',maxBuffer:4*1024*1024});
  const result=JSON.parse(execFileSync(executable,[],{input:JSON.stringify(f),encoding:'utf8',maxBuffer:4*1024*1024}));assert.equal(result.ok,true);
  const input={syntheticOnly:true,context:f.context,clientPublicKey:f.clientPublicKey,clientPrivateKey:f.clientPrivateKey,envelope:result.envelope};
  const opened=JSON.parse(execFileSync(process.execPath,[path.join(cloud,'packages/secure-tax-client/client-only-interop.mjs'),'open'],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:1024*1024}));assert.equal(opened.plaintext,f.plaintext);
  const publicPins=JSON.parse(readFileSync(path.join(root,'native/ios/RideshareTaxPros/Resources/SecureTaxTrustedPins.json'),'utf8'));
  const publicConfig=JSON.parse(readFileSync(path.join(cloud,'deployments/rideshare-tax-pros/secure-portal/browser-public.json'),'utf8'));
  assert.deepEqual(Object.keys(publicPins).sort(),['version','profile','workspaceOrigin','workspaceId','signerPublicKey'].sort());assert.equal(publicPins.version,2);assert.equal(publicPins.profile,'client-only-v1');assert.equal(publicPins.workspaceOrigin,publicConfig.apiOrigin);assert.equal(publicPins.workspaceId,publicConfig.workspaceId);assert.equal(publicPins.signerPublicKey,publicConfig.signerPublicKey);
  console.log(JSON.stringify({ok:true,syntheticOnly:true,realPrivateKeysUsed:false,checks:[...result.checks,'CryptoKit v3 ciphertext decrypted by actual JS client','packaged public pins whitelist matches approved public config'],checkCount:result.checks.length+2,scope:'Local interoperability/security evidence; no device, deployed sync or visual acceptance'},null,2));
}finally{rmSync(work,{recursive:true,force:true});}
