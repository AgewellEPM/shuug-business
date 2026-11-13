import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn} from '../index.mjs';
import {inventoryCost} from '../inventory.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfYearPack} from '../form-years.mjs';
import {reviewed,business,wage} from './fixtures.mjs';
import {reviewedInventory} from './inventory-fixtures.mjs';
import {pdfText} from './pdf-text.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
const inputFor=kind=>{const input=reviewed(kind),value=reviewedInventory();if(kind==='1040')input.individual.businesses=[{...business(),inventory:value}];else{if(['1120','1120S'].includes(kind)){value.purchasesCents-=value.personalWithdrawalsCents;value.personalWithdrawalsCents=0;}Object.assign(input.entity,{receiptsCents:8000000,inventory:value,owners:[{id:'a',name:'Synthetic Owner A',taxId:'000111111',shareBps:5000},{id:'b',name:'Synthetic Owner B',taxId:'000222222',shareBps:5000}]});}return input;};

test('inventory rollforward excludes withdrawals and carries actual component totals to all four families',()=>{
 // 10,000 opening + 29,000 net purchases + 5,000 labor + 2,000
 // materials + 1,000 allocated costs + 500 freight - 12,000 closing.
 for(const kind of ['1040','1065','1120S','1120']){
  const input=inputFor(kind),result=calculateReturn(input);assert.equal(result.calculationAvailable,true,JSON.stringify(result.diagnostics));
  const c=kind==='1040'?result.forms.find(form=>form.form==='f1040sc'):result.forms.find(form=>form.form==='f1125a');
  assert.equal(c.lines[kind==='1040'?'42':'8'],3550000);assert.equal(c.lines[kind==='1040'?'36':'2'],2900000);
  if(kind==='1040'){assert.equal(c.lines['4'],3550000);assert.equal(c.lines['31'],4450000);assert(Number.isSafeInteger(result.summary.totalTaxCents));}
  else{assert.equal(result.forms[0].lines['2'],3550000);assert.equal(result.summary.ordinaryBusinessIncomeCents,4450000);if(kind==='1120')assert.equal(result.summary.totalTaxCents,934500);else assert.equal(result.allocations.reduce((sum,row)=>sum+row.ordinaryIncomeCents,0),4450000);}
 }
});
test('printed rounding conserves form arithmetic and preserves cent-level sources',()=>{
 const value=reviewedInventory();Object.assign(value,{beginningCents:100049,purchasesCents:200049,personalWithdrawalsCents:50,laborCents:100049,materialsCents:0,closingCents:100049,costs:[]});
 const result=inventoryCost(value);assert.equal(result.rawCostCents,300048);assert.equal(result.costCents,300000);assert.equal(result.roundingDifferenceCents,-48);assert.equal(result.lines['40']-result.lines['41'],result.lines['42']);
});
test('unresolved inventory suppresses AGI, SE, QBI, Medicare, corporate tax and owner allocations',()=>{
 for(const kind of ['1040','1065','1120S','1120']){
  const input=inputFor(kind);(input.individual?.businesses[0]??input.entity).inventory.review.quantities=false;
  const result=calculateReturn(input);assert.equal(result.calculationAvailable,true,JSON.stringify(result.diagnostics));assert.equal(result.summary.totalTaxCents,null);
  if(kind==='1040'){assert.equal(result.adjustedGrossIncomeKnown,false);for(const key of ['adjustedGrossIncomeCents','selfEmploymentTaxCents','additionalMedicareTaxCents'])assert.equal(result.summary[key],null,key);assert.equal(result.forms.find(row=>row.form==='f1040s1').lines['3'],null);for(const row of result.forms.filter(row=>row.form==='f1040sse'))assert.equal(row.lines['12'],null);}
  else{assert.equal(result.summary.ordinaryBusinessIncomeCents,null);for(const row of result.allocations)assert.equal(row.ordinaryIncomeCents,null);}
 }
 const old=reviewed();old.individual.businesses=[{...business(),costOfGoodsCents:100000}];old.individual.w2s=[{...wage('taxpayer',200000),medicareTaxWithheldCents:290000}];const result=calculateReturn(old);assert.equal(result.summary.totalTaxCents,null);assert.equal(result.summary.additionalMedicareWithholdingCents,0);assert.equal(result.forms.find(row=>row.form==='f1040sc').lines['31'],null);
});
test('unsupported methods and conflicting source amounts remain visible and cannot become a tax total',()=>{
 for(const mutation of [v=>v.method='afs',v=>v.methodChanged='yes',v=>v.lifo='used',v=>v.subnormalWriteDown='yes',v=>v.section263a='exempt',v=>v.personalWithdrawalsCents=4000000,v=>v.closingCents=9000000,v=>v.costs[0].source='']){
  const value=reviewedInventory();mutation(value);const result=inventoryCost(value);assert.equal(result.incomeUnknown,true);assert.equal(result.costCents,null);assert(result.diagnostics.some(row=>row.severity==='blocking'));
 }
 assert.equal(inventoryCost(reviewedInventory(),{legacyCostCents:100000}).costCents,null);assert.equal(inventoryCost(reviewedInventory(),{legacyCostCents:3550000}).costCents,3550000);
 for(const kind of ['1120','1120S'])assert.equal(inventoryCost(reviewedInventory(),{kind}).incomeUnknown,true);
 const cents=reviewedInventory();cents.purchasesCents+=49;assert.equal(inventoryCost(cents,{legacyCostCents:3550001}).costCents,null);
 const value=reviewedInventory();value.costs.push({...value.costs[0]});assert.throws(()=>inventoryCost(value),/unique/);
});
test('original annual PDFs print inventory at the correct rows with source statement attachments',async()=>{
 for(const year of [2023,2024,2025])for(const kind of ['1040','1120']){
  const input=inputFor(kind);input.year=year;const result=await generateDraftPdf(input,{loadTemplate}),item=result.audit.find(row=>row.form===(kind==='1040'?'f1040sc':'f1125a'));
  assert(item);const xml=pdfText(result.bytes),pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)],page=pages[item.firstPage-1+(kind==='1040'?1:0)][1];
  const expectedY=kind==='1040'?306:210;
  assert([...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,text])=>text==='35500'&&Number(attrs.match(/xMin="([^"]+)"/)[1])>460&&Math.abs((Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2-expectedY)<8),`${year} ${kind}: COGS printed on its official row`);
  assert(item.filled.some(row=>row.checkbox?.includes(kind==='1040'?'c2_1[0]':'c1_1[0]')));const text=pdfText(result.bytes,'-layout');assert.match(text,/Synthetic allocated warehouse cost/);assert.match(text,/SHUUG DRAFT - DO NOT FILE/);
  if(kind==='1120')assert.equal(pdfYearPack(year).templates.find(row=>row.id==='f1125a').revisionYear,year===2023?2018:2024);
 }
 const input=inputFor('1040');input.year=2026;const result=await generateDraftPdf(input,{loadTemplate});assert(result.audit.find(row=>row.form==='f1040sc').filled.some(row=>row.line==='42'));assert(result.omittedForms.includes('f1040'));
});
