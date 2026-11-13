import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMexicoRecord, lookupNewMexicoBusiness } from './registry-new-mexico.mjs';
import { lookupStateBusiness, stateTaxBusinesses } from './state-registry.mjs';
import { localDiscovery } from './local-discovery.mjs';

const source='https://enterprise.sos.nm.gov';
const detail=(name,extra=[])=>({DRAWER_DETAIL_LIST:[
  {LABEL:'Business Name',VALUE:name},{LABEL:'Record #',VALUE:'0001234567'},
  {LABEL:'Status',VALUE:'Active'},{LABEL:'Entity Type',VALUE:'Domestic Profit Corporation'},...extra]});
const search=rows=>({template:[],rows:Object.fromEntries(rows.map(row=>[row.ID,row]))});

test('NM reads named officers/directors only, combines roles, and excludes personal addresses and filing organizers',()=>{
  const record=newMexicoRecord('991001',detail('Synthetic Tax Inc.',[
    {LABEL:'Agent',VALUE:'Synthetic Agent Service\r\nEXCLUDED HOME ADDRESS'},
    {LABEL:'Directors',VALUE:'Synthetic Person: Director\r\n'},
    {LABEL:'Officers',VALUE:'Synthetic Person: President\r\nSynthetic Person: Secretary\r\nMalformed personal address 123'},
    {LABEL:'Organizers and Incorporators',VALUE:'EXCLUDED ORGANIZER: Organizer\r\n'},
    {LABEL:'Principal Address',VALUE:'EXCLUDED ADDRESS'},
    {LABEL:'Email',VALUE:'EXCLUDED@example.test'}]));
  assert.equal(record.principals.length,1);assert.match(record.principals[0].role,/Director \/ President \/ Secretary/);
  assert.equal(record.principals[0].verifiedOwner,false);assert.equal(record.registeredAgents.length,1);
  assert.equal(record.address,'');assert.equal(record.city,'');assert.equal(record.email,'');assert(!JSON.stringify(record).includes('EXCLUDED'));
  assert.match(record.principalIssue,/could not be read/);
  const llc=newMexicoRecord('991002',detail('Synthetic LLC',[{LABEL:'Organizers and Incorporators',VALUE:'EXCLUDED ORGANIZER'}]));
  assert.equal(llc.principals.length,0);assert.match(llc.principalIssue,/not treated as owners/);
  assert.throws(()=>newMexicoRecord('991003',{}),/unsupported/);
});

test('NM legal-name lookup encodes names, retries once without a legal suffix, and requires a matching public record',async()=>{
  const queries=[],name='Synthetic O\'Brien & Tax Inc.';
  const report=await lookupStateBusiness({name,state:'NM',city:'Santa Fe',address:'12 Fixture Road'},async raw=>{
    const url=new URL(raw);assert.equal(url.origin,source);
    if(url.pathname.includes('webSearch')){
      queries.push(url.searchParams.get('SEARCH_VALUE'));assert.equal(url.searchParams.get('QueryTypeId'),'2');
      return Response.json(search(queries.length===1?[]:[{ID:991004,TITLE:['Synthetic O\'Brien & Tax Incorporated',''],RECORD_NUM:'1234567'},
        {ID:991005,TITLE:['Synthetic O\'Brien Property Holdings',''],RECORD_NUM:'9876'}]));
    }
    assert.equal(url.pathname,'/api/FilingDetail/business/991004');
    return Response.json(detail('Synthetic O\'Brien & Tax Incorporated',[{LABEL:'Officers',VALUE:'Synthetic President: President\r\n'}]));
  });
  assert.deepEqual(queries,[name,"Synthetic O'Brien & Tax"]);assert.equal(report.available,true);assert.equal(report.matches.length,1);
  assert.equal(report.matches[0].match,'name_only');assert.equal(report.matches[0].principals.length,1);
  assert.equal(report.coverage.automaticRecords,true);assert.equal(report.coverage.automaticLocalDiscovery,false);
  assert.equal((await stateTaxBusinesses('NM','Santa Fe',()=>{throw Error('No town scan permitted');})).supported,false);
});

test('NM caps public results, rejects path injection, and distinguishes malformed or unavailable responses from no match',async()=>{
  let calls=0;
  const result=await lookupNewMexicoBusiness({name:'Synthetic Bound Check 991006',state:'NM'},async raw=>{
    calls++;assert(new URL(raw).pathname.endsWith('/webSearch'));
    return Response.json(search(Array.from({length:100},(_,i)=>({ID:992000+i,TITLE:['Unrelated LLC','']}))));
  });
  assert.equal(result.matches.length,0);assert.equal(result.truncated,true);assert.equal(calls,1);
  await assert.rejects(lookupNewMexicoBusiness({registryId:'../secret',state:'NM'},()=>{throw Error('Should not fetch');}),/Invalid/);
  const bad=await lookupStateBusiness({name:'Malformed 991007',state:'NM'},async()=>Response.json({message:'Challenge'}));
  assert.equal(bad.available,false);assert.equal(bad.issues[0].code,'registry_unavailable');
  const outage=await lookupStateBusiness({registryId:'991008',registryState:'NM',state:'NM'},async()=>new Response('Offline',{status:503}));
  assert.equal(outage.available,false);assert.match(outage.message,/not evidence/);
});

test('addressless principal research stays bound to the selected office and current town permissions',async()=>{
  const office={candidateId:'fixture',name:'Synthetic NM Tax',address:'42 Fixture Road',city:'Santa Fe',state:'NM',url:source};
  const agent={id:'agent',role:'agent',states:['NM'],territory:{version:1,areas:[{state:'NM',cities:['santa fe']}]}},seen=[];
  const local=localDiscovery({GIGTAX_SALES_SESSION_KEY:'a'.repeat(64)},{
    discoverer:async()=>({results:[office],total:1}),registry:async()=>({supported:false,results:[]}),
    lookup:async()=>({matches:[{...newMexicoRecord('991009',detail(office.name,[{LABEL:'Officers',VALUE:'Synthetic Principal: President\r\n'}])),match:'name_only'}]}),
    search:async()=>[],checkCandidate:async(_user,candidate)=>{seen.push(candidate);}
  });
  const found=await local(agent,'search-local',{state:'NM',city:'Santa Fe'});
  const report=await local(agent,'lookup-business',{candidateToken:found.results[0].candidateToken}),record=report.matches[0];
  assert.equal(record.address,'');assert.equal(record.city,'');assert.equal(record.researchCandidate.address,office.address);
  assert.match(record.researchContextNote,/name only/);
  const token=record.principals[0].researchToken,contacts=await local(agent,'research-local-contacts',{candidateToken:token,city:'Forged'});
  assert.equal(contacts.context.city,'Santa Fe');assert.equal(seen[0].address,office.address);assert.equal(seen[0].name,office.name);
  assert.equal(contacts.evidence[0].value,'Synthetic Principal');assert.equal(contacts.evidence[0].sourceURL,record.sourceURL);
  await assert.rejects(local({...agent,territory:{version:1,areas:[{state:'NM',cities:['albuquerque']}]}},'research-local-contacts',{candidateToken:token}),/territory/);
});
