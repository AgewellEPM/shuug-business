import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn} from '../../packages/tax-engine/index.mjs';
import {generateDraftPdf} from '../../packages/tax-engine/pdf.mjs';
import {nyEmpireChildFixture} from '../../packages/tax-engine/test/state-ny-child-fixtures.mjs';
import {approveReturnCreation} from '../../packages/secure-tax-client/firm-return-creations.mjs';
import {privateReturnCreationReviewCommitment} from '../../packages/secure-tax-client/return-creations.mjs';
import {approveReturnEdit} from '../../packages/secure-tax-client/firm-return-edits.mjs';
import {privateReturnReviewCommitment} from '../../packages/secure-tax-client/return-proposals.mjs';

const loadTemplate=(id,year)=>readFile(new URL(`../../packages/tax-engine/forms/${year}/${id}.pdf`,import.meta.url));
const credit=result=>result.states.find(state=>state.state==='NY').lines['63'];
const decode=record=>JSON.parse(new TextDecoder().decode(record.plaintext));
export function verifyRestoredNyChildReturns(taxReturns,readers){
 let checks=0;for(const saved of taxReturns.filter(row=>row.nyEmpireChild))for(const reader of readers){const record=reader.records.get(saved.objectId);assert.equal(record.revision,2);assert.deepEqual(decode(record),saved.input);const result=calculateReturn(decode(record));assert.equal(credit(result),saved.expectedNyChildCreditCents);assert.equal(result.filingReady,false);checks++;}return checks;
}

/** Synthetic originals through the real encrypted creation/correction protocol. */
export async function proveNyChildReturns({staff,owner,portal,firm,marker,taxReturns,exported}){
 const proof={cases:[],customerAndStaffReopened:true,materialCorrectionVerified:true,restoreVerified:false,checks:0};
 for(const [year,scenario]of [[2023,'claimed'],[2024,'claimed'],[2025,'claimed'],[2025,'unclaimed']]){
  const {input,state,source}=nyEmpireChildFixture({year,children:1,wages:30000,joint:false,locality:'none'}),child=input.individual.dependents[0];child.dateOfBirth=`${year-10}-06-15`;state.dependents[0].dateOfBirth=child.dateOfBirth;
  if(scenario==='unclaimed'){child.claim='no';state.dependents=[];}
  input.notes=marker+' NY child '+scenario;source.source=marker+' original NY child-credit source';source.children[0].source=marker+' original child eligibility and claim';
  const initial=calculateReturn(input);assert.equal(credit(initial),33000);assert.equal(initial.states[0].empireChildCredit.known,true);proof.checks++;
  const creation=await staff.prepareNewReturn(input);assert.equal(await privateReturnCreationReviewCommitment(creation.privateReview),creation.proposal.reviewCommitment);
  const approved=await approveReturnCreation({proposal:creation.proposal,manifest:creation.manifest,grant:creation.grant,expected:creation.expected,reviewedCommitment:creation.proposal.reviewCommitment,reviewReference:'synthetic-NY-child-original-source-review',unlocked:firm});const receipt=await owner.installApprovedReturnCreation(approved);assert.equal(receipt.duplicate,false);proof.checks++;
  await portal.sync();await staff.sync();for(const reader of [portal,staff]){const record=reader.records.get(receipt.objectId);assert.equal(record.revision,1);assert.deepEqual(decode(record),input);assert.equal(credit(calculateReturn(decode(record))),33000);proof.checks++;}
  const original=await generateDraftPdf(decode(portal.records.get(receipt.objectId)),{loadTemplate});try{assert(original.audit.some(row=>row.form==='nyit213'));assert(original.audit.find(row=>row.form==='nyit201').fields.some(row=>row.line==='63'));exported.push({year,kind:'1040',formCopies:original.audit.length,bytes:original.bytes.length,nyChildScenario:scenario,revision:1});}finally{original.bytes.fill(0);}proof.checks++;
  const after=structuredClone(input);after.notes=marker+' corrected NY child '+scenario;for(const key of ['wagesCents','socialSecurityWagesCents','medicareWagesCents'])after.individual.w2s[0][key]=8000000;after.individual.stateReturns[0].wageRecords[0].nyWagesCents=8000000;
  const expected=year===2025?24700:24800,kit=await staff.prepareReturnCorrection(receipt.objectId,after);assert.deepEqual(kit.privateReview.before,input);assert.deepEqual(kit.privateReview.after,after);assert.equal(await privateReturnReviewCommitment(kit.privateReview),kit.proposal.reviewCommitment);
  const packet=await approveReturnEdit({proposal:kit.proposal,envelope:kit.sourceEnvelope,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment:kit.proposal.reviewCommitment,reviewReference:'synthetic-NY-child-corrected-income-review',unlocked:firm});assert.equal((await owner.installApprovedReturnEdit(packet)).duplicate,false);proof.checks++;
  await portal.sync();await staff.sync();for(const reader of [portal,staff]){const record=reader.records.get(receipt.objectId);assert.equal(record.revision,2);assert.deepEqual(decode(record),after);assert.equal(credit(calculateReturn(decode(record))),expected);proof.checks++;}
  const corrected=await generateDraftPdf(decode(portal.records.get(receipt.objectId)),{loadTemplate});try{assert.equal(credit(corrected.result),expected);assert(corrected.audit.some(row=>row.form==='nyit213'));exported.push({year,kind:'1040',formCopies:corrected.audit.length,bytes:corrected.bytes.length,nyChildScenario:scenario,revision:2});}finally{corrected.bytes.fill(0);}proof.checks++;
  taxReturns.push({year,kind:'1040',objectId:receipt.objectId,input:after,nyEmpireChild:true,expectedNyChildCreditCents:expected});proof.cases.push({year,scenario,initialCreditCents:33000,correctedCreditCents:expected,originalAndCorrectedPdfExported:true});
 }
 return proof;
}
