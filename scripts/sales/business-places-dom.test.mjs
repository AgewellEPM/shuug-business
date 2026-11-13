import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {prospectTools} from '../../sales/prospect-tools.mjs';
import {metadata} from '../../sales/model.mjs';

test('saved-office UI keeps catalogue website choices and reviewed contact proposals together',async()=>{
  const dom=new JSDOM('<section id="sales-detail"></section>',{url:'https://gigtax.pro/sales',runScripts:'outside-only'}),w=dom.window,d=w.document;
  let office={id:'12',town:'Synthetic Tax',locality:'Hartford',state:'CT',status:'researching',notes:JSON.stringify({address:'12 Fixture Road'})},writes=0;
  const sourceURL='https://explore.overturemaps.org/',sourceRelease='2026-10-21.0',sourceObservedDates=['2026-09-01'];
  const placeLookup=()=>({status:'matches',sourceName:'Overture fixture',release:sourceRelease,attribution:'Synthetic attribution',attributionURL:'https://gigtax.pro/business-data-attribution.txt',limits:'Business connection needs review.',
    candidates:[{url:'https://fixture-business.org/',title:'Synthetic Tax',sourceURL,sourceRelease,sourceObservedDates}],
    evidence:[{field:'phone',value:'+18602469999',sourceURL,sourceRelease,sourceObservedDates,sourceName:'Overture fixture'}]});
  const db={search:async()=>{throw Error('Catalogue should supply the website');},patch:async(_kind,_id,patch)=>{writes++;office={...office,...patch};return office;},create:async()=>({id:'event'})};
  const run=prospectTools({GIGTAX_SALES_SESSION_KEY:'a'.repeat(64)},db,{placeLookup});
  const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Research UI did not reach expected state');};
  try{
    w.eval(readFileSync('public/rideshare-tax-pros/sales-research.js','utf8'));
    w.GigTaxResearch.mount({office,api:(action,body)=>run({id:'owner',role:'owner'},office,action,body)});
    d.querySelector('#sales-research-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>d.querySelector('[data-research-website]'));
    assert(d.querySelector('.sales-research-review'));
    assert.match(d.body.textContent,/2026-09-01/);assert.match(d.body.textContent,/not a fresh verification/);
    assert(d.querySelector('a[href$="business-data-attribution.txt"]'));
    assert.equal(writes,0);
    d.querySelector('[data-research-website]').click();assert.equal(d.querySelector('#sales-research-form').elements.website.value,'https://fixture-business.org/');
    const form=d.querySelector('.sales-research-review');form.querySelector('input[name="selected"]').checked=true;
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(writes,0);
    form.elements.reviewed.checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>writes===1);assert.equal(office.contact_phone,'+18602469999');
    assert.deepEqual(metadata(office).researchSources.phone.sourceObservedDates,sourceObservedDates);
    assert.equal(metadata(office).contactVerified,false);
  }finally{w.close();}
});
