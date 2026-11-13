import {mountClientKeyRecovery} from './key-recovery-view.mjs';
import {mountLegacyImport} from './legacy-import-view.mjs';
import {mountAuthenticatorRecovery} from './authenticator-recovery-view.mjs';
import {mountEnrollment,mountPasswordRecovery} from './enrollment-view.mjs';
import trustedConfig from './trusted-config.mjs';
import { VaultClient, encodeJson } from './client.mjs';
import { decode64, DOMAINS, encode64 } from '../envelope.mjs';
import { journalSections, renderJournal } from './journal-view.mjs';
import { mountForms, formType, maskedDisplay } from './forms.mjs';
import { mountClientPortal } from './client-portal-view.mjs';
import { mountReturnEditor } from './return-editor.mjs';
import { isTaxReturn,renderReturn } from './return-view.mjs';
import { saveReturn } from './return-save.mjs';
import { renderCase } from './case-view.mjs';
import { renderOffice } from './office-view.mjs';
import { renderLegacyBooks } from './legacy-books-view.mjs';

const $=id=>document.getElementById(id), labels={
  'tax-document':'Tax documents','tax-identity':'Tax identity','driver-record':'Trips, income & expenses',
  'driver-receipt':'Receipts','driver-state':'Journal, goals & preferences','driver-route':'Routes','provider-record':'Provider records'
};
let client, normalEditor, taxEditor, editing=null, advancedDirty=false, working=false, viewGeneration=0;
let portal,enrollment,passwordRecovery,authenticatorRecovery,keyRecovery,legacyImport;
const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error);};
const download=(name,bytes,type='application/json')=>{
  const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
const downloadJson=(name,value)=>download(name,JSON.stringify(value,null,2));
const safeFilename=name=>typeof name==='string'?name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180)||'private-file':'private-file';
async function readJson(input){
  const file=input.files?.[0];if(!file||file.size>64*1024)throw new Error('Choose a JSON file smaller than 64 KiB.');
  try{return JSON.parse(await file.text());}catch{throw new Error('The selected file is not valid JSON.');}
}
function resetEditor(){editing=null;advancedDirty=false;$('payload').value='{"version":1,"title":"","notes":""}';$('attachment').value='';$('domain').disabled=!client?.canWrite||working;$('editor-title').textContent='Add a private item';}
function clearOpened(){viewGeneration++;for(const id of ['current-password','new-password','new-password-confirm'])$(id).value='';keyRecovery?.clear();legacyImport?.clear();enrollment?.clear();passwordRecovery?.clear();authenticatorRecovery?.clear();portal?.clear();taxEditor?.clear();$('groups').replaceChildren();resetEditor();normalEditor?.clear();$('payload').value='';$('mfa-code').value='';$('mfa-setup').textContent='';$('recovery-values').textContent='';$('recovery-codes').hidden=true;$('sync-result').textContent='Opened content cleared from this view.';}
function refreshControls(){
  const ready=!!client, unlocked=client?.unlocked, writable=client?.canWrite;
  for(const id of ['connect','key-choice','create-key','import-backup','import-key','signin-password','email','password'])$(id).disabled=!ready||working;
  $('account-controls').hidden=!client?.identity;for(const id of ['current-password','new-password','new-password-confirm','change-password','revoke-sessions'])$(id).disabled=!client?.identity||working;
  $('signout').disabled=!client?.identity||working;
  const pending=client?.pendingMfa;
  $('second-factor').hidden=!pending;$('mfa-code').disabled=!pending||working;$('mfa-verify').disabled=!pending||working;
  $('mfa-setup').textContent=pending?.secret??'';
  $('mfa-instructions').textContent=pending?.enrollmentRequired?'Add a time-based Shuug account in your authenticator using this private setup key. Use six digits and a 30-second interval, then enter its code.':'Enter the current code from your authenticator, or one unused recovery code.';
  for(const id of ['unlock'])$(id).disabled=!client?.identity||!$('key-choice').value||working;
  for(const id of ['renewal-request','renewal-file','install-renewal'])$(id).disabled=!client?.identity||!client.enrolled||!$('key-choice').value||working;
  $('backup').disabled=!ready||!$('key-choice').value||working;
  for(const id of ['request','manifest','verify-manifest'])$(id).disabled=!unlocked||working;
  for(const id of ['sync','payload','attachment','save','cancel-edit'])$(id).disabled=!writable||working;
  $('domain').disabled=!writable||working||!!editing;$('lock').disabled=!unlocked&&client?.records.size===0&&!pending&&!authenticatorRecovery?.dirty&&!legacyImport?.active;
  normalEditor?.setEnabled(!!writable&&!working);
  taxEditor?.setEnabled(!!writable&&!working);
  keyRecovery?.setEnabled(ready&&!working);legacyImport?.refresh();portal?.refresh();enrollment?.setEnabled(ready&&!working);passwordRecovery?.setEnabled(ready&&!working);authenticatorRecovery?.setEnabled(ready&&!working);
  // Pagination retains its own first/last-page disabled state.
  for(const button of $('groups').querySelectorAll('article.item>button'))button.disabled=working;
}
async function refreshKeys(select){
  const keys=await client.keys();$('key-choice').replaceChildren();
  for(const key of keys){const option=document.createElement('option');option.value=key.keyId;option.textContent=`Client key ${key.keyId.slice(0,14)}…`;$('key-choice').append(option);}
  if(!keys.length){const option=document.createElement('option');option.value='';option.textContent='No local key';$('key-choice').append(option);}
  if(select)$('key-choice').value=select;refreshControls();
}
async function run(operation){
  if(working)return;working=true;refreshControls();
  try{await operation();}catch(error){message(error instanceof Error?error.message:'This operation could not complete.',true);}
  finally{working=false;if(!client?.unlocked&&($('groups').childElementCount||portal?.active||taxEditor?.active||legacyImport?.active))clearOpened();statusText();refreshControls();}
}
function statusText(){
  $('account').textContent=client.identity?`Connected account ${client.identity.accountId}. ${client.enrolled?'Encrypted enrollment exists.':'Encrypted enrollment is not activated.'}`:'No account connected.';
  const status=client.status;
  $('migration').textContent=status?`${status.renewalRequired?'Signed enrollment expired. Renew encrypted access with the existing key before opening records. ':''}${status.legacyMigrationRequired?'Existing plaintext data requires migration. ':'No known current plaintext rows were reported; this is not proof of complete migration. '}${status.legacyProviderAuthorizationPresent?'Host-held provider authorizations remain and require revocation/removal. ':''}Backups, database history, logs and legacy copies still require separate review. Host-compromise protection is not verified.`:'';
}
function payload(item){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(item.plaintext));}catch{return null;}}
const button=(text,action,style)=>{const element=document.createElement('button');element.type='button';element.textContent=text;if(style)element.className=style;element.addEventListener('click',()=>run(action));return element;};
function renderGroups(){
  $('groups').replaceChildren();
  for(const domain of DOMAINS){
    const records=[...client.records.values()].filter(item=>item.domain===domain), area=document.createElement('details'),summary=document.createElement('summary');
    area.className='area';summary.textContent=`${labels[domain]} · ${records.length}`;area.append(summary);
    if(!records.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No encrypted items in this area.';area.append(empty);}
    for(const item of records){
      const data=payload(item),row=document.createElement('article'),title=document.createElement('h3'),meta=document.createElement('small');row.className='item';
      title.textContent=typeof data?.title==='string'?data.title.slice(0,200):typeof data?.filename==='string'?data.filename.slice(0,200):labels[domain];
      meta.textContent=`Item ${item.objectId} · revision ${item.revision}`;row.append(title,meta);
      const file=data?.version===1&&data?.type==='private-file'&&typeof data?.data==='string';
      const journal=journalSections(data,{workspaceId:client.config.workspaceId,...client.identity,objectId:item.objectId,domain:item.domain});
      if(item.verifiedLegacyBooks||data?.type==='legacy-accounting'){title.textContent='Imported business accounting';row.append(renderLegacyBooks(document,item,{download,run}));
      }else if(item.verifiedOffice||data?.type==='client-office'){title.textContent='Your client books and firm billing';row.append(renderOffice(document,item,client.records));
      }else if(item.verifiedCase||data?.type==='tax-case'){
        title.textContent='Your client case';row.append(renderCase(document,item,client.records));
      }else if(item.domain==='tax-document'&&isTaxReturn(data)){
        title.textContent=`${data.year} Form ${data.kind} draft`;const generation=viewGeneration;
        row.append(renderReturn(document,data,{run,download,isCurrent:()=>generation===viewGeneration&&client?.canWrite&&!document.hidden&&row.isConnected}));
        row.append(button('Edit return',async()=>{taxEditor.edit(data,item.objectId);},'secondary'));
      }else if(journal){
        title.textContent='Device Journal snapshot';row.append(renderJournal(document,journal));
        row.append(button('Download readable snapshot',async()=>{download(`${item.objectId}.journal.json`,item.plaintext);message('Readable Journal snapshot downloaded at your request. No device state was restored or replayed.');},'secondary'));
      }else if(file){
        const description=document.createElement('p');description.textContent=`Private attachment · ${typeof data.mime==='string'?data.mime:'unrecognized file type'}`;row.append(description);
        row.append(button('Download readable file',async()=>{
          // Only inert download; no HTML/SVG preview or external resource URL.
          const bytes=decode64(data.data,1,10*1024*1024);
          const allowed=['application/pdf','image/jpeg','image/png'].includes(data.mime)?data.mime:'application/octet-stream';
          download(safeFilename(data.filename),bytes,allowed);bytes.fill(0);
          message('Readable file downloaded at your request. Its Downloads copy is outside this vault.');
        }));
      }else{
        const pre=document.createElement('pre');pre.textContent=data?JSON.stringify(maskedDisplay(data),null,2).slice(0,20000):'This encrypted item uses a payload this preview cannot display.';row.append(pre);
        if(data)row.append(button('Edit details',async()=>{
          if(formType(data)){normalEditor.edit(data,item.objectId);return;}
          editing=item.objectId;$('domain').value=item.domain;$('payload').value=JSON.stringify(data,null,2);$('attachment').value='';$('editor-title').textContent='Edit private item';$('advanced-editor').open=true;$('editor').scrollIntoView({behavior:'smooth',block:'start'});
        },'secondary'));
        row.append(button('Download readable JSON',async()=>{download(`${item.objectId}.json`,item.plaintext);message('Readable JSON downloaded at your request. Its Downloads copy is outside this vault.');},'secondary'));
      }
      if(!item.verifiedCase&&data?.type!=='tax-case')row.append(button('Delete encrypted item',async()=>{
        if(!confirm('Delete this encrypted item from the live API? Older ciphertext can remain in backups or filesystem history. This cannot remove readable files you downloaded.'))return;
        const generation=viewGeneration;await client.remove(item.objectId);if(generation!==viewGeneration)return;
        if(editing===item.objectId)resetEditor();if(taxEditor?.editingId===item.objectId)taxEditor.clear();renderGroups();message('Live ciphertext and object retry records deleted. A content-free sync tombstone remains; backups and prior downloads may retain copies.');
      },'danger'));area.append(row);
    }
    $('groups').append(area);
  }
  portal?.render();
}
const canRefresh=()=>!normalEditor?.dirty&&!taxEditor?.dirty&&!editing&&!advancedDirty;
portal=mountClientPortal(document,$('groups').parentElement,{getClient:()=>client,run,onSaved:renderGroups,onLocked:()=>{clearOpened();statusText();if(!client.identity)message('Sign-in expired or access was revoked. Opened information was cleared; sign in again.',true);},onMessage:message,isWorking:()=>working,setWorking:value=>{working=value;},refreshControls,captureScope:()=>viewGeneration,isCurrentScope:generation=>generation===viewGeneration,canRefresh,confirm:text=>confirm(text)});
legacyImport=mountLegacyImport(document,$('groups'),{getClient:()=>client,run,onSaved:renderGroups,onMessage:message,isWorking:()=>working,download});
for(const id of ['payload','attachment','domain'])$(id).addEventListener('input',()=>{advancedDirty=true;portal.pending();});
for(const domain of DOMAINS){const option=document.createElement('option');option.value=domain;option.textContent=labels[domain];$('domain').append(option);}
normalEditor=mountForms(document,$('normal-editor'),{run,captureScope:()=>viewGeneration,isCurrentScope:generation=>generation===viewGeneration,onDirty:()=>portal.pending(),onSave:async(result,id)=>{const generation=viewGeneration,bytes=encodeJson(result.payload);try{await client.save(result.domain,bytes,id??undefined);if(generation!==viewGeneration)return;renderGroups();message('Private item encrypted on this device and saved. Journal snapshots were not merged or replaced.');}finally{bytes.fill(0);}},onDelete:async id=>{await client.remove(id);renderGroups();message('Entire live tax-identity ciphertext and retry records deleted. A content-free tombstone remains; backups and recipient copies are not erased.');}});
taxEditor=mountReturnEditor(document,$('return-editor'),{run,download,captureScope:()=>viewGeneration,isCurrentScope:generation=>generation===viewGeneration&&!!client?.canWrite,onDirty:()=>portal.pending(),onSave:async(value,id,onPrepared)=>{const generation=viewGeneration;try{await saveReturn(client,value,id??undefined,{onPrepared});if(generation!==viewGeneration)return;renderGroups();message('Return input encrypted and saved. Calculations can be reopened from these inputs; no return was transmitted.');}catch(error){if(generation===viewGeneration&&client.canWrite)await portal.queue?.restore();throw error;}}});
function signedIn(result){
  if(result.mfaRequired){message('Password verified. Complete authenticator verification to access your account.');return;}
  if(result.recoveryCodes?.length){$('recovery-values').textContent=result.recoveryCodes.join('\n');$('recovery-codes').hidden=false;}
  message('Signed in. Select the account client key to verify enrollment or prepare signed setup.');
}
keyRecovery=mountClientKeyRecovery(document,$('enrollment-container'),{getClient:()=>client,getKeyId:()=>$('key-choice').value,run,download,onRecovered:result=>{clearOpened();$('email').value=result.accountCode;message('Encryption key recovered; old sessions revoked. Sign in with your unchanged password and authenticator, then select the replacement key. The firm must refresh staff sharing and review case dependencies against the replacement ciphertext.');}});
enrollment=mountEnrollment(document,$('enrollment-container'),{getClient:()=>client,getKeyId:()=>$('key-choice').value,run,download,onAccountCode:value=>{$('email').value=value;},onActivated:result=>{clearOpened();$('email').value=result.accountCode;message('New encrypted account activated. Sign in with your private account code and account password, then set up the required authenticator.');}});
passwordRecovery=mountPasswordRecovery(document,$('enrollment-container'),{getClient:()=>client,getKeyId:()=>$('key-choice').value,run,onRecovered:result=>{clearOpened();$('email').value=result.accountCode;message('Account password recovered and old sessions revoked. Sign in with the new password and your existing authenticator or unused recovery code.');}});
authenticatorRecovery=mountAuthenticatorRecovery(document,$('enrollment-container'),{getClient:()=>client,getKeyId:()=>$('key-choice').value,run,onStarting:()=>{if(!canRefresh()||portal?.queue?.hasUnprepared)throw new Error('Save or clear unfinished work before authenticator recovery.');clearOpened();},onRecovered:result=>{clearOpened();$('email').value=result.accountCode;$('recovery-values').textContent=result.recoveryCodes.join('\n');$('recovery-codes').hidden=false;message('Authenticator replaced; old sessions and recovery codes revoked. Save these new recovery codes. Sign in with your unchanged password once the replacement authenticator shows a fresh code, or use one new recovery code.');}});
$('signin-password').addEventListener('click',()=>run(async()=>{clearOpened();const password=$('password').value;$('password').value='';signedIn(await client.signInWithCode($('email').value.trim(),password));}));
$('change-password').addEventListener('click',()=>run(async()=>{if($('new-password').value!==$('new-password-confirm').value)throw new Error('Enter matching new passwords.');if(!canRefresh()||portal?.queue?.hasUnprepared)throw new Error('Save or clear unfinished work before changing account access.');const current=$('current-password').value,next=$('new-password').value;for(const id of ['current-password','new-password','new-password-confirm'])$(id).value='';await client.changeAccountPassword(current,next);clearOpened();message('Password changed and all account sessions revoked. Sign in with the new password and your authenticator.');}));
$('revoke-sessions').addEventListener('click',()=>run(async()=>{if(!canRefresh()||portal?.queue?.hasUnprepared)throw new Error('Save or clear unfinished work before signing out all sessions.');await client.revokeAllSessions();clearOpened();message('All account sessions revoked. Your authenticator and encrypted key backup remain usable.');}));
$('mfa-verify').addEventListener('click',()=>run(async()=>{const code=$('mfa-code').value;$('mfa-code').value='';signedIn(await client.verifySignIn(code));}));
$('recovery-saved').addEventListener('click',()=>{$('recovery-values').textContent='';$('recovery-codes').hidden=true;});
$('signout').addEventListener('click',()=>run(async()=>{clearOpened();await client.signOut();message('Signed out. Memory session and opened content cleared; saved browser keys remain.');}));
$('connect').addEventListener('click',()=>run(async()=>{clearOpened();await client.connect();statusText();message('Account connected. Select its local key to verify enrollment or prepare signed setup.');}));
$('lock').addEventListener('click',()=>{client.lock();clearOpened();refreshControls();message('View locked. Opened content cleared; the nonextractable key handle remains in this browser profile.');});
$('key-choice').addEventListener('change',()=>{client?.lock();clearOpened();refreshControls();});
$('unlock').addEventListener('click',()=>run(async()=>{clearOpened();await client.unlock($('key-choice').value);if(client.canWrite)await portal.activate();resetEditor();message(client.enrolled?'Client key matches the independently verified signed manifest. Your portal can upload files and check current encrypted records.':'Key ready for a public enrollment request. Activation remains unavailable.');}));
$('create-key').addEventListener('click',()=>run(async()=>{
  const value=$('passphrase').value;if(value!==$('passphrase-confirm').value)throw new Error('The new-key backup passphrases do not match.');
  try{const result=await client.createKey(value);client.lock();clearOpened();await refreshKeys(result.keyId);downloadJson(`client-key-${result.keyId.slice(0,12)}.encrypted.json`,result.backup);message('Client key saved as nonextractable. Keep the encrypted backup and its separate passphrase safe. No server enrollment changed.');}
  finally{$('passphrase').value='';$('passphrase-confirm').value='';}
}));
$('import-key').addEventListener('click',()=>run(async()=>{
  try{const result=await client.importKey(await readJson($('import-backup')),$('passphrase').value);client.lock();clearOpened();await refreshKeys(result.keyId);message('Client key recovered into nonextractable browser storage. Connect its account and select Use selected key.');}
  finally{$('passphrase').value='';$('passphrase-confirm').value='';$('import-backup').value='';}
}));
$('backup').addEventListener('click',()=>run(async()=>{const id=$('key-choice').value;downloadJson(`client-key-${id.slice(0,12)}.encrypted.json`,await client.encryptedBackup(id));message('Encrypted backup downloaded. Its passphrase stays separate; this file contains no plaintext private key.');}));
$('renewal-request').addEventListener('click',()=>run(async()=>{downloadJson('public-enrollment-renewal-request.json',await client.renewalRequest($('key-choice').value));message('Public renewal request saved. Ask the separate firm signing environment to review the existing account and key.');}));
$('install-renewal').addEventListener('click',()=>run(async()=>{if(!canRefresh()||portal?.queue?.hasUnprepared)throw new Error('Save or clear unfinished work before installing renewal.');const packet=await readJson($('renewal-file'));await client.installEnrollmentRenewal(packet,$('key-choice').value);$('renewal-file').value='';clearOpened();message('Enrollment renewed with the same encryption keys. Use the selected key to reopen records. Staff sharing needs fresh firm-approved capsules.');}));
$('request').addEventListener('click',()=>run(async()=>{downloadJson('public-enrollment-request.json',client.publicRequest());message('Public request downloaded. Ask the firm to sign it using its separately held signing key.');}));
$('verify-manifest').addEventListener('click',()=>run(async()=>{
  const result=await client.stageManifest(await readJson($('manifest')));$('manifest').value='';$('manifest-result').textContent=`Signature, independent public pins, account, client key and epoch ${result.epoch} verified. Staged locally only; activation remains unavailable.`;message('Signed manifest verified and staged. No enrollment or data migration was sent to the API.');
}));
$('sync').addEventListener('click',()=>run(async()=>{if(!canRefresh())throw new Error('Save or clear the current form before refreshing encrypted records. Your unsaved changes were kept.');const generation=viewGeneration,result=await client.sync();if(generation!==viewGeneration)return;renderGroups();portal.updated();$('sync-result').textContent=`${result.items} encrypted items opened locally. No legacy records were migrated.`;message('Encrypted items synced and authenticated on this device.');}));
$('cancel-edit').addEventListener('click',()=>{resetEditor();refreshControls();});
$('save').addEventListener('click',()=>run(async()=>{
  let bytes;const file=$('attachment').files?.[0],generation=viewGeneration;
  if(file){
    if(editing)throw new Error('Create a new item for a new attachment.');
    if(!['tax-document','driver-receipt'].includes($('domain').value))throw new Error('Choose Tax documents or Receipts for a private file.');
    if(file.size<1||file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw new Error('Choose a PDF, JPEG or PNG file of at most 10 MiB.');
    const raw=new Uint8Array(await file.arrayBuffer());try{bytes=encodeJson({version:1,type:'private-file',filename:file.name,mime:file.type,data:encode64(raw)});}finally{raw.fill(0);}
  }else{let data;try{data=JSON.parse($('payload').value);}catch{throw new Error('Enter valid JSON details before encrypting.');}bytes=encodeJson(data);}
  try{if(generation!==viewGeneration)throw new Error('The view was locked. Select the account key again.');await client.save($('domain').value,bytes,editing??undefined);if(generation!==viewGeneration)return;resetEditor();renderGroups();message('Item encrypted on this device and saved as ciphertext.');}finally{bytes?.fill(0);}
}));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(client?.unlocked||client?.pendingMfa||authenticatorRecovery?.dirty||!$('recovery-codes').hidden)){client.lock();clearOpened();refreshControls();message('View locked after leaving this tab. Select the account key again.');}});
window.addEventListener('pagehide',()=>{client?.lock();clearOpened();});
window.addEventListener('beforeunload',event=>{if(portal?.queue?.hasUnprepared||taxEditor?.dirty||enrollment?.dirty||passwordRecovery?.dirty||authenticatorRecovery?.dirty){event.preventDefault();event.returnValue='';}});
try{
  client=await VaultClient.create(trustedConfig,location.origin);$('trust').textContent=`Independent client: ${client.config.uiOrigin}. Ciphertext API: ${client.config.apiOrigin}. Public trust pins were installed with this static client.`;
  $('signin').href=`${client.config.apiOrigin}/api/website/customer`;$('signin').hidden=false;await refreshKeys();message('Independent trust configuration loaded. Sign in with your private account code, or set up a new account using a firm invitation.');
}catch(error){message(error.message,true);}
