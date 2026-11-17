import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {generateRecipientKeyPair} from '../envelope.mjs';
import {mountClientOnlyOwner} from '../browser/client-only-owner.mjs';

const uiOrigin='https://owner.example.test',apiOrigin='https://api.example.test',prefix='/api/website/customer/client-only';
const token='a'.repeat(64),challengeToken='b'.repeat(64),id='12345678-1234-4234-8234-123456789012',accountId='12345678-1234-4234-8234-123456789013',clientId='12345678-1234-4234-8234-123456789014';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected owner UI state was not reached');};
async function fixture({configChanges={},invitationChanges={},rejectInvitation=false,verificationGate=Promise.resolve()}={}){
  const dom=new JSDOM(await readFile(new URL('../browser/client-only-owner.html',import.meta.url),'utf8'),{url:uiOrigin+'/staff.html'}),d=dom.window.document,$=id=>d.getElementById(id),requests=[],downloads=[];
  const key=await generateRecipientKeyPair(),config={version:2,profile:'client-only-v1',uiOrigin,apiOrigin,workspaceId:'synthetic-owner',signerPublicKey:key.publicKey,...configChanges};
  const fetcher=async(url,options={})=>{
    requests.push({url,options});assert.ok(url.startsWith(apiOrigin+prefix+'/'));
    assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
    const path=url.slice((apiOrigin+prefix).length),body=options.body?JSON.parse(options.body):undefined;
    if(path==='/staff/session'&&options.method==='POST'){
      if(body.password){assert.deepEqual(body,{email:'',password:'Synthetic owner password'});return json({apiVersion:1,mfaRequired:true,challengeToken,enrollmentRequired:false,expiresAt:new Date(Date.now()+300000).toISOString()},428);}
      assert.deepEqual(body,{challengeToken,code:'123456'});await verificationGate;return json({apiVersion:1,mfaVerified:true,identity:{staffAccountId:'workspace-owner'},token,expiresAt:new Date(Date.now()+3600000).toISOString()});
    }
    assert.equal(options.headers.Authorization,'Bearer '+token);
    if(path==='/staff/session'&&options.method==='DELETE')return json({ok:true});
    if(path==='/staff/client-invitations'&&options.method==='POST')return rejectInvitation?json({error:'Owner verification expired'},401):json({version:2,type:'gigtax-client-only-invitation',profile:'client-only-v1',invitationId:id,workspaceId:'synthetic-owner',accountId,clientId,token:'c'.repeat(64),expiresAt:new Date(Date.now()+48*3600000).toISOString(),...invitationChanges});
    if(path==='/staff/client-invitations'&&options.method==='DELETE'){assert.deepEqual(body,{invitationId:id});return json({revoked:true});}
    if(path==='/staff/client-access'){assert.equal(body.accountCode,accountId);return json({accountCode:accountId,enabled:body.enabled,sessionsRevoked:true});}
    throw new Error('Unexpected owner endpoint '+path);
  };
  const mounted=await mountClientOnlyOwner(d,{config,fetcher,download:(name,value)=>downloads.push({name,value})});
  async function signin(){
    $('owner-password').value='Synthetic owner password';$('owner-signin').click();await wait(()=>$('owner-mfa').hidden===false);
    assert.equal($('owner-password').value,'');assert.equal($('owner-create-invitation').disabled,true);
    $('owner-mfa-code').value='123456';$('owner-verify').click();await wait(()=>$('owner-create-invitation').disabled===false);assert.equal($('owner-mfa-code').value,'');
  }
  return {dom,d,$,requests,downloads,signin,close(){mounted.destroy();dom.window.close();}};
}

