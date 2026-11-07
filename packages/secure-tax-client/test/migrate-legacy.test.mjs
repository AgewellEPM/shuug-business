import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync,statSync,symlinkSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {generateRecipientKeyPair,publicKeyId,openEnvelope} from '../envelope.mjs';
import {prepareLegacyMigration} from '../migrate-legacy.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pass='Synthetic copied-backup migration test passphrase only';
const filesIn=(root,prefix='')=>readdirSync(path.join(root,prefix)).flatMap(name=>{const file=prefix?`${prefix}/${name}`:name;return statSync(path.join(root,file)).isDirectory()?filesIn(root,file):[file];}).sort();
function sealBackup(root){
 const manifest={version:1,createdAt:new Date().toISOString(),files:filesIn(root).filter(name=>name!=='backup-manifest.json').map(file=>{const bytes=readFileSync(path.join(root,file));return {path:file,sha256:hash(bytes),bytes:bytes.length};})};
 writeFileSync(path.join(root,'backup-manifest.json'),JSON.stringify(manifest));return hash(readFileSync(path.join(root,'backup-manifest.json')));
}
async function fixture(){
 const directory=mkdtempSync(path.join(tmpdir(),'synthetic-legacy-export-')),backup=path.join(directory,'copied-backup');mkdirSync(backup,{mode:0o700});
 const accountId=randomUUID(),clientId=randomUUID(),otherAccount=randomUUID(),otherClient=randomUUID(),receiptId=randomUUID(),orphanId=randomUUID(),documentId=randomUUID(),requestId=randomUUID(),engagementId=randomUUID();
 const receipt=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('Synthetic receipt original bytes')]);
 const pdf=Buffer.from('%PDF-1.7\nSynthetic tax document SSN 000-12-3456\n%%EOF\n');
 const recordIds=[randomUUID(),randomUUID(),randomUUID()];
 const records=[
  {id:recordIds[0],revision:1,deleted:false,kind:'trip',body:{startedAt:'2026-11-07T00:00:00Z',endedAt:'2026-11-07T00:10:00Z',distanceMeters:1234,classification:'business',purpose:'Synthetic work',notes:'Synthetic tax notes 000-12-3456',source:'manual',hasGaps:false,sampleCount:0}},
  {id:recordIds[1],revision:1,deleted:false,kind:'expense',body:{date:'2026-11-07',merchant:'Synthetic merchant',category:'fuel',amountCents:1234,currency:'USD',classification:'business',notes:'Synthetic tax notes',receiptId}},
  {id:recordIds[2],revision:1,deleted:false,kind:'income',body:{date:'2026-11-07',platform:'uber',description:'Synthetic earnings',amountCents:3456,currency:'USD',notes:'Synthetic tax notes'}},
 ];
 const db=new DatabaseSync(path.join(backup,'workspace.sqlite'));
 try{
  db.exec(`CREATE TABLE customer_accounts(id TEXT PRIMARY KEY,clientId TEXT,name TEXT,email TEXT);
   CREATE TABLE driver_records(accountId TEXT,id TEXT,clientId TEXT,revision INTEGER,body TEXT,sequence INTEGER,updatedAt TEXT);
   CREATE TABLE driver_receipts(accountId TEXT,id TEXT,mime TEXT,size INTEGER,digest TEXT,createdAt TEXT);
   CREATE TABLE driver_mutations(accountId TEXT,id TEXT,result TEXT);
   CREATE TABLE tax_client_documents(id TEXT,accountId TEXT,clientId TEXT,requestId TEXT,engagementId TEXT,name TEXT,mime TEXT,size INTEGER,digest TEXT,createdAt TEXT,status TEXT,reviewedAt TEXT,reviewedBy TEXT);
   CREATE TABLE records(id TEXT,kind TEXT,body TEXT);
   CREATE TABLE documents(id TEXT,kind TEXT,body TEXT);
   CREATE TABLE audit(snapshot TEXT);
   CREATE TABLE commands(request TEXT,result TEXT);
   CREATE TABLE driver_bank_items(id TEXT,accountId TEXT,clientId TEXT,secret TEXT);
   CREATE TABLE driver_bank_transactions(id TEXT,itemId TEXT,body TEXT);`);
  db.prepare('INSERT INTO customer_accounts VALUES(?,?,?,?)').run(accountId,clientId,'Synthetic target identity','synthetic@example.test');
  db.prepare('INSERT INTO customer_accounts VALUES(?,?,?,?)').run(otherAccount,otherClient,'FORBIDDEN FOREIGN IDENTITY','foreign@example.test');
  for(const [index,record] of records.entries())db.prepare('INSERT INTO driver_records VALUES(?,?,?,?,?,?,?)').run(accountId,record.id,clientId,1,JSON.stringify(record),index+1,new Date().toISOString());
  const foreign={...records[2],id:randomUUID(),body:{...records[2].body,notes:'FORBIDDEN FOREIGN RECORD'}};
  db.prepare('INSERT INTO driver_records VALUES(?,?,?,?,?,?,?)').run(otherAccount,foreign.id,otherClient,1,JSON.stringify(foreign),4,new Date().toISOString());
  for(const id of [receiptId,orphanId])db.prepare('INSERT INTO driver_receipts VALUES(?,?,?,?,?,?)').run(accountId,id,'image/png',receipt.length,hash(receipt),new Date().toISOString());
  db.prepare('INSERT INTO driver_mutations VALUES(?,?,?)').run(accountId,randomUUID(),'Unsupported old plaintext mutation cache');
  db.prepare('INSERT INTO tax_client_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(documentId,accountId,clientId,requestId,engagementId,'Synthetic tax statement 000-12-3456.pdf','application/pdf',pdf.length,hash(pdf),new Date().toISOString(),'received',null,null);
  db.prepare('INSERT INTO records VALUES(?,?,?)').run(clientId,'client',JSON.stringify({title:'Synthetic target identity'}));
  db.prepare('INSERT INTO documents VALUES(?,?,?)').run('state:module-records','state',JSON.stringify({'tax-engagements':[{id:engagementId,values:{client_id:clientId,notes:'DO NOT SHARE STAFF NOTE',client_visible:false}}]}));
  db.prepare('INSERT INTO audit VALUES(?)').run('Unsupported old snapshot');db.prepare('INSERT INTO commands VALUES(?,?)').run('Unsupported old request','Unsupported old result');
  db.prepare('INSERT INTO driver_bank_items VALUES(?,?,?,?)').run('synthetic-provider-item',accountId,clientId,'HOST_TOKEN_MUST_NOT_COPY');
  db.prepare('INSERT INTO driver_bank_transactions VALUES(?,?,?)').run('synthetic-provider-transaction','synthetic-provider-item','Unsupported bank tax transaction');
 }finally{db.close();}
 const receiptDirectory=path.join(backup,'driver-receipts',accountId);mkdirSync(receiptDirectory,{recursive:true});for(const id of [receiptId,orphanId])writeFileSync(path.join(receiptDirectory,id),receipt);
 const legacyKey=randomBytes(32);writeFileSync(path.join(backup,'vault.key'),legacyKey.toString('base64'));
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',legacyKey,iv),data=Buffer.concat([cipher.update(pdf.toString('base64'),'utf8'),cipher.final()]);
 mkdirSync(path.join(backup,'tax-documents'));writeFileSync(path.join(backup,'tax-documents',documentId),JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));
 writeFileSync(path.join(backup,'legacy-extra.json'),JSON.stringify({privateNotes:'OTHER LEGACY FILE MUST NOT COPY'}));
 const backupManifestSha256=sealBackup(backup),{bundle,publicPins}=await createFirmBundle('synthetic-workspace',pass),unlocked=await unlockFirmBundle(bundle,pass,publicPins),client=await generateRecipientKeyPair();
 const manifest=await signEnrollmentRequest({version:1,workspaceId:publicPins.workspaceId,accountId,clientId,client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},unlocked,{epoch:1});
 const expected={accountId,clientId,manifestId:manifest.manifestId,minimumEpoch:1};
 const options={backupDirectory:backup,backupManifestSha256,manifest,expected,unlocked,outputDirectory:path.join(directory,'encrypted-export'),confirmCopiedBackup:true,confirmOffHost:true};
 return {directory,backup,options,client,publicPins,bundle,unlocked,manifest,expected,receipt,pdf,legacyKey,recordIds,receiptId,documentId,requestId,engagementId};
}
async function openedEntries(value,report){
 const trusted={clientPublicKey:value.client.publicKey,firmRecoveryPublicKey:value.publicPins.firmRecoveryPublicKey},result=[];
 for(const entry of report.entries){
  const file=readFileSync(path.join(value.options.outputDirectory,'objects',`${entry.objectId}.json`));assert.equal(hash(file),entry.sha256);
  const envelope=JSON.parse(file);assert.equal(envelope.author.role,'firm-recovery');
  const clientBytes=await openEnvelope(envelope,envelope.context,trusted,'client',value.client.privateKey),firmBytes=await openEnvelope(envelope,envelope.context,trusted,'firm-recovery',value.unlocked.recovery);
  assert.deepEqual(clientBytes,firmBytes);result.push({entry,payload:JSON.parse(new TextDecoder().decode(clientBytes))});
 }
 return result;
}

