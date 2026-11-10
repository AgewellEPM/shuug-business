import {decode64,publicKeyId} from './envelope.mjs';
import {secureEnvelopeDigest,verifyStaffCapsuleSignature} from './staff-grants.mjs';
import {exactEditObject,assertReturnEditApproval,canonicalReturnEditApproval} from './return-edit-contract.mjs';
const fail=()=>{throw new Error('The selected file is not an exact firm-approved encrypted return correction. No private review kit was uploaded.');};
export async function verifyReturnEditApproval(packet,pins,now=Date.now()){
  exactEditObject(packet,['approval','envelope','capsule']);const a=assertReturnEditApproval(packet.approval),e=packet.envelope;
  if(a.workspaceId!==pins.workspaceId||a.signature.signerKeyId!==await publicKeyId(pins.signerPublicKey)||await secureEnvelopeDigest(e)!==a.newEnvelopeDigest||e.context.workspaceId!==a.workspaceId||e.context.accountId!==a.accountId||e.context.objectId!==a.objectId||e.context.domain!=='tax-document'||e.context.revision!==a.sourceRevision+1||e.author.role!=='firm-recovery'||e.author.keyId!==await publicKeyId(pins.firmRecoveryPublicKey)||e.recipients[1].publicKey!==pins.firmRecoveryPublicKey||Date.parse(a.issuedAt)>now+60000||Date.parse(a.expiresAt)<=now)fail();
  const key=await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode64(a.signature.value,64),new TextEncoder().encode(canonicalReturnEditApproval(a))))fail();
  await verifyStaffCapsuleSignature(packet.capsule,pins,now);const c=packet.capsule;if(c.grantId!==a.grantId||c.grantEpoch!==a.grantEpoch||c.grantDigest!==a.grantDigest||c.staffKeyId!==a.staffKeyId||c.manifestId!==a.manifestId||c.manifestEpoch!==a.manifestEpoch||c.envelopeDigest!==a.newEnvelopeDigest||['workspaceId','accountId','objectId','revision','domain'].some(key=>c.context[key]!==e.context[key]))fail();return packet;
}
