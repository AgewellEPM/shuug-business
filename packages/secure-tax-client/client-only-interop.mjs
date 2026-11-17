// SYNTHETIC ONLY: machine interface for native crypto compatibility checks.
// Callers capture stdout in their test process; never use production keys here.
import {readFileSync} from 'node:fs';
import {decode64,encode64} from './envelope.mjs';
import {sealClientOnlyEnvelope,openClientOnlyEnvelope} from './client-only.mjs';
import {createSyntheticClientOnlyFixture} from './client-only-interop-fixture.mjs';

const mode=process.argv[2];
if(mode==='fixture'){
  process.stdout.write(JSON.stringify(await createSyntheticClientOnlyFixture()));
}else{
  const bytes=readFileSync(0);
  if(bytes.length>1024*1024)throw new Error('Synthetic input exceeds its test limit.');
  const input=JSON.parse(bytes.toString('utf8'));
  if(input.syntheticOnly!==true||input.context?.workspaceId!=='synthetic-client-only-workspace'||!String(input.context?.accountId).startsWith('synthetic-')||!String(input.context?.objectId).startsWith('synthetic-'))throw new Error('Only disposable synthetic contexts are supported.');
  const publicBytes=decode64(input.clientPublicKey,65),privateBytes=decode64(input.clientPrivateKey,32);
  let privateKey;
  try{
    privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(publicBytes.slice(1,33)),y:encode64(publicBytes.slice(33)),d:encode64(privateBytes)}, {name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  }finally{privateBytes.fill(0);}
  const trusted={clientPublicKey:input.clientPublicKey};
  if(mode==='open'){
    const plaintext=await openClientOnlyEnvelope(input.envelope,input.context,trusted,'client',privateKey);
    try{process.stdout.write(JSON.stringify({syntheticOnly:true,plaintext:encode64(plaintext)}));}finally{plaintext.fill(0);}
  }else if(mode==='seal'){
    const plaintext=decode64(input.plaintext,1,65536);
    try{process.stdout.write(JSON.stringify({syntheticOnly:true,envelope:await sealClientOnlyEnvelope(plaintext,input.context,trusted,'client',privateKey)}));}finally{plaintext.fill(0);}
  }else throw new Error('Use fixture, open or seal.');
}
