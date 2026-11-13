import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

// Actual installed MCP -> deployed portal -> official public registry. Read only.
// The persisted receipt contains counts, not people's names or contact channels.
assert(process.argv[2], 'Supply a new receipt filename.');
const result={ok:false,checkedAt:new Date().toISOString(),state:'NM',city:'Albuquerque',checks:[]};
const client=new Client({name:'gigtax-new-mexico-verifier',version:'1.0.0'});
try {
  const connection=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
  await client.connect(new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'}));
  async function call(resource,input={}) {
    const response=await client.callTool({name:'sdr_read',arguments:{resource,...input}});
    assert(!response.isError,'The installed MCP request failed.');
    return JSON.parse(response.content.find(item=>item.type==='text').text);
  }
  const before=await call('workspace'),coverage=await call('state_coverage');
  const nm=coverage.states.find(row=>row.state==='NM');
  assert.equal(nm.automaticRecords,true);assert.equal(nm.automaticLocalDiscovery,false);
  Object.assign(result,{automaticRecordRegions:coverage.states.filter(row=>row.automaticRecords).length,
    automaticLocalDiscoveryRegions:coverage.states.filter(row=>row.automaticLocalDiscovery).length});
  result.checks.push('coverage distinguishes automatic selected-business lookup from town-wide registry discovery');
  const directory=await call('local_offices',{state:'NM',city:'Albuquerque'});
  assert(directory.results.length>100);assert.equal(directory.registrySupported,false);
  const candidate=directory.results.find(row=>row.name.toUpperCase()==='ACCOUNTING CONCEPTS, INC.');assert(candidate);
  const report=await call('business',{candidateToken:candidate.candidateToken});
  assert.equal(report.available,true);assert(report.matches.length);
  const record=report.matches.find(row=>row.match==='name_only' && row.principals.length);assert(record);
  assert.equal(record.registryState,'NM');assert.equal(record.address,'');assert.equal(record.city,'');
  assert.equal(new URL(record.sourceURL).origin,'https://enterprise.sos.nm.gov');
  assert(record.principals.every(row=>!row.verifiedOwner && row.sourceURL===record.sourceURL));
  assert.equal(record.researchCandidate.address,candidate.address);assert.equal(record.researchCandidate.city,candidate.city);
  result.checks.push('a real directory office matches its official legal record and officer/director names without substituting an agent address');
  const principal=record.principals[0],contacts=await call('contact_research',{candidateToken:principal.researchToken});
  assert.equal(contacts.context.name,candidate.name);assert.equal(contacts.context.city,candidate.city);assert.equal(contacts.context.address,candidate.address);
  assert(contacts.evidence.some(row=>row.field==='contact' && row.value===principal.name && row.sourceURL===principal.sourceURL));
  result.checks.push('principal research keeps the selected directory office context and official name provenance');
  const after=await call('workspace');
  for(const key of ['offices','agents','rolodex','contracts','mailboxes'])assert.deepEqual(after[key],before[key]);
  Object.assign(result,{directoryCandidates:directory.results.length,registryMatches:report.matches.length,principals:record.principals.length,
    registeredAgents:record.registeredAgents.length,registrySource:record.sourceURL,businessAddressSupplied:false,ownerAutomaticallyVerified:false,
    websiteSuggestions:contacts.candidates.length,websiteSearchStatus:contacts.websiteSearch.status,savedRecordsUnchanged:true,messagesSent:0,ok:true});
}catch(error){result.error=error.message;}
finally {
  await client.close();result.limits='Selected-name lookup only. The registry response omits business addresses; owners, operating status, website search completeness and human visual acceptance remain unverified.';
  writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
}
