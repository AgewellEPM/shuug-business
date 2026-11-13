import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {lookupBusinessPlaces,businessPlaceCoverage} from '../../sales/business-places.mjs';

const cities={AL:'Montgomery',AK:'Anchorage',AZ:'Phoenix',AR:'Little Rock',CA:'Sacramento',CO:'Denver',CT:'Hartford',DE:'Dover',DC:'Washington',FL:'Tallahassee',GA:'Atlanta',HI:'Honolulu',ID:'Boise',IL:'Springfield',IN:'Indianapolis',IA:'Des Moines',KS:'Topeka',KY:'Frankfort',LA:'Baton Rouge',ME:'Augusta',MD:'Annapolis',MA:'Boston',MI:'Lansing',MN:'Saint Paul',MS:'Jackson',MO:'Jefferson City',MT:'Helena',NE:'Lincoln',NV:'Carson City',NH:'Concord',NJ:'Trenton',NM:'Santa Fe',NY:'Albany',NC:'Raleigh',ND:'Bismarck',OH:'Columbus',OK:'Oklahoma City',OR:'Salem',PA:'Harrisburg',RI:'Providence',SC:'Columbia',SD:'Pierre',TN:'Nashville',TX:'Austin',UT:'Salt Lake City',VT:'Montpelier',VA:'Richmond',WA:'Olympia',WV:'Charleston',WI:'Madison',WY:'Cheyenne'};
const output=process.argv[2];assert(output && !existsSync(output),'Supply a new receipt path.');
const config=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
const client=new Client({name:'gigtax-business-places-live-verifier',version:'1.0.0'}),results=[];
const receipt={ok:false,checkedAt:new Date().toISOString(),scope:'Actual installed MCP, one locality per state/DC, catalogue coverage and selected business-contact source matches; no CRM writes or outreach. Coverage counts do not establish complete businesses, owners, current affiliation or deliverability.',results};
async function call(input){const reply=await client.callTool({name:'sdr_read',arguments:input});assert(!reply.isError,reply.content[0]?.text);return JSON.parse(reply.content[0].text);}
try{
  await client.connect(new StdioClientTransport({...config,env:{...process.env,...config.env},stderr:'pipe'}));
  const before=await call({resource:'workspace'}),coverage=await call({resource:'state_coverage'});
  assert.equal(coverage.states.length,51);
  for(const item of coverage.states)assert.deepEqual(item.businessContacts,businessPlaceCoverage(item.state));
  receipt.catalogueRegions=51;let cursor=0;const states=Object.keys(cities);
  await Promise.all(Array.from({length:2},async()=>{
    while(cursor<states.length){
      const state=states[cursor++],city=cities[state];
      try{
        const search=await call({resource:'local_offices',state,city});assert(search.results.length>0);
        const matches=search.results.map(candidate=>({candidate,place:lookupBusinessPlaces(candidate)}));
        const matching=matches.filter(item=>item.place.matches.length);
        const selected=matching.sort((a,b)=>(Number(b.place.candidates.length>0)*4+Number(b.place.evidence.length>0)*2+Number(!b.candidate.chain))-(Number(a.place.candidates.length>0)*4+Number(a.place.evidence.length>0)*2+Number(!a.candidate.chain)))[0];
        const result={state,city:search.city,ok:true,candidates:search.results.length,catalogueMatches:matching.length,
          officesWithWebsiteSuggestions:matching.filter(item=>item.place.candidates.length).length,
          officesWithContactEvidence:matching.filter(item=>item.place.evidence.length).length,sourceIssues:search.issues,
          selectedSourceVerified:false};
        if(selected){
          const actual=await call({resource:'contact_research',candidateToken:selected.candidate.researchToken});
          assert.equal(actual.catalogue.release,selected.place.release);
          assert.deepEqual(actual.catalogue.matches,selected.place.matches);
          for(const suggestion of selected.place.candidates)assert(actual.candidates.some(row=>row.url===suggestion.url&&row.sourceRecordId===suggestion.sourceRecordId&&row.sourceRelease===suggestion.sourceRelease));
          for(const evidence of selected.place.evidence)assert(actual.evidence.some(row=>row.field===evidence.field&&row.value===evidence.value&&row.sourceURL===evidence.sourceURL&&JSON.stringify(row.sourceObservedDates)===JSON.stringify(evidence.sourceObservedDates)));
          assert.equal(actual.catalogue.attributionURL,'https://gigtax.pro/business-data-attribution.txt');
          Object.assign(result,{selectedSourceVerified:true,selectedWebsiteSuggestions:selected.place.candidates.length,selectedPublishedChannels:selected.place.evidence.length,websiteSearchStatus:actual.websiteSearch.status,selectedIsChain:Boolean(selected.candidate.chain),sourceRelease:actual.catalogue.release});
        }
        results.push(result);console.log(JSON.stringify(result));
      }catch(error){const result={state,city,ok:false,error:error.message};results.push(result);console.log(JSON.stringify(result));}
      writeFileSync(output+'.progress.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
    }
  }));
  const after=await call({resource:'workspace'});
  assert.deepEqual(after.offices,before.offices);assert.deepEqual(after.agents,before.agents);assert.deepEqual(after.rolodex,before.rolodex);
  receipt.savedRecordsUnchanged=true;
  receipt.regionsWithSelectedSourceVerified=results.filter(row=>row.selectedSourceVerified).length;
  receipt.regionsWithWebsiteSuggestions=results.filter(row=>row.officesWithWebsiteSuggestions>0).length;
  receipt.ok=results.length===51&&results.every(row=>row.ok);
}catch(error){receipt.error=error.message;}
finally{
  await client.close();results.sort((a,b)=>a.state.localeCompare(b.state));
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...receipt,results:results.length}));process.exitCode=receipt.ok?0:1;
}
