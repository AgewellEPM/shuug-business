import {mountAuthenticatorRecovery} from '../browser/authenticator-recovery-view.mjs';
import {sealAuthenticatorRecoveryChallenge,openAuthenticatorRecoveryChallenge} from '../authenticator-recovery-proof.mjs';
import {verifyEnrollmentDocument,verifyEnrollmentManifest} from '../envelope.mjs';
import {verifyEnrollmentRenewal} from '../enrollment-renewal.mjs';
import {renewFirmEnrollment} from '../firm-enrollment-renewal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountEnrollment,mountPasswordRecovery} from '../browser/enrollment-view.mjs';
import {buildFormPayload,formType} from '../browser/forms.mjs';
import {privateClientProfile,privateAccountCode,assertPrivateInvitation} from '../client-enrollment.mjs';
import {sealPasswordRecoveryChallenge,openPasswordRecoveryChallenge} from '../password-recovery-proof.mjs';
import {sealActivationChallenge,openActivationChallenge,activationAnswerDigest} from '../activation-proof.mjs';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {generateRecipientKeyPair,publicKeyId} from '../envelope.mjs';

test('possession proof binds the exact manifest, key, scope, ciphertext and expiry',async()=>{
  const created=await createFirmBundle('synthetic-proof-workspace','Synthetic separate firm passphrase'),firm=await unlockFirmBundle(created.bundle,'Synthetic separate firm passphrase',created.publicPins),key=await generateRecipientKeyPair();
  const expected={accountId:crypto.randomUUID(),clientId:crypto.randomUUID(),minimumEpoch:1},manifest=await signEnrollmentRequest({version:1,workspaceId:created.publicPins.workspaceId,accountId:expected.accountId,clientId:expected.clientId,client:{keyId:await publicKeyId(key.publicKey),publicKey:key.publicKey}},firm,{epoch:1});
  const sealed=await sealActivationChallenge(manifest,{challengeId:crypto.randomUUID(),expiresAt:new Date(Date.now()+300000).toISOString()}),open=value=>openActivationChallenge(value,manifest,expected,created.publicPins,key.privateKey);
  assert.equal(await activationAnswerDigest(await open(sealed.challenge)),sealed.answerDigest);
  const recovery=await sealPasswordRecoveryChallenge(manifest,{challengeId:crypto.randomUUID(),expiresAt:new Date(Date.now()+300000).toISOString()});
  assert.equal(await activationAnswerDigest(await openPasswordRecoveryChallenge(recovery.challenge,manifest,expected,created.publicPins,key.privateKey)),recovery.answerDigest);
  const replacement=await sealAuthenticatorRecoveryChallenge(manifest,{challengeId:crypto.randomUUID(),expiresAt:new Date(Date.now()+300000).toISOString()});assert.equal(await activationAnswerDigest(await openAuthenticatorRecoveryChallenge(replacement.challenge,manifest,expected,created.publicPins,key.privateKey)),replacement.answerDigest);
  await assert.rejects(openAuthenticatorRecoveryChallenge(recovery.challenge,manifest,expected,created.publicPins,key.privateKey));await assert.rejects(openPasswordRecoveryChallenge(replacement.challenge,manifest,expected,created.publicPins,key.privateKey));
  await assert.rejects(open(recovery.challenge));await assert.rejects(openPasswordRecoveryChallenge(sealed.challenge,manifest,expected,created.publicPins,key.privateKey));
  for(const change of [{accountId:crypto.randomUUID()},{manifestEpoch:2},{expiresAt:new Date(Date.now()-1000).toISOString()},{challengeId:crypto.randomUUID()},{ciphertext:'A'.repeat(64)},{extra:'unrecognized'}])await assert.rejects(open({...sealed.challenge,...change}));
  await assert.rejects(openActivationChallenge(sealed.challenge,manifest,expected,created.publicPins,(await generateRecipientKeyPair()).privateKey));
});

