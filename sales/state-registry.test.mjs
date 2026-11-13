import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allRegistryCoverage, registryLinks} from './registry-catalog.mjs';
import {localDiscovery} from './local-discovery.mjs';
import {lookupStateBusiness, stateTaxBusinesses} from './state-registry.mjs';
import {socrataRecord, lookupSocrataBusiness, socrataTaxBusinesses} from './registry-socrata.mjs';
import {matchBusiness} from './registry-matching.mjs';

test('coverage exposes every state/DC, separates official links from connected records, and respects territories',async()=>{
  const coverage=allRegistryCoverage();
  assert.equal(coverage.length,51);assert.equal(new Set(coverage.map(row=>row.state)).size,51);
  assert.deepEqual(coverage.filter(row=>row.automaticRecords).map(row=>row.state).sort(),['CO','CT','NY','OR','PA','TX']);
  for(const row of coverage){assert.equal(new URL(row.officialURL).protocol,'https:');assert(row.note);}
  const app=localDiscovery({GIGTAX_SALES_SESSION_KEY:'a'.repeat(64)});
  assert.deepEqual((await app({role:'agent',states:['NY','NJ']},'state-coverage',{})).states.map(row=>row.state),['NJ','NY']);
  const links=registryLinks({state:'FL',name:'Synthetic & Tax'});assert.equal(links.length,2);assert.match(new URL(links[1].url).searchParams.get('q'),/Synthetic & Tax/);
});

test('unconnected states make no automatic requests; connected outages retain an official route without claiming no business exists',async()=>{
  const noFetch=()=>{throw new Error('Unexpected source call');};
  const manual=await lookupStateBusiness({state:'CA',name:'Synthetic Tax'},noFetch);
  assert.equal(manual.supported,false);assert.equal(manual.coverage.automaticRecords,false);assert(manual.links.length);assert.match(manual.message,/not connected/);
  assert.equal((await stateTaxBusinesses('FL','Tallahassee',noFetch)).supported,false);
  const outage=await lookupStateBusiness({state:'PA',name:'Synthetic Registry Outage 99234',registryId:'synthetic-outage-99234'},async()=>new Response('Unavailable',{status:503}));
  assert.equal(outage.supported,true);assert.equal(outage.available,false);assert.equal(outage.issues[0].code,'registry_unavailable');assert.match(outage.message,/not evidence/);
});

test('state schemas preserve published roles without promoting agents to principals or leaking extra fields',()=>{
  const co=socrataRecord('CO',{entityid:993001,entityname:'Synthetic Tax LLC',principalcity:'Denver',principalstate:'CO',agentfirstname:'Synthetic',agentlastname:'Agent',agentprincipaladdress1:'EXCLUDED'});
  assert.equal(co.principals.length,0);assert.equal(co.registeredAgents[0].verifiedOwner,false);assert(!JSON.stringify(co).includes('EXCLUDED'));
  const ny=socrataRecord('NY',{dos_id:'synthetic-ny-993002',current_entity_name:'Synthetic Tax Inc',dos_process_address_1:'Service Address',dos_process_city:'Albany',dos_process_state:'NY',chairman_name:'Synthetic Chair',registered_agent_name:'Synthetic Agent'});
  assert.match(ny.addressKind,/not a storefront/);assert.equal(ny.principals[0].role,'Chairman / CEO (registry field)');assert.equal(ny.principals[0].verifiedOwner,false);assert.equal(ny.registeredAgents.length,1);
  const tx=socrataRecord('TX',{secretary_of_state_sos_or_coa_file_number:'synthetic-tx-993003',taxpayer_name:'Synthetic Tax',taxpayer_number:'EXCLUDED'});
  assert.equal(tx.principals.length,0);assert(!JSON.stringify(tx).includes('EXCLUDED'));assert.match(tx.addressKind,/mailing/);
});

test('Oregon fetches representatives and agents by the selected business ID using names only',async()=>{
  const record={registry_number:'synthetic-or-993004',business_name:'Synthetic Oregon Tax LLC',city:'Salem',state:'OR',address:'12 Fixture Road',associated_name_type:'PRINCIPAL PLACE OF BUSINESS'};
  const requests=[];
  const result=await lookupSocrataBusiness({...socrataRecord('OR',record)},async raw=>{
    const url=new URL(raw);requests.push(url);assert.equal(url.origin,'https://data.oregon.gov');
    const fields=url.searchParams.get('$select');
    if(fields.includes('first_name')){
      assert(!/address|zip|city/.test(fields));assert.match(url.searchParams.get('$where'),/synthetic-or-993004/);
      return Response.json([{first_name:'Synthetic',last_name:'Representative',associated_name_type:'AUTHORIZED REPRESENTATIVE'},{not_of_record_entity:'Synthetic Agent Service',associated_name_type:'REGISTERED AGENT'}]);
    }
    return Response.json([record]);
  });
  assert.equal(requests.length,2);assert.equal(result.matches[0].match,'registry_record');
  assert.equal(result.matches[0].principals.length,1);assert.match(result.matches[0].principals[0].role,/ownership unconfirmed/);
  assert.equal(result.matches[0].registeredAgents.length,1);assert.match(result.matches[0].registeredAgents[0].name,/Agent Service/);
});

test('state queries stay bounded, escape locality values, and never request personal agent addresses',async()=>{
  const results=await socrataTaxBusinesses('CO',"O'Fallon fixture 993005",async raw=>{
    const url=new URL(raw);assert.equal(url.searchParams.get('$limit'),'501');assert.match(url.searchParams.get('$where'),/O''FALLON FIXTURE 993005/);
    assert(!/agentprincipaladdress|residence|taxpayer_number/.test(url.searchParams.get('$select')));
    return Response.json([{entityid:993005,entityname:'Synthetic Accounting',principalcity:"O'Fallon fixture 993005",principalstate:'CO'},{entityid:993006,entityname:'STAX Freight',principalcity:"O'Fallon fixture 993005",principalstate:'CO'}]);
  });
  assert.equal(results.results.length,1);assert.equal(results.results[0].registryState,'CO');
});

test('a shared street number or ID from a different registry cannot manufacture a match',()=>{
  const candidate={name:'Synthetic Tax',address:'29 Victoria Road',city:'Hartford',state:'CT',registryId:'same-id',registryState:'CT'};
  assert.equal(matchBusiness(candidate,{name:'Property Holding LLC',address:'29 Sherman Street',city:'Hartford',state:'CT',registryId:'other-id',registryState:'CT'}),null);
  assert.equal(matchBusiness(candidate,{name:'Unrelated Company',registryId:'same-id',registryState:'NY'}),null);
  assert.equal(matchBusiness(candidate,{...candidate,registryId:'other-id',registryState:'CT'}).match,'name_and_address');
});

test('registry outages preserve national directory results and expose unavailable status separately from coverage',async()=>{
  const app=localDiscovery({GIGTAX_SALES_SESSION_KEY:'a'.repeat(64)},{discoverer:async()=>({results:[{candidateId:'fixture',name:'Synthetic Tax',address:'12 Fixture Road',city:'Denver',state:'CO',url:'https://www.irs.gov/pub/irs-efile/co.zip'}],total:1}),registry:async()=>{throw new Error('offline');}});
  const result=await app({role:'owner',id:'owner'},'search-local',{state:'CO',city:'Denver'});
  assert.equal(result.results.length,1);assert.equal(result.registrySupported,true);assert.equal(result.registryAvailable,false);assert.equal(result.registryCoverage.automaticRecords,true);assert(result.issues.length);
});
