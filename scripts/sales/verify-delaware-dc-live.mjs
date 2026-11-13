import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {allRegistryCoverage} from '../../sales/registry-catalog.mjs';
import {DC_OWNER_FIELDS} from '../../sales/registry-dc.mjs';

// Installed MCP -> live portal -> official records. The receipt stores counts
// and source status only; no CRM writes, contact exports or outreach.
const output=process.argv[2];assert(output&&!existsSync(output),'Supply a new receipt filename.');
const result={ok:false,checkedAt:new Date().toISOString(),states:[]};
const client=new Client({name:'gigtax-delaware-dc-verifier',version:'1.0.0'});
try {
  const connection=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
  await client.connect(new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'}));
  async function call(resource,input={}) {
    const reply=await client.callTool({name:'sdr_read',arguments:{resource,...input}});assert(!reply.isError,`Installed MCP ${resource} failed.`);
    return JSON.parse(reply.content.find(item=>item.type==='text').text);
  }
  const before=await call('workspace'),coverage=await call('state_coverage');
  for(const field of ['automaticRecords','automaticLocalDiscovery'])assert.deepEqual(coverage.states.filter(row=>row[field]).map(row=>row.state).sort(),allRegistryCoverage().filter(row=>row[field]).map(row=>row.state).sort());
  for(const [state,city] of [['DE','Dover'],['DC','Washington']]) {
    const search=await call('local_offices',{state,city});
    assert.equal(search.registrySupported,true);assert.equal(search.registryAvailable,true);assert(search.registryTotal>0);
    assert(search.results.every(row=>row.state===state));
    const selected=search.results.find(row=>row.registryId&&row.registryState===state&&!row.chain);assert(selected);
    const report=await call('business',{candidateToken:selected.candidateToken});assert.equal(report.available,true);
    const record=report.matches.find(row=>row.registryId===selected.registryId&&row.match==='registry_record');assert(record);
    assert(record.principals.every(person=>person.verifiedOwner===false));assert(!record.location);
    const response=await fetch(record.sourceURL,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
    const payload=await response.json();let sourceRecordVerified=false,principalSourceVerified=false,contact;
    if(state==='DE') {
      assert.match(record.sourceName,/Division of Revenue/);assert.equal(record.principals.length,0);assert(record.licenseValidTo);
      assert(Array.isArray(payload));sourceRecordVerified=payload.some(row=>String(row.license_number)===record.businessId&&row.business_name===record.legalName&&(row.trade_name||'')===record.tradeName);
      assert.equal(record.name,record.tradeName||record.legalName);assert.match(search.registryCoverage.note,/separate from corporate/);
      contact=await call('contact_research',{candidateToken:record.researchToken});
    }else {
      sourceRecordVerified=payload.features.some(item=>item.attributes.FILE_NUMBER===record.businessId&&item.attributes.BUSINESS_NAME===record.legalName);
      assert(record.principals.length);assert(record.registeredAgents.length);assert.match(record.attribution,/CC BY 4.0/);assert.match(record.sourceUpdatedAt,/^\d{4}-\d{2}-\d{2}$/);
      const principal=record.principals[0],url=new URL(principal.sourceURL);assert.equal(url.searchParams.get('outFields'),DC_OWNER_FIELDS);assert(!DC_OWNER_FIELDS.includes('ADDRESS'));
      assert.equal(url.searchParams.get('where'),`INITIALFILENUMBER='${record.businessId}'`);
      const owners=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(owners.status,200);
      const data=await owners.json();principalSourceVerified=data.features.some(item=>item.attributes.INITIALFILENUMBER===record.businessId&&item.attributes.NAME===principal.name);assert(principalSourceVerified);
      contact=await call('contact_research',{candidateToken:principal.researchToken});
      assert(contact.evidence.some(item=>item.field==='contact'&&item.value===principal.name&&item.sourceURL===principal.sourceURL));
    }
    assert(sourceRecordVerified);
    const points=await call('map_addresses',{candidateTokens:search.results.slice(0,10).map(row=>row.candidateToken)});assert.equal(points.results.length,10);
    result.states.push({state,city,candidates:search.results.length,registryCandidates:search.registryTotal,sourceLimitReached:search.truncated,
      selectedNonChain:true,selectedIDRoundTrip:true,officialSourceRecordVerified:sourceRecordVerified,principals:record.principals.length,registeredAgents:record.registeredAgents.length,
      officialPrincipalSourceVerified:principalSourceVerified,sourceUpdatedAt:record.sourceUpdatedAt||null,sourceAttributionPresent:Boolean(record.attribution),
      principalResearchEvidenceVerified:state==='DC',addressesChecked:points.results.length,mapped:points.results.filter(row=>row.location).length,
      websiteSuggestions:contact.candidates.length,websiteSearchStatus:contact.websiteSearch.status,ownerAutomaticallyVerified:false});
    console.log(JSON.stringify(result.states.at(-1)));
  }
  const after=await call('workspace');for(const key of ['offices','agents','rolodex','contracts','mailboxes'])assert.deepEqual(after[key],before[key]);
  Object.assign(result,{automaticRecordRegions:coverage.states.filter(row=>row.automaticRecords).length,automaticLocalDiscoveryRegions:coverage.states.filter(row=>row.automaticLocalDiscovery).length,
    savedRecordsUnchanged:true,messagesSent:0,ok:true});
}catch(error){result.error=error.message;}
finally {
  await client.close();result.limits='One locality and selected record per region, not complete business coverage. Delaware revenue licenses supply no owners; D.C. published beneficial-owner names do not establish current ownership or a verified office match. No email deliverability or human visual acceptance established.';
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
}
