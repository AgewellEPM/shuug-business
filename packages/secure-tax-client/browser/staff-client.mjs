import { verifyStaffGrant, verifyStaffCapsuleSignature, openStaffCapsule } from '../staff-grants.mjs';
import { BrowserKeyStore, createClientKey, importEncryptedBackup, assertPrivateKey } from './custody.mjs';
import { validateTrustedConfig } from './config.mjs';
import { prepareReturnProposal } from '../return-proposals.mjs';
import { calculateReturn } from '@shuug/tax-engine';
import { verifyReturnEditApproval } from '../return-edit-approval.mjs';
import { prepareReturnCreation } from '../return-creations.mjs';
import { verifyReturnCreationApproval } from '../return-create-approval.mjs';
import { prepareCaseTransition } from '../case-proposals.mjs';
import { verifyCaseApproval } from '../case-approval.mjs';
import { CASE_OBJECT_PREFIX } from '../case-contract.mjs';
import {officeObjectId} from '../office-model.mjs';
import { openedRecordMetadata } from './opened-record.mjs';

const prefix='/api/website/customer/secure/staff';
const id=value=>typeof value==='string'&&value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===value;
const integer=(value,min=1)=>Number.isSafeInteger(value)&&value>=min;
const clone=value=>structuredClone(value);
const ownVersion=(versions,key)=>Object.hasOwn(versions,key)?versions[key]:undefined;
const setVersion=(versions,key,value)=>Object.defineProperty(versions,key,{value,enumerable:true,writable:true,configurable:true});
async function readJson(response,maximum,challenge=false){
  if(!response.ok&&!(challenge&&response.status===428))throw new Error(response.status===401||response.status===403?'Staff access expired or was revoked. Sign in and check your current grants.':response.status===409?'The current encrypted revision is awaiting a matching signed sharing capsule. No older revision was opened.':'The encrypted staff API rejected this request.');
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!response.body)throw new Error('Invalid encrypted staff response.');
  if(Number(response.headers.get('content-length'))>maximum)throw new Error('The encrypted staff response exceeds this client’s limit.');
  const reader=response.body.getReader(),parts=[];let length=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;length+=value.length;if(length>maximum)throw new Error('The encrypted staff response exceeds this client’s limit.');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('Invalid encrypted staff JSON response.');}
}

/** Independent trusted staff reader/proposer. It has no plaintext upload or
 * direct staff object writer; only the owner publishes exact firm approvals.
 * Device-key backups reuse the existing encrypted, nonextractable client custody
 * primitive in a distinct IndexedDB namespace. */
