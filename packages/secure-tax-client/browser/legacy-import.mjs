import {decode64} from '../envelope.mjs';
import {legacySha256,verifyLegacyImportReport} from '../legacy-import.mjs';
import {assertLegacyBookSource,isLegacyBooks,legacyBookCounts} from '../legacy-books.mjs';
const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const scopeOf=client=>JSON.stringify(client.scope),fail=()=>{throw new Error('A migrated object has invalid contents, links or provenance. No import was started.');};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function sourceKey(domain,value){
  const book=isLegacyBooks(value)||value?.kind==='legacy-client-book',source=isLegacyBooks(value)?value.source:value;
  const field=book?'bookId':{'driver-record':'recordId','driver-receipt':'receiptId','tax-document':'documentId'}[domain],legacy=source?.legacy;
  if(!field||!legacy||!uuid(legacy.accountId)||!uuid(legacy[field])||(domain!=='driver-receipt'&&!uuid(legacy.clientId))||(legacy.clientId!==undefined&&legacy.clientId!==null&&!uuid(legacy.clientId)))fail();
  // A client business book can be reached through more than one old customer
  // account. Its stable book ID, not the login used to export it, is the source.
  return JSON.stringify(book?['client-book',legacy.bookId]:[domain,legacy.accountId,legacy.clientId??null,legacy[field]]);
}
async function normalize(bytes,entry,report,preparation){
  const value=JSON.parse(decoder.decode(bytes)),migration={version:1,backupManifestSha256:report.backupManifestSha256};
  if(value.version!==1||!value.legacy||typeof value.legacy!=='object')fail();
  sourceKey(entry.domain,value);
  if(entry.sourceType==='client-book'){
    assertLegacyBookSource(value);if(await legacySha256(bytes)!==entry.sourceSha256)fail();
    return {version:1,type:'legacy-accounting',source:value,migration,preparation};
  }
  if(entry.domain==='driver-record'){
    const record=value.record;if(value.kind!=='legacy-driver-record'||record?.id!==entry.objectId||!['trip','expense','income'].includes(record.kind)||typeof record.deleted!=='boolean'||!Number.isSafeInteger(record.revision)||record.revision<1||!record.body||typeof record.body!=='object'||Array.isArray(record.body))fail();
    if(record.body.receiptId&&!report.entries.some(item=>item.domain==='driver-receipt'&&item.objectId===record.body.receiptId))fail();
    return {version:1,type:'driver-record',record,legacy:value.legacy,migration};
  }
  const file=value.file;if(value.kind!==(entry.domain==='driver-receipt'?'legacy-driver-receipt':'legacy-tax-document')||!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>10*1024**2||!['image/png','image/jpeg','application/pdf'].includes(file.mime)||!/^[a-f0-9]{64}$/.test(file.sha256))fail();
  const raw=decode64(file.bytesBase64url,file.size);
  try{
    if(await legacySha256(raw)!==file.sha256)fail();
    const magic=file.mime==='application/pdf'?[37,80,68,70,45]:file.mime==='image/jpeg'?[255,216,255]:[137,80,78,71,13,10,26,10];if(!magic.every((v,i)=>raw[i]===v))fail();
  }finally{raw.fill(0);}
  if(entry.domain==='driver-receipt'&&(!Array.isArray(value.links?.driverRecordObjectIds)||!value.links.driverRecordObjectIds.length||value.links.driverRecordObjectIds.some(id=>!report.entries.some(item=>item.domain==='driver-record'&&item.objectId===id))))fail();
  const extension={'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'}[file.mime];
  return {version:1,type:'private-file',filename:typeof file.name==='string'&&file.name?file.name.slice(0,240):`Migrated receipt.${extension}`,mime:file.mime,data:file.bytesBase64url,byteLength:file.size,purpose:entry.domain==='driver-receipt'?'receipt':'tax-document',category:entry.domain==='driver-receipt'?'purchases':'tax',notes:'Imported from a reviewed legacy backup.',savedAt:value.legacy.createdAt,legacy:value.legacy,...(value.links?{links:value.links}:{}),migration};
}
async function read(file,maximum){if(!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>maximum)throw new Error('Select the complete bounded migration export.');const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)throw new Error('A selected migration file changed.');return bytes;}
/** Selection and decrypted previews remain in memory. Durable retries contain
 * only ciphertext. Existing objects are compared, never overwritten. */