test('owner console requires pinned client-only configuration and contains no client-content or key tools',async()=>{
  const p=await fixture({configChanges:{version:1,firmRecoveryPublicKey:'not-a-client-profile'}});
  try{
    assert.equal(p.$('owner-signin').disabled,true);p.$('owner-signin').click();assert.equal(p.requests.length,0);
    assert.equal(p.d.querySelector('input[type=file]'),null);assert.equal(p.d.querySelector('form'),null);
    assert.doesNotMatch(p.d.body.textContent,/publish.*grant|sharing capsule|unlock.*device|private key|open.*record/i);
    assert.equal(p.$('owner-methods').hidden,true);
  }finally{p.close();}
});

test('mandatory MFA gates opaque invitations and availability controls, using only the new namespace and memory-only sessions',async()=>{
  const p=await fixture();
  try{
    assert.equal(p.$('owner-methods').href,apiOrigin+'/api/auth/social/manage');await p.signin();
    p.$('owner-create-invitation').click();await wait(()=>p.downloads.length===1);
    assert.equal(p.downloads[0].name,'client-invitation-'+id+'.json');assert.equal(p.downloads[0].value.profile,'client-only-v1');
    assert.equal(p.$('owner-invitation-id').value,id);assert.equal(p.$('owner-account-code').value,accountId);
    await wait(()=>p.$('owner-revoke-invitation').disabled===false);p.$('owner-revoke-invitation').click();await wait(()=>p.$('owner-message').textContent==='Invitation revoked.');
    p.$('owner-suspend-account').click();await wait(()=>p.$('owner-message').textContent.includes('Account suspended'));
    p.$('owner-restore-account').click();await wait(()=>p.$('owner-message').textContent.includes('Account access restored'));
    assert.equal(p.dom.window.localStorage.length,0);assert.equal(p.dom.window.sessionStorage.length,0);assert.equal(p.d.body.innerHTML.includes(token),false);
    assert.ok(p.requests.every(r=>!/(?:objects|grants|capsules|cases|recovery|secure\/)/.test(new URL(r.url).pathname)));
    p.$('owner-signout').click();await wait(()=>p.$('owner-signin').disabled===false);
    assert.equal(p.$('owner-account-code').value,'');assert.equal(p.$('owner-create-invitation').disabled,true);
  }finally{p.close();}
});

test('legacy or foreign invitation responses never reach a download',async()=>{
  for(const invitationChanges of [{version:1,type:'shuug-private-account-invitation'},{profile:'firm-recovery'},{workspaceId:'another-workspace'},{privateKey:'unexpected-private-key'}]){
    const p=await fixture({invitationChanges});
    try{await p.signin();p.$('owner-create-invitation').click();await wait(()=>p.$('owner-message').classList.contains('error'));assert.equal(p.downloads.length,0);assert.equal(p.$('owner-invitation-id').value,'');}
    finally{p.close();}
  }
});

test('expired owner authority clears the in-memory session and account controls',async()=>{
  const p=await fixture({rejectInvitation:true});
  try{await p.signin();p.$('owner-create-invitation').click();await wait(()=>p.$('owner-message').textContent==='Owner verification expired');assert.equal(p.$('owner-signin').disabled,false);assert.equal(p.$('owner-create-invitation').disabled,true);assert.equal(p.downloads.length,0);assert.equal(p.$('owner-identity').textContent,'Signed out.');}
  finally{p.close();}
});

test('leaving the owner page prevents an outstanding MFA response from restoring a cleared session',async()=>{
  let release;const verificationGate=new Promise(resolve=>{release=resolve;}),p=await fixture({verificationGate});
  try{
    p.$('owner-password').value='Synthetic owner password';p.$('owner-signin').click();await wait(()=>p.$('owner-mfa').hidden===false);
    p.$('owner-mfa-code').value='123456';p.$('owner-verify').click();await wait(()=>p.requests.length===2);
    p.dom.window.dispatchEvent(new p.dom.window.Event('pagehide'));release();await wait(()=>p.$('owner-signin').disabled===false);
    assert.equal(p.$('owner-identity').textContent,'Signed out.');assert.equal(p.$('owner-create-invitation').disabled,true);assert.equal(p.$('owner-mfa').hidden,true);assert.equal(p.downloads.length,0);
  }finally{release();p.close();}
});
