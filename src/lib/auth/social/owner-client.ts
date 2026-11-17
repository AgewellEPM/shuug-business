// Served as a same-origin external script; no provider SDK, user claims or secrets
// are embedded in this source. The verifier and pending factor stay in memory.
export const ownerClientScript = String.raw`
(() => {
  const status = document.getElementById('social-status'), area = document.getElementById('social-factor');
  const buttons = [...document.querySelectorAll('[data-social-provider]')];let working = false;
  const say = text => {status.textContent = text;};
  const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  async function call(path, body) {
    const response = await fetch('/api/auth/social/'+path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify(body)});
    const bytes = await response.text();if(bytes.length>16384)throw new Error('Sign-in returned an invalid response.');
    let value;try {value=JSON.parse(bytes);}catch {throw new Error('Sign-in could not be completed.');}
    if(!response.ok)throw new Error(value.error||'Sign-in could not be completed.');return value;
  }
  function node(tag,text){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;}
  function factor(result) {
    area.replaceChildren();
    if(result.enrollmentRequired){area.append(node('p','Add this private setup key to your authenticator, then enter its code.'),node('code',result.secret));}
    const label=node('label','Authenticator or unused recovery code'),input=node('input');input.autocomplete='one-time-code';input.maxLength=40;input.type='password';label.append(input);
    const verify=node('button','Verify and sign in');verify.type='button';area.append(label,verify);
    verify.addEventListener('click',async()=>{
      verify.disabled=true;const code=input.value;input.value='';
      try {
        const session=await call('factor',{challengeToken:result.challengeToken,code});area.replaceChildren();
        if(session.recoveryCodes?.length){area.append(node('p','Save these recovery codes privately. Each works once.'),node('pre',session.recoveryCodes.join('\n')));const link=node('a','I saved the codes. Continue');link.href=session.destination==='/'?'/':'/me';area.append(link);}
        else location.assign(session.destination==='/'?'/':'/me');
      }catch(error){say(error.message);verify.disabled=false;}
    });
    input.focus();say('Google or Apple identity verified. Complete your authenticator check.');
  }
  for(const button of buttons)button.addEventListener('click',async()=>{
    if(working)return;working=true;buttons.forEach(item=>item.disabled=true);area.replaceChildren();
    if(button.dataset.socialPurpose==='unlink') {
      try {await call('unlink',{provider:button.dataset.socialProvider,audience:'owner'});location.reload();}
      catch(error){say(error.message);working=false;buttons.forEach(item=>item.disabled=false);}return;
    }
    const popup=window.open('about:blank','_blank','popup,width=540,height=720');if(popup)popup.opener=null;
    try {
      const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      const flow=await call('start',{provider:button.dataset.socialProvider,audience:'owner',purpose:button.dataset.socialPurpose,challenge});
      const url=new URL(flow.authorizationUrl);if(!['https://accounts.google.com','https://appleid.apple.com'].includes(url.origin))throw new Error('The provider address was not verified.');
      if(popup)popup.location.replace(url.href);else {const link=node('a','Open secure provider sign-in');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';area.append(link);}
      say('Complete the provider sign-in, then return here.');
      while(Date.now()<Date.parse(flow.expiresAt)) {
        await new Promise(resolve=>setTimeout(resolve,1500));const result=await call('result',{requestId:flow.requestId,verifier});
        if(result.pending)continue;if(popup&&!popup.closed)popup.close();
        if(result.linked){say('Sign-in method connected. You can use it on your next visit.');area.replaceChildren();return;}
        if(result.mfaRequired){factor(result);return;}throw new Error('The provider did not confirm sign-in.');
      }
      throw new Error('Sign-in expired. Start again.');
    }catch(error){say(error.message);if(popup&&!popup.closed)popup.close();}
    finally {working=false;buttons.forEach(item=>item.disabled=false);}
  });
})();`;