test('verified copied backup exports exact driver/receipt/document bytes for both recipients with only encrypted labels and links',async()=>{
 const value=await fixture();
 try{
  const before=filesIn(value.backup).map(file=>[file,hash(readFileSync(path.join(value.backup,file)))]),report=await prepareLegacyMigration(value.options);
  assert.deepEqual(report.supportedCounts,{driverRecords:3,linkedDriverReceipts:1,submittedTaxDocuments:1});assert.equal(report.entries.length,5);
  assert.equal(report.migrationComplete,false);assert.equal(report.sourcePurged,false);assert.equal(report.uploaded,false);assert.equal(report.clientRecoveryVerified,false);assert.equal(report.firmRecoveryVerified,true);
  assert.deepEqual(filesIn(value.backup).map(file=>[file,hash(readFileSync(path.join(value.backup,file)))]),before);
  const opened=await openedEntries(value,report),expense=opened.find(row=>row.payload.record?.kind==='expense'),receipt=opened.find(row=>row.payload.kind==='legacy-driver-receipt'),document=opened.find(row=>row.payload.kind==='legacy-tax-document');
  assert.equal(expense.payload.record.id,expense.entry.objectId);assert.equal(expense.payload.record.body.receiptId,receipt.entry.objectId);assert.equal(expense.payload.legacy.recordId,value.recordIds[1]);assert.equal(expense.payload.legacy.receiptId,value.receiptId);
  assert.deepEqual(receipt.payload.links.driverRecordObjectIds,[expense.entry.objectId]);assert.deepEqual(Buffer.from(receipt.payload.file.bytesBase64url,'base64url'),value.receipt);
  assert.deepEqual(Buffer.from(document.payload.file.bytesBase64url,'base64url'),value.pdf);assert.equal(document.payload.legacy.documentId,value.documentId);assert.equal(document.payload.legacy.requestId,value.requestId);
  assert.equal(report.unsupported.counts.sdkTaxRows,1);assert.equal(report.unsupported.counts.bankAuthorizations,1);assert.equal(report.unsupported.counts.driverMutationCaches,1);assert.equal(report.unsupported.counts.unreferencedDriverReceipts,1);assert.equal(report.unsupported.workspaceWideUnscoped.auditSnapshotsPresent,true);
  const disk=filesIn(value.options.outputDirectory).map(file=>readFileSync(path.join(value.options.outputDirectory,file),'utf8')).join('\n');
  for(const text of ['000-12-3456','Synthetic tax notes','Synthetic tax statement','FORBIDDEN FOREIGN','DO NOT SHARE STAFF NOTE','HOST_TOKEN_MUST_NOT_COPY','OTHER LEGACY FILE MUST NOT COPY',value.legacyKey.toString('base64'),...value.recordIds,value.receiptId,value.documentId,value.requestId,value.engagementId])assert(!disk.includes(text));
  assert.equal(statSync(value.options.outputDirectory).mode&0o777,0o700);for(const file of filesIn(value.options.outputDirectory))assert.equal(statSync(path.join(value.options.outputDirectory,file)).mode&0o777,0o600);
  await assert.rejects(()=>prepareLegacyMigration(value.options),/new export directory/);
 }finally{rmSync(value.directory,{recursive:true,force:true});}
});

