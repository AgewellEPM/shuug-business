import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn} from '../../packages/tax-engine/index.mjs';
import {generateDraftPdf} from '../../packages/tax-engine/pdf.mjs';
import {nyEicFixture,nyNoncustodialFixture} from '../../packages/tax-engine/test/state-ny-eic-fixtures.mjs';
import {approveReturnCreation} from '../../packages/secure-tax-client/firm-return-creations.mjs';
import {privateReturnCreationReviewCommitment} from '../../packages/secure-tax-client/return-creations.mjs';
import {approveReturnEdit} from '../../packages/secure-tax-client/firm-return-edits.mjs';
import {privateReturnReviewCommitment} from '../../packages/secure-tax-client/return-proposals.mjs';

const loadTemplate=(id,year)=>readFile(new URL(`../../packages/tax-engine/forms/${year}/${id}.pdf`,import.meta.url));
const credits=result=>Object.fromEntries(['65','66','70'].map(line=>[line,result.states.find(state=>state.state==='NY').lines[line]]));
function verifyOpened(reader,saved){
 const record=reader.records.get(saved.objectId),opened=JSON.parse(new TextDecoder().decode(record.plaintext));assert.equal(record.revision,2);assert.deepEqual(opened,saved.input);const result=calculateReturn(opened);assert.deepEqual(credits(result),saved.expectedNyCredits);assert.equal(result.filingReady,false);assert.equal(result.states[0].summary.amountOwedCents!==null,saved.nySettlementKnown);return opened;
}
export function verifyRestoredNyEicReturns(taxReturns,readers){let checks=0;for(const saved of taxReturns.filter(row=>row.nyEic))for(const reader of readers){verifyOpened(reader,saved);checks++;}return checks;}

/** Same encrypted creation/correction/restore path as other return families.
 * All identities and records here are explicit synthetic test sources. */
export async function proveNyEicReturns({staff,owner,portal,firm,marker,taxReturns,exported}){
 const proof={cases:[],customerAndStaffReopened:true,materialCorrectionVerified:true,restoreVerified:false,checks:0};
 for(const year of [2023,2024,2025])for(const scenario of ['ordinary','noncustodial','noncustodial-federal-zero']){
  const {input,state,source}=scenario==='ordinary'?nyEicFixture({year}):nyNoncustodialFixture({year,wages:scenario==='noncustodial'?10000:30000});input.notes=marker+' NY '+scenario;source.source=marker+' NY EIC originals';source.noncustodial.source=marker+' NY complete child/support records';
  const initial=calculateReturn(input),initialExpected=scenario==='ordinary'?{'65':({2023:13000,2024:14500,2025:15000})[year],'66':0,'70':({2023:14600,2024:15800,2025:16200})[year]}:{'65':0,'66':(scenario==='noncustodial'?{2023:145800,2024:158000,2025:162300}:{2023:52800,2024:60900,2025:65200})[year],'70':0};assert.deepEqual(credits(initial),initialExpected);if(scenario.endsWith('federal-zero'))assert.equal(initial.summary.earnedIncomeCreditCents,0);proof.checks++;
  const creation=await staff.prepareNewReturn(input);assert.equal(await privateReturnCreationReviewCommitment(creation.privateReview),creation.proposal.reviewCommitment);
  const approval=await approveReturnCreation({proposal:creation.proposal,manifest:creation.manifest,grant:creation.grant,expected:creation.expected,reviewedCommitment:creation.proposal.reviewCommitment,reviewReference:'synthetic-NY-EIC-original-source-review',unlocked:firm});const receipt=await owner.installApprovedReturnCreation(approval);assert.equal(receipt.duplicate,false);proof.checks++;
  await portal.sync();await staff.sync();for(const reader of [portal,staff]){const record=reader.records.get(receipt.objectId),opened=JSON.parse(new TextDecoder().decode(record.plaintext));assert.equal(record.revision,1);assert.deepEqual(opened,input);assert.deepEqual(credits(calculateReturn(opened)),initialExpected);proof.checks++;}
  const originalPacket=await generateDraftPdf(JSON.parse(new TextDecoder().decode(portal.records.get(receipt.objectId).plaintext)),{loadTemplate});try{const form=scenario==='ordinary'?'nyit215':'nyit209';assert(originalPacket.audit.some(row=>row.form===form));exported.push({year,kind:'1040',formCopies:originalPacket.audit.length,bytes:originalPacket.bytes.length,nyEicScenario:scenario,revision:1});}finally{originalPacket.bytes.fill(0);}proof.checks++;
  const after=structuredClone(input),afterState=after.individual.stateReturns[0];after.notes=marker+' corrected NY '+scenario;
  if(scenario==='ordinary'){afterState.earnedIncomeCredit.worksheetBCredits='other';}
  else afterState.earnedIncomeCredit.noncustodial.orders[0].currentSupportPaidCents=100000;
  // Ordinary credit review becomes unresolved; noncustodial underpayment
  // disqualifies that alternative and restores the actual ordinary amount.
  const expected=scenario==='ordinary'?{'65':null,'66':null,'70':initialExpected['70']}:{'65':scenario==='noncustodial'?({2023:13000,2024:14500,2025:15000})[year]:0,'66':0,'70':0};
  const kit=await staff.prepareReturnCorrection(receipt.objectId,after);assert.deepEqual(kit.privateReview.before,input);assert.deepEqual(kit.privateReview.after,after);assert.equal(await privateReturnReviewCommitment(kit.privateReview),kit.proposal.reviewCommitment);
  const packet=await approveReturnEdit({proposal:kit.proposal,envelope:kit.sourceEnvelope,manifest:kit.manifest,grant:kit.grant,expected:kit.expected,reviewedCommitment:kit.proposal.reviewCommitment,reviewReference:'synthetic-NY-EIC-correction-source-review',unlocked:firm});assert.equal((await owner.installApprovedReturnEdit(packet)).duplicate,false);proof.checks++;
  const saved={year,kind:'1040',objectId:receipt.objectId,input:after,nyEic:true,expectedNyCredits:expected,nySettlementKnown:scenario!=='ordinary'};
  await portal.sync();await staff.sync();for(const reader of [portal,staff]){const record=reader.records.get(receipt.objectId),opened=JSON.parse(new TextDecoder().decode(record.plaintext));assert.equal(record.revision,2);assert.deepEqual(opened,after);const result=calculateReturn(opened);assert.deepEqual(credits(result),expected);assert.equal(result.states[0].summary.refundCents!==null,saved.nySettlementKnown);assert.equal(result.filingReady,false);proof.checks++;}
  const correctedPacket=await generateDraftPdf(JSON.parse(new TextDecoder().decode(portal.records.get(receipt.objectId).plaintext)),{loadTemplate});try{assert.deepEqual(credits(correctedPacket.result),expected);assert(!correctedPacket.audit.some(row=>row.form==='nyit209'));exported.push({year,kind:'1040',formCopies:correctedPacket.audit.length,bytes:correctedPacket.bytes.length,nyEicScenario:scenario,revision:2});}finally{correctedPacket.bytes.fill(0);}proof.checks++;
  taxReturns.push(saved);proof.cases.push({year,scenario,initialFederalEicCents:initial.summary.earnedIncomeCreditCents,initialCredits:initialExpected,correctedCredits:expected,correctedSettlementKnown:saved.nySettlementKnown,originalAndCorrectedPdfExported:true});
 }
 return proof;
}
