import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReturn} from '../index.mjs';
import {childFixture} from './child-credits-fixtures.mjs';

test('duplicate filer identifiers cannot establish contradictory SSN eligibility or a completed return',()=>{
 for(const filingStatus of ['marriedJoint','marriedSeparate']){
  const input=childFixture({joint:true,children:0,wages:18000});input.individual.filingStatus=filingStatus;input.individual.spouseTaxId='000-12-3456';Object.assign(input.individual.taxpayerIdentifiers.spouse,{type:'itin',validForEmployment:'no'});const before=structuredClone(input),result=calculateReturn(input);
  assert.equal(result.calculationAvailable,false);assert.equal(result.status,'invalid-input');assert.match(result.diagnostics[0].message,/distinct taxpayer identifiers/);assert.deepEqual(result.forms,[]);assert.deepEqual(input,before);
 }
});