test('refuses unreviewed copies, wrong manifest pins, foreign client links and corrupted or incomplete backup manifests',async()=>{
 const value=await fixture();
 try{
  await assert.rejects(()=>prepareLegacyMigration({...value.options,confirmCopiedBackup:false}),/Confirm/);
  await assert.rejects(()=>prepareLegacyMigration({...value.options,backupManifestSha256:'0'.repeat(64)}),/preparation failed/);
  await assert.rejects(()=>prepareLegacyMigration({...value.options,expected:{...value.expected,clientId:randomUUID()}}));
  await assert.rejects(()=>prepareLegacyMigration({...value.options,expected:{...value.expected,manifestId:randomUUID()}}));
  const foreignClient=randomUUID(),foreignManifest=await signEnrollmentRequest({version:1,workspaceId:value.publicPins.workspaceId,accountId:value.expected.accountId,clientId:foreignClient,client:{keyId:await publicKeyId(value.client.publicKey),publicKey:value.client.publicKey}},value.unlocked,{epoch:1});
  await assert.rejects(()=>prepareLegacyMigration({...value.options,manifest:foreignManifest,expected:{...value.expected,clientId:foreignClient,manifestId:foreignManifest.manifestId}}),/preparation failed/);
  writeFileSync(path.join(value.backup,'unexpected-private-file'),'Must not be exported');
  await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);assert.equal(existsSync(value.options.outputDirectory),false);rmSync(path.join(value.backup,'unexpected-private-file'));
  writeFileSync(path.join(value.backup,'driver-receipts',value.expected.accountId,value.receiptId),'Corrupted bytes');
  await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);assert.equal(existsSync(value.options.outputDirectory),false);
 }finally{rmSync(value.directory,{recursive:true,force:true});}
});

