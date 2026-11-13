import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {allRegistryCoverage} from '../../sales/registry-catalog.mjs';
import {normalizedBusiness} from '../../sales/registry-matching.mjs';
import {lookupKentuckyBusiness} from '../../sales/registry-kentucky.mjs';

const output=process.argv[2];assert(output&&!existsSync(output),'Supply a new receipt filename.');
const result={ok:false,checkedAt:new Date().toISOString(),state:'KY',city:'Elizabethtown'};
const client=new Client({name:'gigtax-kentucky-verifier',version:'1.0.0'});
try {
  const connection=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
  await client.connect(new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'}));
  async function call(resource,input={}) {
    const response=await client.callTool({name:'sdr_read',arguments:{resource,...input}});assert(!response.isError,`Installed MCP ${resource} failed.`);
    return JSON.parse(response.content.find(item=>item.type==='text').text);
  }
  const before=await call('workspace'),coverage=await call('state_coverage');
  for(const field of ['automaticRecords','automaticLocalDiscovery'])assert.deepEqual(coverage.states.filter(row=>row[field]).map(row=>row.state).sort(),allRegistryCoverage().filter(row=>row[field]).map(row=>row.state).sort());
  const ky=coverage.states.find(row=>row.state==='KY');assert.equal(ky.automaticRecords,true);assert.equal(ky.automaticLocalDiscovery,false);
  const search=await call('local_offices',{state:'KY',city:result.city});assert.equal(search.registrySupported,false);
  const selected=search.results.find(row=>normalizedBusiness(row.name)===normalizedBusiness('Accounting & Tax Professionals, LLC'));assert(selected);
  const report=await call('business',{candidateToken:selected.candidateToken});assert.equal(report.available,true);
  const record=report.matches.find(row=>row.match==='name_and_address');assert(record);assert(record.principals.length);assert.equal(record.registeredAgents.length,1);
  assert(record.principals.every(person=>person.verifiedOwner===false&&person.sourceURL===record.sourceURL+'#currentOfficersHeading'));
  const roundTrip=await call('business',{candidateToken:record.researchToken});assert(roundTrip.matches.some(row=>row.registryId===record.registryId&&row.match==='registry_record'));
  const official=await lookupKentuckyBusiness(record),source=official.matches.find(row=>row.registryId===record.registryId);assert(source);
  assert.deepEqual(record.principals.map(row=>({name:row.name,role:row.role})),source.principals.map(row=>({name:row.name,role:row.role})));
  assert.equal(record.address,source.address);assert.equal(record.businessId,source.businessId);
  const principal=record.principals[0],contacts=await call('contact_research',{candidateToken:principal.researchToken});
  assert(contacts.evidence.some(item=>item.field==='contact'&&item.value===principal.name&&item.sourceURL===principal.sourceURL));
  const after=await call('workspace');for(const key of ['offices','agents','rolodex','contracts','mailboxes'])assert.deepEqual(after[key],before[key]);
  Object.assign(result,{ok:true,directoryCandidates:search.results.length,registryMatches:report.matches.length,selectedNameAndAddressVerified:true,selectedProfileIDRoundTrip:true,
    officialCurrentOfficerNamesAndRolesVerified:true,principals:record.principals.length,registeredAgents:record.registeredAgents.length,lastAnnualReport:record.lastAnnualReport,
    principalSourceRetainedInResearch:true,automaticRecordRegions:coverage.states.filter(row=>row.automaticRecords).length,
    automaticLocalDiscoveryRegions:coverage.states.filter(row=>row.automaticLocalDiscovery).length,websiteSuggestions:contacts.candidates.length,
    websiteSearchStatus:contacts.websiteSearch.status,savedRecordsUnchanged:true,messagesSent:0,ownerAutomaticallyVerified:false});
}catch(error){result.error=error.message;}
finally {
  await client.close();result.limits='One selected directory office and profile. Kentucky town-wide registry discovery remains unavailable; sole proprietors, confirmed owners, complete contacts, email deliverability and human visual acceptance are not established. No bulk subscription, document purchase or real CRM write.';
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
}
