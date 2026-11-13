import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KENTUCKY_SEARCH,parseKentuckySearch,parseKentuckyProfile,parseKentuckyOfficers,lookupKentuckyBusiness} from './registry-kentucky.mjs';
import {lookupStateBusiness,stateTaxBusinesses} from './state-registry.mjs';

const input=(name,value,type='hidden')=>`<input type="${type}" name="${name}" value="${value}">`;
const hidden=input('__VIEWSTATE','PUBLIC_FORM_STATE')+input('__VIEWSTATEGENERATOR','PUBLIC_GENERATOR');
const searchForm=hidden+input('ctl00$MainContent$txtSearch','','text')+'<select name="ctl00$MainContent$ddlSearchBy"><option>Business Name or Organization Number</option></select><script>globalThis.__kyScriptExecuted=true</script>';
const searchResults=(name='Synthetic Kentucky Tax LLC',count=1)=>`<span id="MainContent_LblResults">${count} Results found (1 Results shown; Page 1 of 2):</span><a id="MainContent_gvSearchResults_HlName_0" href="Profile.aspx/?ctr=990001">${name}</a>`;
const field=(label,value)=>`<div class="grid-row"><div class="grid-label">${label}</div><div class="grid-value">${value}</div></div>`;
const profileHTML=hidden+input('ctl00$MainContent$hdnCompanyID','0990001')+input('ctl00$MainContent$hdnCTR','990001')+input('ctl00$MainContent$BtnCurrent','Show Current Officers','submit')+
  field('Organization Number','0990001')+field('Name','Synthetic Kentucky Tax LLC')+field('Status','A - Active')+field('Standing','G - Good')+field('Company Type','Kentucky LLC')+
  field('Principal Office','12 Fixture Road<br/>Suite 2<br/>Frankfort, KY, 40601')+field('Registered Agent','Synthetic Agent<br/>EXCLUDED PERSONAL ADDRESS')+field('Last Annual Report','6/10/2026');
const officersHTML=(extra='')=>hidden+input('ctl00$MainContent$hdnCompanyID','0990001')+input('ctl00$MainContent$hdnCTR','990001')+
  '<span id="MainContent_lblName">Synthetic Kentucky Tax LLC</span><div id="MainContent_pcurrent"><span id="MainContent_rptCurrentOfficers_LblTitle_0">Member</span><a id="MainContent_rptCurrentOfficers_LbOfficer_0" href="../Offsearch.aspx?sf=Synthetic">Synthetic Member</a></div>'+extra;
const candidate={name:'Synthetic Kentucky Tax LLC',address:'12 Fixture Road, Suite 2',city:'Frankfort',state:'KY'};

test('Kentucky uses only native public business-name and Current Officers forms, excluding private fields and downloaded script execution',async()=>{
  const calls=[];
  const fetcher=async (url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.origin,new URL(KENTUCKY_SEARCH).origin);assert.equal(options.redirect,'error');assert(options.signal);calls.push({url:String(url),options});
    if(!options.body)return new Response(String(url).includes('Profile.aspx')?profileHTML:searchForm,{headers:{'Set-Cookie':'ASP.NET_SessionId=public-session; Path=/; HttpOnly'}});
    const body=new URLSearchParams(options.body);assert.equal(options.headers.Cookie,'ASP.NET_SessionId=public-session');
    assert.equal(body.get('__VIEWSTATE'),'PUBLIC_FORM_STATE');assert(![...body.keys()].some(key=>/BtnInitial|Cert|payment|filing|OfficerSearch/i.test(key)));
    if(String(url)===KENTUCKY_SEARCH){assert.equal(body.get('__EVENTTARGET'),'ctl00$MainContent$BSearch');assert.equal(body.get('ctl00$MainContent$txtSearch'),candidate.name);return new Response(searchResults());}
    assert.equal(body.get('ctl00$MainContent$BtnCurrent'),'Show Current Officers');return new Response(officersHTML('<span id="MainContent_rptInitialOfficers_LblName_0">EXCLUDED ORGANIZER</span>'));
  };
  const report=await lookupKentuckyBusiness(candidate,fetcher);assert.equal(calls.length,4);assert.equal(report.matches.length,1);const record=report.matches[0];
  assert.equal(record.match,'name_and_address');assert.equal(record.principals[0].name,'Synthetic Member');assert.match(record.principals[0].role,/Member .*ownership unconfirmed/);assert.equal(record.principals[0].verifiedOwner,false);
  assert.equal(record.registeredAgents[0].name,'Synthetic Agent');assert.equal(record.address,'12 Fixture Road, Suite 2');assert.equal(record.city,'Frankfort');
  assert(!JSON.stringify(report).includes('EXCLUDED'));assert(!JSON.stringify(report).includes('PUBLIC_FORM_STATE'));assert.equal(globalThis.__kyScriptExecuted,undefined);
  assert(record.principals[0].sourceURL.endsWith('#currentOfficersHeading'));
  assert.deepEqual((await lookupKentuckyBusiness(candidate,fetcher)).matches,report.matches);assert.equal(calls.length,4,'Only sanitized successful public results are cached.');
});

