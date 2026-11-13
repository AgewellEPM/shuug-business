import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';
import {reviewed,wage} from './fixtures.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
function wordsAt(xml,audit,form,text,left,right,top){
  const pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)],page=pages[audit.find(item=>item.form===form).firstPage-1][1];
  assert([...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,word])=>{const x=Number(attrs.match(/xMin="([^"]+)"/)[1]),y=(Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2;return word===String(text)&&x>=left&&x<right&&Math.abs(y-top)<8;}),`${form}: ${text} at x ${left}-${right}, y ${top}`);
}
for(const year of [2023,2024,2025])test(`${year} actual Schedule B, NIIT and Schedule 2 PDF rows reconcile to the individual return`,async()=>{
  const input=reviewed();input.year=year;input.individual.w2s=[{...wage('taxpayer',220000,30000),medicareTaxWithheldCents:337000}];input.individual.investmentIncome=investmentFixture();
  const result=calculateReturn(input);assert.equal(result.calculationAvailable,true);assert.equal(result.summary.netInvestmentIncomeTaxCents,17800);assert.equal(result.summary.adjustedGrossIncomeCents,22469000);assert.equal(result.summary.totalTaxCents,result.summary.ordinaryTaxCents+result.summary.additionalMedicareTaxCents+17800);assert.equal(result.filingReady,false);assert(!result.diagnostics.some(item=>item.code==='SCHEDULE_B_REQUIRED'||item.code==='NET_INVESTMENT_TAX_REQUIRED'));
  const packet=await generateDraftPdf(input,{loadTemplate}),xml=pdfText(packet.bytes),schedule=packet.audit.find(item=>item.form==='f1040sb');
  wordsAt(xml,packet.audit,'f1040sb','Synthetic',129,470,150);wordsAt(xml,packet.audit,'f1040sb',1234,489,576,150);wordsAt(xml,packet.audit,'f1040sb',1234,489,576,318);wordsAt(xml,packet.audit,'f1040sb',1234,489,576,354);wordsAt(xml,packet.audit,'f1040sb',3456,489,576,378);wordsAt(xml,packet.audit,'f1040sb',3456,489,576,558);
  wordsAt(xml,packet.audit,'f8960',1234,504,576,150);wordsAt(xml,packet.audit,'f8960',3456,504,576,162);wordsAt(xml,packet.audit,'f8960',4690,504,576,342);wordsAt(xml,packet.audit,'f8960',4690,504,576,462);wordsAt(xml,packet.audit,'f8960',224690,410,483,486);wordsAt(xml,packet.audit,'f8960',200000,410,483,498);wordsAt(xml,packet.audit,'f8960',178,504,576,546);
  // Source Schedule 2 line 12 moves between the three annual editions.
  wordsAt(xml,packet.audit,'f1040s2',178,504,576,{2023:396,2024:618,2025:630}[year]);
  assert(schedule.filled.some(item=>item.checkbox===`topmostSubform[0].Page1[0].${year===2025?'TagcorrectingSubform[0].':''}c1_1[1]`));assert(schedule.filled.some(item=>item.checkbox==='topmostSubform[0].Page1[0].c1_3[1]'));
  assert(!schedule.filled.some(item=>item.checkbox?.includes('c1_2[')));
});
test('foreign answers and payer overflow reach the PDF while separate filings stay outstanding',async()=>{
  const input=reviewed(),value=investmentFixture(0,0);input.individual.investmentIncome=value;value.foreignAccount='yes';value.fbarRequired='yes';value.foreignCountries='Canada';
  value.interestPayers=Array.from({length:17},(_,index)=>({id:'bank-'+index,payer:'Synthetic Bank '+index,amountCents:10000+index,source:'Source record '+index}));value.dividendPayers=Array.from({length:18},(_,index)=>({id:'fund-'+index,payer:'Synthetic Fund '+index,amountCents:20000+index,source:'Dividend source '+index}));
  const packet=await generateDraftPdf(input,{loadTemplate}),text=pdfText(packet.bytes,'-raw'),filled=packet.audit.find(item=>item.form==='f1040sb').filled;
  assert.match(text,/Synthetic Bank 16/);assert.match(text,/Synthetic Fund 17/);assert.match(text,/100\.16 USD/);assert.match(text,/200\.17 USD/);assert.match(text,/Canada/);assert.match(text,/Additional payers/);assert(filled.some(item=>item.checkbox?.includes('c1_1[0]')));assert(filled.some(item=>item.checkbox?.includes('c1_2[0]')));assert(packet.result.diagnostics.some(item=>item.code==='FBAR_SEPARATE_FILING_REQUIRED'));assert.equal(packet.result.filingReady,false);
});
test('unreviewed NIIT values and foreign answers stay blank on the official PDF',async()=>{
  const input=reviewed();input.individual.w2s=[{...wage('taxpayer',220000),medicareTaxWithheldCents:337000}];const value=investmentFixture();value.review.noMagiAdjustments=false;value.foreignAccount='unknown';value.foreignTrust='unknown';input.individual.investmentIncome=value;
  const packet=await generateDraftPdf(input,{loadTemplate});assert.equal(packet.result.summary.totalTaxCents,null);assert.equal(packet.result.summary.amountOwedCents,null);assert.equal(packet.result.summary.refundCents,null);
  const niit=packet.audit.find(item=>item.form==='f8960').filled,b=packet.audit.find(item=>item.form==='f1040sb').filled;for(const line of ['13','15','16','17'])assert(!niit.some(item=>item.line===line));assert(!b.some(item=>item.checkbox));
});
test('rounding that would make payer rows disagree uses a complete source statement and one reconciled total',async()=>{
  const input=reviewed(),value=investmentFixture(0,0);input.individual.investmentIncome=value;value.interestPayers=[{id:'bank-a',payer:'Synthetic Rounding Bank A',amountCents:10049,source:'Synthetic A'},{id:'bank-b',payer:'Synthetic Rounding Bank B',amountCents:10049,source:'Synthetic B'}];
  const packet=await generateDraftPdf(input,{loadTemplate}),xml=pdfText(packet.bytes),text=pdfText(packet.bytes,'-raw');wordsAt(xml,packet.audit,'f1040sb',201,489,576,150);wordsAt(xml,packet.audit,'f1040sb',201,489,576,318);wordsAt(xml,packet.audit,'f1040sb',201,489,576,354);assert.match(text,/All payers/);assert.match(text,/Synthetic Rounding Bank A/);assert.match(text,/Synthetic Rounding Bank B/);assert.match(text,/100\.49 USD/);assert.equal(packet.result.summary.adjustedGrossIncomeCents,20100);
});
