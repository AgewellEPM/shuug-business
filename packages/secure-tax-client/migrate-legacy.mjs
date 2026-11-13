// Node-only, offline preparation. Never import into the website/API bundle.
import {createHash,createDecipheriv} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,readSync,lstatSync,readdirSync,writeFileSync,copyFileSync,chmodSync,mkdirSync,mkdtempSync,rmSync,realpathSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sealEnvelope,openEnvelope,verifyEnrollmentManifest,encode64,MAX_CIPHERTEXT_BYTES} from './envelope.mjs';
import {signLegacyImportReport} from './legacy-import.mjs';
import {assertLegacyBookSource,legacyBookCounts,legacyEntryDigest} from './legacy-books.mjs';

const MAX_FILES=100000,MAX_BACKUP_BYTES=8*1024**3,MAX_FILE_BYTES=2*1024**3,MAX_ENTRIES=10000,MAX_EXPORT_PLAINTEXT=384*1024**2;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex=/^[a-f0-9]{64}$/;
const fail=message=>{throw new Error(message);};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail('Invalid copied-backup manifest.');};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function boundedFile(file,maximum){
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maximum)fail('A selected backup file exceeds preparation bounds.');
  const chunks=[];let total=0;
  for(;;){const chunk=Buffer.alloc(Math.min(1024*1024,maximum-total+1));const n=readSync(fd,chunk);if(!n)break;total+=n;if(total>maximum)fail('A selected backup file exceeds preparation bounds.');chunks.push(chunk.subarray(0,n));}
  return Buffer.concat(chunks);
 }finally{closeSync(fd);}
}
function fileDigest(file,maximum=MAX_FILE_BYTES){
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW),hash=createHash('sha256');let bytes=0;
 try{if(!fstatSync(fd).isFile())fail('Copied backups must contain regular files only.');const chunk=Buffer.alloc(1024*1024);for(;;){const n=readSync(fd,chunk);if(!n)break;bytes+=n;if(bytes>maximum)fail('The copied backup exceeds preparation bounds.');hash.update(chunk.subarray(0,n));}return {sha256:hash.digest('hex'),bytes};}finally{closeSync(fd);}
}
function filesIn(root,prefix='',depth=0){
 if(depth>32)fail('The copied backup exceeds preparation bounds.');
 const result=[];
 for(const name of readdirSync(path.join(root,prefix))){
  const relative=prefix?`${prefix}/${name}`:name,stat=lstatSync(path.join(root,relative));
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))fail('Copied backups cannot contain links or special files.');
  if(stat.isDirectory())result.push(...filesIn(root,relative,depth+1));else result.push(relative);
  if(result.length>MAX_FILES+1)fail('The copied backup exceeds preparation bounds.');
 }
 return result.sort();
}
function verifyAndCopy(backup,expectedHash,target){
 if(!hex.test(expectedHash))fail('Supply the independently reviewed copied-backup manifest SHA256.');
 const bytes=boundedFile(path.join(backup,'backup-manifest.json'),32*1024**2);
 if(sha(bytes)!==expectedHash)fail('Copied-backup manifest does not match the independently reviewed hash.');
 const manifest=JSON.parse(bytes);exact(manifest,['version','createdAt','files']);
 if(manifest.version!==1||typeof manifest.createdAt!=='string'||!Number.isFinite(Date.parse(manifest.createdAt))||new Date(manifest.createdAt).toISOString()!==manifest.createdAt||!Array.isArray(manifest.files)||manifest.files.length>MAX_FILES)fail('Invalid copied-backup manifest.');
 let total=0;const names=new Set();
 for(const entry of manifest.files){
  exact(entry,['path','sha256','bytes']);
  if(typeof entry.path!=='string'||entry.path.includes('\\')||entry.path.includes('\0')||path.posix.isAbsolute(entry.path)||entry.path.split('/').some(part=>!part||part==='.'||part==='..')||entry.path==='backup-manifest.json'||names.has(entry.path)||!hex.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>MAX_FILE_BYTES)fail('Invalid copied-backup manifest.');
  if(/(-wal|-shm|\.lock)$/.test(entry.path))fail('Use a stopped, checkpointed copied backup without live journals.');
  total+=entry.bytes;if(total>MAX_BACKUP_BYTES)fail('The copied backup exceeds preparation bounds.');names.add(entry.path);
 }
 const expected=[...names].sort(),actual=filesIn(backup).filter(file=>file!=='backup-manifest.json');
 if(JSON.stringify(actual)!==JSON.stringify(expected))fail('Copied-backup file set does not match its manifest.');
 for(const entry of manifest.files){
  const source=path.join(backup,entry.path),verified=fileDigest(source,entry.bytes);
  if(verified.sha256!==entry.sha256||verified.bytes!==entry.bytes)fail('A copied-backup checksum or size does not match.');
  const destination=path.join(target,entry.path);mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});copyFileSync(source,destination,constants.COPYFILE_EXCL);chmodSync(destination,0o600);
  const restored=fileDigest(destination,entry.bytes);if(restored.sha256!==entry.sha256||restored.bytes!==entry.bytes)fail('Disposable restore verification failed.');
 }
 if(sha(boundedFile(path.join(backup,'backup-manifest.json'),32*1024**2))!==expectedHash||JSON.stringify(filesIn(backup).filter(file=>file!=='backup-manifest.json'))!==JSON.stringify(expected))fail('The copied backup changed during verification.');
 return {files:expected,createdAt:manifest.createdAt};
}
const existsTable=(db,name)=>Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name));
function count(db,table,sql,...args){return existsTable(db,table)?Number(db.prepare(sql).get(...args).n):0;}
const canonicalBase64=(value,expectedLength)=>{
 if(typeof value!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))fail('A legacy encrypted document is malformed.');
 const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value||(expectedLength!==undefined&&bytes.length!==expectedLength))fail('A legacy encrypted document is malformed.');return bytes;
};
function fileMime(bytes){
 if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return 'image/jpeg';
 if(bytes.subarray(0,5).toString('ascii')==='%PDF-')return 'application/pdf';
 fail('A legacy file has unsupported content framing.');
}
function verifiedBytes(bytes,row,maximum){
 if(!Number.isSafeInteger(row.size)||row.size<1||row.size>maximum||bytes.length!==row.size||!hex.test(row.digest)||sha(bytes)!==row.digest||fileMime(bytes)!==row.mime)fail('Legacy file metadata or byte integrity does not match.');return bytes;
}
function legacyDocument(snapshot,row,key){
 if(!uuid.test(row.id))fail('Invalid legacy document routing identifier.');
 const envelope=JSON.parse(boundedFile(path.join(snapshot,'tax-documents',row.id),21*1024**2));exact(envelope,['iv','tag','data']);
 const decipher=createDecipheriv('aes-256-gcm',key,canonicalBase64(envelope.iv,12));decipher.setAuthTag(canonicalBase64(envelope.tag,16));
 const encoded=Buffer.concat([decipher.update(canonicalBase64(envelope.data)),decipher.final()]);
 try{return verifiedBytes(canonicalBase64(encoded.toString('utf8')),row,10*1024**2);}finally{encoded.fill(0);}
}
function inventory(db,accountId,clientId,receiptCount,exportedReceipts,files,usedFiles){
 const counts={
  driverMutationCaches:count(db,'driver_mutations','SELECT count(*) AS n FROM driver_mutations WHERE accountId=?',accountId),
  coachProfiles:count(db,'driver_coach_profiles','SELECT count(*) AS n FROM driver_coach_profiles WHERE accountId=? OR clientId=?',accountId,clientId),
  coachMessages:count(db,'driver_coach_messages','SELECT count(*) AS n FROM driver_coach_messages WHERE accountId=? OR clientId=?',accountId,clientId),
  coachMutationCaches:count(db,'driver_coach_mutations','SELECT count(*) AS n FROM driver_coach_mutations WHERE accountId=? OR clientId=?',accountId,clientId),
  unreferencedDriverReceipts:receiptCount-exportedReceipts,
  taxDocumentReviewerMetadata:count(db,'tax_client_documents','SELECT count(*) AS n FROM tax_client_documents WHERE accountId=? AND clientId=? AND reviewedBy IS NOT NULL',accountId,clientId),
  taxDocumentReviewAudits:existsTable(db,'tax_client_documents')?count(db,'tax_document_reviews','SELECT count(*) AS n FROM tax_document_reviews r JOIN tax_client_documents d ON d.id=r.documentId WHERE d.accountId=? AND d.clientId=?',accountId,clientId):0,
  sdkTaxRows:0,
  bankAuthorizations:count(db,'driver_bank_items','SELECT count(*) AS n FROM driver_bank_items WHERE (accountId=? OR clientId=?) AND length(secret)>0',accountId,clientId),
  bankPendingRevocations:count(db,'driver_bank_revocations','SELECT count(*) AS n FROM driver_bank_revocations WHERE (accountId=? OR clientId=?) AND length(accessSecret)>0',accountId,clientId),
  bankTransactions:existsTable(db,'driver_bank_items')?count(db,'driver_bank_transactions','SELECT count(*) AS n FROM driver_bank_transactions t JOIN driver_bank_items i ON i.id=t.itemId WHERE i.accountId=? OR i.clientId=?',accountId,clientId):0,
  uberAuthorizations:count(db,'gig_uber_links','SELECT count(*) AS n FROM gig_uber_links WHERE (accountId=? OR clientId=?) AND secrets IS NOT NULL',accountId,clientId),
  uberProfiles:count(db,'gig_uber_links','SELECT count(*) AS n FROM gig_uber_links WHERE (accountId=? OR clientId=?) AND profile IS NOT NULL',accountId,clientId),
  uberSourceFacts:count(db,'gig_uber_facts','SELECT count(*) AS n FROM gig_uber_facts WHERE accountId=? OR clientId=?',accountId,clientId),
  uberAuthorizationStates:count(db,'gig_uber_states','SELECT count(*) AS n FROM gig_uber_states WHERE accountId=? OR clientId=?',accountId,clientId),
  accountIdentityProfiles:count(db,'customer_accounts','SELECT count(*) AS n FROM customer_accounts WHERE id=?',accountId),
  serviceClientProfiles:count(db,'records',"SELECT count(*) AS n FROM records WHERE kind='client' AND id=?",clientId),
  unclassifiedBackupFiles:files.filter(file=>!usedFiles.has(file)).length,
 };
 if(existsTable(db,'documents')){
  const row=db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get();
  if(row){const modules=JSON.parse(row.body);for(const name of ['tax-engagements','tax-document-requests','tax-filing-handoffs','rideshare-tax-records','tax-quarterly-reviews']){
   if(modules[name]!==undefined&&!Array.isArray(modules[name]))fail('Legacy SDK tax state is malformed.');
   counts.sdkTaxRows+=(modules[name]??[]).filter(record=>record?.values?.client_id===clientId).length;
  }}
 }
 return {counts,workspaceWideUnscoped:{auditSnapshotsPresent:count(db,'audit','SELECT count(*) AS n FROM audit')>0,commandSnapshotsPresent:count(db,'commands','SELECT count(*) AS n FROM commands')>0,legacyHostVaultKeyPresent:files.includes('vault.key'),connectionVaultPresent:files.includes('connections.enc')},
  unscannedExposure:['Other accounts and client links','Generic workspace, SDK and custom tracker fields','Coach preferences, confirmed intake, conversation bodies and mutation metadata are counted but not exported','Device app caches, journal exports and route data outside this backup','Orphan receipt/document files and legacy JSON outside supported links','Filesystem history, prior exports, logs, deleted SQLite pages and retained backups','Provider copies, subscriptions and externally valid credentials'],
  providerCredentialsCopied:false,staffOnlySdkRowsCopied:false};
}