export class LegacyImport {
  #client;#scope;#rows=[];#generation=0;#running=false;report=null;
  constructor(client){this.#client=client;}
  get ready(){return !!this.report&&this.#rows.length>0;}
  get running(){return this.#running;}
  get rows(){return this.#rows.map(({objectId,domain,label,status})=>({objectId,domain,label,status}));}
  #check(generation){if(generation!==this.#generation||!this.#client.canWrite||scopeOf(this.#client)!==this.#scope)throw new Error('The account or unlocked view changed. Select the migration export again.');}
  clear(){this.#generation++;for(const row of this.#rows)row.bytes.fill(0);this.#rows=[];this.report=null;this.#scope=null;}
  async select(files){
    if(this.#running)throw new Error('Wait for the current import.');this.clear();if(!this.#client.canWrite)throw new Error('Unlock the destination account first.');this.#scope=scopeOf(this.#client);const generation=this.#generation,byName=new Map();
    this.#running=true;
    try{
      for(const file of Array.from(files)){if(byName.has(file.name))throw new Error('Migration file names must be unique.');byName.set(file.name,file);}
      if(byName.size>10002)throw new Error('Too many selected migration files.');
      const reportBytes=await read(byName.get('export-manifest.json'),8*1024**2),signature=JSON.parse(decoder.decode(await read(byName.get('import-signature.json'),4096)));
      const report=await verifyLegacyImportReport(reportBytes,signature,this.#client.config,this.#client.scope);this.#check(generation);
      if(byName.size!==report.entries.length+2)throw new Error('Select the report, signature and every encrypted object, with no extra files.');
      let total=0;
      for(const entry of report.entries){
        const raw=await read(byName.get(`${entry.objectId}.json`),entry.envelopeBytes);this.#check(generation);
        if(raw.length!==entry.envelopeBytes||await legacySha256(raw)!==entry.sha256)throw new Error('An encrypted object differs from its signed manifest.');
        const envelope=JSON.parse(decoder.decode(raw));if(envelope.context?.objectId!==entry.objectId||envelope.context?.domain!==entry.domain||envelope.context?.revision!==1)fail();
        const original=await this.#client.openLegacyExport(envelope,report.recipientManifest);
        try{
          this.#check(generation);
          const value=await normalize(original,entry,report,{reportBytes:decoder.decode(reportBytes),signature});this.#check(generation);
          const bytes=utf8.encode(JSON.stringify(value));let retained=false;
          try{
            total+=bytes.length;if(total>64*1024**2)throw new Error('Opened migration content exceeds the 64 MiB browser limit.');this.#check(generation);
            this.#rows.push({objectId:entry.objectId,domain:entry.domain,bytes,label:isLegacyBooks(value)?`Business books: ${value.source.book.name} · ${value.source.state?.entries.length??'unknown'} journal entries`:value.filename??`${value.record.deleted?'Archived deleted ':''}${value.record.kind}: ${value.record.body.description??value.record.body.merchant??value.record.body.purpose??'Legacy record'}`,status:'review'});retained=true;
          }finally{if(!retained)bytes.fill(0);}
        }finally{original.fill(0);}
      }
      const counts={};for(const row of this.#rows){const value=JSON.parse(decoder.decode(row.bytes));if(isLegacyBooks(value))for(const [name,count]of Object.entries(legacyBookCounts(value.source)))counts[name]=(counts[name]??0)+count;}
      for(const [name,count]of Object.entries(counts))if(report.supportedCounts[name]!==count)fail();
      await this.#client.sync();this.#check(generation);await this.#reconcile(generation);this.report=report;return this.rows;
    }catch(error){this.clear();throw error;}finally{this.#running=false;}
  }
  async #reconcile(generation){
    let size=[...this.#client.records.values()].reduce((sum,item)=>sum+item.plaintext.length,0),count=this.#client.records.size;
    const sources=new Map(),selected=new Map(),rowsById=new Map(this.#rows.map(row=>[row.objectId,row]));
    const remember=(domain,value,objectId)=>{if(!value?.migration||!(value?.legacy||isLegacyBooks(value))||!['driver-record','driver-receipt','tax-document'].includes(domain))return;const key=sourceKey(domain,value),prior=sources.get(key);if(prior&&prior!==objectId)throw new Error('This legacy source already has conflicting destination or pending objects. Reconcile its revisions separately.');sources.set(key,objectId);};
    for(const item of this.#client.records.values()){let value;try{value=JSON.parse(decoder.decode(item.plaintext));}catch{continue;}remember(item.domain,value,item.objectId);}
    for(const row of this.#rows){const key=sourceKey(row.domain,JSON.parse(decoder.decode(row.bytes)));if(selected.has(key))throw new Error('The selected export contains the same legacy source more than once. No import was started.');selected.set(key,row.objectId);}
    // A previous backup may have a durable encrypted retry with a different
    // destination ID. Reconcile every pending source before sending any row.
    const pending=await this.#client.pendingUploads();this.#check(generation);const pendingCounts=new Map();
    for(const item of pending){
      const opened=await this.#client.previewPrepared(item);
      try{
        this.#check(generation);let value;try{value=JSON.parse(decoder.decode(opened));}catch{value=null;}
        remember(item.domain,value,item.objectId);
        const row=rowsById.get(item.objectId);
        if(row){if(item.expectedRevision!==0||item.domain!==row.domain||!same(opened,row.bytes))throw new Error('A different pending write already uses this migration object. Keep it for separate review.');pendingCounts.set(row.objectId,(pendingCounts.get(row.objectId)??0)+1);}
      }finally{opened.fill(0);}
    }
    for(const [key,objectId]of selected){const prior=sources.get(key);if(prior&&prior!==objectId)throw new Error('This legacy source was imported or queued from another backup. Reconcile its revisions separately before importing it again.');}
    for(const row of this.#rows){const existing=this.#client.records.get(row.objectId);if(existing){if(existing.domain!==row.domain||!same(existing.plaintext,row.bytes))throw new Error('A migration destination already contains different content. Review it separately; existing records were preserved.');row.status='already imported';}else{row.status='ready';size+=row.bytes.length;count++;}}
    for(const row of this.#rows)if(row.status!=='already imported'&&(pendingCounts.get(row.objectId)??0)>1)throw new Error('Multiple pending writes require separate review. No import was started.');
    if(size>64*1024**2||count>10000)throw new Error('This import would exceed the current browser account limit. No existing item was replaced.');
  }
  async import({reviewed=false}={}){
    if(!reviewed||!this.ready||this.#running)throw new Error('Review the selected export and its unsupported coverage before importing.');const generation=this.#generation;this.#check(generation);this.#running=true;
    try{
      await this.#client.sync();this.#check(generation);await this.#reconcile(generation);
      for(const row of this.#rows){
        this.#check(generation);const pending=(await this.#client.pendingUploads()).filter(item=>item.objectId===row.objectId);this.#check(generation);
        for(const item of pending){const opened=await this.#client.previewPrepared(item);try{if(item.expectedRevision!==0||item.domain!==row.domain||!same(opened,row.bytes))throw new Error('A different pending write already uses this migration object. Keep it for separate review.');}finally{opened.fill(0);}}
        if(row.status==='already imported'){for(const item of pending)await this.#client.forgetPendingUpload(item.mutationId);continue;}
        if(pending.length>1)throw new Error('Multiple pending writes require separate review.');
        const prepared=pending[0]??await this.#client.prepareSave(row.domain,row.bytes,row.objectId);this.#check(generation);
        if(prepared.expectedRevision!==0)throw new Error('A migration cannot replace an existing revision.');
        await this.#client.keepPendingUpload(prepared);this.#check(generation);await this.#client.savePrepared(prepared);this.#check(generation);await this.#client.forgetPendingUpload(prepared.mutationId);row.status='imported';
      }
      await this.#client.sync();this.#check(generation);await this.#reconcile(generation);
      return {version:1,type:'shuug-legacy-import-reconciliation',workspaceId:this.#client.scope.workspaceId,accountId:this.#client.scope.accountId,backupManifestSha256:this.report.backupManifestSha256,objects:this.#rows.map(({objectId,domain})=>({objectId,domain,revision:this.#client.records.get(objectId).revision})),supportedCounts:this.report.supportedCounts,clientReopenedAll:true,sourcePurged:false,completeProductMigration:false,backupRecoveryVerified:false};
    }finally{this.#running=false;}
  }
}
