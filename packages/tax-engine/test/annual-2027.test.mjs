import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {federal2027Rules,federal2027CapitalThresholds,federal2027Availability,taxRateSchedules2027,ordinaryTax2027,qualifiedBusinessDeduction2027} from '../annual-2027.mjs';

test('2027 published annual amounts retain status distinctions and do not imply final annual forms',()=>{
 assert.deepEqual(federal2027Rules.standardDeductions,{single:1660000,marriedJoint:3320000,marriedSeparate:1660000,headOfHousehold:2492500,survivingSpouse:3320000});assert.equal(federal2027Rules.socialSecurityBaseCents,19230000);
 assert.deepEqual(federal2027Rules.qbiThresholds,{single:20830000,marriedJoint:41660000,marriedSeparate:20832500,headOfHousehold:20830000,survivingSpouse:20830000});
 assert.deepEqual(federal2027CapitalThresholds,{single:[5105000,56320000],marriedJoint:[10210000,63360000],marriedSeparate:[5105000,31680000],headOfHousehold:[6835000,59840000],survivingSpouse:[10210000,63360000]});
 assert.equal(federal2027Availability.annualRulesAvailable,true);assert.equal(federal2027Availability.finalTaxTableAvailable,false);assert.equal(federal2027Availability.finalMainReturnAvailable,false);assert.equal(federal2027Availability.filingApproved,false);assert.deepEqual(federal2027Availability.finalForms,[]);assert.deepEqual(federal2027Availability.finalInstructions,[]);
});
test('2027 required Tax Table boundary is unknown below100000 after rounding, including zero',()=>{
 for(const status of ['single','marriedJoint','marriedSeparate','headOfHousehold','survivingSpouse'])for(const cents of [0,1,49999,5000000,9999949]){const result=ordinaryTax2027(cents,status);assert.equal(result.taxCents,null);assert.equal(result.method,'2027-final-tax-table-unavailable');assert.equal(result.diagnostics[0].code,'TAX_TABLE_2027_NOT_FINAL');assert.equal(result.formReady,false);}
 assert.equal(ordinaryTax2027(9999950,'single').taxCents,1654200);assert.throws(()=>ordinaryTax2027(-1,'single'),/nonnegative/);assert.throws(()=>ordinaryTax2027(10000000,'unsupported'),/filing status/);
});
test('2027 statutory tax matches independent base-plus-excess arithmetic vectors at annual boundaries',()=>{
 // Independently derived from published Rev.Proc.2026-35 section3.01 amounts;
 // these are synthetic arithmetic vectors, not IRS taxpayer examples.
 const cases=[['single',100000,16542],['marriedJoint',100000,11488],['marriedSeparate',100000,16542],['headOfHousehold',100000,14670],['survivingSpouse',100000,11488],['single',109125,18549],['single',208325,42357],['marriedJoint',104050,11974],['marriedJoint',218250,37098],['marriedJoint',416650,84714],['headOfHousehold',208300,40480],['single',661375,199238],['single',700000,213529],['marriedSeparate',400000,107820],['headOfHousehold',700000,211661],['marriedJoint',800000,215640]];
 for(const [status,dollars,expected]of cases){const result=ordinaryTax2027(dollars*100,status);assert.equal(result.taxCents,expected*100,`${status} ${dollars}`);assert.equal(result.method,'official-2027-statutory-rate-schedule');assert.equal(result.formReady,false);}
 for(const rows of Object.values(taxRateSchedules2027))for(let index=1;index<rows.length;index++){const [lower,,,base]=rows[index],previous=rows[index-1];assert.equal(base,previous[3]+(lower-previous[0])*previous[2]);}
});
test('2027 QBI indexed active minimum uses the sourced1030/415 and precise MFS threshold',()=>{
 const value={filingStatus:'single',taxableIncomeBeforeDeductionCents:500000,qualifiedIncomeCents:103000,activeQualifiedIncomeCents:103000};
 assert.equal(qualifiedBusinessDeduction2027(value).deductionCents,41500);assert.equal(qualifiedBusinessDeduction2027({...value,activeQualifiedIncomeCents:102999}).deductionCents,20600);assert.equal(qualifiedBusinessDeduction2027({...value,activeQualifiedIncomeCents:0}).deductionCents,20600);assert.equal(qualifiedBusinessDeduction2027({...value,taxableIncomeBeforeDeductionCents:0}).deductionCents,41500);
 assert.equal(qualifiedBusinessDeduction2027({...value,activeQualifiedIncomeCents:null}).deductionCents,null);assert.equal(qualifiedBusinessDeduction2027({...value,priorLossCents:1}).deductionCents,null);assert.equal(qualifiedBusinessDeduction2027({...value,qualifiedIncomeCents:500000,activeQualifiedIncomeCents:null}).deductionCents,100000);
 for(const [filingStatus,threshold]of Object.entries(federal2027Rules.qbiThresholds)){assert.equal(qualifiedBusinessDeduction2027({...value,filingStatus,taxableIncomeBeforeDeductionCents:threshold}).deductionCents,41500);assert.equal(qualifiedBusinessDeduction2027({...value,filingStatus,taxableIncomeBeforeDeductionCents:threshold+100}).deductionCents,null);}
 assert.equal(qualifiedBusinessDeduction2027({...value,filingStatus:'marriedSeparate',taxableIncomeBeforeDeductionCents:20830100}).deductionCents,41500);assert.equal(qualifiedBusinessDeduction2027({...value,taxableIncomeBeforeDeductionCents:20830100}).deductionCents,null);
 const capital=qualifiedBusinessDeduction2027({...value,qualifiedIncomeCents:1000000,activeQualifiedIncomeCents:0,netCapitalGainCents:400000});assert.equal(capital.deductionCents,20000);assert.throws(()=>qualifiedBusinessDeduction2027({...value,activeQualifiedIncomeCents:undefined}),/integer-cent/);
});
test('2027 provenance records the actual IRS release and source anomaly, with no false form availability',async()=>{
 const source=JSON.parse(await readFile(new URL('../data/2027-sources.json',import.meta.url),'utf8'));assert.equal(source.taxYear,2027);assert.equal(source.releasedOn,'2026-11-05');assert.equal(source.scheduledBulletinDate,'2026-11-23');assert.match(source.sourceAnomalies[0],/Release Date/);
 assert(source.sources.every(row=>row.bytes>0&&/^[0-9a-f]{64}$/.test(row.sha256)));assert(source.sources.some(row=>row.id==='rp-26-35'&&row.sha256==='87b383c6ce6e616fd006a61f5eed46fe67099b9c23fb1e1c42ff5359474513b8'));assert(source.sources.some(row=>row.id==='ssa2027'&&row.sha256==='700ede41c38274b5a270fa3ef05d64ae93a60c9f5b7a0e20a04f2c444e40a20c'));
 assert.deepEqual(source.availableFinalForms,[]);for(const id of ['f1040','i1040tt','f1065','f1120s','f1120'])assert(source.unavailableAnnualBoundaries.some(row=>row.id===id&&row.requiredTaxYear===2027&&row.status===404));assert.equal(source.processingYear2027IsTaxYear2027,false);
});
