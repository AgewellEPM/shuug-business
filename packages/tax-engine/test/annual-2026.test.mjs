import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {federalYearRules,federalSourcesFor} from '../federal-years.mjs';
import {ordinaryTax} from '../ordinary-tax.mjs';
import {qualifiedBusinessDeduction2026,federal2026Availability,taxRateSchedules2026} from '../annual-2026.mjs';
import {officialForms2026} from '../forms/2026/templates.mjs';
import {lineMaps2026,identity2026} from '../form-maps-2026.mjs';
import {referencedField} from '../form-maps.mjs';
import {pdfText} from './pdf-text.mjs';
import {reviewed,business} from './fixtures.mjs';

test('2026 rules use final annual deductions, SSA base and the published distinct QBI thresholds',()=>{
 const rules=federalYearRules(2026);assert.deepEqual(rules.standardDeductions,{single:1610000,marriedJoint:3220000,marriedSeparate:1610000,headOfHousehold:2415000,survivingSpouse:3220000});
 assert.equal(rules.socialSecurityBaseCents,18450000);assert.equal(rules.qbiThresholds.marriedJoint,40350000);assert.equal(rules.qbiThresholds.marriedSeparate,20177500);assert.equal(rules.qbiThresholds.single,20175000);
 assert.equal(federal2026Availability.finalTaxTableAvailable,false);assert.equal(federal2026Availability.finalMainReturnAvailable,false);assert.equal(federal2026Availability.filingApproved,false);
 assert.equal(Object.hasOwn(federalSourcesFor(2026),'taxTable'),false);assert.equal(Object.hasOwn(federalSourcesFor(2026),'individual'),false);
});
test('2026 ordinary tax under100000 remains unknown instead of using brackets or a prior TaxTable',()=>{
 for(const value of [0,1,49999,5000000,9999949]){const result=ordinaryTax(value,'single',2026);assert.equal(result.taxCents,null);assert.equal(result.method,'2026-final-tax-table-unavailable');assert.equal(result.diagnostics[0].code,'TAX_TABLE_2026_NOT_FINAL');}
 assert.equal(ordinaryTax(9999950,'single',2026).taxCents,1671200);assert.throws(()=>ordinaryTax(-1,'single',2026),/nonnegative/);assert.throws(()=>ordinaryTax(10000000,'unsupported',2026),/filing status/);
});
test('2026 statutory schedules match independently derived annual boundary and top-rate vectors',()=>{
 // Derived from Rev.Proc.2025-32 section4.01 base-plus-excess rows, not IRS taxpayer examples.
 const cases=[['single',100000,16712],['marriedJoint',100000,11504],['marriedSeparate',100000,16712],['headOfHousehold',100000,14901],['survivingSpouse',100000,11504],['single',105700,17966],['single',201775,41024],['marriedJoint',100800,11600],['marriedJoint',211400,35932],['marriedJoint',403550,82048],['headOfHousehold',201750,39207],['single',700000,214957],['marriedSeparate',400000,109082],['headOfHousehold',700000,213149],['marriedJoint',800000,218165]];
 for(const [status,dollars,expected]of cases){const result=ordinaryTax(dollars*100,status,2026);assert.equal(result.taxCents,expected*100,`${status} ${dollars}`);assert.equal(result.method,'official-2026-statutory-rate-schedule');assert.equal(result.formReady,false);}
 for(const rows of Object.values(taxRateSchedules2026))for(let i=1;i<rows.length;i++){const [lower,,,base]=rows[i],previous=rows[i-1];assert.equal(base,previous[3]+(lower-previous[0])*previous[2]);}
});
test('2026 QBI minimum applies only to the active1000 threshold and preserves unresolved loss/limitation work',()=>{
 const input={filingStatus:'single',taxableIncomeBeforeDeductionCents:500000,qualifiedIncomeCents:100000,activeQualifiedIncomeCents:100000};
 assert.equal(qualifiedBusinessDeduction2026(input).deductionCents,40000);assert.equal(qualifiedBusinessDeduction2026({...input,activeQualifiedIncomeCents:99999}).deductionCents,20000);
 assert.equal(qualifiedBusinessDeduction2026({...input,activeQualifiedIncomeCents:0}).deductionCents,20000);assert.equal(qualifiedBusinessDeduction2026({...input,taxableIncomeBeforeDeductionCents:0}).deductionCents,40000);
 assert.equal(qualifiedBusinessDeduction2026({...input,activeQualifiedIncomeCents:null}).deductionCents,null);assert.equal(qualifiedBusinessDeduction2026({...input,priorLossCents:1}).deductionCents,null);
 assert.equal(qualifiedBusinessDeduction2026({...input,taxableIncomeBeforeDeductionCents:20175100}).deductionCents,null);
 assert.equal(qualifiedBusinessDeduction2026({...input,filingStatus:'marriedSeparate',taxableIncomeBeforeDeductionCents:20175100}).deductionCents,40000);
 assert.equal(qualifiedBusinessDeduction2026({...input,qualifiedIncomeCents:500000,activeQualifiedIncomeCents:null}).deductionCents,100000);
});
test('2026 source pins distinguish final rules/schedules from observed2025mainform and draft2026evidence',async()=>{
 const source=JSON.parse(await readFile(new URL('../data/2026-sources.json',import.meta.url),'utf8'));
 assert.equal(source.taxYear,2026);assert(source.sources.every(item=>new URL(item.url).hostname.endsWith('.gov')&&/^[0-9a-f]{64}$/.test(item.sha256)));
 assert(source.unavailableAnnualBoundaries.some(item=>item.id==='i1040tt'&&item.observedTaxYear===2025&&item.requiredTaxYear===2026));assert(source.draftEvidence.every(item=>item.usableForFiling===false));
 assert.deepEqual(officialForms2026.map(form=>form.id),['f1040sc','f1040sse','f1040s8']);assert.equal(Object.hasOwn(lineMaps2026,'f1040'),false);
 for(const entry of officialForms2026){const bytes=await readFile(new URL(`../forms/2026/${entry.id}.pdf`,import.meta.url));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert(!pdfText(bytes,'-layout').includes('DRAFT—NOT FOR FILING'));assert(pdfText(bytes,'-layout').includes('2026'));}
});
test('actual final2026 ScheduleC prints other interest at16c and separate city/state/ZIP identity fields',async()=>{
 const input=reviewed();input.year=2026;input.individual.businesses=[business()];const source=await readFile(new URL('../forms/2026/f1040sc.pdf',import.meta.url)),pdf=await PDFDocument.load(source),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica),set=(reference,value)=>{if(value!=='')referencedField(form,reference).setText(String(value));};set.checkbox=name=>form.getCheckBox(name).check();
 identity2026(input,{form:'f1040sc',copyId:'business-taxpayer',owner:'taxpayer'},set);set(lineMaps2026.f1040sc['16c'],'3210');set(lineMaps2026.f1040sc['31'],'80000');
 assert.equal(referencedField(form,'1/8').getText(),undefined);assert.equal(referencedField(form,'1/9').getText(),'Hartford');assert.equal(referencedField(form,'1/10').getText(),'CT');assert.equal(referencedField(form,'1/11').getText(),'06103');assert.equal(referencedField(form,lineMaps2026.f1040sc['16b']).getText(),undefined);
 form.updateFieldAppearances(font);form.flatten();const bytes=await pdf.save(),text=pdfText(bytes,'-layout');assert(/16c\s+Other[\s\S]{0,90}3210/.test(text));assert(text.includes('80000'));
 const xml=pdfText(bytes),words=[...xml.matchAll(/<word\b([^>]*)>(3210|80000)<\/word>/g)];assert.equal(words.length,2);for(const [,attrs,value]of words){const y=Number(attrs.match(/yMin="([^"]+)"/)[1]);assert(Math.abs(y-(value==='3210'?558:696))<10,`${value}: ${y}`);}
});
test('actual final2026 ScheduleSE contains the184500printed limit and reviewed income/tax fields',async()=>{
 const source=await readFile(new URL('../forms/2026/f1040sse.pdf',import.meta.url)),pdf=await PDFDocument.load(source),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const [line,value]of [['2','200000'],['4a','184700'],['9','184500'],['10','22878'],['11','5356'],['12','28234'],['13','14117']])referencedField(form,lineMaps2026.f1040sse[line]).setText(value);
 form.updateFieldAppearances(font);form.flatten();const text=pdfText(await pdf.save(),'-layout');assert(text.includes('184,500'));for(const value of ['200000','184700','28234','14117'])assert(text.includes(value));
});
