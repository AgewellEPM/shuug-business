import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sealEnvelope,openEnvelope,encode64,decode64} from '../packages/secure-tax-client/envelope.mjs';
import {legacySha256,signLegacyImportReport} from '../packages/secure-tax-client/legacy-import.mjs';
import {LegacyImport} from '../packages/secure-tax-client/browser/legacy-import.mjs';

export async function proveLegacyImport({portal,manifest,firm,json,token,marker}){
  const objectId=randomUUID(),original=new TextEncoder().encode(`%PDF-1.7\n${marker} migrated original\n%%EOF`),context={workspaceId:manifest.workspaceId,accountId:manifest.accountId,objectId,revision:1,domain:'tax-document'},recipients={clientPublicKey:manifest.client.publicKey,firmRecoveryPublicKey:manifest.firmRecovery.publicKey};
  const payload={version:1,kind:'legacy-tax-document',file:{name:'Synthetic migrated statement.pdf',mime:'application/pdf',size:original.length,sha256:await legacySha256(original),bytesBase64url:encode64(original)},legacy:{accountId:randomUUID(),clientId:randomUUID(),documentId:randomUUID(),createdAt:'2025-01-01T00:00:00.000Z'}};
  const envelope=await sealEnvelope(new TextEncoder().encode(JSON.stringify(payload)),context,recipients,'firm-recovery',firm.recovery),raw=new TextEncoder().encode(JSON.stringify(envelope)+'\n');
  const report={version:1,kind:'shuug-legacy-encrypted-preparation',recipientManifest:manifest,backupManifestSha256:'1'.repeat(64),entries:[{objectId,revision:1,domain:'tax-document',envelopeBytes:raw.length,sha256:await legacySha256(raw)}],supportedCounts:{driverRecords:0,linkedDriverReceipts:0,submittedTaxDocuments:1},unsupported:{counts:{accountIdentityProfiles:1}},sourceBackupVerified:true,disposableSqliteRestoreVerified:true,firmRecoveryVerified:true,sourcePurged:false};
  const bytes=new TextEncoder().encode(JSON.stringify(report)),signature=await signLegacyImportReport(bytes,firm),files=[new File([bytes],'export-manifest.json'),new File([JSON.stringify(signature)],'import-signature.json'),new File([raw],objectId+'.json')],importer=new LegacyImport(portal);
  await importer.select(files);const receipt=await importer.import({reviewed:true});assert.equal(receipt.clientReopenedAll,true);assert.equal(receipt.sourcePurged,false);assert.equal(receipt.completeProductMigration,false);
  const served=await json(`/objects/${objectId}`,{token}),opened=portal.records.get(objectId),data=JSON.parse(new TextDecoder().decode(opened.plaintext));assert.equal(served.envelope.author.role,'client');assert.deepEqual(decode64(data.data,1,10*1024**2),original);assert.equal(data.legacy.documentId,payload.legacy.documentId);
  const recovered=await openEnvelope(served.envelope,context,recipients,'firm-recovery',firm.recovery);assert.deepEqual(recovered,opened.plaintext);recovered.fill(0);
  await importer.select(files);await importer.import({reviewed:true});assert.equal((await json(`/objects/${objectId}`,{token})).revision,1);importer.clear();
  return {object:{context,envelope:served.envelope,bytes:opened.plaintext},proof:{signedPreparationVerified:true,clientImportedAndReopened:true,firmRecoveryVerified:true,retryKeptRevisionOne:true,sourcePurged:false,completeMigration:false}};
}
