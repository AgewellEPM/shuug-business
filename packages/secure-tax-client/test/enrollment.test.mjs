import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountEnrollment} from '../browser/enrollment-view.mjs';
import {buildFormPayload,formType} from '../browser/forms.mjs';
import {privateClientProfile,privateAccountCode,assertPrivateInvitation} from '../client-enrollment.mjs';
import {sealActivationChallenge,openActivationChallenge,activationAnswerDigest} from '../activation-proof.mjs';
import {createFirmBundle,unlockFirmBundle,signEnrollmentRequest} from '../firm-recovery.mjs';
import {generateRecipientKeyPair,publicKeyId} from '../envelope.mjs';

test('possession proof binds the exact manifest, key, scope, ciphertext and expiry',async()=>{
  const created=await createFirmBundle('synthetic-proof-workspace','Synthetic separate firm passphrase'),firm=await unlockFirmBundle(created.bundle,'Synthetic separate firm passphrase',created.publicPins),key=await generateRecipientKeyPair();
  const expected={accountId:crypto.randomUUID(),clientId:crypto.randomUUID(),minimumEpoch:1},manifest=await signEnrollmentRequest({version:1,workspaceId:created.publicPins.workspaceId,accountId:expected.accountId,clientId:expected.clientId,client:{keyId:await publicKeyId(key.publicKey),publicKey:key.publicKey}},firm,{epoch:1});
  const sealed=await sealActivationChallenge(manifest,{challengeId:crypto.randomUUID(),expiresAt:new Date(Date.now()+300000).toISOString()}),open=value=>openActivationChallenge(value,manifest,expected,created.publicPins,key.privateKey);
  assert.equal(await activationAnswerDigest(await open(sealed.challenge)),sealed.answerDigest);
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
