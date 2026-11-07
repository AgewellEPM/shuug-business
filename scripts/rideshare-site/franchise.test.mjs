import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { joinFamilyPage } from './franchise.mjs';
import { renderHome, renderPage } from './layout.mjs';
import { renderedPages } from './pages.mjs';
import { origin } from './content.mjs';

const script=await readFile(new URL('../../public/rideshare-tax-pros/inner-pages.js',import.meta.url),'utf8');
const home=await readFile(new URL('../../public/rideshare-tax-pros/index.html',import.meta.url),'utf8');
function page(){
  const dom=new JSDOM(renderPage(joinFamilyPage()),{url:`${origin}/join-the-family`,runScripts:'outside-only'}),w=dom.window;
  w.fetch=()=>{throw new Error('The owner brief must not make a network request.');};w.navigator.sendBeacon=()=>{throw new Error('The owner brief must not send a beacon.');};
  w.eval(script);return dom;
}
function valid(dom){
  const d=dom.window.document;for(const [key,value] of Object.entries({name:'Synthetic Owner',office:'Independent Office',community:'Synthetic City, NY',email:'owner@example.invalid',questions:'How are software licenses and support arranged?'}))d.querySelector(`[data-owner-field="${key}"]`).value=value;
  d.querySelector('[data-owner-interest][value="workshops"]').checked=true;
}
test('join page explains independent ownership, support, free workshops and unconfirmed costs',()=>{
  const dom=page(),d=dom.window.document;
  try{
    assert.equal(d.querySelectorAll('h1').length,1);assert.ok(d.body.classList.contains('owner-page'));assert.match(d.querySelector('h1').textContent,/Your storefront.A bigger future/);assert.match(d.body.textContent,/independently owned small tax offices/i);assert.match(d.body.textContent,/Owner tax workshops are free/);
    assert.match(d.body.textContent,/software.*costs.*confirmed/i);assert.match(d.body.textContent,/not guaranteed customers or an announcement of App Store availability/);assert.equal(d.querySelectorAll('.owner-benefit').length,6);assert.equal(d.querySelectorAll('.owner-faq details').length,12);assert.equal(d.querySelectorAll('.journey-steps>li').length,3);
    assert.equal(d.querySelectorAll('.owner-pillars>li').length,4);assert.equal(d.querySelectorAll('.owner-pilot-phases>li').length,3);assert.equal(d.querySelectorAll('.owner-services article').length,6);assert.match(d.querySelector('.owner-keep-list').textContent,/legal business/);assert.match(d.querySelector('.owner-keep-list').textContent,/Revenue from the services you deliver/);assert.match(d.body.textContent,/does not authorize access to another office’s client files/);assert.match(d.querySelector('.owner-cobrand').textContent,/Your local office name/);assert.equal(d.querySelector('a[href*="gigtax.org"]'),null);assert.equal(d.querySelector('a[href$=".pdf"]'),null);
    assert.ok(d.querySelector('a[href="https://www.ftc.gov/business-guidance/resources/consumers-guide-buying-franchise"]'));assert.equal(d.querySelector('form,input[type="password"],input[type="file"]'),null);assert.equal(d.querySelector('link[rel="canonical"]').href,`${origin}/join-the-family`);
    assert.equal(d.querySelector('.mobile-action-bar a').getAttribute('href'),'#owner-interest');
    assert.match(d.querySelector('[data-national-goal]').textContent,/long-term goal: national brand recognition/);assert.match(d.querySelector('[data-national-goal]').textContent,/service availability depends on confirmed participating offices/);assert.match(d.querySelector('.owner-pillars').textContent,/community by community toward a nationwide presence/);
  }finally{dom.window.close();}
});
test('local brief validates before preview and invalidates stale copies after edits',()=>{
  const dom=page(),d=dom.window.document;
  try{
    d.querySelector('[data-owner-prepare]').click();assert.equal(d.querySelector('#owner-brief-error').hidden,false);assert.equal(d.activeElement.id,'owner-name');assert.equal(d.querySelector('#owner-brief-result').hidden,true);
    valid(dom);d.querySelector('#owner-email').value='invalid email';d.querySelector('[data-owner-prepare]').click();assert.equal(d.activeElement.id,'owner-email');
    d.querySelector('#owner-email').value='owner@example.invalid';d.querySelector('#owner-office').value='<img src=x onerror=alert(1)> office';d.querySelector('[data-owner-prepare]').click();assert.equal(d.querySelector('#owner-brief-result').hidden,false);assert.equal(d.activeElement.id,'owner-brief-result');assert.match(d.querySelector('#owner-brief-preview').textContent,/<img src=x/);assert.equal(d.querySelector('#owner-brief-result img'),null);
    d.querySelector('#owner-community').value='New community';d.querySelector('#owner-community').dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelector('#owner-brief-result').hidden,true);assert.equal(d.querySelector('#owner-brief-preview').textContent,'');
    assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
  }finally{dom.window.close();}
});
test('download produces the reviewed local brief only and reset removes draft and preview',async()=>{
  const dom=page(),d=dom.window.document;let blob,downloadCount=0,filename,revoked=false;
  try{
    dom.window.Blob=Blob;dom.window.URL.createObjectURL=value=>{blob=value;return 'blob:owner-brief-test';};dom.window.URL.revokeObjectURL=()=>{revoked=true;};dom.window.setTimeout=callback=>{callback();return 1;};
    dom.window.HTMLAnchorElement.prototype.click=function(){downloadCount++;filename=this.download;};
    d.querySelector('[data-owner-download]').click();assert.equal(downloadCount,0);
    valid(dom);d.querySelector('[data-owner-prepare]').click();const preview=d.querySelector('#owner-brief-preview').textContent;d.querySelector('[data-owner-download]').click();assert.equal(downloadCount,1);assert.equal(filename,'gig-tax-pros-owner-interest-brief.txt');assert.equal(await blob.text(),preview);assert.match(preview,/Not submitted or approved/);assert.match(preview,/Owner tax workshops are free/);assert.match(preview,/Confirm software products, licensing/);assert.equal(revoked,true);
    d.querySelector('[data-owner-reset]').click();assert.equal(d.querySelector('#owner-name').value,'');assert.equal(d.querySelector('#owner-office').value,'');assert.equal(d.querySelector('#owner-brief-preview').textContent,'');assert.equal(d.querySelector('#owner-brief-result').hidden,true);assert.equal(d.querySelectorAll('[data-owner-interest]:checked').length,0);assert.equal(d.activeElement.id,'owner-name');
    d.querySelector('[data-owner-download]').click();assert.equal(downloadCount,1);
  }finally{dom.window.close();}
});
test('shared site navigation, footer and homepage all expose the owner path',()=>{
  const pages=renderedPages();assert.ok(pages.some(item=>item.slug==='join-the-family'));
  for(const item of pages){const dom=new JSDOM(item.html),d=dom.window.document;try{assert.ok(d.querySelector('nav[aria-label="Main navigation"] a[href="/join-the-family"]'),item.slug);assert.ok(d.querySelector('footer a[href="/join-the-family"]'),item.slug);assert.match(d.querySelector('.footer-disclaimer').textContent,/independently owned/);}finally{dom.window.close();}}
  const dom=new JSDOM(renderHome(home)),d=dom.window.document;
  try{assert.equal(d.querySelectorAll('main [data-owner-home]').length,1);assert.ok(d.querySelector('[data-owner-home] a[href="/join-the-family"]'));assert.match(d.querySelector('[data-owner-home]').textContent,/Free owner tax workshops/);assert.match(d.querySelector('[data-owner-home]').textContent,/90-day founding pilot/);assert.match(d.querySelector('[data-owner-home] [data-national-goal]').textContent,/goal is national brand recognition and a future nationwide presence/);assert.ok(d.querySelector('script[src="/office-map.js"]'));assert.ok(d.querySelector('link[href="/office-map.css"]'));assert.equal(d.querySelectorAll('iframe').length,0);assert.ok(d.querySelector('[data-office-map]').compareDocumentPosition(d.querySelector('#approach'))&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(d.body.classList.contains('owner-page'),false);}finally{dom.window.close();}
  assert.throws(()=>renderHome(home.replace('<!-- OFFICE_COVERAGE -->','')),/OFFICE_COVERAGE/);
});
test('ad-pool example presets calculate pooled spend and illustrative allocations only',()=>{
  const dom=page(),d=dom.window.document;
  try{
    assert.equal(d.querySelector('[data-ad-total]').textContent,'$2,000');assert.equal(d.querySelector('[data-ad-allocation="search"]').textContent,'$900');
    assert.equal(d.querySelector('[data-ad-count]').disabled,false);assert.equal(d.querySelector('[data-ad-contribution]').disabled,false);
    for(const [count,total] of [[10,'$2,000'],[50,'$10,000'],[100,'$20,000']]){d.querySelector(`[data-ad-preset="${count}"]`).click();assert.equal(d.querySelector('[data-ad-count]').value,String(count));assert.equal(d.querySelector('[data-ad-total]').textContent,total);}
    d.querySelector('[data-ad-count]').value='7';d.querySelector('[data-ad-contribution]').value='125';d.querySelector('[data-ad-contribution]').dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelector('[data-ad-total]').textContent,'$875');assert.equal(d.querySelector('[data-ad-allocation="search"]').textContent,'$393.75');assert.equal(d.querySelector('[data-ad-allocation="maps"]').textContent,'$262.50');assert.equal(d.querySelector('[data-ad-allocation="social"]').textContent,'$131.25');assert.equal(d.querySelector('[data-ad-allocation="testing"]').textContent,'$87.50');
    assert.match(d.querySelector('#ad-pool-boundary').textContent,/not a payment, fee quote, forecast/);assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
  }finally{dom.window.close();}
});
test('invalid and fractional ad-pool values clear stale arithmetic and reset restores defaults',()=>{
  const dom=page(),d=dom.window.document,count=d.querySelector('[data-ad-count]'),contribution=d.querySelector('[data-ad-contribution]');
  try{
    for(const [offices,amount] of [['','200'],['0','200'],['1001','200'],['1.5','200'],['10','-1'],['10','10001'],['10','200.5'],['1e2','200']]){count.value=offices;contribution.value=amount;count.dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelector('#ad-pool-error').hidden,false);assert.equal(d.querySelector('[data-ad-total]').textContent,'—');assert.equal(d.querySelector('[data-ad-allocation="search"]').textContent,'—');}
    d.querySelector('[data-ad-reset]').click();assert.equal(count.value,'10');assert.equal(contribution.value,'200');assert.equal(d.querySelector('[data-ad-total]').textContent,'$2,000');assert.equal(d.querySelector('#ad-pool-error').hidden,true);assert.equal(count.hasAttribute('aria-invalid'),false);
    contribution.value='0';contribution.dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelector('[data-ad-total]').textContent,'$0');
  }finally{dom.window.close();}
});
test('proposal remains readable without JavaScript and does not imply delivered platforms or pilot results',()=>{
  const dom=new JSDOM(renderPage(joinFamilyPage())),d=dom.window.document;
  try{
    assert.equal(d.querySelectorAll('.owner-ad-examples>div').length,3);assert.match(d.querySelector('.owner-ad-examples').textContent,/\$20,000/);assert.match(d.querySelector('.owner-reporting').textContent,/contribution ledger/);assert.match(d.querySelector('.owner-reporting').textContent,/results would be reported when measured/);assert.match(d.querySelector('.owner-routing').textContent,/LocationRequested serviceOffice capacityAvailability/);assert.match(d.querySelector('.owner-routing').textContent,/reassignment/);assert.match(d.querySelector('#owner-support').textContent,/validated milestones/);assert.match(d.querySelector('#owner-support').textContent,/tax calculation, e-file, banking/);assert.match(d.querySelector('.owner-pilot').textContent,/DAYS 01–30/);assert.match(d.querySelector('.owner-pilot').textContent,/DAYS 61–90/);for(const control of d.querySelectorAll('[data-ad-count],[data-ad-contribution],[data-ad-preset],[data-ad-reset]'))assert.equal(control.disabled,true);
  }finally{dom.window.close();}
});
