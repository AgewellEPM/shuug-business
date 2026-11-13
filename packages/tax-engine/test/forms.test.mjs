import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {pdfText} from './pdf-text.mjs';
import { PDFDocument } from 'pdf-lib';
import { generateDraftPdf } from '../pdf.mjs';
import { reviewed,business,wage } from './fixtures.mjs';
const loadTemplate=id=>readFile(new URL(`../forms/2025/${id}.pdf`,import.meta.url));
const words=bytes=>pdfText(bytes,'-layout');
function amountAt(bytes,pageNumber,expected,x,top){
  const xml=pdfText(bytes,'-bbox-layout'),page=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)][pageNumber-1]?.[1];assert(page,'Actual output page exists');
  assert([...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,text])=>text===String(expected)&&Number(attrs.match(/xMin="([^"]+)"/)[1])>=x&&Math.abs((Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2-top)<8),`Actual PDF must place ${expected} at its official amount row, page ${pageNumber}, top ${top}`);
}

test('individual official packet contains actual filled C/SE/QBI amounts and flattened draft pages',async()=>{
  const input=reviewed();input.individual.businesses=[business()];const {bytes,result,audit}=await generateDraftPdf(input,{loadTemplate}),pdf=await PDFDocument.load(bytes),text=words(bytes);
  assert.equal(audit.length,6);assert.equal(pdf.getPageCount(),audit.reduce((sum,item)=>sum+item.pageCount,0)+audit[0].firstPage-1);assert.equal(pdf.getForm().getFields().length,0);
  assert.match(text,/Synthetic Taxpayer/);for(const amount of ['74348','46878','11304','11720','16691'])assert(text.includes(amount),`Actual flattened PDF must contain ${amount}`);
  assert.match(text,/SHUUG DRAFT - DO NOT FILE/);assert.match(text,/No return has been filed/);assert.equal(result.filingReady,false);
  assert(audit.find(item=>item.form==='f1040').filled.some(field=>field.line==='24'&&field.reference==='2/16'));
  amountAt(bytes,audit.find(item=>item.form==='f1040').firstPage+1,16691,504,258);
  amountAt(bytes,audit.find(item=>item.form==='f1040sc').firstPage,80000,475,666);
  amountAt(bytes,audit.find(item=>item.form==='f8995').firstPage,11720,504,570);
});
test('partnership and S corporation official packages include distinct owner K-1 amounts',async()=>{
  for(const kind of ['1065','1120S']){const input=reviewed(kind);input.entity.receiptsCents=10000100;input.entity.owners=[{id:'a',name:'Synthetic Owner A',taxId:'000111111',shareBps:5000},{id:'b',name:'Synthetic Owner B',taxId:'000222222',shareBps:5000}];const {bytes,audit}=await generateDraftPdf(input,{loadTemplate}),text=words(bytes);assert.equal(audit.length,3);assert(text.includes('50001'));assert(text.includes('50000'));assert(text.includes('Synthetic Owner A'));assert(text.includes('Synthetic Owner B'));assert.match(text,/DO NOT FILE/);}
});
test('corporate Schedule J is filled on page 3 of its original template, once',async()=>{
  const input=reviewed('1120');input.entity.receiptsCents=10000000;input.entity.estimatedPaymentsCents=1500000;const {bytes,audit}=await generateDraftPdf(input,{loadTemplate}),text=words(bytes);
  assert.equal(audit.length,1);assert.equal(audit[0].pageCount,6);assert(audit[0].filled.some(item=>item.line==='J:12'&&item.reference==='3/33'));assert(text.includes('21000'));assert(text.includes('6000'));assert.match(text,/CORPORATE_DISCLOSURES|Complete Schedule C\/K\/L\/M/);
  amountAt(bytes,audit[0].firstPage,6000,504,618);amountAt(bytes,audit[0].firstPage+2,21000,504,462);
});
test('form export refuses corrupted templates, wrong years and source truncation',async()=>{
  const input=reviewed();input.individual.w2s=[wage('taxpayer',50000)];await assert.rejects(()=>generateDraftPdf(input,{loadTemplate:async id=>{const data=new Uint8Array(await loadTemplate(id));data[100]^=1;return data;}}),/integrity/);
  input.year=2028;await assert.rejects(()=>generateDraftPdf(input,{loadTemplate}),/tax-year/);input.year=2025;input.party.firstName='W'.repeat(200);await assert.rejects(()=>generateDraftPdf(input,{loadTemplate}),/truncated/);
});
