import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateDraftPdf} from '../pdf.mjs';
import {pdfText} from './pdf-text.mjs';
import {reviewed,wage} from './fixtures.mjs';
import {capitalFixture,capitalTrade} from './capital-fixtures.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
function wordsAt(xml,audit,form,value,left,right,top,{copyId,page=1}={}){
  const entry=audit.find(item=>item.form===form&&(!copyId||item.copyId===copyId));assert(entry,form+' '+copyId);
  const pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)],source=pages[entry.firstPage+page-2][1];
  assert([...source.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,word])=>{const x=Number(attrs.match(/xMin="([^"]+)"/)[1]),y=(Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2;return word===String(value)&&x>=left&&x<right&&Math.abs(y-top)<7;}),`${form}/${copyId??''} page ${page}: ${value}, x ${left}-${right}, y ${top}`);
}
for(const year of [2023,2024,2025])test(`${year} printed 1040, Schedule D, 8949 and NIIT rows reconcile to original trade records`,async()=>{
  const input=reviewed();input.year=year;input.individual.w2s=[{...wage('taxpayer',220000),medicareTaxWithheldCents:319000}];input.individual.investmentIncome=investmentFixture(1000,5000);input.individual.investmentIncome.dividendPayers[0].qualifiedDividendsCents=300000;
  const value=capitalFixture();input.individual.capitalIncome=value;value.trades=[capitalTrade(year,'A',-1000,{adjustments:[{code:'W',amountCents:50000,explanation:'Synthetic reviewed replacement lot loss'}]}),capitalTrade(year,'D',4000)];
  const packet=await generateDraftPdf(input,{loadTemplate}),xml=pdfText(packet.bytes),raw=pdfText(packet.bytes,'-raw');assert.equal(packet.result.summary.capitalGainOrLossCents,350000);assert.equal(packet.result.summary.netInvestmentIncomeTaxCents,36100);
  wordsAt(xml,packet.audit,'f1040',3000,252,350,{2023:540,2024:564,2025:588}[year]);wordsAt(xml,packet.audit,'f1040',3500,504,576,{2023:600,2024:624,2025:696}[year]);
  const shortY=year===2025?414:366,longY=year===2025?378:330,short={copyId:'capital-A-1'},long={copyId:'capital-D-1',page:2};
  wordsAt(xml,packet.audit,'f8949',10000,273,338,shortY,short);wordsAt(xml,packet.audit,'f8949',11000,338,403,shortY,short);wordsAt(xml,packet.audit,'f8949','W',403,446,shortY,short);wordsAt(xml,packet.audit,'f8949',500,446,511,shortY,short);wordsAt(xml,packet.audit,'f8949',-500,511,577,shortY,short);
  wordsAt(xml,packet.audit,'f8949',14000,273,338,longY,long);wordsAt(xml,packet.audit,'f8949',4000,511,577,longY,long);wordsAt(xml,packet.audit,'f8949',-500,511,577,year===2025?714:726,short);wordsAt(xml,packet.audit,'f8949',4000,511,577,year===2025?678:690,long);
  wordsAt(xml,packet.audit,'f1040sd',-500,504,576,year===2025?306:294);wordsAt(xml,packet.audit,'f1040sd',-500,504,576,426);wordsAt(xml,packet.audit,'f1040sd',4000,504,576,year===2025?594:582);wordsAt(xml,packet.audit,'f1040sd',4000,504,576,year===2025?738:726);wordsAt(xml,packet.audit,'f1040sd',3500,489,577,90,{page:2});
  wordsAt(xml,packet.audit,'f8960',3500,410,483,246);wordsAt(xml,packet.audit,'f8960',3500,504,576,306);wordsAt(xml,packet.audit,'f8960',9500,504,576,462);
  const d=packet.audit.find(item=>item.form==='f1040sd').filled;for(const name of ['c1_1[1]','c2_1[0]','c2_2[0]'])assert(d.some(item=>item.checkbox?.endsWith(name)));assert(!d.some(item=>item.checkbox?.includes('c2_3')));
  for(const [id,name]of [['capital-A-1','c1_1[0]'],['capital-D-1','c2_1[0]']])assert(packet.audit.find(item=>item.copyId===id).filled.some(item=>item.checkbox?.endsWith(name)));
  assert.match(raw,/Qualified Dividends and Capital Gain Tax Worksheet/);assert.match(raw,/Synthetic reviewed replacement lot loss/);assert.equal(packet.result.filingReady,false);
});

for(const year of [2023,2024,2025])test(`${year} Form 8949 overflow creates another exact annual page without dropping trades`,async()=>{
  const input=reviewed();input.year=year;input.individual.capitalIncome=capitalFixture();const capacity=year===2025?11:14;input.individual.capitalIncome.trades=Array.from({length:capacity+1},(_,index)=>capitalTrade(year,'A',index+1,{id:'lot-'+index,description:index===capacity?'FINALLOT':'LOT '+index}));
  const packet=await generateDraftPdf(input,{loadTemplate}),copies=packet.audit.filter(item=>item.form==='f8949'),xml=pdfText(packet.bytes);assert.equal(copies.length,2);assert.equal(packet.result.summary.capitalGainOrLossCents,(capacity+1)*(capacity+2)/2*100);
  wordsAt(xml,packet.audit,'f8949','FINALLOT',36,166,year===2025?408:360,{copyId:'capital-A-2'});wordsAt(xml,packet.audit,'f8949',capacity+1,511,577,year===2025?414:366,{copyId:'capital-A-2'});wordsAt(xml,packet.audit,'f8949',capacity,511,577,(year===2025?414:366)+24*(capacity-1),{copyId:'capital-A-1'});
});

test('capital loss limits and next-year worksheet are printed; unresolved gains remain blank',async()=>{
  const input=reviewed();input.individual.w2s=[wage('taxpayer',16750)];input.individual.capitalIncome=capitalFixture();input.individual.capitalIncome.trades=[capitalTrade(2025,'A',-5000),capitalTrade(2025,'D',-5000)];
  let packet=await generateDraftPdf(input,{loadTemplate}),xml=pdfText(packet.bytes),raw=pdfText(packet.bytes,'-raw');assert.equal(packet.result.summary.shortTermCapitalLossCarryforwardCents,400000);assert.equal(packet.result.summary.longTermCapitalLossCarryforwardCents,500000);wordsAt(xml,packet.audit,'f1040sd',3000,492,574,426,{page:2});wordsAt(xml,packet.audit,'f1040',-3000,504,576,696);assert.match(raw,/Next-year short-term loss: 4000.00; long-term loss: 5000.00/);
  input.individual.capitalIncome.review.basis=false;packet=await generateDraftPdf(input,{loadTemplate});const main=packet.audit.find(item=>item.form==='f1040').filled,d=packet.audit.find(item=>item.form==='f1040sd').filled;for(const line of ['7a','9','11a','11b','15','16','24','34','37'])assert(!main.some(item=>item.line===line),line);for(const line of ['7','15','16','21'])assert(!d.some(item=>item.line===line),line);assert(!packet.audit.filter(item=>item.form==='f8949').some(item=>item.filled.some(field=>field.line==='trade-gain')));
});