test('refuses live journals, symlinks, unsafe backup paths and legacy host-vault authentication failure without leaving an export',async()=>{
 const value=await fixture();
 try{
  writeFileSync(path.join(value.backup,'workspace.sqlite-wal'),'Synthetic live journal');value.options.backupManifestSha256=sealBackup(value.backup);
  await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);rmSync(path.join(value.backup,'workspace.sqlite-wal'));
  symlinkSync(path.join(value.backup,'vault.key'),path.join(value.backup,'linked-key'));value.options.backupManifestSha256=sealBackup(value.backup);
  await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);rmSync(path.join(value.backup,'linked-key'));
  const manifest=JSON.parse(readFileSync(path.join(value.backup,'backup-manifest.json')));manifest.files[0].path='../escape';writeFileSync(path.join(value.backup,'backup-manifest.json'),JSON.stringify(manifest));
  value.options.backupManifestSha256=hash(readFileSync(path.join(value.backup,'backup-manifest.json')));await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);
  writeFileSync(path.join(value.backup,'vault.key'),randomBytes(32).toString('base64'));value.options.backupManifestSha256=sealBackup(value.backup);
  await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);assert.equal(existsSync(value.options.outputDirectory),false);
 }finally{rmSync(value.directory,{recursive:true,force:true});}
});

test('offline CLI requires explicit copied-backup/offhost inputs and never uploads or purges',async()=>{
 const value=await fixture();
 try{
  const file=name=>path.join(value.directory,name);for(const [name,data] of [['firm.json',value.bundle],['pins.json',value.publicPins],['manifest.json',value.manifest],['expected.json',value.expected]])writeFileSync(file(name),JSON.stringify(data));
  const cli=new URL('../migrate-legacy-cli.mjs',import.meta.url).pathname,args=['--confirm-off-host','--confirm-copied-backup','--backup',value.backup,'--backup-manifest-sha256',value.options.backupManifestSha256,'--bundle',file('firm.json'),'--public-pins',file('pins.json'),'--manifest',file('manifest.json'),'--expected',file('expected.json'),'--passphrase-fd','0','--out',value.options.outputDirectory];
  const run=values=>spawnSync(process.execPath,[cli,...values],{input:pass+'\n',encoding:'utf8',maxBuffer:4096});
  assert.equal(run(args.slice(1)).status,1);const result=run(args);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).supportedCounts,{driverRecords:3,linkedDriverReceipts:1,submittedTaxDocuments:1});
  assert(!result.stdout.includes('000-12-3456'));assert.equal(existsSync(path.join(value.backup,'vault.key')),true);assert.equal(run(args).status,1);
 }finally{rmSync(value.directory,{recursive:true,force:true});}
});
