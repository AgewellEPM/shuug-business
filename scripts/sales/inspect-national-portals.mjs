import {writeFileSync} from 'node:fs';
import {REGISTRIES} from '../../sales/registry-catalog.mjs';
import {JSDOM} from 'jsdom';
const entries=Object.entries(REGISTRIES),results=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
  while(cursor<entries.length){
    const [state,registry]=entries[cursor++];
    try{
      const response=await fetch(registry.url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'GigTaxSourceCheck/1.0 (+https://gigtax.pro/privacy)'}});
      const text=(await response.text()).slice(0,1000000),title=text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g,' ').trim();
      const dom=new JSDOM(text,{url:response.url});
      const links=[...dom.window.document.querySelectorAll('a[href]')].filter(a=>/search|find (?:a )?business|business entit/i.test(a.textContent)).map(a=>({label:a.textContent.trim().replace(/\s+/g,' ').slice(0,140),url:a.href})).filter(a=>a.url.startsWith('https:')).slice(0,20);
      dom.window.close();
      const result={state,url:registry.url,status:response.status,finalURL:response.url,title:title?.slice(0,220),challenge:/verify you are human|checking your browser|captcha challenge|challenge-platform|cf-chl-/i.test(text),links};
      results.push(result);console.log(JSON.stringify(result));
    }catch(error){const result={state,url:registry.url,error:error.message};results.push(result);console.log(JSON.stringify(result));}
  }
}));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify({checkedAt:new Date().toISOString(),scope:'Official portal availability only; HTTP 200 does not establish working business searches.',results:results.sort((a,b)=>a.state.localeCompare(b.state))},null,2)+'\n',{flag:'wx'});
