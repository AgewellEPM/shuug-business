import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {generateRecipientKeyPair,encode64} from '../envelope.mjs';
import {VaultClient} from '../browser/client.mjs';
import {mountSocialSignIn} from '../browser/social-signin.mjs';
async function fixture(changeUrl=url=>url){
 const signer=await generateRecipientKeyPair(),recovery=await generateRecipientKeyPair();
 const config={version:1,workspaceId:crypto.randomUUID(),uiOrigin:'https://portal.example.net',apiOrigin:'https://api.example.net',signerPublicKey:signer.publicKey,firmRecoveryPublicKey:recovery.publicKey};
 const identity={accountId:crypto.randomUUID(),clientId:crypto.randomUUID()};let challenge;const calls=[];
 const client=await VaultClient.create(config,config.uiOrigin,{storage:{},fetcher:async(url,options)=>{
  calls.push({url,options});const path=new URL(url).pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  let value;
  if(path==='start'){
   assert.equal(body.audience,'secure-customer');challenge=body.challenge;
   const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:'synthetic.apps.googleusercontent.com',redirect_uri:config.apiOrigin+'/api/auth/social/google/callback',response_type:'code',state:'s'.repeat(43),nonce:'n'.repeat(43),scope:'openid',code_challenge:'c'.repeat(43),code_challenge_method:'S256',prompt:'select_account'});
   value={apiVersion:1,requestId:crypto.randomUUID(),authorizationUrl:changeUrl(target).toString(),expiresAt:new Date(Date.now()+600000).toISOString()};
  }else if(path==='result'){
   assert.equal(encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.verifier)))),challenge);
   value={apiVersion:1,mfaRequired:true,audience:'secure-customer',challengeToken:'a'.repeat(64),enrollmentRequired:false,expiresAt:new Date(Date.now()+300000).toISOString(),secret:null};
  }else if(path==='session'){
   assert.equal(body.privateAccount,true);assert.equal(body.code,'123456');value={apiVersion:1,identity,token:'b'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()};
  }else if(path==='status')value={enrolled:false,identity};else throw Error('Unexpected synthetic route');
  return Response.json(value);
 }});return {client,calls};
}
test('the default browser request keeps the Window receiver Safari requires',async t=>{
 const {client}=await fixture();
 t.mock.method(globalThis,'fetch',function(url){
  assert.equal(this,globalThis);
  assert.equal(url,client.config.apiOrigin+'/api/website/customer/secure/social/config');
  return Promise.resolve(Response.json({apiVersion:1,providers:{google:true,apple:true}}));
 });
 const browserClient=await VaultClient.create(client.config,client.config.uiOrigin,{storage:{}});
 assert.deepEqual(await browserClient.socialProviders(),{google:true,apple:true});
});
test('social identity proof is bound to its initiating client and still requires private-account MFA',async()=>{
 const {client,calls}=await fixture(),flow=await client.beginSocialSignIn('google');
 assert.equal(client.identity,null);assert.equal((await client.finishSocialSignIn(flow)).mfaRequired,true);assert.equal(client.identity,null);
 assert.equal(client.pendingMfa.challengeToken,'a'.repeat(64));await client.verifySignIn('123456');assert.ok(client.identity.accountId);
 assert.ok(calls.every(call=>call.options.redirect==='error'&&call.options.referrerPolicy==='no-referrer'));
});
test('a compromised API cannot broaden provider permissions, redirect the callback or change provider hosts',async()=>{
 for(const change of [url=>{url.searchParams.set('scope','openid https://www.googleapis.com/auth/drive');return url;},url=>{url.searchParams.set('redirect_uri','https://foreign.example/callback');return url;},url=>{url.searchParams.append('scope','openid');return url;},url=>{url.hostname='foreign.example';return url;}]){
  const {client}=await fixture(change);await assert.rejects(()=>client.beginSocialSignIn('google'),/invalid/);assert.equal(client.pendingMfa,null);
 }
 const {client}=await fixture(),flow=await client.beginSocialSignIn('google');client.lock();await assert.rejects(()=>client.finishSocialSignIn(flow),/connection changed/);
});
test('portal shows configured provider controls and clears opened content before opening a provider window',async()=>{
 const dom=new JSDOM('<main><section id="connection"></section></main>',{pretendToBeVisual:true}),document=dom.window.document;
 const order=[],messages=[];let task,attempts=0;const previous=globalThis.open;
 globalThis.open=()=>{order.push('open');return {opener:123,closed:false,location:{replace:()=>order.push('navigate')},close(){this.closed=true;}};};
 const client={identity:null,busy:false,lock(){order.push('lock');},async socialProviders(){return {google:true,apple:false};},async beginSocialSignIn(){return {authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth',expiresAt:new Date(Date.now()+60000).toISOString()};},async finishSocialSignIn(){return ++attempts===1?{pending:true}:{mfaRequired:true};}};
 try {
  const view=mountSocialSignIn(document,document.getElementById('connection'),{getClient:()=>client,run:work=>task=work(),clearOpened:()=>order.push('clear'),onMessage:text=>messages.push(text),onSignedIn:()=>order.push('mfa'),wait:async()=>{}});
  await view.configure();const button=[...view.element.querySelectorAll('button')].find(e=>e.textContent==='Continue with Google');assert.equal(button.hidden,false);
  button.click();await task;assert.deepEqual(order,['lock','clear','open','navigate','mfa']);assert.equal(attempts,2);assert.equal([...view.element.querySelectorAll('button')].find(e=>e.textContent==='Continue with Apple').hidden,true);
 }finally {globalThis.open=previous;dom.window.close();}
});
