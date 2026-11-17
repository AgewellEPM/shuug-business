// No third-party SDK runs in the key-holding portal. Provider authentication
// opens separately; its one-time result requires this page's private verifier.
export function mountSocialSignIn(document,before,{getClient,run,onSignedIn,onMessage,clearOpened,showLogin=true,canRefresh=()=>true,isWorking=()=>false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const section=document.createElement('section'),heading=document.createElement('h2'),status=document.createElement('p');
  heading.textContent=showLogin?'Continue with your account':'Connected sign-in methods';status.setAttribute('role','status');section.hidden=true;section.append(heading,status);before.before(section);
  const rows=[];let linked=[],connectionScope=null;
  async function connections(){const id=getClient()?.identity?.accountId;if(!id)return;try{const value=await getClient().linkedSocialProviders();if(getClient()?.identity?.accountId===id){linked=value;refresh();}}catch{ /* Existing sign-in remains usable while settings are offline. */ }}
  for(const provider of ['google','apple'])for(const mode of ['login','link','unlink']) {
    const link=mode==='link';
    const button=document.createElement('button');button.type='button';button.textContent=`${mode==='unlink'?'Disconnect':link?'Connect':'Continue with'} ${provider==='google'?'Google':'Apple'}`;button.hidden=true;section.append(button);rows.push({provider,mode,button});
    button.addEventListener('click',()=>{
      if(isWorking())return;
      if(!canRefresh()){onMessage('Save or clear unfinished work before changing sign-in.',true);return;}
      const client=getClient();
      if(mode==='unlink'){void run(async()=>{await client.unlinkSocialProvider(provider);await connections();onMessage('Sign-in method disconnected.');});return;}
      client.lock();clearOpened();
      const popup=globalThis.open('about:blank','_blank','popup,width=540,height=720');if(popup)popup.opener=null;
      void run(async()=>{
        try {
          const flow=await client.beginSocialSignIn(provider,{link});
          status.textContent='Complete sign-in with the provider, then return here.';
          if(popup)popup.location.replace(flow.authorizationUrl);
          else {const a=document.createElement('a');a.href=flow.authorizationUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open secure provider sign-in';status.append(a);}
          while(Date.now()<Date.parse(flow.expiresAt)) {
            await wait(1500);if(document.hidden)continue;
            const result=await client.finishSocialSignIn(flow);if(result.pending)continue;
            if(popup&&!popup.closed)popup.close();
            if(result.linked){await connections();onMessage('Sign-in method connected. Use it on your next visit.');return;}
            onSignedIn(result);return;
          }
          throw new Error('Provider sign-in expired. Start again.');
        } finally {if(popup&&!popup.closed)popup.close();status.textContent='';}
      });
    });
  }
  let providers={google:false,apple:false};
  async function configure(){providers=await getClient().socialProviders();refresh();}
  function refresh(){
    const signedIn=!!getClient()?.identity,id=getClient()?.identity?.accountId;
    if(!signedIn){connectionScope=null;linked=[];}else if(connectionScope!==id){connectionScope=id;void connections();}
    for(const {provider,mode,button} of rows){button.hidden=!providers[provider]||(signedIn?(mode==='login'||mode==='link'&&linked.includes(provider)||mode==='unlink'&&!linked.includes(provider)):mode!=='login');button.disabled=isWorking()||!!getClient()?.busy;}
    section.hidden=(!showLogin&&!signedIn)||!Object.values(providers).some(Boolean);
  }
  return {configure,refresh,element:section};
}
