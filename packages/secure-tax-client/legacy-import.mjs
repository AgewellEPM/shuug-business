// Shared signed preparation receipt. Contains no legacy names, IDs or file bytes.
import {decode64,encode64,publicKeyId} from './envelope.mjs';
const utf8=new TextEncoder();
export const legacySha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
const fail=()=>{throw new Error('The selected migration files do not match the firm-signed preparation.');};
export function canonicalLegacyImportSignature(value){
  if(!value||Object.keys(value).sort().join('|')!==['version','type','reportSha256','signerKeyId','signature'].sort().join('|')||value.version!==1||value.type!=='shuug-legacy-import-preparation'||!/^[a-f0-9]{64}$/.test(value.reportSha256))fail();
  decode64(value.signerKeyId,32);if(value.signature!=='')decode64(value.signature,64);
  return JSON.stringify([1,value.type,value.reportSha256,value.signerKeyId]);
}
export async function signLegacyImportReport(bytes,unlocked){
  const value={version:1,type:'shuug-legacy-import-preparation',reportSha256:await legacySha256(bytes),signerKeyId:await publicKeyId(unlocked.publicPins.signerPublicKey),signature:''};
  value.signature=encode64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.signing,utf8.encode(canonicalLegacyImportSignature(value)))));return value;
}
export async function verifyLegacyImportReport(bytes,signature,pins,scope){
  const canonical=canonicalLegacyImportSignature(signature);
  if(signature.reportSha256!==await legacySha256(bytes)||signature.signerKeyId!==await publicKeyId(pins.signerPublicKey))fail();
  const key=await crypto.subtle.importKey('raw',decode64(pins.signerPublicKey,65),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode64(signature.signature,64),utf8.encode(canonical)))fail();
  const report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),manifest=report.recipientManifest;
  if(report.version!==1||report.kind!=='shuug-legacy-encrypted-preparation'||!manifest||['workspaceId','accountId','clientId'].some(key=>manifest[key]!==scope[key])||manifest.client?.keyId!==scope.keyId||!/^[a-f0-9]{64}$/.test(report.backupManifestSha256)||!Array.isArray(report.entries)||!report.entries.length||report.entries.length>10000||report.sourceBackupVerified!==true||report.disposableSqliteRestoreVerified!==true||report.firmRecoveryVerified!==true||report.sourcePurged!==false)fail();
  const ids=new Set(),counts={'driver-record':0,'driver-receipt':0,'tax-document':0,'client-book':0};let total=0;
  for(const entry of report.entries){
    const book=entry?.sourceType==='client-book',fields=['objectId','revision','domain','envelopeBytes','sha256',...(book?['sourceType','sourceSha256']:[])];
    if(!entry||Object.keys(entry).sort().join('|')!==fields.sort().join('|')||!/^[0-9a-f-]{36}$/.test(entry.objectId)||ids.has(entry.objectId)||entry.revision!==1||!['driver-record','driver-receipt','tax-document'].includes(entry.domain)||book&&(entry.domain!=='tax-document'||!/^[a-f0-9]{64}$/.test(entry.sourceSha256))||!Number.isSafeInteger(entry.envelopeBytes)||entry.envelopeBytes<1||entry.envelopeBytes>24*1024**2||!/^[a-f0-9]{64}$/.test(entry.sha256))fail();
    total+=entry.envelopeBytes;if(total>96*1024**2)throw new Error('This import exceeds the trusted browser’s 96 MiB encrypted selection limit. Prepare a smaller reviewed selection.');ids.add(entry.objectId);counts[book?'client-book':entry.domain]++;
  }
  if(report.supportedCounts?.driverRecords!==counts['driver-record']||report.supportedCounts?.linkedDriverReceipts!==counts['driver-receipt']||report.supportedCounts?.submittedTaxDocuments!==counts['tax-document']||(report.supportedCounts?.clientBusinessBooks??0)!==counts['client-book'])fail();
  if(counts['client-book'])for(const name of ['clientBookJournalEntries','clientBookBillingDocuments','clientBookPeriodEvents','clientBooksMissingState'])if(!Number.isSafeInteger(report.supportedCounts[name])||report.supportedCounts[name]<0||report.supportedCounts[name]>1000000000)fail();return report;
}
