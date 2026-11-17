// SYNTHETIC INTEROPERABILITY ONLY. Every key is freshly generated disposable
// test material. This module never opens production bundles, backups or files.
import {encode64,publicKeyId} from './envelope.mjs';
import {PROFILE,sealClientOnlyEnvelope} from './client-only.mjs';
import {signClientOnlyEnrollment} from './client-only-signing.mjs';
import {sealClientOnlyActivationChallenge,openClientOnlyActivationChallenge} from './client-only-activation-proof.mjs';

export async function createSyntheticClientOnlyFixture(){
  const now=Date.now(),client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const unrelatedFirm=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const exported=async pair=>({publicKey:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),privateKey:(await crypto.subtle.exportKey('jwk',pair.privateKey)).d});
  const c=await exported(client),firm=await exported(unrelatedFirm),owner=await exported(signer);
  const pins={version:2,profile:PROFILE,workspaceId:'synthetic-client-only-workspace',signerPublicKey:owner.publicKey};
  const request={version:2,profile:PROFILE,workspaceId:pins.workspaceId,accountId:'synthetic-account',clientId:'synthetic-client',client:{keyId:await publicKeyId(c.publicKey),publicKey:c.publicKey}};
  const manifest=await signClientOnlyEnrollment({publicPins:pins,signing:signer.privateKey},request,{now,validForMs:30*86400000});
  const context={workspaceId:pins.workspaceId,accountId:request.accountId,objectId:'synthetic-tax-object',revision:1,domain:'tax-identity'};
  const expected={accountId:request.accountId,clientId:request.clientId,minimumEpoch:1,clientPublicKey:c.publicKey};
  const plaintext=new TextEncoder().encode('SYNTHETIC ONLY: disposable client-only interoperability record.');
  const envelope=await sealClientOnlyEnvelope(plaintext,context,{clientPublicKey:c.publicKey},'client',client.privateKey);
  const proof=await sealClientOnlyActivationChallenge(manifest,{challengeId:crypto.randomUUID(),expiresAt:new Date(now+300000).toISOString()});
  const activationAnswer=await openClientOnlyActivationChallenge(proof.challenge,manifest,expected,pins,client.privateKey,now);
  return {syntheticOnly:true,fixtureType:'SYNTHETIC client-only-v1 interoperability; private values are disposable random test keys',generatedAt:new Date(now).toISOString(),profile:PROFILE,pins,nativePins:{version:2,profile:PROFILE,workspaceOrigin:'https://synthetic-api.example',workspaceId:pins.workspaceId,signerPublicKey:pins.signerPublicKey},expected,request,manifest,context,clientPublicKey:c.publicKey,clientPrivateKey:c.privateKey,unrelatedFirmPublicKey:firm.publicKey,unrelatedFirmPrivateKey:firm.privateKey,signerPublicKey:owner.publicKey,signerPrivateKey:owner.privateKey,plaintext:encode64(plaintext),envelope,activationChallenge:proof.challenge,activationAnswer,activationAnswerDigest:proof.answerDigest};
}

// Generate an exclusive fixture file for Kotlin/Swift interoperability runners.
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
  const output=process.argv[2];
  if(!output)throw new Error('Supply a NEW synthetic fixture output path. No production keys are read.');
  const fixture=await createSyntheticClientOnlyFixture();
  await (await import('node:fs/promises')).writeFile(output,JSON.stringify(fixture,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({syntheticOnly:true,output,profile:PROFILE,realPrivateKeysUsed:false}));
}
