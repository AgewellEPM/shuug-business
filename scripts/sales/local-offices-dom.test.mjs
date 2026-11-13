import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {contactFixture} from './contact-fixture.mjs';
import {createHandler} from '../../sales/handler.mjs';

for(const addressless of [false,true])test(`the shipped Leaflet UI maps, researches ${addressless?'addressless name matches':'name/address matches'}, and saves only a reviewed office form`,async()=>{
  const f=contactFixture(),calls=[];
  const results=Array.from({length:3},(_,i)=>({candidateId:`candidate-${i}`,name:i===0?'Synthetic <img src=x onerror=alert(1)> Tax':`Synthetic Tax ${i}`,address:`${800+i} Fixture Avenue`,city:'Hartford',state:'CT',zip:'06103',contact:'Listed contact',phone:'8605550100',url:'https://www.irs.gov/pub/irs-efile/ct.zip'}));
  const handler=createHandler(f.env,f.db,{localDiscovery:{discoverer:async()=>({results,total:3,locality:'Hartford',correction:{from:'hartord',to:'Hartford'}}),registry:async()=>({supported:true,results:[]}),geocoder:async rows=>rows.map((row,i)=>({candidateId:row.candidateId,location:i===2?null:{lat:41.76,lng:-72.68,source:'Synthetic address fixture',precision:'Address estimate'}})),search:async()=>[{title:'Synthetic official website',url:'https://fixture-tax.org',snippet:'Business website fixture'}],researcher:async()=>({evidence:[{id:'email-fixture',field:'email',value:'office@fixture-tax.org',sourceURL:'https://fixture-tax.org/contact',excerpt:'Office email',checkedAt:new Date().toISOString()}],pages:[{url:'https://fixture-tax.org/contact',status:'checked'}]}),lookup:async row=>({supported:true,message:'Listed principals are not confirmed owners.',matches:[{legalName:row.name,name:row.name,address:addressless?'':row.address,city:addressless?'':row.city,state:row.state,registryState:row.state,zip:addressless?'':row.zip,match:addressless?'name_only':'name_and_address',status:'Active',businessType:'LLC',businessId:'synthetic',sourceURL:'https://data.ct.gov/d/n7gp-d28j',principals:[{name:'Synthetic Principal',role:'Manager',sourceURL:'https://data.ct.gov/d/ka36-64k6'}]}]})}});
  const dom=new JSDOM(readFileSync('deployments/rideshare-tax-pros/.vercel/output/static/sales.html','utf8'),{url:'https://gigtax.pro/sales#owner-code='+f.code+'&view=discover&city=hartord&state=CT',runScripts:'outside-only'}),w=dom.window,d=w.document;let cookie='';
  const until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out waiting for the shipped local-office UI: '+d.querySelector('[data-local-contact-status]')?.textContent+'; '+JSON.stringify(calls));};
  try{
    w.SVGSVGElement.prototype.createSVGRect=()=>({});
    Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.id==='sales-discovery-map'?900:0;}});
    Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='sales-discovery-map'?460:0;}});
    w.fetch=async(_url,options)=>{let data,status;const body=JSON.parse(options.body);await handler({method:'POST',headers:{origin:f.env.GIGTAX_SALES_ORIGIN,'content-type':'application/json',cookie},body:options.body},{statusCode:200,setHeader(name,value){if(name==='Set-Cookie')cookie=value.split(';')[0];},end(value){status=this.statusCode;data=JSON.parse(value);}});calls.push({action:body.action,status});return{ok:status<400,status,json:async()=>data};};
    for(const script of d.querySelectorAll('script[src][defer]'))w.eval(readFileSync('public/rideshare-tax-pros'+script.getAttribute('src'),'utf8'));
    await until(()=>!d.querySelector('#sales-workspace').hidden);
    const form=d.querySelector('#sales-discover');
    await until(()=>d.querySelectorAll('[data-local-office]').length===3&&d.querySelector('[data-map-progress]').textContent.includes('Mapped 2 of 3'));
    assert.equal(w.L.version,'1.9.4');assert.equal(form.elements.city.value,'Hartford');assert.equal(d.querySelector('#sales-stats').hidden,true);
    assert.equal(d.querySelectorAll('.local-map-pin').length,1,'co-located businesses share a pin, without hiding their list entries');
    const tile=d.querySelector('.leaflet-tile');assert(tile);assert.equal(tile.referrerPolicy,'origin');assert.match(tile.src,/^https:\/\/tile\.openstreetmap\.org\//);
    assert.equal(d.querySelectorAll('[data-local-list] img').length,0,'business names are rendered as text');
    assert.match(d.querySelector('[data-local-list]').textContent,/Address not matched/);
    d.querySelector('[data-local-office="candidate-0"]').click();await until(()=>d.querySelector('[data-local-business]').textContent.includes('Synthetic Principal'));
    assert.match(d.querySelector('[data-local-business]').textContent,/Manager/);assert.match(d.querySelector('[data-local-business]').textContent,/not confirmed owners/);
    assert.equal(f.rows.offices.length,0,'discovery, maps and business lookup never populate the pipeline');
    d.querySelector('[data-research-principal]').click();
    assert.match(d.querySelector('[data-local-contact-context]').textContent,/Synthetic Principal/);
    if(addressless)assert.match(d.querySelector('[data-local-contact-context]').textContent,/name only/);
    d.querySelector('[data-local-contact-search]').click();await until(()=>d.querySelector('[data-local-contact-website]'));
    d.querySelector('[data-local-contact-website]').click();const researchForm=d.querySelector('[data-local-contact-form]');
    assert.equal(researchForm.elements.website.value,'https://fixture-tax.org/');assert.equal(researchForm.elements.reviewed.checked,false);
    researchForm.elements.reviewed.checked=true;researchForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>d.querySelector('[data-local-contact-results]').textContent.includes('office@fixture-tax.org'));
    const entry=d.querySelector('#sales-create-office');d.querySelector('[data-local-contact-prepare]').click();assert.equal(entry.elements.email.value,'','unreviewed preparation is blocked');
    d.querySelectorAll('[data-local-contact-evidence]').forEach(input=>input.checked=true);d.querySelector('[data-local-contact-reviewed]').checked=true;d.querySelector('[data-local-contact-prepare]').click();
    assert.equal(entry.elements.email.value,'office@fixture-tax.org');assert.equal(entry.elements.contact.value,'Synthetic Principal');assert.equal(entry.elements.website.value,'https://fixture-tax.org/');
    assert.equal(entry.elements.address.value,'800 Fixture Avenue');assert.equal(f.rows.offices.length,0);
    entry.elements.name.value='Synthetic reviewed fixture';entry.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>f.rows.offices.length===1);
    assert.equal(JSON.parse(f.rows.offices[0].notes).independence,'unverified');assert(calls.some(call=>call.action==='lookup-business'&&call.status===200));assert(calls.every(call=>call.status===200));
  }finally{w.close();}
});
