import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {territoryManifest,territoryCatalog} from '../../sales/territories.mjs';

const output=process.argv[2];assert(output);
const connection=Object.values(JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/mcp-client.json'))).mcpServers)[0];
const client=new Client({name:'gigtax-territory-live-verifier',version:'1.0.0'}),results=[];
const receipt={ok:false,checkedAt:new Date().toISOString(),scope:'Installed MCP reads actual deployed catalogs in all 50 states/DC; no real salesperson or office assignment changes.',results};
async function call(input){const response=await client.callTool({name:'sdr_read',arguments:input});assert(!response.isError,response.content[0]?.text);return JSON.parse(response.content[0].text);}
try{
  await client.connect(new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'}));
  const before=await call({resource:'workspace'});let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(cursor<territoryManifest.states.length){
      const expected=territoryManifest.states[cursor++],state=expected.state;
      const result=await call({resource:'territory_localities',state});
      assert.equal(result.total,expected.localities);assert.equal(result.stateTotal,expected.localities);assert.equal(result.version,'2026');
      assert.deepEqual(result.results,territoryCatalog(state).slice(0,100));
      results.push({state,localities:result.total,firstPageMatches:true});
    }
  }));
  const page=await call({resource:'territory_localities',state:'CT',offset:100});assert.equal(page.results.length,69);assert.equal(page.hasMore,false);
  const query=await call({resource:'territory_localities',state:'CT',query:'Hartford'});assert.equal(query.total,4);assert(query.results.some(row=>row.name==='Hartford'));
  const after=await call({resource:'workspace'});assert.deepEqual(after.offices,before.offices);assert.deepEqual(after.agents,before.agents);
  receipt.savedRecordsUnchanged=true;receipt.connecticut={towns:169,secondPage:69,hartfordSearch:4};receipt.totalLocalities=results.reduce((sum,row)=>sum+row.localities,0);receipt.ok=results.length===51;
}catch(error){receipt.error=error.message;}
finally{await client.close();results.sort((a,b)=>a.state.localeCompare(b.state));writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...receipt,results:results.length}));process.exitCode=receipt.ok?0:1;}
