import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {STATES} from '../../sales/model.mjs';

const cities={AL:'Montgomery',AK:'Anchorage',AZ:'Phoenix',AR:'Little Rock',CA:'Sacramento',CO:'Denver',CT:'Hartford',DE:'Dover',DC:'Washington',FL:'Tallahassee',GA:'Atlanta',HI:'Honolulu',ID:'Boise',IL:'Springfield',IN:'Indianapolis',IA:'Des Moines',KS:'Topeka',KY:'Frankfort',LA:'Baton Rouge',ME:'Augusta',MD:'Annapolis',MA:'Boston',MI:'Lansing',MN:'Saint Paul',MS:'Jackson',MO:'Jefferson City',MT:'Helena',NE:'Lincoln',NV:'Carson City',NH:'Concord',NJ:'Trenton',NM:'Santa Fe',NY:'Albany',NC:'Raleigh',ND:'Bismarck',OH:'Columbus',OK:'Oklahoma City',OR:'Salem',PA:'Harrisburg',RI:'Providence',SC:'Columbia',SD:'Pierre',TN:'Nashville',TX:'Austin',UT:'Salt Lake City',VT:'Montpelier',VA:'Richmond',WA:'Olympia',WV:'Charleston',WI:'Madison',WY:'Cheyenne'};
const output=process.argv[2];assert(output,'Supply a new receipt path.');assert(!existsSync(output),'Use a new receipt path.');
const config=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
const client=new Client({name:'gigtax-national-read-verifier',version:'1.0.0'}),results=[];
async function call(input){const r=await client.callTool({name:'sdr_read',arguments:input});assert(!r.isError,r.content[0]?.text);return JSON.parse(r.content[0].text);}
let unchanged=false;
try{
  await client.connect(new StdioClientTransport({...config,env:{...process.env,...config.env},stderr:'pipe'}));
  const before=await call({resource:'workspace'}),contactsBefore=await call({resource:'rolodex'});
  const coverage=await call({resource:'state_coverage'});assert.equal(coverage.states.length,51);let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(cursor<STATES.length){
      const state=STATES[cursor++],city=cities[state];
      try{
        const search=await call({resource:'local_offices',state,city});assert(search.results.length>0,'No candidates in the probe city.');
        assert(search.results.every(row=>row.state===state),'Result crossed the requested state.');
        let registryIDVerified=false;
        if(search.registrySupported){
          assert.equal(search.registryAvailable,true,'Connected registry unavailable.');
          const selected=search.results.find(row=>row.registryId);assert(selected,'Connected registry returned no records in the probe locality.');
          const business=await call({resource:'business',candidateToken:selected.candidateToken});
          assert.equal(business.available,true);assert(business.matches.some(row=>row.registryId===selected.registryId),'Selected registry ID did not round-trip.');registryIDVerified=true;
        }
        const batch=search.results.filter(row=>row.phone).slice(0,10);assert(batch.length,'No directory phones found.');
        const mapped=await call({resource:'map_addresses',candidateTokens:batch.map(row=>row.candidateToken)});
        assert.equal(mapped.results.length,batch.length);
        const contact=await call({resource:'contact_research',candidateToken:batch[0].researchToken});
        assert(contact.evidence.some(row=>row.field==='phone'&&row.value===batch[0].phone&&row.sourceURL),'Published phone was not carried into sourced contact research.');
        const result={state,city:search.city,ok:true,candidates:search.results.length,truncated:search.truncated,withPhone:search.results.filter(row=>row.phone).length,
          addressesChecked:batch.length,mapped:mapped.results.filter(row=>row.location).length,contactSourceVerified:true,automaticRegistry:search.registrySupported,registryIDVerified,websiteSuggestions:contact.candidates?.length || 0,websiteSearchStatus:contact.websiteSearch?.status,sourceIssues:search.issues};
        results.push(result);console.log(JSON.stringify(result));
      }catch(error){const result={state,city,ok:false,error:error.message};results.push(result);console.log(JSON.stringify(result));}
      writeFileSync(output+'.progress.json',JSON.stringify({checkedAt:new Date().toISOString(),complete:false,results},null,2)+'\n');
    }
  }));
  const after=await call({resource:'workspace'}),contactsAfter=await call({resource:'rolodex'});assert.deepEqual(after.offices,before.offices);assert.deepEqual(contactsAfter.contacts,contactsBefore.contacts);unchanged=true;
}finally{
  await client.close();
  const report={checkedAt:new Date().toISOString(),ok:results.length===51&&results.every(row=>row.ok)&&unchanged,savedRecordsUnchanged:unchanged,
    scope:'Installed MCP against the live portal: one locality per state/DC, up to ten directory addresses, and sourced published phone research. This does not establish complete operating-business coverage or automatic registry coverage.',results:results.sort((a,b)=>a.state.localeCompare(b.state))};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});process.exitCode=report.ok?0:1;
}
