// Uses generated SYNTHETIC fixture keys only; never prints them or sends them to a host.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {openEnvelope,sealEnvelope,encode64,decode64} from './envelope.mjs';
const binary=process.argv[2];assert(binary?.startsWith('/private/tmp/'),'Supply the compiled synthetic CryptoKit proof binary.');
const call=(command,input)=>JSON.parse(execFileSync(binary,[command],{input:input?JSON.stringify(input):undefined,encoding:'utf8',maxBuffer:4*1024*1024}));
const native=call('self-test');assert(native.ok);
const fixture=call('fixture');
const trusted={clientPublicKey:fixture.clientPublicKey,firmRecoveryPublicKey:fixture.firmRecoveryPublicKey};
const checks=[];let authorPrivateKey;
for(const role of ['client','firm-recovery']){
 const raw=decode64(role==='client'?fixture.clientPrivateKey:fixture.firmRecoveryPrivateKey,32);
 const pub=decode64(role==='client'?fixture.clientPublicKey:fixture.firmRecoveryPublicKey,65);
 const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.subarray(1,33)),y:encode64(pub.subarray(33)),d:encode64(raw)},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);raw.fill(0);
 if(role==='client')authorPrivateKey=privateKey;
 const opened=await openEnvelope(fixture.envelope,fixture.context,trusted,role,privateKey);
 assert.equal(encode64(opened),fixture.plaintext);checks.push(`CryptoKit seals → WebCrypto opens for ${role}`);
}
const envelope=await sealEnvelope(decode64(fixture.plaintext,0,1024*1024),fixture.context,trusted,'client',authorPrivateKey);
for(const role of ['client','firm-recovery']){
 const result=call('open',{syntheticOnly:true,context:fixture.context,...trusted,privateKey:role==='client'?fixture.clientPrivateKey:fixture.firmRecoveryPrivateKey,role,envelope});
 assert(result.ok);assert.equal(result.plaintext,fixture.plaintext);checks.push(`WebCrypto seals → CryptoKit opens for ${role}`);
}
console.log(JSON.stringify({ok:true,verifiedAt:new Date().toISOString(),checks,nativeChecks:native.checks?.length??native.checkCount,scope:'Synthetic interoperability of actual CryptoKit HPKE/AES-GCM and WebCrypto @hpke/core 1.10.0; not deployed end-to-end encryption',realPrivateKeysUsed:false},null,2));
