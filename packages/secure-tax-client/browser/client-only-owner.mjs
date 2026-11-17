import { validateTrustedConfig } from './config.mjs';
import { enterBusinessWorkspace, workspaceSecret } from './workspace-entry.mjs';
import { mountWorkspaceAssignments } from './workspace-assignments.mjs';
import { mountWorkspaceEmailSettings } from './workspace-email-settings.mjs';

const PROFILE='client-only-v1',PREFIX='/api/website/customer/client-only';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
async function boundedJson(response,maximum=16384){
  if(!response.body||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new Error('The account service returned an invalid response.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum)throw new Error('The account service response was too large.');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('The account service returned an invalid response.');}finally{bytes.fill(0);}
}
function downloadJson(document,name,value){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function mountClientOnlyOwner(document,{config,fetcher=globalThis.fetch,download=(name,value)=>downloadJson(document,name,value),onReturn}={}){
  const $=id=>document.getElementById(id),message=(text,error=false)=>{$('owner-message').textContent=text;$('owner-message').classList.toggle('error',error);};
  let trusted=null,token=null,expires=0,pending=null,working=false,recovery=false,destroyed=false,generation=0;
  const shared=!!onReturn;
  const workspace=shared&&mountWorkspaceAssignments($('owner-workspace-access'),{call,run,onMessage:message});
  const emailSettings=shared&&mountWorkspaceEmailSettings($('owner-console').querySelector('[data-sign-in-email]'),{run,save:(email,currentPassword)=>call('/sign-in-email','POST',{email,currentPassword}),message});
  const listeners=[];
  function clearVerification(){pending=null;$('owner-mfa-code').value='';$('owner-mfa-secret').textContent='';}
  function clear(){generation++;token=null;expires=0;clearVerification();recovery=false;$('owner-password').value='';$('owner-recovery-values').textContent='';$('owner-invitation-id').value='';$('owner-account-code').value='';if(workspace){workspace.clear();emailSettings.clear();$('owner-sdr-link').hidden=true;$('owner-sdr-link').removeAttribute('href');}}
  const signed=()=>!!token&&expires>Date.now();
  function refresh(){
    const ready=!!trusted&&!destroyed,active=signed(),manage=active&&!recovery;
    $('owner-password').disabled=!ready||working||active||!!pending;$('owner-signin').disabled=!ready||working||active||!!pending;
    $('owner-signout').disabled=!active||working;$('owner-mfa').hidden=!pending;
    if(shared){$('owner-credentials').hidden=active||!!pending;$('owner-return').hidden=active;$('owner-signout').hidden=!active;}
    for(const id of ['owner-mfa-code','owner-verify','owner-cancel-verification'])$(id).disabled=!pending||working||!ready;
    $('owner-mfa-note').textContent=pending?.enrollmentRequired?'Add this setup key to your authenticator and enter its current six-digit code.':'Enter a fresh authenticator code or an unused recovery code.';
    $('owner-mfa-secret').textContent=pending?.secret??'';
    $('owner-recovery').hidden=!recovery;$('owner-codes-saved').disabled=!recovery||working;
    $('owner-identity').textContent=active?'Owner sign-in verified.':'Signed out.';
    if(workspace){
      workspace.refresh(ready&&manage,working);
      emailSettings.refresh(ready&&manage,working);
      $('owner-sdr-access').hidden=!manage;$('owner-sdr-ticket').disabled=!manage||working;
      $('owner-methods').hidden=!manage;
      for(const id of ['owner-create-invitation','owner-account-code'])$(id).closest('section').hidden=!manage;
    }
    for(const id of ['owner-create-invitation','owner-invitation-id','owner-revoke-invitation','owner-account-code','owner-suspend-account','owner-restore-account'])$(id).disabled=!ready||!manage||working;
  }
  async function call(path,method='GET',body,authenticated=true){
    if(!trusted||destroyed)throw new Error('This owner workspace is not available.');
    if(authenticated&&!signed()){clear();throw new Error('Your owner sign-in expired. Sign in again.');}
    const started=generation,response=await fetcher(trusted.apiOrigin+PREFIX+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(authenticated?{Authorization:'Bearer '+token}:{})},credentials:'omit',cache:'no-store',redirect:'error',...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await boundedJson(response,path==='/staff/workspace-access'?128*1024:16384);
    if(destroyed||started!==generation)throw new Error('The owner sign-in changed. Start again.');
    if(!response.ok&&!(path==='/staff/session'&&method==='POST'&&!authenticated&&response.status===428)){if(authenticated&&(response.status===401||response.status===403))clear();throw new Error(typeof value?.error==='string'&&value.error.length<=500?value.error:'The account operation could not be completed.');}
    return value;
  }
  function acceptSession(value){
    if(value?.apiVersion!==1||value.mfaVerified!==true||value.identity?.staffAccountId!=='workspace-owner'||!/^[a-f0-9]{64}$/.test(value.token)||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())throw new Error('The service did not confirm an owner sign-in.');
    const codes=value.recoveryCodes??[];
    if(!Array.isArray(codes)||codes.length>10||codes.some(code=>typeof code!=='string'||!/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/.test(code)))throw new Error('The owner recovery response was invalid.');
    token=value.token;expires=Date.parse(value.expiresAt);clearVerification();recovery=codes.length>0;$('owner-recovery-values').textContent=codes.join('\n');message(recovery?'Save your owner recovery codes before continuing.':'Signed in. You can create invitations and manage account access.');
  }
  async function run(operation){if(working||destroyed)return;working=true;refresh();try{await operation();}catch(error){if(!destroyed)message(error instanceof Error?error.message:'The account operation failed.',true);}finally{working=false;if(!destroyed)refresh();}}
  function on(id,operation){const listener=()=>run(operation);$(id).addEventListener('click',listener);listeners.push(()=>$(id).removeEventListener('click',listener));}
  function stageFactor(value){
    if(value?.apiVersion!==1||value.mfaRequired!==true||!/^[a-f0-9]{64}$/.test(value.challengeToken)||typeof value.enrollmentRequired!=='boolean'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()||Date.parse(value.expiresAt)>Date.now()+6*60000||value.enrollmentRequired&&!/^[A-Z2-7]{32}$/.test(value.secret))throw new Error('Owner sign-in requires authenticator verification.');
    pending={challengeToken:value.challengeToken,enrollmentRequired:value.enrollmentRequired,expiresAt:value.expiresAt,secret:value.enrollmentRequired?value.secret:null};message('Complete your authenticator check.');
  }
  on('owner-signin',async()=>{
    const password=$('owner-password').value;$('owner-password').value='';if(!password||password.length>200)throw new Error('Enter your owner password.');clear();
    stageFactor(await call('/staff/session','POST',{email:'',password},false));
  });
  on('owner-verify',async()=>{
    const code=$('owner-mfa-code').value;$('owner-mfa-code').value='';
    if(!pending||Date.parse(pending.expiresAt)<=Date.now()){clearVerification();throw new Error('Verification expired. Start a fresh sign-in.');}
    if(!code||code.length>40)throw new Error('Enter an authenticator or unused recovery code.');
    acceptSession(await call('/staff/session','POST',{challengeToken:pending.challengeToken,code},false));
  });
  on('owner-cancel-verification',async()=>{clearVerification();message('Enter your owner password to start again.');});
  on('owner-codes-saved',async()=>{recovery=false;$('owner-recovery-values').textContent='';message('Recovery codes cleared from this page.');});
  on('owner-signout',async()=>{try{await call('/staff/session','DELETE');message('Signed out.');}finally{clear();onReturn?.();}});
  if(shared){
    on('owner-return',async()=>{clear();onReturn();});
    on('owner-sdr-ticket',async()=>{
      const started=generation,{ticket}=await call('/staff/sdr-ticket','POST');
      if(!workspaceSecret(ticket))throw new Error('The account service did not issue an SDR sign-in.');
      const destination=await enterBusinessWorkspace({action:'workspace-entry',ticket});
      if(started!==generation||!signed()||destination!=='https://gigtax.pro/sales')throw new Error('The SDR sign-in changed. Try again.');
      $('owner-sdr-link').href=destination;$('owner-sdr-link').hidden=false;$('owner-sdr-link').focus();
    });
  }
  on('owner-create-invitation',async()=>{
    const value=await call('/staff/client-invitations','POST',{}),fields=['version','type','profile','invitationId','workspaceId','accountId','clientId','token','expiresAt'];
    if(!exact(value,fields)||value.version!==2||value.type!=='gigtax-client-only-invitation'||value.profile!==PROFILE||value.workspaceId!==trusted.workspaceId||![value.invitationId,value.accountId,value.clientId].every(uuid)||!/^[a-f0-9]{64}$/.test(value.token)||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()||Date.parse(value.expiresAt)>Date.now()+49*3600000)throw new Error('The service did not provide a matching client-owned invitation.');
    download(`client-invitation-${value.invitationId}.json`,value);$('owner-invitation-id').value=value.invitationId;$('owner-account-code').value=value.accountId;message('Invitation saved. Give the file to your client through your agreed private channel.');
  });
  on('owner-revoke-invitation',async()=>{const invitationId=$('owner-invitation-id').value.trim();if(!uuid(invitationId))throw new Error('Enter the invitation ID.');const value=await call('/staff/client-invitations','DELETE',{invitationId});if(typeof value?.revoked!=='boolean')throw new Error('The service did not confirm invitation revocation.');message(value.revoked?'Invitation revoked.':'That invitation is already used, revoked or unavailable.');});
  async function access(enabled){const accountCode=$('owner-account-code').value.trim();if(!uuid(accountCode))throw new Error('Enter the client account code.');const value=await call('/staff/client-access','POST',{accountCode,enabled});if(value?.accountCode!==accountCode||value.enabled!==enabled||value.sessionsRevoked!==true)throw new Error('The service did not confirm this account access change.');message(enabled?'Account access restored. The client must sign in again.':'Account suspended and current sessions ended.');}
  on('owner-suspend-account',()=>access(false));on('owner-restore-account',()=>access(true));
  try{
    if(config?.version!==2||config.profile!==PROFILE)throw new Error('This owner page requires the client-owned private workspace. Sign-in is disabled.');
    const checked=await validateTrustedConfig(config,document.location.origin);if(destroyed)return;
    trusted=checked;$('owner-trust').textContent='Client-owned workspace verified.';$('owner-methods').href=trusted.apiOrigin+'/api/auth/social/manage';$('owner-methods').hidden=false;message('Sign in with your owner password and authenticator.');
  }catch(error){message(error instanceof Error?error.message:'This owner workspace could not be verified.',true);}refresh();
  const pagehide=()=>{clear();refresh();};document.defaultView?.addEventListener('pagehide',pagehide);listeners.push(()=>document.defaultView?.removeEventListener('pagehide',pagehide));
  return {
    stageFederated(value){
      if(!shared||!trusted||destroyed||working||signed()||value?.audience!=='owner')throw new Error('Owner sign-in could not be verified.');
      clear();stageFactor(value);refresh();
    },
    destroy(){destroyed=true;clear();for(const remove of listeners)remove();refresh();},
  };
}
if(typeof document!=='undefined'&&document.querySelector('#owner-console:not([data-shared])')){
  import('./trusted-config.mjs').then(({default:config})=>mountClientOnlyOwner(document,{config})).catch(()=>{document.getElementById('owner-message').textContent='This owner workspace could not be verified. Sign-in is disabled.';});
}