export class StaffVaultClient {
  #config;#storage;#fetch;#token;#expires=0;#generation=0;#key=null;#selection=null;#binding=null;#busy=false;#mfa=null;
  identity=null;grants=[];records=new Map();
  static async create(config,origin,options={}){return new StaffVaultClient(await validateTrustedConfig(config,origin),options);}
  constructor(config,{storage=new BrowserKeyStore({databaseName:'shuug-secure-tax-staff-v1'}),fetcher=globalThis.fetch}={}){this.#config=config;this.#storage=storage;this.#fetch=fetcher;}
  get config(){return this.#config;}
  get unlocked(){return !!this.#key;}
  get keyId(){return this.#key?.keyId;}
  get selectedGrant(){return this.#selection?clone(this.#selection):null;}
  get pendingMfa(){return this.#mfa?clone(this.#mfa):null;}
  get isOwner(){return this.identity?.staffAccountId==='workspace-owner';}
  #same(generation){if(generation!==this.#generation)throw new Error('The staff account, key or client changed. Unlock the current device again.');}
  #clear(){this.#generation++;this.#mfa=null;this.#key=null;this.#selection=null;this.#binding=null;for(const item of this.records.values())item.plaintext.fill(0);this.records.clear();}
  #forgetSession(){this.#token=null;this.#expires=0;this.#clear();this.identity=null;this.grants=[];}
  lock(){this.#clear();}
  async #request(path,method='GET',body,maximum=65536,challenge=false){
    if(this.#token&&this.#expires<=Date.now()){this.#forgetSession();throw new Error('Your staff session expired. Sign in again.');}
    const generation=this.#generation;
    const response=await this.#fetch(`${this.#config.apiOrigin}${prefix}${path}`,{method,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.#token?{Authorization:`Bearer ${this.#token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if((response.status===401||response.status===403)&&generation===this.#generation&&!challenge)this.#forgetSession();
    if(response.status===409&&path.startsWith('/scope?')){await response.body?.cancel();throw new Error('The selected client enrollment or assignment changed. Refresh signed access or ask the firm to renew enrollment.');}
    return readJson(response,maximum,challenge);
  }
  async signIn(email,password){
    this.#forgetSession();const generation=this.#generation;
    if(typeof email!=='string'||email.length>160||typeof password!=='string'||!password||password.length>200)throw new Error('Enter your staff account and password.');
    const result=await this.#request('/session','POST',{email:email.trim(),password},8192,true);this.#same(generation);
    if(result?.mfaRequired!==true)throw new Error('Staff vault access requires authenticator verification. No session was accepted.');
    if(result.apiVersion!==1||!/^[a-f0-9]{64}$/.test(result.challengeToken)||typeof result.enrollmentRequired!=='boolean'||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now()||Date.parse(result.expiresAt)>Date.now()+6*60000||result.enrollmentRequired&&!/^[A-Z2-7]{32}$/.test(result.secret))throw new Error('Invalid staff verification challenge.');
    this.#mfa={challengeToken:result.challengeToken,enrollmentRequired:result.enrollmentRequired,expiresAt:result.expiresAt,secret:result.enrollmentRequired?result.secret:null};return {mfaRequired:true};
  }
  async verifySignIn(code){
    if(!this.#mfa||Date.parse(this.#mfa.expiresAt)<=Date.now()){this.#mfa=null;throw new Error('Staff verification expired. Sign in again.');}
    if(typeof code!=='string'||!code.trim()||code.length>40)throw new Error('Enter your authenticator or unused account recovery code.');
    const generation=this.#generation,result=await this.#request('/session','POST',{challengeToken:this.#mfa.challengeToken,code:code.trim()},8192,true);this.#same(generation);
    if(result?.apiVersion!==1||typeof result.token!=='string'||!/^[A-Za-z0-9._~-]{16,4096}$/.test(result.token)||!id(result.identity?.staffAccountId)||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now())throw new Error('Invalid verified staff session.');
    const recoveryCodes=result.recoveryCodes??[];
    if(!Array.isArray(recoveryCodes)||recoveryCodes.length>10||recoveryCodes.some(value=>typeof value!=='string'||!/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/.test(value)))throw new Error('Invalid account recovery codes.');
    this.#token=result.token;this.#expires=Date.parse(result.expiresAt);this.#mfa=null;
    try{const status=await this.#request('/status');this.#same(generation);if(status.apiVersion!==1||status.mfaVerified!==true||status.identity?.staffAccountId!==result.identity.staffAccountId)throw new Error('Staff identity changed during verification.');this.identity={staffAccountId:result.identity.staffAccountId};return {...status,recoveryCodes};}
    catch(error){this.#forgetSession();throw error;}
  }
  async signOut(){const pending=this.#token?this.#request('/session','DELETE'):Promise.resolve();this.#forgetSession();try{await pending;}catch{throw new Error('Local staff view cleared. The API could not confirm session revocation.');}}
  async keys(){
    const keys=await this.#storage.listKeys(),marked=[];
    for(const key of keys)if((await this.#storage.getBinding(`staff-local-key:${key.keyId}`))?.purpose==='staff-device')marked.push(key);
    return marked;
  }
  async #keep(entry){await this.#storage.putKey(entry);await this.#storage.putBinding({id:`staff-local-key:${entry.keyId}`,purpose:'staff-device',keyId:entry.keyId});return {keyId:entry.keyId,publicKey:entry.publicKey};}
  async createKey(passphrase){const entry=await createClientKey(passphrase);return {...await this.#keep(entry),backup:clone(entry.backup)};}
  async importKey(backup,passphrase){return this.#keep(await importEncryptedBackup(backup,passphrase));}
  async encryptedBackup(keyId){const entry=await this.#storage.getKey(keyId);if(!entry?.backup)throw new Error('No encrypted device-key backup is stored here.');return clone(entry.backup);}
  async unlock(keyId){
    if(!this.identity)throw new Error('Verify your staff sign-in first.');this.#clear();const generation=this.#generation;
    const entry=await this.#storage.getKey(keyId);this.#same(generation);if(!entry)throw new Error('Create or recover this staff device key first.');assertPrivateKey(entry.privateKey);this.#key=entry;return {keyId:entry.keyId,publicKey:entry.publicKey};
  }
  publicRequest(){if(!this.identity||!this.#key)throw new Error('Sign in and unlock the staff device key first.');return {version:1,workspaceId:this.#config.workspaceId,staffAccountId:this.identity.staffAccountId,staff:{keyId:this.#key.keyId,publicKey:this.#key.publicKey}};}
  #bindingId(grant){return `staff:${this.#config.workspaceId}|${this.identity.staffAccountId}|${this.#key.keyId}|${grant.accountId}|${grant.clientId}|${grant.grantId}`;}
  #manifestBindingId(grant){return `staff-manifest:${this.#config.workspaceId}|${grant.accountId}|${grant.clientId}`;}
  async #rememberManifestEpoch(grant,minimumManifestEpoch,generation){
    if(!integer(minimumManifestEpoch)||minimumManifestEpoch>1000000000)throw new Error('The client enrollment checkpoint is invalid.');
    if(typeof this.#storage.updateBinding!=='function')throw new Error('Atomic staff trust storage is required before preparing or opening client returns.');
    const id=this.#manifestBindingId(grant),stored=await this.#storage.updateBinding(id,current=>{
      this.#same(generation);const observed=current?.minimumManifestEpoch??1;
      if(!integer(observed)||observed>1000000000||current&&current.id!==id)throw new Error('The local client enrollment checkpoint needs review.');
      return {...current,id,minimumManifestEpoch:Math.max(observed,minimumManifestEpoch)};
    });this.#same(generation);
    if(stored.minimumManifestEpoch>minimumManifestEpoch)throw new Error('A newer client enrollment was observed in another staff view. Reopen its current signed scope.');
  }
  #nextBinding(grant,verified,binding){
    const same=binding?.minimumGrantEpoch===verified.epoch&&binding?.grantDigest===verified.grantDigest;
    return {...binding,id:this.#bindingId(grant),minimumGrantEpoch:verified.epoch,grantDigest:verified.grantDigest,minimumManifestEpoch:binding?.minimumManifestEpoch??1,versions:binding?.versions??{},requiredPresence:same?(binding.requiredPresence??Object.keys(binding.versions??{})):[]};
  }
  async #verify(grant,generation){
    const binding=await this.#storage.getBinding(this.#bindingId(grant));this.#same(generation);
    const verified=await verifyStaffGrant(grant,{staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:grant.accountId,clientId:grant.clientId,minimumGrantEpoch:binding?.minimumGrantEpoch??1},this.#config);this.#same(generation);
    if(verified.status!=='active')throw new Error('This staff grant was revoked. Request fresh access for the current device.');
    if(binding?.minimumGrantEpoch===verified.epoch&&binding.grantDigest!==verified.grantDigest)throw new Error('A different staff grant reused an observed epoch.');
    return {verified,binding};
  }
  async refreshGrants(){
    if(!this.identity||!this.#key)throw new Error('Verify sign-in and unlock your staff device key first.');const generation=this.#generation;
    try{
    const result={grants:[]},seen=new Set();let after='',snapshot=null,pages=0,total=0;
    do{
      if(++pages>401)throw new Error('This staff list exceeds the supported workspace capacity.');
      const query=new URLSearchParams({limit:'25',...(after?{after,snapshot}:{})});
      const page=await this.#request('/grants?'+query);this.#same(generation);
      if(!Array.isArray(page.grants)||!Array.isArray(page.revocations??[]))throw new Error('Invalid staff grant list.');
      const paginated=Object.hasOwn(page,'snapshot')||Object.hasOwn(page,'nextCursor');
      if(paginated){
        if(!/^[a-f0-9]{64}$/.test(page.snapshot??'')||snapshot&&snapshot!==page.snapshot||page.nextCursor!==null&&(!id(page.nextCursor)||page.nextCursor<=after)||page.grants.length+(page.revocations??[]).length>25)throw new Error('The staff-list snapshot or continuation changed.');
        snapshot=page.snapshot;
      }else if(pages!==1||page.grants.length>1000||(page.revocations??[]).length>1000)throw new Error('Invalid unpaginated staff grant list.');
      // Remember signed denials as soon as their page arrives, even if a later
      // page fails. Never expose a partial list as the complete authorization.
      for(const notice of page.revocations??[]){
        if(notice?.staff?.keyId!==this.#key.keyId)continue;
        if(notice.status!=='revoked')throw new Error('Invalid signed staff revocation list.');
        await this.stageGrant(notice,{clearUnselected:false});this.#same(generation);
      }
      for(const document of [...page.grants,...(page.revocations??[])]){
        if(!id(document?.grantId)||seen.has(document.grantId)||paginated&&(document.grantId<=after||page.nextCursor!==null&&document.grantId>page.nextCursor)||++total>10000)throw new Error('Invalid or repeated staff grant in the complete list.');
        seen.add(document.grantId);
      }
      result.grants.push(...page.grants);after=paginated?page.nextCursor:null;
    }while(after!==null);
    const grants=[],verifiedById=new Map();
    for(const grant of result.grants){
      if(grant?.staff?.keyId!==this.#key.keyId)continue;
      const {verified,binding}=await this.#verify(grant,generation);
      await this.#storage.putBinding(this.#nextBinding(grant,verified,binding));this.#same(generation);
      verifiedById.set(grant.grantId,verified);
      grants.push(clone(grant));
    }
    this.grants=grants;
    if(this.#selection&&(!verifiedById.has(this.#selection.grantId)||verifiedById.get(this.#selection.grantId).grantDigest!==this.#binding.grantDigest)){this.#clear();throw new Error('The selected staff grant changed, is unavailable or was revoked. Opened data was cleared.');}
    return clone(grants);
    }catch(error){if(generation===this.#generation)this.#clear();throw error;}
  }
  async selectGrant(grantId){
    if(!this.#key)throw new Error('Unlock the staff key first.');this.#generation++;const generation=this.#generation;
    for(const item of this.records.values())item.plaintext.fill(0);this.records.clear();this.#selection=null;this.#binding=null;
    const grants=await this.refreshGrants();this.#same(generation);const grant=grants.find(value=>value.grantId===grantId);if(!grant)throw new Error('This client grant is unavailable or revoked.');
    const {verified,binding}=await this.#verify(grant,generation);
    const value=this.#nextBinding(grant,verified,binding);
    await this.#storage.putBinding(value);this.#same(generation);this.#selection=grant;this.#binding=value;return clone(grant);
  }
  async stageGrant(grant,{clearUnselected=true}={}){
    if(!this.identity||!this.#key)throw new Error('Sign in and unlock the staff device key before checking a signed notice.');const generation=this.#generation;
    const binding=await this.#storage.getBinding(this.#bindingId(grant));this.#same(generation);
    const verified=await verifyStaffGrant(grant,{staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:grant.accountId,clientId:grant.clientId,minimumGrantEpoch:binding?.minimumGrantEpoch??1},this.#config);this.#same(generation);
    if(binding?.minimumGrantEpoch===verified.epoch&&binding.grantDigest!==verified.grantDigest)throw new Error('A different signed grant reused an observed epoch.');
    await this.#storage.putBinding(this.#nextBinding(grant,verified,binding));this.#same(generation);
    if(verified.status==='revoked'&&(clearUnselected||this.#selection?.grantId===grant.grantId)||this.#selection?.grantId===grant.grantId&&this.#binding.grantDigest!==verified.grantDigest)this.#clear();
    return {...verified,apiActivationPerformed:false};
  }
  async installGrant(grant){
    if(!this.isOwner)throw new Error('Only the firm owner can register a separately signed grant.');
    await verifyStaffGrant(grant,{staffAccountId:grant?.staffAccountId,staffKeyId:grant?.staff?.keyId,accountId:grant?.accountId,clientId:grant?.clientId},this.#config);
    return this.#request('/grants','POST',grant);
  }
  async installCapsule(capsule){if(!this.isOwner)throw new Error('Only the firm owner can register a separately signed sharing capsule.');await verifyStaffCapsuleSignature(capsule,this.#config);return this.#request('/capsules','POST',capsule);}
  async withdrawGrant(grantId,expectedEpoch){if(!this.isOwner||!id(grantId)||!integer(expectedEpoch))throw new Error('Owner access and the exact grant ID/epoch are required.');return this.#request('/grants','DELETE',{grantId,expectedEpoch});}
  async prepareNewReturn(after){
    if(this.#busy)throw new Error('Wait for the current staff operation.');
    if(!this.#selection||!this.#key||!this.identity||!this.#selection.domains.includes('tax-document'))throw new Error('Select a current signed tax-document grant before preparing a new client return.');
    if(!calculateReturn(after).calculationAvailable)throw new Error('Correct the draft input before preparing a private review kit.');
    const draft=clone(after),generation=this.#generation,selected=clone(this.#selection);this.#busy=true;
    try{
      await this.refreshGrants();this.#same(generation);
      const observedManifest=await this.#storage.getBinding(this.#manifestBindingId(selected));this.#same(generation);
      const expected={staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:selected.accountId,clientId:selected.clientId,minimumGrantEpoch:this.#binding.minimumGrantEpoch,minimumManifestEpoch:Math.max(this.#binding.minimumManifestEpoch??1,observedManifest?.minimumManifestEpoch??1),objectId:crypto.randomUUID(),revision:1,domain:'tax-document'};
      const scope=await this.#request(`/scope?grantId=${encodeURIComponent(selected.grantId)}`);this.#same(generation);
      if(!scope||Object.keys(scope).sort().join('|')!=='grant|manifest')throw new Error('The selected client enrollment is unavailable.');
      const checked=await verifyStaffGrant(scope.grant,expected,this.#config);this.#same(generation);
      if(scope.grant.grantId!==selected.grantId||checked.grantDigest!==this.#binding.grantDigest)throw new Error('The selected client assignment changed. Select its current signed grant.');
      const prepared=await prepareReturnCreation({after:draft,manifest:scope.manifest,grant:scope.grant,expected,pins:this.#config,staffPrivateKey:this.#key.privateKey});this.#same(generation);
      await this.refreshGrants();this.#same(generation);
      const minimumManifestEpoch=Math.max(expected.minimumManifestEpoch,prepared.proposal.manifestEpoch),binding={...this.#binding,minimumManifestEpoch};
      await this.#rememberManifestEpoch(selected,minimumManifestEpoch,generation);await this.#storage.putBinding(binding);this.#same(generation);this.#binding=binding;
      return {version:1,type:'shuug-private-return-creation-kit',proposal:prepared.proposal,manifest:scope.manifest,grant:scope.grant,expected,privateReview:prepared.privateReview};
    }catch(error){if(generation===this.#generation)this.#clear();throw error;}finally{this.#busy=false;}
  }
  async prepareReturnCorrection(objectId,after){
    if(this.#busy)throw new Error('Wait for the current staff operation.');
    const original=this.records.get(objectId);if(!this.#selection||!this.#key||!this.identity||!original||original.domain!=='tax-document')throw new Error('Open the current shared tax return before proposing a correction.');
    if(!calculateReturn(after).calculationAvailable)throw new Error('Correct the draft input before preparing a private review kit.');
    this.#busy=true;const generation=this.#generation,selected=clone(this.#selection);
    try{
      await this.refreshGrants();this.#same(generation);
      const item=await this.#request(`/objects/${encodeURIComponent(objectId)}?grantId=${encodeURIComponent(selected.grantId)}`,'GET',undefined,24*1024*1024);this.#same(generation);
      if(item.deleted||item.objectId!==objectId||item.revision!==original.revision||item.capsule?.envelopeDigest!==original.envelopeDigest)throw new Error('The saved return changed. Reopen its latest shared revision before editing.');
      const expected={staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:selected.accountId,clientId:selected.clientId,minimumGrantEpoch:this.#binding.minimumGrantEpoch,minimumManifestEpoch:this.#binding.minimumManifestEpoch,objectId,revision:original.revision,domain:'tax-document'};
      const prepared=await prepareReturnProposal({envelope:item.envelope,manifest:item.manifest,grant:selected,capsule:item.capsule,expected,pins:this.#config,staffPrivateKey:this.#key.privateKey,after});this.#same(generation);
      await this.refreshGrants();this.#same(generation);
      return {version:1,type:'shuug-private-return-correction-kit',proposal:prepared.proposal,sourceEnvelope:item.envelope,manifest:item.manifest,grant:selected,expected,privateReview:prepared.privateReview};
    }catch(error){if(generation===this.#generation)this.#clear();throw error;}finally{this.#busy=false;}
  }
  async installApprovedReturnEdit(packet){if(!this.isOwner)throw new Error('Only the verified owner can publish a separately approved return correction.');const generation=this.#generation;await verifyReturnEditApproval(packet,this.#config);this.#same(generation);return this.#request('/return-edits','POST',packet);}
  async installApprovedReturnCreation(packet){if(!this.isOwner)throw new Error('Only the verified owner can publish a separately approved new return.');const generation=this.#generation;await verifyReturnCreationApproval(packet,this.#config);this.#same(generation);return this.#request('/return-creations','POST',packet);}
  async prepareCaseAction(objectId,command,evidenceObjectId=null){
    if(this.#busy)throw new Error('Wait for the current staff operation.');
    if(!this.#selection||!this.#key||!this.identity||!this.#selection.domains.includes('tax-document'))throw new Error('Select a current signed tax-document grant before preparing client case work.');
    const original=objectId===null?null:this.records.get(objectId),evidence=evidenceObjectId===null?null:this.records.get(evidenceObjectId);
    if(objectId!==null&&(!(original?.verifiedCase||original?.verifiedOffice)||original.domain!=='tax-document'))throw new Error('Open the case’s current verified firm review before changing its work.');
    if(evidenceObjectId!==null&&(!evidence||!['tax-document','driver-receipt'].includes(evidence.domain)||!evidence.envelopeDigest))throw new Error('Open the current shared document or draft before selecting it as evidence.');
    const action=clone(command),generation=this.#generation,selected=clone(this.#selection);this.#busy=true;
    try{
      await this.refreshGrants();this.#same(generation);const observedManifest=await this.#storage.getBinding(this.#manifestBindingId(selected));this.#same(generation);
      const newId=action.type==='office.create'?await officeObjectId({workspaceId:this.#config.workspaceId,accountId:selected.accountId,clientId:selected.clientId}):CASE_OBJECT_PREFIX+crypto.randomUUID();this.#same(generation);
      const expected={staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:selected.accountId,clientId:selected.clientId,minimumGrantEpoch:this.#binding.minimumGrantEpoch,minimumManifestEpoch:Math.max(this.#binding.minimumManifestEpoch??1,observedManifest?.minimumManifestEpoch??1),objectId:objectId??newId,revision:original?.revision??0,domain:'tax-document'};
      const scope=await this.#request(`/scope?grantId=${encodeURIComponent(selected.grantId)}`);this.#same(generation);
      if(!scope||Object.keys(scope).sort().join('|')!=='grant|manifest')throw new Error('The selected client enrollment is unavailable.');
      const checked=await verifyStaffGrant(scope.grant,expected,this.#config);this.#same(generation);
      if(scope.grant.grantId!==selected.grantId||checked.grantDigest!==this.#binding.grantDigest)throw new Error('The selected client assignment changed. Select its current signed grant.');
      const fresh=async(record)=>{if(!record)return null;const item=await this.#request(`/objects/${encodeURIComponent(record.objectId)}?grantId=${encodeURIComponent(selected.grantId)}`,'GET',undefined,24*1024*1024);this.#same(generation);if(item.deleted||item.objectId!==record.objectId||item.revision!==record.revision||item.capsule?.envelopeDigest!==record.envelopeDigest)throw new Error('The case or selected evidence changed. Reopen current shared records before review.');return item;};
      const source=await fresh(original),selectedEvidence=await fresh(evidence);
      const prepared=await prepareCaseTransition({envelope:source?.envelope??null,manifest:scope.manifest,grant:scope.grant,capsule:source?.capsule??null,expected,pins:this.#config,staffPrivateKey:this.#key.privateKey,command:action,evidenceEnvelope:selectedEvidence?.envelope??null,evidenceCapsule:selectedEvidence?.capsule??null});this.#same(generation);
      await this.refreshGrants();this.#same(generation);const minimumManifestEpoch=Math.max(expected.minimumManifestEpoch,prepared.proposal.manifestEpoch),binding={...this.#binding,minimumManifestEpoch};
      await this.#rememberManifestEpoch(selected,minimumManifestEpoch,generation);await this.#storage.putBinding(binding);this.#same(generation);this.#binding=binding;
      return {version:1,type:'shuug-private-case-review-kit',proposal:prepared.proposal,sourceEnvelope:source?.envelope??null,manifest:scope.manifest,grant:scope.grant,expected,privateReview:prepared.privateReview};
    }catch(error){if(generation===this.#generation)this.#clear();throw error;}finally{this.#busy=false;}
  }
  async installApprovedCase(packet){if(!this.isOwner)throw new Error('Only the verified owner can publish separately approved client case work.');const generation=this.#generation;await verifyCaseApproval(packet,this.#config);this.#same(generation);return this.#request('/cases','POST',packet);}
  async sync(){
    if(this.#busy)throw new Error('Wait for the current staff operation.');if(!this.#selection||!this.#key||!this.identity)throw new Error('Select a signed client grant first.');this.#busy=true;
    const generation=this.#generation,selected=clone(this.#selection),oldBinding=clone(this.#binding),opened=[];let committed=false;
    try{
      const grants=await this.refreshGrants();this.#same(generation);const current=grants.find(value=>value.grantId===selected.grantId);
      if(!current)throw new Error('This staff grant is no longer available.');
      const {verified}=await this.#verify(current,generation);if(verified.grantDigest!==oldBinding.grantDigest)throw new Error('The signed grant changed. Select its new authorization before opening data.');
      const observedManifest=await this.#storage.getBinding(this.#manifestBindingId(current));this.#same(generation);
      const versions=clone(oldBinding.versions??{}),records=new Map(),seen=new Set();let after=0,pages=0,more=false,minimumManifestEpoch=Math.max(oldBinding.minimumManifestEpoch??1,observedManifest?.minimumManifestEpoch??1);
      do{
        if(++pages>1001)throw new Error('This staff view exceeds the supported item limit.');
        const page=await this.#request(`/objects?grantId=${encodeURIComponent(current.grantId)}&after=${after}&limit=100`);this.#same(generation);
        if(!Array.isArray(page.changes)||page.changes.length>100||!integer(page.cursor,0)||page.cursor<after||typeof page.hasMore!=='boolean')throw new Error('Invalid staff ciphertext change feed.');
        let sequence=after;
        for(const change of page.changes){
          if(!id(change.objectId)||!integer(change.revision)||!integer(change.sequence)||change.sequence<=sequence||change.sequence>page.cursor||typeof change.deleted!=='boolean'||seen.has(change.objectId))throw new Error('Invalid staff ciphertext revision order.');
          sequence=change.sequence;seen.add(change.objectId);const prior=ownVersion(versions,change.objectId);
          if(prior&&(change.revision<prior.revision||prior.deleted&&!change.deleted))throw new Error('The API returned an older or resurrected staff item.');
          if(change.deleted){setVersion(versions,change.objectId,{revision:change.revision,deleted:true});continue;}
          if(change.available!==true)throw new Error('A current encrypted revision is awaiting a signed sharing capsule.');
          const item=await this.#request(`/objects/${encodeURIComponent(change.objectId)}?grantId=${encodeURIComponent(current.grantId)}`,'GET',undefined,24*1024*1024);this.#same(generation);
          if(item.deleted||item.objectId!==change.objectId||item.revision!==change.revision||item.sequence!==change.sequence)throw new Error('Staff ciphertext changed during sync. Retry the current revision.');
          const expected={staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:current.accountId,clientId:current.clientId,minimumGrantEpoch:oldBinding.minimumGrantEpoch,minimumManifestEpoch,objectId:item.objectId,revision:item.revision,domain:item.envelope?.context?.domain};
          const plaintext=await openStaffCapsule(item.capsule,item.envelope,item.manifest,current,expected,this.#config,this.#key.privateKey);opened.push(plaintext);this.#same(generation);
          const metadata=await openedRecordMetadata(plaintext,item.envelope,current.clientId,this.#config);this.#same(generation);
          minimumManifestEpoch=Math.max(minimumManifestEpoch,item.manifest.epoch);records.set(item.objectId,{objectId:item.objectId,revision:item.revision,domain:expected.domain,plaintext,...metadata});setVersion(versions,item.objectId,{revision:item.revision,deleted:false});
        }
        // The account cursor includes scanned objects outside this grant's domains.
        // Visible changes stay ordered within that cursor; filtered pages may be empty.
        if(page.hasMore&&page.cursor===after)throw new Error('Staff ciphertext cursor did not advance.');after=page.cursor;more=page.hasMore;
      }while(more);
      for(const objectId of oldBinding.requiredPresence??Object.keys(oldBinding.versions??{}))if(!seen.has(objectId))throw new Error('An observed staff object or tombstone is missing.');
      if(records.size>10000||Object.keys(versions).length>100000||[...records.values()].reduce((sum,item)=>sum+item.plaintext.length,0)>64*1024*1024)throw new Error('This staff view exceeds the supported opened-content limit.');
      // A separate grant check closes revocation during a multi-request download.
      const finalGrants=await this.refreshGrants();this.#same(generation);const finalGrant=finalGrants.find(value=>value.grantId===current.grantId);
      if(!finalGrant)throw new Error('Staff access changed during sync.');
      const finalVerified=await verifyStaffGrant(finalGrant,{staffAccountId:this.identity.staffAccountId,staffKeyId:this.#key.keyId,accountId:current.accountId,clientId:current.clientId,minimumGrantEpoch:oldBinding.minimumGrantEpoch},this.#config);this.#same(generation);
      if(finalVerified.epoch!==verified.epoch||finalVerified.grantDigest!==verified.grantDigest)throw new Error('Staff authorization changed during sync. No downloaded data was committed.');
      const binding={...oldBinding,minimumManifestEpoch,versions,requiredPresence:[...seen]};await this.#rememberManifestEpoch(current,minimumManifestEpoch,generation);await this.#storage.putBinding(binding);this.#same(generation);
      for(const item of this.records.values())item.plaintext.fill(0);this.records=records;this.#binding=binding;committed=true;return {items:records.size,grantId:current.grantId,clientId:current.clientId};
    }finally{this.#busy=false;if(!committed){for(const bytes of opened)bytes.fill(0);if(generation===this.#generation)this.#clear();}}
  }
}
