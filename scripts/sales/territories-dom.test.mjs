import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {contactFixture} from './contact-fixture.mjs';
import {createHandler} from '../../sales/handler.mjs';
import {metadata} from '../../sales/model.mjs';

test('shipped state map drills into the full town catalog and saves reviewed salesperson coverage through the actual handler',async()=>{
  const f=contactFixture(),calls=[];
  await f.app.dispatch(f.owner,'create-agent',{name:'Synthetic Town Agent',email:'towns@example.test',states:['CT','CA']});
  const handler=createHandler(f.env,f.db);
  const dom=new JSDOM(readFileSync('deployments/rideshare-tax-pros/.vercel/output/static/sales.html','utf8'),{url:'https://gigtax.pro/sales#owner-code='+f.code+'&view=territories',runScripts:'outside-only'}),w=dom.window,d=w.document;let cookie='';
  const until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out in territory UI: '+d.querySelector('#sales-status')?.textContent);};
  try{
    w.fetch=async(_url,options)=>{const input=JSON.parse(options.body);let status,data;await handler({method:'POST',headers:{origin:f.env.GIGTAX_SALES_ORIGIN,'content-type':'application/json',cookie},body:options.body},{statusCode:200,setHeader(name,value){if(name==='Set-Cookie')cookie=value.split(';')[0];},end(value){status=this.statusCode;data=JSON.parse(value);}});calls.push({action:input.action,status});return{ok:status<400,status,json:async()=>data};};
    for(const script of d.querySelectorAll('script[src][defer]'))w.eval(readFileSync('public/rideshare-tax-pros'+script.getAttribute('src'),'utf8'));
    await until(()=>!d.querySelector('#sales-workspace').hidden);
    d.querySelector('[data-territory-state="CT"]').click();
    await until(()=>d.querySelector('[data-territory-town]'));
    assert.equal(d.querySelector('[data-tab-panel="territories"]').hidden,false);
    assert.match(d.querySelector('.territory-drilldown').textContent,/169 available/);
    assert.equal(d.querySelectorAll('[data-territory-town]').length,100);
    assert.equal(f.rows.offices.length,0,'town catalog does not require a saved office');
    d.querySelector('[data-territory-next]').click();await until(()=>d.querySelectorAll('[data-territory-town]').length===69);
    assert.equal(d.querySelectorAll('[data-territory-town]').length,69);
    const query=d.querySelector('[data-territory-query]');query.value='Hartford';query.dispatchEvent(new w.Event('input',{bubbles:true}));
    await until(()=>d.querySelectorAll('[data-territory-town]').length===4);
    const mode=d.querySelector('[data-territory-mode]');mode.value='selected';mode.dispatchEvent(new w.Event('change',{bubbles:true}));
    const town=d.querySelector('[data-territory-town][value="hartford"]');town.checked=true;town.dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.equal(metadata(f.rows.agents[0]).territory,undefined,'nothing saves until Save territory');
    d.querySelector('[data-territory-save]').click();await until(()=>metadata(f.rows.agents[0]).territory?.areas.some(area=>area.state==='CT'&&area.cities?.includes('hartford')));
    await until(()=>d.querySelector('[data-territory-save]')?.disabled===false);
    assert.equal(metadata(f.rows.agents[0]).territory.areas.find(area=>area.state==='CA').cities,null,'other assigned state retained');
    assert.match(d.querySelector('#sales-team').textContent,/CT: 1 towns/);
    d.querySelector('[data-territory-state="CA"]').click();await until(()=>d.querySelector('[data-territory-town]')?.value==='acalanes ridge');
    assert(d.querySelector('.territory-drilldown').textContent.includes('CA · Towns & cities'));
    assert(d.querySelector('[data-territory-research]'));
    assert.equal(calls.filter(call=>call.action==='set-agent-territory').length,1);assert(calls.every(call=>call.status===200));
  }finally{w.close();}
});
