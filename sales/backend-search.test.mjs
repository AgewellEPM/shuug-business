import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backend} from './backend.mjs';
import {researchLocalContacts} from './local-contacts.mjs';

test('legacy empty web search is unconfirmed and cannot hide a sourced directory phone',async()=>{
  let calls=0;
  const db=backend({},async()=>{calls++;return Response.json({ok:true,results:[]});});
  const report=await researchLocalContacts({name:'Synthetic Tax',state:'CT',city:'Hartford',phone:'+18602469999',sourceURL:'https://www.irs.gov/'},{},{search:db.search,placeLookup:()=>({candidates:[],evidence:[]})});
  assert.equal(calls,2);assert.equal(report.websiteSearch.status,'unavailable');
  assert(report.issues.some(row=>row.message.includes('does not distinguish')));
  assert.equal(report.evidence[0].field,'phone');
});