test('Kentucky preserves source limits and requires exact legal-name matches before opening profiles',async()=>{
  assert.equal(parseKentuckySearch(searchResults('Unrelated Tax LLC',150)).truncated,true);
  let calls=0;
  const result=await lookupKentuckyBusiness(candidate,async url=>{
    calls++;assert(!String(url).includes('Profile.aspx'));return new Response(calls%2?searchForm:searchResults('Unrelated Tax LLC',150));
  });
  assert.equal(result.matches.length,0);assert.equal(result.truncated,true);assert.equal(calls,4);
  assert.throws(()=>parseKentuckySearch(searchResults().replace('Profile.aspx/?ctr=990001','https://outside.example/record')),/unavailable/);
  assert.throws(()=>parseKentuckySearch(searchResults().replace('1 Results shown','2 Results shown')),/format changed/);
});

test('Kentucky Current Officers must agree with both business identifiers and its heading, excluding similarly named profiles',()=>{
  const record=parseKentuckyProfile(profileHTML,'990001');assert.equal(record.registryId,'profile:990001');assert.equal(record.businessId,'0990001');
  assert.equal(parseKentuckyOfficers(officersHTML(),record).length,1);
  for(const html of [officersHTML().replace('0990001','0990002'),officersHTML().replace('990001','990002'),officersHTML().replace('Synthetic Kentucky Tax LLC','Unrelated Kentucky LLC')])assert.throws(()=>parseKentuckyOfficers(html,record),/unavailable/);
  assert.equal(record.principals.length,0);assert(!JSON.stringify(record).includes('EXCLUDED'));assert(!record.location);
  assert.throws(()=>parseKentuckyProfile(profileHTML,'../bad'),/unavailable/);
});

test('Kentucky officer-source failures preserve the corporate record, remain explicit, and are retried without caching the failure',async()=>{
  let posts=0;
  const fetcher=async(_url,options)=>{
    if(!options.body)return new Response(profileHTML);
    posts++;return posts===1?new Response('Unavailable',{status:503}):new Response(officersHTML());
  };
  const input={...candidate,registryId:'profile:990001',registryState:'KY'};
  const failed=await lookupKentuckyBusiness(input,fetcher);assert.equal(failed.matches.length,1);assert.equal(failed.matches[0].principals.length,0);assert.match(failed.matches[0].principalIssue,/could not be loaded/);
  const retry=await lookupKentuckyBusiness(input,fetcher);assert.equal(retry.matches[0].principals.length,1);assert.equal(posts,2);
});

test('Kentucky outages and source challenges fail closed with the manual official route; local registry discovery stays unsupported',async()=>{
  const unavailable=await lookupStateBusiness(candidate,async()=>new Response(searchForm+'<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'));
  assert.equal(unavailable.available,false);assert.equal(unavailable.matches.length,0);assert(unavailable.links.length);assert.equal(unavailable.coverage.automaticLocalDiscovery,false);
  const noFetch=()=>{throw Error('Must not fetch');};assert.equal((await stateTaxBusinesses('KY','Frankfort',noFetch)).supported,false);
  await assert.rejects(lookupKentuckyBusiness({...candidate,registryId:'990001 OR true'},noFetch),/Invalid/);
});

test('Kentucky decodes published entities and preserves business address units without retaining agent address lines',()=>{
  const record=parseKentuckyProfile(profileHTML.replace('Synthetic Kentucky Tax LLC','Synthetic O&#39;Neil &amp; Tax LLC'),'990001');
  assert.equal(record.name,"Synthetic O'Neil & Tax LLC");assert.equal(record.zip,'40601');assert.equal(record.registeredAgents[0].name,'Synthetic Agent');assert.equal(record.lastAnnualReport,'6/10/2026');
});
