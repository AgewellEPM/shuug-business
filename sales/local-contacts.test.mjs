import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registryMatch} from './business-registry.mjs';
import {researchLocalContacts} from './local-contacts.mjs';
import {localDiscovery} from './local-discovery.mjs';
import {service} from './service.mjs';
import {contactFixture} from '../scripts/sales/contact-fixture.mjs';

const office={candidateId:'fixture-office',name:'7082 LLC',address:'29 Victoria Rd',city:'Hartford',state:'CT',zip:'06114',contact:'Synthetic Directory Contact',phone:'860-555-0199',url:'https://www.irs.gov/pub/irs-efile/ct.zip'};
test('registry candidates need a meaningful name or full tax-business address match, never just a street number',()=>{
  const row=(name,billingstreet,extra={})=>({id:name,name,billingstreet,billingcity:'Hartford',billingstate:'CT',...extra});
  assert.equal(registryMatch(office,row('Unrelated Property LLC','29 Charter Oak Place')),null);
  assert.equal(registryMatch(office,row('Unrelated Realty LLC','29 Victoria Road')),null);
  assert.equal(registryMatch(office,row('7082 Tax Solution LLC','84 Other Road')).match,'related_name');
  assert.equal(registryMatch(office,row('7082 LLC','29 Victoria Road')).match,'name_and_address');
  assert.equal(registryMatch(office,row('Other Tax Services LLC','29 Victoria Road')).match,'address_only');
  assert.equal(registryMatch({...office,name:'Tax Services LLC'},row('Other Tax Services LLC','100 Elsewhere')),null,'generic tax words do not identify a company');
});
test('contact research preserves published sources, requires website review and separates business channels from personal identity',async()=>{
  let queries=[],reads=0;
  const options={search:async query=>{queries.push(query);return[{url:'https://fixture-business.org',title:'Synthetic business'},{url:'javascript:alert(1)'},{url:'https://www.whitepages.com/person/fixture'}];},researcher:async()=>{reads++;return{evidence:[{id:'mail',field:'email',value:'office@fixture-business.org',sourceURL:'https://fixture-business.org/contact',excerpt:'Published office inbox'}],pages:[{url:'https://fixture-business.org/contact',status:'checked'}]};}};
  const first=await researchLocalContacts(office,{},options);
  assert.equal(first.candidates.length,1);assert(queries[0].includes(office.contact));assert.equal(first.evidence.find(item=>item.field==='phone').scope,'business');assert.equal(reads,0);
  await assert.rejects(researchLocalContacts(office,{website:'https://fixture-business.org'},options),/Confirm/);
  await assert.rejects(researchLocalContacts(office,{website:'https://whitepages.com',websiteReviewed:true},options),/business website/);
  const report=await researchLocalContacts(office,{website:'https://fixture-business.org',websiteReviewed:true},options);
  assert.equal(report.evidence.find(item=>item.field==='email').scope,'business');assert.equal(report.evidence.find(item=>item.field==='contact').value,office.contact);assert.equal(reads,1);
  const outage=await researchLocalContacts(office,{}, {search:async()=>{throw Error('offline');}});
  assert(outage.issues.length);assert(outage.evidence.length);assert.equal(outage.searchLinks.length,2);
});
test('principal research tokens are bound to a sourced business, user, territory and expiry',async()=>{
  const env={GIGTAX_SALES_SESSION_KEY:'a'.repeat(64)},owner={id:'owner',role:'owner'},agent={id:'agent',role:'agent',states:['CT']};let now=Date.now(),readCandidate;
  const options={now:()=>now,discoverer:async()=>({results:[office],total:1,locality:'Hartford'}),registry:async()=>({results:[],supported:true}),lookup:async()=>({matches:[{...office,registryId:'fixture',sourceURL:'https://data.ct.gov/d/n7gp-d28j',principals:[{name:'Synthetic Principal',role:'Manager',sourceURL:'https://data.ct.gov/d/ka36-64k6'}]}]}),search:async()=>[],checkCandidate:async(_user,candidate)=>{readCandidate=candidate;}};
  const local=localDiscovery(env,options),search=await local(agent,'search-local',{city:'Hartford',state:'CT'}),candidateToken=search.results[0].candidateToken;
  assert(Buffer.byteLength(JSON.stringify({candidateTokens:Array(10).fill(candidateToken)}))<16000);
  const business=await local(agent,'lookup-business',{candidateToken}),token=business.matches[0].principals[0].researchToken;
  const report=await local(agent,'research-local-contacts',{candidateToken:token,contact:'Forged Name'});
  assert.equal(readCandidate.contact,'Synthetic Principal');assert.equal(report.context.contact,'Synthetic Principal');assert.equal(report.evidence.find(item=>item.field==='contact').sourceURL,'https://data.ct.gov/d/ka36-64k6');
  await assert.rejects(local(owner,'research-local-contacts',{candidateToken:token}),/another agent/);
  await assert.rejects(local({...agent,states:['MA']},'research-local-contacts',{candidateToken:token}),/territory/);
  now+=3600001;await assert.rejects(local(agent,'research-local-contacts',{candidateToken:token}),/expired/);
});
test('map contact research honors saved do-not-contact records without modifying the pipeline',async()=>{
  const f=contactFixture(),saved=await f.createOffice();let searches=0;
  const candidate={...office,name:saved.town,address:JSON.parse(saved.notes).address,city:saved.locality,state:saved.state};
  f.rows.offices[0].status='do_not_contact';
  const app=service(f.env,f.db,undefined,{localDiscovery:{discoverer:async()=>({results:[candidate],total:1}),registry:async()=>({results:[]}),search:async()=>{searches++;return[];}}});
  const before=JSON.stringify(f.rows),found=await app.dispatch(f.owner,'search-local',{city:candidate.city,state:candidate.state});
  await assert.rejects(app.dispatch(f.owner,'research-local-contacts',{candidateToken:found.results[0].researchToken}),/paused/);
  assert.equal(searches,0);assert.equal(JSON.stringify(f.rows),before);
});
