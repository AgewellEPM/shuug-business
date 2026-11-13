import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {generateRecipientKeyPair,publicKeyId,openEnvelope,sealEnvelope} from '../envelope.mjs';
import {openedRecordMetadata} from '../browser/opened-record.mjs';
import {legacyEntryDigest} from '../legacy-books.mjs';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const at='2026-11-13T12:00:00.000Z';
export const listFiles=(root,prefix='')=>readdirSync(path.join(root,prefix)).flatMap(name=>{const relative=prefix?`${prefix}/${name}`:name;return statSync(path.join(root,relative)).isDirectory()?listFiles(root,relative):[relative];}).sort();
export function sealBackup(root){const manifest={version:1,createdAt:at,files:listFiles(root).filter(name=>name!=='backup-manifest.json').map(name=>{const bytes=readFileSync(path.join(root,name));return {path:name,sha256:hash(bytes),bytes:bytes.length};})};const bytes=JSON.stringify(manifest);writeFileSync(path.join(root,'backup-manifest.json'),bytes);return hash(bytes);}
export const selectedFiles=directory=>listFiles(directory).map(name=>{const bytes=readFileSync(path.join(directory,name));return {name:path.basename(name),size:bytes.length,arrayBuffer:async()=>bytes};});
const line=(accountNumber,debitCents,creditCents)=>({accountNumber,debitCents,creditCents});
const billingLine=amount=>({description:'Synthetic consulting work',quantity:'1.0000',unit:'service',unitCents:amount,discountCents:0,taxCents:0,accountNumber:4000,taxAccountNumber:2200});
export async function fixture(){
  const directory=mkdtempSync(path.join(tmpdir(),'shuug-synthetic-business-migration-')),backup=path.join(directory,'backup');mkdirSync(backup,{mode:0o700});
  const accountId=randomUUID(),clientId=randomUUID(),bookId=randomUUID(),foreignId=randomUUID(),foreignClient=randomUUID();
  const book={id:bookId,clientId,name:'Synthetic client business <script>unsafe()</script>',revision:2,currency:'USD',grants:[{accountId:randomUUID(),level:'edit'}],createdAt:at};
  const rows=[['manual:opening','2025-01-01','Opening capital',[line(1000,50000,0),line(3000,0,50000)]],['billing:invoice','2025-02-01','Consulting invoice',[line(1200,10000,0),line(4000,0,10000)]],['billing:payment','2025-03-01','Partial payment',[line(1000,2500,0),line(1200,0,2500)]],['billing:credit','2025-04-01','Credit',[line(4000,1500,0),line(1200,0,1500)]],['manual:reverse','2025-07-01','Capital reversal',[line(1000,0,50000),line(3000,50000,0)]]];
  const entries=rows.map(([id,date,memo,lines])=>({entry:{id,date,memo,source:id.startsWith('billing:')?'native-billing':'manual',lines},actor:'Synthetic accountant',recordedAt:at,reversesId:id==='manual:reverse'?'manual:opening':null,reason:id==='manual:reverse'?'Synthetic correction':null,imported:false}));
  const accounts=[[1000,'Checking','asset','bank'],[1200,'Receivables','asset','receivable'],[3000,'Capital','equity','equity'],[4000,'Service sales','income','income']].map(([number,name,type,classification])=>({number,name,type,classification,statement:type==='income'?'profit-and-loss':'balance-sheet',parentNumber:null,active:true,revision:1,system:false}));
  const invoice={id:randomUUID(),revision:4,status:'posted',createdAt:at,updatedAt:at,kind:'invoice',number:'TEST-001',heading:'Invoice',date:'2025-02-01',due:'2025-03-01',currency:'USD',party:{name:'Synthetic customer',email:'synthetic@example.test',address:'Synthetic address'},issuer:'Synthetic client business',terms:'Net 30',notes:'Historical invoice',privateNotes:'Private synthetic notes',controlAccount:1200,lines:[billingLine(10000)],custom:[],journalId:'billing:invoice',settlements:[{id:randomUUID(),date:'2025-03-01',amountCents:2500,accountNumber:1000,method:'check',reference:'SYNTHETIC-CHECK-1',evidence:'Synthetic payment evidence',direction:'payment',journalId:'billing:payment',actor:'Synthetic accountant',at,providerPaymentId:'public-provider-payment-reference'}],credits:[{id:randomUUID(),date:'2025-04-01',reason:'Synthetic discount correction',lines:[billingLine(1500)],amountCents:1500,journalId:'billing:credit',actor:'Synthetic accountant',at}]};
  const state={accounts,accountAudit:[],entries,commands:{'synthetic-command':{hash:'a'.repeat(64),id:'billing:payment'}},audit:[{id:randomUUID(),action:'journal.reverse',entryId:'manual:reverse',actor:'Synthetic accountant',at,relatedId:'manual:opening'}],billing:[invoice]};
  const sealed=entries.filter(row=>row.entry.date<='2025-06-30').map(row=>row.entry),digest=await legacyEntryDigest(sealed),periods={active:{through:'2025-06-30',entries:sealed,digest,actor:'Synthetic owner',at},history:[{action:'close',through:'2025-06-30',reason:'Synthetic period review',reviewed:true,actor:'Synthetic owner',at,digest}]};
  const db=new DatabaseSync(path.join(backup,'workspace.sqlite'));
  try{
    db.exec('CREATE TABLE customer_accounts(id TEXT PRIMARY KEY,clientId TEXT); CREATE TABLE documents(id TEXT PRIMARY KEY,kind TEXT,body TEXT);');db.prepare('INSERT INTO customer_accounts VALUES(?,?)').run(accountId,clientId);
    const save=(id,kind,body)=>db.prepare('INSERT INTO documents VALUES(?,?,?)').run(id,kind,JSON.stringify(body));
    save(`client-book:${bookId}`,'client-book',book);save(`state:client-journal:${bookId}`,'state',state);save(`accounting-periods:${bookId}`,'accounting-periods',periods);
    save(`client-book:${foreignId}`,'client-book',{...book,id:foreignId,clientId:foreignClient,name:'FOREIGN_CLIENT_DO_NOT_COPY'});save(`state:client-journal:${foreignId}`,'state',{...state,secret:'FOREIGN_JOURNAL_DO_NOT_COPY'});
    save('state:manual-journal','state',{secret:'OFFICE_HISTORY_DO_NOT_COPY'});save(`billing-connection:${bookId}`,'billing-connection',{secret:'PROVIDER_SECRET_DO_NOT_COPY'});save('billing-share:synthetic','billing-share',{bookId,token:'PUBLIC_SHARE_DO_NOT_COPY'});
  }finally{db.close();}
  const pass='Synthetic bookkeeping migration passphrase only',firm=await createFirmBundle('synthetic-workspace',pass),unlocked=await unlockFirmBundle(firm.bundle,pass,firm.publicPins),client=await generateRecipientKeyPair();
  const manifest=await signEnrollmentRequest({version:1,workspaceId:firm.publicPins.workspaceId,accountId,clientId,client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},unlocked,{epoch:1});
  const options={backupDirectory:backup,backupManifestSha256:sealBackup(backup),manifest,expected:{accountId,clientId,manifestId:manifest.manifestId,minimumEpoch:1},unlocked,outputDirectory:path.join(directory,'export'),confirmCopiedBackup:true,confirmOffHost:true};
  return {directory,backup,book,state,periods,options,manifest,client,unlocked,publicPins:firm.publicPins,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
export function importClient(value){
  const scope={workspaceId:value.publicPins.workspaceId,accountId:value.manifest.accountId,clientId:value.manifest.clientId,keyId:value.manifest.client.keyId},recipients={clientPublicKey:value.client.publicKey,firmRecoveryPublicKey:value.publicPins.firmRecoveryPublicKey},remote=new Map(),pending=[];
  const client={scope,config:value.publicPins,canWrite:true,records:new Map(),writes:0,remote,
    openLegacyExport:(envelope)=>openEnvelope(envelope,envelope.context,recipients,'client',value.client.privateKey),
    async sync(){client.records=new Map(remote);},
    async prepareSave(domain,bytes,objectId){return {domain,objectId,expectedRevision:remote.has(objectId)?1:0,mutationId:randomUUID(),envelope:await sealEnvelope(bytes,{workspaceId:scope.workspaceId,accountId:scope.accountId,objectId,domain,revision:1},recipients,'client',value.client.privateKey)};},
    async pendingUploads(){return structuredClone(pending);},async keepPendingUpload(item){pending.push(structuredClone(item));},async forgetPendingUpload(id){const index=pending.findIndex(item=>item.mutationId===id);if(index>=0)pending.splice(index,1);},
    previewPrepared:item=>openEnvelope(item.envelope,item.envelope.context,recipients,'client',value.client.privateKey),
    async savePrepared(item){const plaintext=await client.previewPrepared(item),metadata=await openedRecordMetadata(plaintext,item.envelope,scope.clientId,value.publicPins);remote.set(item.objectId,{objectId:item.objectId,domain:item.domain,revision:1,plaintext,...metadata});client.writes++;await client.sync();}
  };return client;
}
