import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Verify the exact prepared function modules against disposable D1 boards only.
const [prepared,output]=process.argv.slice(2);assert(prepared&&output);
const modules=path.join(prepared,'.vercel/output/functions/api/sales.func');
const {backend}=await import(pathToFileURL(path.join(modules,'backend.mjs')));
const {service}=await import(pathToFileURL(path.join(modules,'service.mjs')));
const {territoryRevision}=await import(pathToFileURL(path.join(modules,'territories.mjs')));
const config=JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/installation.json')));
const boards={},archived=[],checks=[],suffix=randomUUID().slice(0,8);
const receipt={ok:false,checkedAt:new Date().toISOString(),scope:'Exact prepared backend with actual isolated D1 boards. Synthetic agent/town writes only; no real pipeline, messages, payments or provider changes.',checks};
async function request(route,method='GET',body){
  const response=await fetch('https://tinkyspeak-tiles.tinkyspeak.workers.dev'+route,{method,headers:{Authorization:`Bearer ${config.GIGTAX_TINKY_KEY}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Diagnostic backend returned HTTP ${response.status}.`);return response.json();
}
try{
  for(const kind of ['offices','agents','events','enrollments'])boards[kind]=(await request('/api/outreach/boards','POST',{name:`GigTax synthetic territories ${suffix} ${kind}`,config_json:{purpose:'synthetic-gigtax-territories-proof',kind}})).board.id;
  const env={...config,GIGTAX_SALES_BOARDS:JSON.stringify(boards)},db=backend(env),app=service(env,db),owner={id:'owner',name:'Synthetic Diagnostic Owner',role:'owner',states:[]};
  const created=await app.dispatch(owner,'create-agent',{name:'Synthetic Territory Agent',email:`territory-${suffix}@example.test`,states:['CT','CA']});
  const login=await app.login({email:`territory-${suffix}@example.test`,code:created.code}),id=created.agent.id;
  const old=await db.get('agents',id);
  await app.dispatch(owner,'set-agent-territory',{id,state:'CT',mode:'selected',cityKeys:['hartford','new haven'],expectedRevision:territoryRevision(old)});
  const fresh=service(env,backend(env)),agent=await fresh.identity(login.token);
  assert.deepEqual(agent.territory.areas.find(area=>area.state==='CT').cities,['hartford','new haven']);assert.equal(agent.territory.areas.find(area=>area.state==='CA').cities,null);
  const towns=await fresh.dispatch(agent,'territory-localities',{state:'CT'});assert.equal(towns.total,2);
  checks.push('town assignment persists and fresh identity/adapter reads the same restricted towns while retaining another state');
  await assert.rejects(fresh.dispatch(owner,'set-agent-territory',{id,state:'CT',mode:'state',expectedRevision:territoryRevision(old)}),error=>error.status===409);
  await assert.rejects(fresh.dispatch(agent,'set-agent-territory',{id,state:'CT',mode:'state'}),error=>error.status===403);
  await assert.rejects(fresh.dispatch(agent,'search-local',{state:'CT',city:'Stamford'}),error=>error.status===403);
  await assert.rejects(fresh.dispatch(agent,'search-local',{state:'CT',city:'06103'}),error=>error.status===403);
  checks.push('stale concurrent changes, non-owner edits, outside-town searches and ZIP bypasses are rejected');
  const office=(await fresh.dispatch(agent,'create-office',{name:`SYNTHETIC TERRITORY OFFICE ${suffix}`,address:'123 Example Street',city:'Hartford',state:'CT'})).office;
  assert.equal(String(office.assigned_to),id);
  await assert.rejects(fresh.dispatch(owner,'create-office',{name:'Synthetic outside office',address:'123 Example Street',city:'Stamford',state:'CT',assignedTo:id}),error=>error.status===400);
  checks.push('eligible office creation persists with the salesperson; outside-town reassignment is rejected');
  for(const region of ['CT','CA'])await fresh.dispatch(owner,'set-agent-territory',{id,state:region,mode:'none',expectedRevision:territoryRevision(await db.get('agents',id))});
  const cleared=await fresh.identity(login.token);assert.deepEqual((await fresh.dispatch(cleared,'state-coverage')).states,[]);
  await assert.rejects(fresh.dispatch(cleared,'office',{id:office.id}),error=>error.status===404);
  checks.push('clearing all coverage remains restricted and existing signed-in sessions immediately lose outside-scope access');
  receipt.ok=true;
}catch(error){receipt.error=error.message;}
finally{
  for(const id of Object.values(boards)){try{await request(`/api/outreach/boards/${id}`,'DELETE');archived.push(id);}catch{receipt.ok=false;receipt.cleanupError='Diagnostic board archive failed.';}}
  if(archived.length){try{const saved=(await request('/api/outreach/boards')).boards;assert(archived.every(id=>saved.find(row=>row.id===id)?.archived_at));}catch{receipt.ok=false;receipt.cleanupError='Diagnostic archive verification failed.';}}
  receipt.diagnosticBoardsArchived=archived;writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));process.exitCode=receipt.ok?0:1;
}
