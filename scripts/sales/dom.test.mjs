import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createHandler} from '../../sales/handler.mjs';
import {digest} from '../../sales/model.mjs';

test('sales DOM signs in, saves an office through its API, keeps tabs separate and records a follow-up',async()=>{
  const rows={offices:[],agents:[],events:[],enrollments:[]};let nextId=1,cookie='',support=null;
  const db={list:async kind=>structuredClone(rows[kind]),get:async(kind,id)=>structuredClone(rows[kind].find(r=>String(r.id)===String(id))),create:async(kind,b)=>{const r={...b,id:nextId++,created_at:new Date().toISOString()};rows[kind].push(r);return structuredClone(r);},patch:async(kind,id,b)=>{const r=rows[kind].find(r=>String(r.id)===String(id));Object.assign(r,b);return structuredClone(r);},terms:async()=>null};
  const env={GIGTAX_TINKY_KEY:'synthetic',GIGTAX_SALES_SESSION_KEY:'a'.repeat(64),GIGTAX_SALES_OWNER_HASH:digest('synthetic-owner-code'),GIGTAX_SALES_ORIGIN:'https://gigtax.pro'};
  db.support=async()=>support;db.setSupport=async value=>{support=structuredClone(value);};
  const handler=createHandler(env,db),dom=new JSDOM(readFileSync('deployments/rideshare-tax-pros/.vercel/output/static/sales.html','utf8'),{url:'https://gigtax.pro/sales',runScripts:'outside-only'}),w=dom.window;
  w.fetch=async(url,options)=>{let result,code;await handler({method:'POST',headers:{origin:env.GIGTAX_SALES_ORIGIN,'content-type':'application/json',cookie},body:options.body},{statusCode:200,setHeader(name,value){if(name==='Set-Cookie')cookie=value.split(';')[0];},end(value){code=this.statusCode;result=JSON.parse(value);}});return {ok:code>=200&&code<300,status:code,json:async()=>result};};
  const wait=async test=>{for(let i=0;i<80;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw new Error('DOM did not reach expected state');};
  try {
    w.eval(readFileSync('public/rideshare-tax-pros/directory-admin.js','utf8'));
    w.eval(readFileSync('public/rideshare-tax-pros/sales.js','utf8'));await new Promise(r=>setTimeout(r,15));
    assert.equal(w.document.querySelector('#sales-workspace').hidden,true);
    const login=w.document.querySelector('#sales-login-form');login.elements.code.value='synthetic-owner-code';login.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>!w.document.querySelector('#sales-workspace').hidden);
    assert.equal(w.document.querySelector('[data-tab-panel="team"]').hidden,true);
    w.document.querySelector('[data-tab="discover"]').click();const form=w.document.querySelector('#sales-create-office');
    for(const [name,value] of Object.entries({name:'Synthetic <Office>',address:'123 Example Street',city:'Hartford',state:'CT',email:'owner@example.test',contact:'Synthetic Owner',independence:'independent'}))form.elements[name].value=value;
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>Boolean(w.document.querySelector('#sales-activity')));
    assert.equal(rows.offices.length,1);assert.equal(w.document.querySelector('#sales-detail h2').textContent,'Synthetic <Office>');assert.equal(w.document.querySelector('#sales-detail Office'),null);
    assert.equal(w.document.querySelector('[data-tab-panel="team"]').hidden,true);
    const activity=w.document.querySelector('#sales-activity');activity.elements.note.value='A real UI action recorded against a synthetic office.';activity.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>rows.events.length===2);
    assert.equal(w.document.querySelector('#sales-invite button').disabled,true);
    const listing=w.document.querySelector('#directory-listing-form');assert(listing);
    for(const [name,value] of Object.entries({postalCode:'06103',latitude:'41.7658',longitude:'-72.6734',phone:'+1 203 555 0100',appointmentURL:'https://example.test/book'}))listing.elements[name].value=value;
    listing.elements.enabled.checked=true;listing.elements.publicDetailsConfirmed.checked=true;
    listing.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>JSON.parse(rows.offices[0].notes).publicListing?.enabled===true);
    assert.equal(JSON.parse(rows.offices[0].notes).publicListing.phone,'+1 203 555 0100');
    await wait(()=>Boolean(w.document.querySelector('#directory-support-form')));
    const help=w.document.querySelector('#directory-support-form');help.elements.phone.value='+1 203 555 0101';
    help.elements.available24x7.checked=true;help.elements.coverageConfirmed.checked=true;
    help.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>support?.available24x7===true);assert.equal(support.phone,'+1 203 555 0101');
    assert(!w.localStorage.length&&!w.sessionStorage.length);
  } finally {w.close();}
});
