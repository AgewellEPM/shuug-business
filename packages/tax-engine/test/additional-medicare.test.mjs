import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pdfText} from './pdf-text.mjs';
import {additionalMedicare} from '../additional-medicare.mjs';
import {calculateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {reviewed,wage} from './fixtures.mjs';
const examples=JSON.parse(await readFile(new URL('./irs-8959-examples.json',import.meta.url),'utf8'));
for(const example of examples.examples)test(`IRS 2025 Form 8959 instructions ${example.id}`,()=>{
 const result=additionalMedicare({filingStatus:example.filingStatus,w2s:example.medicareWagesDollars.map(medicare=>({medicareWagesCents:medicare*100,medicareTaxWithheldCents:medicare*1.45})),selfEmploymentEarnings:example.selfEmploymentIncomeDollars.map(value=>value*100)});
 assert.equal(result.required,example.required);assert.equal(result.taxCents,example.expectedAdditionalTaxDollars*100);assert.equal(result.form?.lines['6']??0,example.expectedWageSubjectDollars*100);assert.equal(result.form?.lines['12']??0,example.expectedSelfEmploymentSubjectDollars*100);
});
test('thresholds, positive spouse income, sub-400 SE exclusion and unknown withholding retain their distinct meanings',()=>{
 for(const [filingStatus,threshold]of [['single',20000000],['headOfHousehold',20000000],['survivingSpouse',20000000],['marriedSeparate',12500000],['marriedJoint',25000000]]){
  const calculate=value=>additionalMedicare({filingStatus,w2s:[],selfEmploymentEarnings:[value]});assert.equal(calculate(threshold).required,false);assert.equal(calculate(threshold+10000).taxCents,100);
 }
 assert.equal(additionalMedicare({filingStatus:'marriedJoint',w2s:[],selfEmploymentEarnings:[30000000,-10000000]}).taxCents,45000);
 assert.equal(additionalMedicare({filingStatus:'single',w2s:[{medicareWagesCents:20000000,medicareTaxWithheldCents:290000}],selfEmploymentEarnings:[39900]}).required,false);
 const partial=additionalMedicare({filingStatus:'marriedJoint',w2s:[{medicareWagesCents:1000000,medicareTaxWithheldCents:40000},{medicareWagesCents:1000000}],selfEmploymentEarnings:[]});assert(partial.required);assert.equal(partial.withholdingCents,null);
});
for(const year of [2023,2024,2025])test(`${year} Form 8959 tax and withholding carry to Schedule 2 and 1040, with original PDF fields`,async()=>{
 const input=reviewed();input.year=year;input.individual.w2s=[{...wage('taxpayer',220000,5000),medicareTaxWithheldCents:337000}];const result=calculateReturn(input),main=result.forms.find(form=>form.form==='f1040'),medicare=result.forms.find(form=>form.form==='f8959'),other=result.forms.find(form=>form.form==='f1040s2');
 assert.equal(result.summary.additionalMedicareTaxCents,18000);assert.equal(result.summary.additionalMedicareWithholdingCents,18000);assert.equal(main.lines['25c'],18000);assert.equal(main.lines['25d'],518000);assert.equal(other.lines['11'],18000);assert.equal(other.lines['21'],18000);assert.equal(main.lines['24'],main.lines['16']+18000);assert.equal(main.lines['37'],main.lines['24']-518000);assert.equal(medicare.lines['21'],319000);
 const {bytes,audit}=await generateDraftPdf(input,{loadTemplate:(id,selected)=>readFile(new URL(`../forms/${selected}/${id}.pdf`,import.meta.url))});
 const xml=pdfText(bytes,'-bbox-layout'),pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
 const amount=(form,offset,value,top,x=500)=>{const page=pages[audit.find(item=>item.form===form).firstPage-1+offset][1];assert([...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,text])=>text===String(value)&&Number(attrs.match(/xMin="([^"]+)"/)[1])>=x&&Math.abs((Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2-top)<8),`${form} actual printed amount on the reviewed source row`);};
 amount('f1040',1,180,year===2025?306:186,410);amount('f8959',0,180,558);amount('f8959',0,180,714);amount('f1040s2',0,180,year===2023?378:year===2024?600:612);
 assert(audit.find(item=>item.form==='f1040').filled.some(field=>field.line==='25c'&&field.reference===(year===2025?'2/19':'2/13')));assert.equal(result.filingReady,false);
});
test('withholding-only Form 8959 credits a joint return below its tax threshold, while absent source values stay unknown',()=>{
 const input=reviewed();input.individual.filingStatus='marriedJoint';input.individual.w2s=[{...wage('taxpayer',220000),medicareTaxWithheldCents:337000}];let result=calculateReturn(input);assert.equal(result.summary.additionalMedicareTaxCents,0);assert.equal(result.summary.additionalMedicareWithholdingCents,18000);assert(result.forms.some(form=>form.form==='f8959'));assert.equal(result.summary.paymentsCents,18000);
 delete input.individual.w2s[0].medicareTaxWithheldCents;result=calculateReturn(input);assert.equal(result.summary.paymentsCents,null);assert.equal(result.summary.refundCents,null);assert.equal(result.summary.amountOwedCents,null);assert(result.diagnostics.some(item=>item.code==='MEDICARE_WITHHOLDING_REQUIRED'));
 input.individual.w2s[0].medicareTaxWithheldCents=0;assert.equal(calculateReturn(input).summary.paymentsCents,0);
 input.individual.w2s[0].medicareTaxWithheldCents=-1;assert.equal(calculateReturn(input).calculationAvailable,false);
});
test('new Medicare coverage does not conceal investment tax or other excluded wage treatments',()=>{
 const input=reviewed();input.individual.w2s=[{...wage('taxpayer',220000),medicareTaxWithheldCents:337000}];input.individual.taxableInterestCents=100;let result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(item=>item.code==='NET_INVESTMENT_TAX_REQUIRED'));
 input.individual.taxableInterestCents=0;input.features=['railroad-unreported-wages'];result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,null);assert(result.diagnostics.some(item=>item.code==='ADDITIONAL_TREATMENT'));
});
