// Private historical content certificate; public access leases remain separate.
import {decode64,encode64,publicKeyId} from './envelope.mjs';
import {assertCaseBody,assertCaseTime,canonicalCaseJson,exactCaseObject} from './case-model.mjs';
import {isCaseObjectId} from './case-contract.mjs';
import {isOfficeBody,officeObjectId} from './office-model.mjs';
const utf8=new TextEncoder(),fail=()=>{throw new Error('The private case is missing a valid firm content certificate for this exact context.');};
const id=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};
function context(value){exactCaseObject(value,['workspaceId','accountId','clientId','objectId','revision','domain']);for(const key of ['workspaceId','accountId','clientId','objectId'])id(value[key]);if(!isCaseObjectId(value.objectId)||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>1e9||value.domain!=='tax-document')fail();return value;}
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const purpose=body=>isOfficeBody(body)?'shuug-private-client-office-certificate':'shuug-private-tax-case-certificate';
function canonical(body,certificate){
  return JSON.stringify([1,isOfficeBody(body)?'shuug/private-client-office-certificate':'shuug/private-tax-case-certificate',certificate.context.workspaceId,certificate.context.accountId,certificate.context.clientId,certificate.context.objectId,certificate.context.revision,certificate.context.domain,certificate.actor,certificate.issuedAt,canonicalCaseJson(body)]);
}
function checked(payload,expected,pins,now){
  exactCaseObject(payload,['version','type','body','certificate']);if(!isCasePayload(payload))fail();assertCaseBody(payload.body);context(expected);
  const certificate=payload.certificate;exactCaseObject(certificate,['version','type','context','actor','issuedAt','signature']);context(certificate.context);id(certificate.actor);assertCaseTime(certificate.issuedAt);
  if(payload.type!==(isOfficeBody(payload.body)?'client-office':'tax-case')||certificate.version!==1||certificate.type!==purpose(payload.body)||certificate.context.workspaceId!==pins.workspaceId||Object.keys(expected).some(key=>expected[key]!==certificate.context[key])||payload.body.history.length!==expected.revision||certificate.actor!==payload.body.history.at(-1).actor||!Number.isFinite(now)||Date.parse(certificate.issuedAt)>now+60000||Date.parse(payload.body.history.at(-1).at)>Date.parse(certificate.issuedAt)+60000)fail();
  exactCaseObject(certificate.signature,['algorithm','signerKeyId','value']);if(certificate.signature.algorithm!=='ES256-P1363')fail();decode64(certificate.signature.signerKeyId,32);decode64(certificate.signature.value,64);return certificate;
}
export const isCasePayload=value=>value?.version===1&&['tax-case','client-office'].includes(value?.type);
export async function signCasePayload(body,expected,unlocked,{actor,now=Date.now()}={}){
  assertCaseBody(body);context(expected);id(actor);if(!Number.isFinite(now)||expected.workspaceId!==unlocked.publicPins.workspaceId||body.history.length!==expected.revision||body.history.at(-1).actor!==actor)fail();
  if(isOfficeBody(body)!==(expected.objectId===await officeObjectId(expected)))fail();
  const copied=structuredClone(body),certificate={version:1,type:purpose(body),context:structuredClone(expected),actor,issuedAt:new Date(now).toISOString(),signature:{algorithm:'ES256-P1363',signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),value:''}};
  certificate.signature.value=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonical(copied,certificate)))));
  const payload={version:1,type:isOfficeBody(body)?'client-office':'tax-case',body:copied,certificate};await verifyCasePayload(payload,expected,unlocked.publicPins,now);return frozen(payload);
}
export async function verifyCasePayload(payload,expected,pins,now=Date.now()){
  // Snapshot caller-owned objects before awaiting crypto. Returned content must
  // be exactly what was verified even if another callback mutates its input.
  const selected=structuredClone(payload),binding=structuredClone(expected),selectedPins=structuredClone(pins),certificate=checked(selected,binding,selectedPins,now);if(certificate.signature.signerKeyId!==await publicKeyId(selectedPins.signerPublicKey))fail();
  if(isOfficeBody(selected.body)!==(binding.objectId===await officeObjectId(binding)))fail();
  const publicKey=await crypto.subtle.importKey('raw',decode64(selectedPins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,decode64(certificate.signature.value,64),utf8.encode(canonical(selected.body,certificate))))fail();
  return frozen(selected.body);
}
