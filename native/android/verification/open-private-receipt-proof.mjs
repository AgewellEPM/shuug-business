import assert from 'node:assert/strict';
const {openEnvelope,encode64,decode64}=await import(process.env.GIGTAX_ENVELOPE_MODULE??'../../../packages/secure-tax-client/envelope.mjs');
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const fixture=JSON.parse(Buffer.concat(chunks));assert.equal(fixture.syntheticOnly,true);
let opened;
for(const role of ['client','firm-recovery']) {
  const pub=decode64(role==='client'?fixture.clientPublicKey:fixture.firmRecoveryPublicKey,65);
  const raw=decode64(role==='client'?fixture.clientPrivateKey:fixture.firmRecoveryPrivateKey,32);
  const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.subarray(1,33)),y:encode64(pub.subarray(33)),d:encode64(raw)},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);raw.fill(0);
  const bytes=await openEnvelope(fixture.envelope,fixture.envelope.context,{clientPublicKey:fixture.clientPublicKey,firmRecoveryPublicKey:fixture.firmRecoveryPublicKey},role,privateKey);
  const payload=JSON.parse(new TextDecoder().decode(bytes));bytes.fill(0);
  if(opened)assert.deepEqual(payload,opened);opened=payload;
}
assert.equal(opened.type,'private-file');assert.equal(opened.purpose,'receipt');assert.equal(opened.mime,'application/pdf');
process.stdout.write(JSON.stringify({bothRecipientsOpened:true,payload:opened}));
