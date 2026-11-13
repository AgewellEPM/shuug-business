// Separate firm environment only. Every original is authenticated before re-encryption.
import {encode64,publicKeyId,openEnvelope,sealEnvelope} from './envelope.mjs';
import {signEnrollmentRequest} from './firm-recovery.mjs';
import {verifyClientKeyRecoveryRequest,canonicalClientKeyRecovery,recoveryEnvelopeDigest,verifyClientKeyRecoveryApproval,verifyRecoveredEnvelope} from './key-recovery.mjs';
export async function recoverClientEncryptionKey(snapshot,unlocked,{identityAndKeyReviewed=false,now=Date.now()}={}){
 if(identityAndKeyReviewed!==true)throw new Error('Review the client identity, replacement-key fingerprint and complete encrypted snapshot on the separate firm device.');
 if(!snapshot||Object.keys(snapshot).sort().join('|')!=='envelopes|request'||!Array.isArray(snapshot.envelopes))throw new Error('Select a complete recovery snapshot.');
 const request=structuredClone(snapshot.request),envelopes=structuredClone(snapshot.envelopes);await verifyClientKeyRecoveryRequest(request,unlocked.publicPins,{},now);
 if(envelopes.length!==request.entries.length)throw new Error('Recovery requires every current encrypted object.');
 const prior=request.previous,manifest=await signEnrollmentRequest({version:1,workspaceId:prior.workspaceId,accountId:prior.accountId,clientId:prior.clientId,client:request.client},unlocked,{epoch:prior.epoch+1,now}),objects=[],entries=[];
 for(let i=0;i<envelopes.length;i++){
  const envelope=envelopes[i],e=request.entries[i],context={workspaceId:prior.workspaceId,accountId:prior.accountId,objectId:e.objectId,revision:e.revision,domain:e.domain};
  if(await recoveryEnvelopeDigest(envelope)!==e.envelopeDigest)throw new Error('The original ciphertext changed after the reviewed recovery request.');
  const bytes=await openEnvelope(envelope,context,{clientPublicKey:prior.client.publicKey,firmRecoveryPublicKey:prior.firmRecovery.publicKey},'firm-recovery',unlocked.recovery);
  try{const next=await sealEnvelope(bytes,context,{clientPublicKey:manifest.client.publicKey,firmRecoveryPublicKey:manifest.firmRecovery.publicKey},'firm-recovery',unlocked.recovery);objects.push(next);entries.push({objectId:e.objectId,envelopeDigest:await recoveryEnvelopeDigest(next)});}finally{bytes.fill(0);}
 }
 const approval={version:1,type:'shuug-approved-client-key-recovery',request,manifest,entries,issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+4*3600000,Date.parse(request.expiresAt))).toISOString()};
 approval.signature={algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,new TextEncoder().encode(canonicalClientKeyRecovery(approval)))))};
 await verifyClientKeyRecoveryApproval(approval,unlocked.publicPins,{},now);for(let i=0;i<objects.length;i++)await verifyRecoveredEnvelope(objects[i],approval,i);
 return {approval,envelopes:objects};
}
