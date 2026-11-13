import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {allRegistryCoverage} from '../../sales/registry-catalog.mjs';

// Installed MCP -> live portal -> free official sources. No CRM writes/outreach.
assert(process.argv[2],'Supply a new receipt filename.');
const result={ok:false,checkedAt:new Date().toISOString(),states:[]};
const client=new Client({name:'gigtax-iowa-alaska-verifier',version:'1.0.0'});
try {
  const connection=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
  await client.connect(new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'}));
  async function call(resource,input={}) {
    const response=await client.callTool({name:'sdr_read',arguments:{resource,...input}});
    assert(!response.isError,`The installed MCP ${resource} read failed.`);
    return JSON.parse(response.content.find(item=>item.type==='text').text);
  }
  const before=await call('workspace'),coverage=await call('state_coverage');
  for(const field of ['automaticRecords','automaticLocalDiscovery'])assert.deepEqual(coverage.states.filter(row=>row[field]).map(row=>row.state).sort(),allRegistryCoverage().filter(row=>row[field]).map(row=>row.state).sort());
  for(const [state,city] of [['IA','Des Moines'],['AK','Anchorage']]) {
    const search=await call('local_offices',{state,city});
    assert.equal(search.registrySupported,true);assert.equal(search.registryAvailable,true);assert(search.registryTotal>0);
    const selected=search.results.find(row=>row.registryId && row.registryState===state);assert(selected);
    const report=await call('business',{candidateToken:selected.candidateToken});
    assert.equal(report.available,true);
    const record=report.matches.find(row=>row.registryId===selected.registryId && row.registryState===state);assert(record);
    assert.equal(record.match,'registry_record');assert(record.principals.every(person=>person.verifiedOwner===false));
    let contact,linkVerified=false;
    if(state==='IA') {
      assert.equal(record.principals.length,0);assert.match(record.attribution,/CC BY/);assert.match(search.registryCoverage.note,/Monthly/);
      const directory=search.results.find(row=>row.phone && row.sourceKind==='irs');assert(directory);
      contact=await call('contact_research',{candidateToken:directory.researchToken});
      assert(contact.evidence.some(item=>item.field==='phone' && item.value===directory.phone && item.sourceURL));
    }else {
      assert.match(search.registryCoverage.note,/12%/);assert(record.principals.length);assert.match(record.sourceUpdatedAt,/^\d{4}-\d{2}-\d{2}$/);
      assert(!record.location);assert(!selected.location);
      const url=new URL(record.sourceURL);assert.equal(url.origin,'https://maps.commerce.alaska.gov');assert.equal(url.searchParams.get('returnGeometry'),'false');
      const response=await fetch(url,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
      const source=await response.json();assert(source.features.some(row=>String(row.attributes.LicenseNumber)===record.businessId));linkVerified=true;
      const principal=record.principals[0];contact=await call('contact_research',{candidateToken:principal.researchToken});
      assert(contact.evidence.some(item=>item.field==='contact' && item.value===principal.name && item.sourceURL===principal.sourceURL));
    }
    const points=await call('map_addresses',{candidateTokens:search.results.slice(0,10).map(row=>row.candidateToken)});
    assert.equal(points.results.length,10);assert(points.results.some(row=>row.location));
    result.states.push({state,city,directoryAndRegistryCandidates:search.results.length,registryCandidates:search.registryTotal,
      sourceLimitReached:search.truncated,registryIDRoundTrip:true,principals:record.principals.length,registeredAgents:record.registeredAgents.length,
      registryLinkVerified:linkVerified,sourceUpdatedAt:record.sourceUpdatedAt || null,addressesChecked:points.results.length,mapped:points.results.filter(row=>row.location).length,
      sourcedContactEvidence:true,websiteSuggestions:contact.candidates.length,websiteSearchStatus:contact.websiteSearch.status,ownerAutomaticallyVerified:false});
  }
  const after=await call('workspace');for(const key of ['offices','agents','rolodex','contracts','mailboxes'])assert.deepEqual(after[key],before[key]);
  Object.assign(result,{automaticRecordRegions:coverage.states.filter(row=>row.automaticRecords).length,automaticLocalDiscoveryRegions:coverage.states.filter(row=>row.automaticLocalDiscovery).length,savedRecordsUnchanged:true,messagesSent:0,ok:true});
}catch(error){result.error=error.message;}
finally {
  await client.close();result.limits='Iowa is monthly active-entity data without owners; Alaska is a partial business-license extract, not a complete entity registry. No owner identity, complete contacts, email deliverability or human visual acceptance established.';
  writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
}