/** Explicit copied-backup preparation only. `unlocked` comes from
 * unlockFirmBundle on the separately trusted firm device. No network or purge. */
export async function prepareLegacyMigration({backupDirectory,backupManifestSha256,manifest,expected,unlocked,outputDirectory,confirmCopiedBackup=false,confirmOffHost=false}){
 if(!confirmCopiedBackup||!confirmOffHost)fail('Confirm a copied backup and a separately trusted offhost device.');
 const sourceStat=lstatSync(backupDirectory);if(sourceStat.isSymbolicLink()||!sourceStat.isDirectory())fail('Explicitly select an ordinary copied-backup directory.');
 const backup=realpathSync(backupDirectory),requestedOutput=path.resolve(outputDirectory),parent=realpathSync(path.dirname(requestedOutput)),output=path.join(parent,path.basename(requestedOutput));
 if(output===backup||output.startsWith(backup+path.sep)||existsSync(output))fail('Select a new export directory outside the copied backup.');
 if(!expected||!uuid.test(expected.accountId)||!uuid.test(expected.clientId)||expected.manifestId!==manifest?.manifestId||!Number.isInteger(expected.minimumEpoch)||expected.minimumEpoch<1||expected.minimumEpoch>1e9)fail('Independently review the expected account, client, signed manifest ID and minimum epoch.');
 const verified=await verifyEnrollmentManifest(manifest,expected,unlocked.publicPins);
 const scratch=mkdtempSync(path.join(tmpdir(),'shuug-offhost-legacy-'));chmodSync(scratch,0o700);
 let db,outputOwned=false,plaintextBytes=0,key;
 try{
  const backupInfo=verifyAndCopy(backup,backupManifestSha256,scratch);
  if(!backupInfo.files.includes('workspace.sqlite'))fail('The copied backup has no supported workspace database.');
  for(const file of backupInfo.files.filter(name=>/\.(sqlite|db)$/.test(name))){
   const check=new DatabaseSync(path.join(scratch,file),{readOnly:true});try{if(JSON.stringify(check.prepare('PRAGMA quick_check').all())!=='[{"quick_check":"ok"}]')fail('Disposable SQLite restore integrity failed.');}finally{check.close();}
  }
  db=new DatabaseSync(path.join(scratch,'workspace.sqlite'),{readOnly:true});
  if(!existsTable(db,'customer_accounts'))fail('The legacy account table is missing.');
  const sourceAccountId=expected.sourceAccountId??expected.accountId,sourceClientId=expected.sourceClientId??expected.clientId;
  if(!uuid.test(sourceAccountId)||!uuid.test(sourceClientId)||Boolean(expected.sourceAccountId)!==Boolean(expected.sourceClientId))fail('Review both source identifiers when migrating to a new account.');
  const account=db.prepare('SELECT id,clientId FROM customer_accounts WHERE id=?').get(sourceAccountId);
  if(!account||account.clientId!==sourceClientId)fail('The copied backup does not match the independently reviewed client link.');
  const objectIdFor=(domain,legacyId)=>{const digest=sha(Buffer.from(JSON.stringify(['shuug/legacy-import/v1',backupManifestSha256,expected.accountId,expected.clientId,domain,legacyId])));return `${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;};
  const plans=[],receiptIds=new Map(),receiptUsers=new Map(),usedFiles=new Set(['workspace.sqlite']);
  const recordCount=count(db,'driver_records','SELECT count(*) AS n FROM driver_records WHERE accountId=? AND clientId=?',account.id,account.clientId);
  if(recordCount>MAX_ENTRIES)fail('This account exceeds the preparation object limit.');
  const records=recordCount?db.prepare('SELECT * FROM driver_records WHERE accountId=? AND clientId=? ORDER BY sequence').all(account.id,account.clientId):[];
  for(const row of records){
   const record=JSON.parse(row.body);if(!uuid.test(row.id)||record.id!==row.id||!['trip','expense','income'].includes(record.kind)||!record.body||typeof record.body!=='object'||Array.isArray(record.body)||typeof record.deleted!=='boolean'||!Number.isSafeInteger(record.revision)||record.revision<1||record.revision!==row.revision)fail('A selected legacy driver record is malformed.');
   const objectId=objectIdFor('driver-record',row.id);
   if(record.kind==='expense'&&record.body.receiptId){if(!uuid.test(record.body.receiptId))fail('Invalid legacy receipt routing identifier.');if(!receiptIds.has(record.body.receiptId))receiptIds.set(record.body.receiptId,objectIdFor('driver-receipt',record.body.receiptId));receiptUsers.set(record.body.receiptId,[...(receiptUsers.get(record.body.receiptId)??[]),objectId]);}
   plans.push({domain:'driver-record',objectId,payload:{version:1,kind:'legacy-driver-record',record,legacy:{recordId:row.id,accountId:row.accountId,clientId:row.clientId,sequence:row.sequence,updatedAt:row.updatedAt}}});
  }
  const receiptCount=count(db,'driver_receipts','SELECT count(*) AS n FROM driver_receipts WHERE accountId=?',account.id);
  for(const [legacyId,objectId] of receiptIds){
   if(!existsTable(db,'driver_receipts'))fail('A referenced legacy receipt is missing.');
   const row=db.prepare('SELECT * FROM driver_receipts WHERE accountId=? AND id=?').get(account.id,legacyId);if(!row)fail('A referenced legacy receipt is missing.');
   const file=`driver-receipts/${account.id}/${legacyId}`;usedFiles.add(file);
   plans.push({domain:'driver-receipt',objectId,load:()=>{const bytes=verifiedBytes(boundedFile(path.join(scratch,file),5*1024**2),row,5*1024**2);try{return {version:1,kind:'legacy-driver-receipt',file:{mime:row.mime,size:row.size,sha256:row.digest,bytesBase64url:encode64(bytes)},links:{driverRecordObjectIds:receiptUsers.get(legacyId)},legacy:{receiptId:legacyId,accountId:account.id,createdAt:row.createdAt}};}finally{bytes.fill(0);}}});
  }
  for(const plan of plans.filter(plan=>plan.domain==='driver-record')){
   const record=plan.payload.record;record.id=plan.objectId;
   if(record.kind==='expense'&&record.body.receiptId){plan.payload.legacy.receiptId=record.body.receiptId;record.body.receiptId=receiptIds.get(record.body.receiptId);}
  }
  const documentCount=count(db,'tax_client_documents','SELECT count(*) AS n FROM tax_client_documents WHERE accountId=? AND clientId=?',account.id,account.clientId);
  if(plans.length+documentCount>MAX_ENTRIES)fail('This account exceeds the preparation object limit.');
  if(documentCount){key=canonicalBase64(boundedFile(path.join(scratch,'vault.key'),1024).toString('utf8').trim(),32);usedFiles.add('vault.key');}
  const documents=documentCount?db.prepare('SELECT * FROM tax_client_documents WHERE accountId=? AND clientId=? ORDER BY createdAt,id').all(account.id,account.clientId):[];
  for(const row of documents){usedFiles.add(`tax-documents/${row.id}`);plans.push({domain:'tax-document',objectId:objectIdFor('tax-document',row.id),load:()=>{const bytes=legacyDocument(scratch,row,key);try{return {version:1,kind:'legacy-tax-document',file:{name:row.name,mime:row.mime,size:row.size,sha256:row.digest,bytesBase64url:encode64(bytes)},status:row.status,legacy:{documentId:row.id,accountId:row.accountId,clientId:row.clientId,requestId:row.requestId,engagementId:row.engagementId,createdAt:row.createdAt,reviewedAt:row.reviewedAt}};}finally{bytes.fill(0);}}});}
  const bookCounts={};
  if(existsTable(db,'documents')){
   const selectedBooks=db.prepare("SELECT id,body FROM documents WHERE kind='client-book' AND json_extract(body,'$.clientId')=? ORDER BY id").all(account.clientId);
   if(plans.length+selectedBooks.length>MAX_ENTRIES)fail('This account exceeds the preparation object limit.');
   const sourceBooks=new Set();
   for(const row of selectedBooks){
    const book=JSON.parse(row.body);if(!uuid.test(book.id)||book.clientId!==account.clientId||row.id!==`client-book:${book.id}`||sourceBooks.has(book.id))fail('A selected client book has invalid routing.');sourceBooks.add(book.id);
    const stateDocumentId=`state:client-journal:${book.id}`,periodDocumentId=`accounting-periods:${book.id}`;
    const state=db.prepare("SELECT body FROM documents WHERE id=? AND kind='state'").get(stateDocumentId),periods=db.prepare("SELECT body FROM documents WHERE id=? AND kind='accounting-periods'").get(periodDocumentId);
    const payload=assertLegacyBookSource({version:1,kind:'legacy-client-book',book,state:state?JSON.parse(state.body):null,periods:periods?JSON.parse(periods.body):null,legacy:{accountId:account.id,clientId:account.clientId,bookId:book.id,bookDocumentId:row.id,stateDocumentId,periodDocumentId}});
    if(payload.periods?.active&&await legacyEntryDigest(payload.periods.active.entries)!==payload.periods.active.digest)fail('A selected period seal has changed.');
    for(const [name,value]of Object.entries(legacyBookCounts(payload)))bookCounts[name]=(bookCounts[name]??0)+value;
    plans.push({domain:'tax-document',sourceType:'client-book',objectId:objectIdFor('client-book',book.id),payload});
   }
  }
  if(plans.length>MAX_ENTRIES)fail('This account exceeds the preparation object limit.');
  const unsupported=inventory(db,account.id,account.clientId,receiptCount,receiptIds.size,backupInfo.files,usedFiles);
  mkdirSync(output,{mode:0o700});outputOwned=true;mkdirSync(path.join(output,'objects'),{mode:0o700});
  const entries=[];
  for(const plan of plans){
   const payload=plan.payload??plan.load(),plain=Buffer.from(JSON.stringify(payload));plaintextBytes+=plain.length;
   try{
    if(plain.length>MAX_CIPHERTEXT_BYTES-16||plaintextBytes>MAX_EXPORT_PLAINTEXT)fail('The selected encrypted export exceeds preparation bounds.');
    const context={workspaceId:manifest.workspaceId,accountId:expected.accountId,objectId:plan.objectId,revision:1,domain:plan.domain};
    const envelope=await sealEnvelope(new Uint8Array(plain),context,verified.recipients,'firm-recovery',unlocked.recovery);
    // Verify each fresh export with the actual offhost recovery recipient before
    // writing it; client-key recovery remains a separate acceptance requirement.
    const opened=await openEnvelope(envelope,context,verified.recipients,'firm-recovery',unlocked.recovery);
    try{if(!Buffer.from(opened).equals(plain))fail('Encrypted export recovery verification failed.');}finally{opened.fill(0);}
    const bytes=Buffer.from(JSON.stringify(envelope)+'\n');writeFileSync(path.join(output,'objects',`${plan.objectId}.json`),bytes,{mode:0o600,flag:'wx'});
    entries.push({objectId:plan.objectId,revision:1,domain:plan.domain,envelopeBytes:bytes.length,sha256:sha(bytes),...(plan.sourceType?{sourceType:plan.sourceType,sourceSha256:sha(plain)}:{})});
   }finally{plain.fill(0);}
  }
  const report={version:1,kind:'shuug-legacy-encrypted-preparation',createdAt:new Date().toISOString(),recipientManifest:manifest,backupManifestSha256,backupCreatedAt:backupInfo.createdAt,
   entries,supportedCounts:{driverRecords:records.length,linkedDriverReceipts:receiptIds.size,submittedTaxDocuments:documents.length,...bookCounts},unsupported,
   sourceBackupVerified:true,disposableSqliteRestoreVerified:true,firmRecoveryVerified:entries.length>0,clientRecoveryVerified:false,
   migrationComplete:false,uploaded:false,sourcePurged:false,legacyExposureRemains:true,physicalErasureVerified:false,
   nextRequiredSteps:['Open every exported object with the client recipient on a separately trusted client','Review supported/unsupported coverage and encrypted legacy link mappings','Perform an explicitly authorized encrypted import with duplicate reconciliation','Verify encrypted backup recovery before any separately consented legacy removal']};
  const reportBytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
  writeFileSync(path.join(output,'export-manifest.json'),reportBytes,{mode:0o600,flag:'wx'});
  writeFileSync(path.join(output,'import-signature.json'),JSON.stringify(await signLegacyImportReport(reportBytes,unlocked))+'\n',{mode:0o600,flag:'wx'});
  return report;
 }catch{if(outputOwned)rmSync(output,{recursive:true,force:true});throw new Error('Offline migration preparation failed. Check the reviewed backup, client manifest, bounds and legacy file integrity; no source data was purged.');}
 finally{key?.fill(0);try{db?.close();}finally{rmSync(scratch,{recursive:true,force:true});}}
}
