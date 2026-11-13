import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contactFixture} from '../scripts/sales/contact-fixture.mjs';
import {territoryCatalog, territoryManifest, territoryRevision} from './territories.mjs';
import {localityAllowed, stateAllowed} from './territory-access.mjs';
import {digest, metadata, visible} from './model.mjs';
import {localDiscovery} from './local-discovery.mjs';

test('published catalog covers all 51 regions with verified source hashes and every Connecticut town',()=>{
  assert.equal(territoryManifest.states.length,51);
  for(const entry of territoryManifest.states){
    const bytes=readFileSync(new URL(`./territory-data/${entry.state}.json`,import.meta.url));assert.equal(digest(bytes),entry.sha256);
    const towns=territoryCatalog(entry.state);assert.equal(towns.length,entry.localities);assert(towns.length>0);assert.equal(new Set(towns.map(row=>row.key)).size,towns.length);
  }
  assert.equal(territoryCatalog('CT').length,169);assert(territoryCatalog('CT').some(row=>row.name==='Hartford'));assert(territoryCatalog('CA').some(row=>row.name==='Los Angeles'));
  assert.throws(()=>territoryCatalog('../'),error=>error.status===400);
});

test('town assignments persist, retain explicit other-state coverage, reject stale updates and take effect in existing sessions',async()=>{
  const f=contactFixture(),created=await f.app.dispatch(f.owner,'create-agent',{name:'Synthetic Territory Agent',email:'territory@example.test',states:['CT','MA']});
  const login=await f.app.login({email:'territory@example.test',code:created.code});
  const before=f.rows.agents[0],revision=territoryRevision(before),id=String(before.id);
  await f.app.dispatch(f.owner,'set-agent-territory',{id,state:'CT',mode:'selected',cityKeys:['hartford'],expectedRevision:revision});
  const user=await f.app.identity(login.token);
  assert(localityAllowed(user,'CT','HARTFORD'));assert(!localityAllowed(user,'CT','New Haven'));assert(localityAllowed(user,'MA','Boston'));assert(!stateAllowed(user,'NY'));
  const towns=await f.app.dispatch(user,'territory-localities',{state:'CT'});assert.deepEqual(towns.results.map(row=>row.name),['Hartford']);
  await assert.rejects(f.app.dispatch(user,'set-agent-territory',{id,state:'CT',mode:'state',expectedRevision:territoryRevision(f.rows.agents[0])}),error=>error.status===403);
  await assert.rejects(f.app.dispatch(f.owner,'set-agent-territory',{id,state:'CT',mode:'state',expectedRevision:revision}),error=>error.status===409);
  assert.equal(metadata(f.rows.agents[0]).codeHash,metadata(before).codeHash,'access code retained');
});

test('town restrictions protect search, candidate tokens, saved-office reads, creation and reassignment',async()=>{
  const f=contactFixture(),created=await f.app.dispatch(f.owner,'create-agent',{name:'Synthetic Local Agent',email:'local@example.test',states:['CT']});
  const id=created.agent.id,login=await f.app.login({email:'local@example.test',code:created.code});
  const oldUser=await f.app.identity(login.token);
  const local=localDiscovery(f.env,{discoverer:async()=>({results:[{candidateId:'fixture',name:'Synthetic New Haven Tax',address:'1 Fixture Road',city:'New Haven',state:'CT',url:'https://www.irs.gov/pub/irs-efile/ct.zip'}],total:1}),registry:async()=>({results:[],supported:true})});
  const candidate=(await local(oldUser,'search-local',{city:'New Haven',state:'CT'})).results[0];
  const prior=await f.createOffice({city:'New Haven',assignedTo:id});
  await f.app.dispatch(f.owner,'set-agent-territory',{id,state:'CT',mode:'selected',cityKeys:['hartford'],expectedRevision:territoryRevision(f.rows.agents[0])});
  const user=await f.app.identity(login.token);
  for(const city of ['New Haven','06103'])await assert.rejects(local(user,'search-local',{state:'CT',city}),error=>error.status===403);
  await assert.rejects(local(user,'lookup-business',{candidateToken:candidate.candidateToken}),error=>error.status===403);
  await assert.rejects(f.app.dispatch(user,'create-office',{name:'Outside',address:'1 Fixture Road',city:'New Haven',state:'CT'}),error=>error.status===403);
  await assert.rejects(f.app.dispatch(user,'office',{id:prior.id}),error=>error.status===404);
  assert.equal(visible(user,prior),false);assert.equal(f.rows.offices[0].assigned_to,id);
  await assert.rejects(f.createOffice({name:'Other outside',city:'New Haven',assignedTo:id}),error=>error.status===400);
  const inside=await f.createOffice({name:'Inside fixture',city:'Hartford',assignedTo:id});assert(visible(user,inside));
  const external=await f.createOffice({name:'Owner outside fixture',city:'New Haven'});
  await assert.rejects(f.app.dispatch(f.owner,'update-office',{id:external.id,assignedTo:id}),error=>error.status===400);
});

test('first local assignment narrows nationwide access, invalid towns fail, and clearing all territories never restores nationwide access',async()=>{
  const f=contactFixture(),created=await f.app.dispatch(f.owner,'create-agent',{name:'Synthetic Nationwide Agent',email:'national@example.test',states:[]});
  const id=created.agent.id,login=await f.app.login({email:'national@example.test',code:created.code});
  await assert.rejects(f.app.dispatch(f.owner,'set-agent-territory',{id,state:'CT',mode:'selected',cityKeys:['los angeles'],expectedRevision:territoryRevision(f.rows.agents[0])}),error=>error.status===400);
  await f.app.dispatch(f.owner,'set-agent-territory',{id,state:'CT',mode:'selected',cityKeys:['hartford'],expectedRevision:territoryRevision(f.rows.agents[0])});
  let user=await f.app.identity(login.token);assert(!stateAllowed(user,'CA'));
  await f.app.dispatch(f.owner,'set-agent-territory',{id,state:'CT',mode:'none',expectedRevision:territoryRevision(f.rows.agents[0])});
  user=await f.app.identity(login.token);assert.equal(user.states.length,0);assert(!stateAllowed(user,'CT'));assert(!stateAllowed(user,'CA'));
  assert.deepEqual((await f.app.dispatch(user,'state-coverage')).states,[]);
});
