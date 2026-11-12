import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDiscovery } from './local-discovery.mjs';
import { lookupBusiness, taxBusinesses } from './business-registry.mjs';
import { csvRows, geocodeCandidates } from './geocoding.mjs';

const owner = { id:'owner',role:'owner',states:[] }, env = { GIGTAX_SALES_SESSION_KEY:'a'.repeat(64) };
const candidate = (i=1) => ({ candidateId:`candidate-${i}`, name:`Synthetic Tax ${i}`, address:`${i} Fixture Street`,city:'Hartford',state:'CT',zip:'06103',url:'https://www.irs.gov/pub/irs-efile/ct.zip' });
test('local discovery includes every result page/chains, merges public sources, and binds source tokens to identity and territory',async()=>{
  const calls=[];
  const app=localDiscovery(env,{discoverer:async(_state,city,_fetcher,options)=>{calls.push(options);return{results:Array.from({length:Math.min(50,63-options.offset)},(_,i)=>candidate(options.offset+i+1)),total:63,locality:'Hartford',correction:city==='hartord'?{from:city,to:'Hartford'}:null};},registry:async()=>({supported:true,results:[{...candidate(1),registryId:'entity-1',sourceURL:'https://data.ct.gov/d/n7gp-d28j'}]}),lookup:async row=>({supported:true,matches:[{name:row.name}]}),geocoder:async rows=>rows.map(row=>({candidateId:row.candidateId,location:null}))});
  const result=await app(owner,'search-local',{state:'CT',city:'hartord'});assert.equal(result.results.length,63);assert.equal(result.results[0].registryId,'entity-1');assert.equal(result.correction.to,'Hartford');assert(calls.every(call=>call.includeChains&&call.exactCity));assert.deepEqual(calls.map(call=>call.offset),[0,50]);
  const token=result.results[0].candidateToken;
  assert.equal((await app(owner,'lookup-business',{candidateToken:token})).matches[0].name,'Synthetic Tax 1');
  await assert.rejects(app({id:'other',role:'agent',states:['CT']},'lookup-business',{candidateToken:token}),/another agent/);
  await assert.rejects(app(owner,'lookup-business',{candidateToken:token.slice(0,-3)+'bad'}),/expired|another agent/);
  await assert.rejects(app({id:'agent',role:'agent',states:['MA']},'search-local',{state:'CT',city:'Hartford'}),error=>error.status===403);
  assert.equal((await app(owner,'map-geocode',{candidateTokens:[token]})).results[0].location,null);
  assert(Buffer.byteLength(JSON.stringify({action:'map-geocode',candidateTokens:Array(10).fill(token)}))<16000);
});
test('exact public address matches get pins; ambiguous, foreign-state and impossible coordinates remain unmapped',async()=>{
  const rows=Array.from({length:4},(_,i)=>({...candidate(9101+i),candidateId:`geo-${i}`}));
  const response='"0","input","Match","Exact","9101 FIXTURE ST, HARTFORD, CT, 06103","-72.68,41.76"\n"1","input","Match","Non_Exact","9102 FIXTURE ST, HARTFORD, CT, 06103","-72.68,41.76"\n"2","input","Match","Exact","9103 FIXTURE ST, ALBANY, NY, 12201","-73.7,42.6"\n"3","input","Match","Exact","9104 FIXTURE ST, HARTFORD, CT, 06103","0,0"\n';
  let count=0;const fetcher=async(url,options)=>{count++;assert.equal(url,'https://geocoding.geo.census.gov/geocoder/locations/addressbatch');assert.equal(options.redirect,'error');const form=options.body;assert.equal(form.get('benchmark'),'Public_AR_Current');assert.equal(csvRows(await form.get('addressFile').text()).length,4);return new Response(response);};
  const first=await geocodeCandidates(rows,fetcher);assert.equal(first.filter(row=>row.location).length,1);assert.equal(first[0].location.precision,'Address-range estimate');assert.equal(first[3].status,'unmatched');
  await geocodeCandidates(rows,fetcher);assert.equal(count,1,'actual match/no-match responses are cached; no repeated source load');
  assert.deepEqual(csvRows('"a,b","quoted ""value"""\n'),[['a,b','quoted "value"']]);
});
test('CT cross-reference uses actual business keys and professional fields without treating principals as verified owners',async()=>{
  const queries=[];
  const fetcher=async(url)=>{const u=new URL(url);queries.push(u);const select=u.searchParams.get('$select');assert(!/residence|woman_owned|veteran_owned|minority_owned|category_survey/.test(select));
    if(u.pathname.includes('ka36-64k6')){assert.match(u.searchParams.get('$where'),/business_id='synthetic-entity'/);return Response.json([{business_id:'synthetic-entity',name__c:'Synthetic Principal',designation:'Manager'}]);}
    return Response.json([{id:'synthetic-entity',name:'Synthetic Tax 1 LLC',billingstreet:'1 Fixture Street',billingcity:'Hartford',billingstate:'CT',billingpostalcode:'06103',status:'Active',accountnumber:'12345',business_type:'LLC',naics_code:'Tax Preparation Services (541213)'},{id:'unrelated',name:'STAX Logistics LLC',billingstreet:'2 Other Road',billingcity:'Hartford',billingstate:'CT',naics_code:'Trucking (484110)'}]);};
  const search=await taxBusinesses('CT','Hartford',fetcher);assert.equal(search.results.length,1);
  const lookup=await lookupBusiness({...candidate(1),registryId:'synthetic-entity'},fetcher);assert.equal(lookup.matches[0].principals[0].role,'Manager');assert.equal(lookup.matches[0].principals[0].verifiedOwner,undefined);assert.match(lookup.message,/not automatically confirmed owners/);
  assert.equal((await lookupBusiness({...candidate(1),state:'MA'},fetcher)).supported,false);
  assert(queries.every(u=>u.origin==='https://data.ct.gov'));assert.equal(lookup.matches[0].residence_address,undefined);
});
test('a registry outage retains IRS coverage and never claims that no business exists',async()=>{
  const app=localDiscovery(env,{discoverer:async()=>({results:[candidate()],total:1,locality:'Hartford'}),registry:async()=>{throw new Error('Source offline');}});
  const result=await app(owner,'search-local',{city:'Hartford',state:'CT'});assert.equal(result.results.length,1);assert.match(result.issues[0],/temporarily unavailable/);
});
