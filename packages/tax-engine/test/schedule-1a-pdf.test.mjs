import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {generateDraftPdf} from '../pdf.mjs';
import {schedule1ATemplate} from '../schedule-1a-pdf.mjs';
import {pdfText} from './pdf-text.mjs';
import {reviewed,wage} from './fixtures.mjs';
import {schedule1AFixture,identifiersFixture,tip,overtime,vehicle,senior} from './schedule-1a-fixtures.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
function at(xml,page,value,x1,x2,y){const source=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)][page-1][1];assert([...source.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,word])=>{const x=Number(attrs.match(/xMin="([^"]+)"/)[1]),center=(Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2;return word===String(value)&&x>=x1&&x<x2&&Math.abs(center-y)<5;}),`page${page}: ${value} at x${x1}-${x2}, y${y}`);}
function inputFixture(){const input=reviewed();input.individual.w2s=[wage('taxpayer',65000)];input.individual.eligibility.taxpayer.dateOfBirth='1961-01-01';input.individual.taxpayerIdentifiers=identifiersFixture();input.individual.schedule1A=schedule1AFixture();Object.assign(input.individual.schedule1A,{tips:[tip(10000)],overtime:[overtime(15000)],vehicles:[vehicle(5000)],seniors:[senior()]});return input;}
test('2025 official Schedule1A pin, structure and actual printed deduction rows match the source',async()=>{
 const blank=await loadTemplate('f1040s1a',2025);assert.equal(blank.length,schedule1ATemplate.bytes);assert.equal(createHash('sha256').update(blank).digest('hex'),schedule1ATemplate.sha256);const pdf=await PDFDocument.load(blank);assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getForm().getFields().length,54);
 const input=inputFixture(),packet=await generateDraftPdf(input,{loadTemplate}),entry=packet.audit.find(row=>row.form==='f1040s1a'),xml=pdfText(packet.bytes),raw=pdfText(packet.bytes,'-raw').replace(/\s+/g,' ');assert.equal(packet.result.schedule1A.deductionCents,2600000);
 at(xml,entry.firstPage,10000,504,576,546);at(xml,entry.firstPage,5000,504,576,750);at(xml,entry.firstPage+1,5000,504,576,306);at(xml,entry.firstPage+1,6000,504,576,462);at(xml,entry.firstPage+1,26000,504,576,498);
 const main=packet.audit.find(row=>row.form==='f1040');assert(main.filled.some(row=>row.line==='13b'));assert(entry.filled.some(row=>row.reference==='2/1'));assert.match(raw,/qualified premium 5000.00 USD/);assert.match(raw,/Schedule 1-A 2025 source and calculation workpaper/);assert.equal(packet.result.filingReady,false);
});
test('unresolved source blanks affected official deduction and total while preserving other sections',async()=>{
 const input=inputFixture();input.individual.schedule1A.tips[0].review.lawful=false;const packet=await generateDraftPdf(input,{loadTemplate}),entry=packet.audit.find(row=>row.form==='f1040s1a'),main=packet.audit.find(row=>row.form==='f1040');for(const line of ['6','7','13','38'])assert(!entry.filled.some(row=>row.line===line),line);assert(entry.filled.some(row=>row.line==='21'));assert(!main.filled.some(row=>row.line==='13b'));assert.equal(packet.result.summary.adjustedGrossIncomeCents,6500000);assert.equal(packet.result.summary.totalTaxCents,null);
});
test('third VIN prints as attached continuation, with all interest included once in total',async()=>{
 const input=inputFixture();input.individual.schedule1A.vehicles.push(vehicle(1000,{vin:'1HGCM82633A004353'}),vehicle(1000,{vin:'1HGCM82633A004354'}));const packet=await generateDraftPdf(input,{loadTemplate}),raw=pdfText(packet.bytes,'-raw').replace(/\s+/g,' '),entry=packet.audit.find(row=>row.form==='f1040s1a');assert.equal(packet.result.schedule1A.lines['23'],700000);assert.match(raw,/line 22 continuation/);assert.match(raw,/VIN 1HGCM82633A004354/);assert(entry.filled.some(row=>row.line==='23'));
});