test('ordinary setup form requests a signed manifest, activates and clears private fields',async()=>{
  const dom=new JSDOM('<!doctype html><div id="setup"></div>'),document=dom.window.document,invitation={accountId:crypto.randomUUID()},manifest={synthetic:true};let pending,activated,code,downloaded,selected='synthetic-key';
  const client={async newEnrollmentRequest(value,key){assert.deepEqual(value,invitation);assert.equal(key,selected);return {synthetic:'public request'};},async activateNewAccount(value){assert.equal(document.querySelector('#enrollment-password').value,'');activated=value;return {accountCode:invitation.accountId,keyId:selected};}};
  const view=mountEnrollment(document,document.querySelector('#setup'),{getClient:()=>client,getKeyId:()=>selected,run:operation=>{pending=operation();},download:(...value)=>{downloaded=value;},onAccountCode:value=>{code=value;}});
  try{
    assert([...document.querySelectorAll('input,button')].every(node=>node.disabled));view.setEnabled(true);
    const setFile=(id,value)=>Object.defineProperty(document.querySelector(`#enrollment-${id}`),'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(value)}]});setFile('invitation',invitation);setFile('manifest',manifest);
    const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
    button('Save public new-account enrollment request').click();await pending;assert.equal(code,invitation.accountId);assert.deepEqual(JSON.parse(downloaded[1]),{synthetic:'public request'});
    for(const [key,value]of Object.entries({legalName:'Synthetic private name',email:'synthetic@example.invalid',phone:'555-0109',mailingAddress:'Synthetic address',password:'Separate account password',confirmation:'Separate account password'}))document.querySelector(`#enrollment-${key}`).value=value;
    assert(view.dirty);button('Activate new encrypted account').click();await pending;assert.equal(activated.profile.legalName,'Synthetic private name');assert.equal(activated.keyId,selected);assert.equal(activated.password,'Separate account password');assert(!view.dirty);assert.match(document.body.textContent,/Account activated/);
    document.querySelector('#enrollment-email').value='unsaved@example.invalid';view.clear();assert(!view.dirty);selected='';view.setEnabled(true);assert(button('Activate new encrypted account').disabled);
  }finally{dom.window.close();}
});

test('contact profile stays in tax identity and private account inputs reject metadata',()=>{
  const values={legalName:'Synthetic private client',email:'client@example.invalid',phone:'',mailingAddress:''},result=buildFormPayload('profile',values);assert.equal(result.domain,'tax-identity');assert.equal(formType(result.payload),'profile');assert.deepEqual(result.payload,privateClientProfile(values));
  assert.throws(()=>privateClientProfile({...values,password:'must not be saved'}));assert.throws(()=>privateAccountCode(values.email));
  const invite={version:1,type:'shuug-private-account-invitation',invitationId:crypto.randomUUID(),workspaceId:'synthetic',accountId:crypto.randomUUID(),clientId:crypto.randomUUID(),token:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()};assertPrivateInvitation(invite,'synthetic');assert.throws(()=>assertPrivateInvitation({...invite,email:values.email},'synthetic'));assert.throws(()=>assertPrivateInvitation(invite,'other-workspace'));
});

test('replacement authenticator view keeps setup private, verifies the new code, and discards late setup after clearing',async()=>{
 const dom=new JSDOM('<!doctype html><div id="setup"></div>'),document=dom.window.document;let pending,received,completed,resolveSetup,delay=false;
 const client={async beginAuthenticatorRecovery(value){received=value;assert.equal(document.querySelector('#authenticator-recovery-password').value,'');if(delay)return new Promise(resolve=>{resolveSetup=resolve;});return {secret:'SYNTHETIC PRIVATE SETUP',expiresAt:new Date(Date.now()+300000).toISOString()};},async finishAuthenticatorRecovery(code){assert.equal(code,'123456');return {accountCode:'synthetic',recoveryCodes:['synthetic-code']};}};
 const view=mountAuthenticatorRecovery(document,document.querySelector('#setup'),{getClient:()=>client,getKeyId:()=>'synthetic-key',run:operation=>{pending=operation();},onStarting:()=>view.clear(),onRecovered:result=>{completed=result;}});
 const field=name=>document.querySelector(`#authenticator-recovery-${name}`),buttons=[...document.querySelectorAll('button')];
 const load=()=>{for(const name of ['invitation','approval'])Object.defineProperty(field(name),'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify({synthetic:name})}]});field('password').value='Synthetic password';};
 try{assert([...document.querySelectorAll('input,button')].every(node=>node.disabled));view.setEnabled(true);load();buttons[0].click();await pending;assert.equal(received.password,'Synthetic password');assert.equal(received.keyId,'synthetic-key');assert.match(document.querySelector('#authenticator-recovery-secret').textContent,/PRIVATE SETUP/);assert(view.dirty);field('code').value='123456';buttons[1].click();await pending;assert.equal(completed.accountCode,'synthetic');assert.equal(document.querySelector('#authenticator-recovery-secret').textContent,'');assert(!view.dirty);
  delay=true;load();buttons[0].click();while(!resolveSetup)await new Promise(resolve=>setTimeout(resolve,0));view.clear();resolveSetup({secret:'LATE PRIVATE SETUP',expiresAt:new Date().toISOString()});await pending;assert(!document.body.textContent.includes('LATE PRIVATE SETUP'));assert(!view.dirty);
 }finally{dom.window.close();}
});

test('ordinary forgotten-password form uses the selected backup key and clears credentials',async()=>{
 const dom=new JSDOM('<!doctype html><div id="setup"></div>'),document=dom.window.document;let pending,received,recovered;
 const client={async recoverAccountPassword(value){assert.equal(document.querySelector('#recovery-password').value,'');received=value;return {accountCode:'synthetic-code'};}};
 const view=mountPasswordRecovery(document,document.querySelector('#setup'),{getClient:()=>client,getKeyId:()=>'existing-key',run:operation=>{pending=operation();},onRecovered:value=>{recovered=value;}});
 try{assert(document.querySelector('button').disabled);view.setEnabled(true);for(const name of ['invitation','approval'])Object.defineProperty(document.querySelector(`#recovery-${name}`),'files',{value:[{size:10,text:async()=>JSON.stringify({synthetic:name})}]});
  for(const name of ['password','confirmation'])document.querySelector(`#recovery-${name}`).value='Synthetic recovered account password';assert(view.dirty);document.querySelector('button').click();await pending;
  assert.equal(received.keyId,'existing-key');assert.equal(received.newPassword,'Synthetic recovered account password');assert.equal(recovered.accountCode,'synthetic-code');assert(!view.dirty);
 }finally{dom.window.close();}
});

test('renewal verifies expired documents without granting old access and rejects changed recipients, forged signatures and missing review',async()=>{
 const created=await createFirmBundle('synthetic-renewal','Synthetic separate firm passphrase'),firm=await unlockFirmBundle(created.bundle,'Synthetic separate firm passphrase',created.publicPins),key=await generateRecipientKeyPair(),identity={accountId:crypto.randomUUID(),clientId:crypto.randomUUID()};
 const original=await signEnrollmentRequest({version:1,workspaceId:created.publicPins.workspaceId,...identity,client:{keyId:await publicKeyId(key.publicKey),publicKey:key.publicKey}},firm,{epoch:3,validDays:1,now:Date.now()-2*86400000});
 await verifyEnrollmentDocument(original,identity,created.publicPins);await assert.rejects(verifyEnrollmentManifest(original,identity,created.publicPins));
 const request={version:1,type:'shuug-enrollment-renewal-request',manifest:original};await assert.rejects(renewFirmEnrollment(request,firm));const packet=await renewFirmEnrollment(request,firm,{identityAndKeyReviewed:true});await verifyEnrollmentRenewal(packet,created.publicPins,identity);assert.equal(packet.manifest.epoch,4);assert.deepEqual(packet.manifest.client,original.client);assert.deepEqual(packet.manifest.firmRecovery,original.firmRecovery);
 const other=await generateRecipientKeyPair(),changed=await signEnrollmentRequest({version:1,workspaceId:created.publicPins.workspaceId,...identity,client:{keyId:await publicKeyId(other.publicKey),publicKey:other.publicKey}},firm,{epoch:4});await assert.rejects(verifyEnrollmentRenewal({...packet,manifest:changed},created.publicPins,identity));
 const forged=structuredClone(packet);forged.previous.accountId=crypto.randomUUID();await assert.rejects(verifyEnrollmentRenewal(forged,created.publicPins,identity));await assert.rejects(verifyEnrollmentRenewal({...packet,manifest:original},created.publicPins,identity));
});
