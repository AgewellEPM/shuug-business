import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {eligibilityIdentity,eligibilityAnnotations,eligibilityCheckboxes} from '../eligibility-pdf.mjs';
import {standardDeduction} from '../standard-deduction.mjs';
import {eligibilityFixture} from './standard-deduction-fixtures.mjs';
import {referencedField} from '../form-maps.mjs';
import {pdfYearPack} from '../form-years.mjs';
import {pdfText} from './pdf-text.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {reviewed,wage} from './fixtures.mjs';
function words(xml,page){return [...[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)][page-1][1].matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].map(([,attrs,text])=>({text,x:Number(attrs.match(/xMin="([^"]+)"/)[1]),y:(Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2}));}
for(const year of [2023,2024,2025])test(`${year} actual IRS checkbox appearances, deduction amount and decedent fields survive flattening`,async()=>{
 const eligibility=eligibilityFixture();for(const owner of ['taxpayer','spouse'])Object.assign(eligibility[owner],{dateOfBirth:`${year-70}-01-01`,blind:'yes',canBeClaimed:'yes',deceased:'yes',dateOfDeath:`${year}-10-15`});
 const input={year,party:{name:'Synthetic Taxpayer'},individual:{filingStatus:'marriedJoint',spouseName:'Synthetic Spouse',eligibility}},deduction=standardDeduction(eligibility,{year,filingStatus:'marriedJoint',wagesCents:500000,incomeKnown:true}),item={form:'f1040',standardDeduction:deduction};assert.equal(deduction.known,true);
 const bytes=await readFile(new URL(`../forms/${year}/f1040.pdf`,import.meta.url)),pdf=await PDFDocument.load(bytes),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica),audit=[];
 const set=(name,value)=>referencedField(form,name).setText(String(value));set.checkbox=name=>{form.getCheckBox(name).check();audit.push(name);};eligibilityIdentity(input,item,set);set(pdfYearPack(year).lineMaps.f1040[year===2025?'12e':'12'],deduction.deductionCents/100);
 const map=eligibilityCheckboxes[year],rects=Object.entries(map).filter(([key])=>!['page','ineligible','spouseItemizes','dualStatus'].includes(key)).map(([key,name])=>({key,rect:form.getCheckBox(`topmostSubform[0].Page${map.page}[0].${name}`).acroField.getWidgets()[0].getRectangle()}));
 form.updateFieldAppearances(font);form.flatten();eligibilityAnnotations(input,item,{pdf,font,audit});const output=await pdf.save(),xml=pdfText(output),raw=pdfText(output,'-raw'),page=words(xml,map.page);
 for(const {key,rect}of rects)assert(page.some(word=>word.text==='✔'&&word.x>=rect.x&&word.x<=rect.x+rect.width&&Math.abs(word.y-(792-rect.y-rect.height/2))<3),`${year} printed ${key}`);
 assert(page.some(word=>word.text===String(deduction.deductionCents/100)));
 if(year===2025){const first=words(xml,1);assert(first.some(word=>word.text==='✔'&&word.x>=374&&word.x<383&&word.y<75));assert.equal(first.filter(word=>word.text===String(year)&&word.y>60&&word.y<80).length,2);}else assert.match(raw,/DECEASED: Synthetic Taxpayer/);
 assert.equal((await PDFDocument.load(output)).getForm().getFields().length,0);
});
test('2026 never substitutes a prior-year 1040 checkbox map',()=>{let calls=0;eligibilityIdentity({year:2026},{form:'f1040',standardDeduction:{flags:{taxpayerAge65:true}}},Object.assign(()=>calls++,{checkbox:()=>calls++}));assert.equal(calls,0);});
test('real draft-packet path carries dependent worksheet, source facts and actual checked fields',async()=>{
 const input=reviewed();input.year=2024;input.individual.w2s=[wage('taxpayer',7000)];Object.assign(input.individual.eligibility.taxpayer,{blind:'yes',canBeClaimed:'yes'});
 const packet=await generateDraftPdf(input,{loadTemplate:(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url))}),entry=packet.audit.find(row=>row.form==='f1040'),raw=pdfText(packet.bytes,'-raw').replace(/\s+/g,' ');assert.equal(packet.result.standardDeduction.deductionCents,940000);assert(entry.filled.some(row=>row.checkbox?.endsWith('c1_6[0]')));assert(entry.filled.some(row=>row.checkbox?.endsWith('c1_10[0]')));assert(entry.filled.some(row=>row.line==='12'));assert.match(raw,/Calculated standard deduction: 9400.00 USD/);assert.match(raw,/Synthetic eligibility source for taxpayer/);assert.equal(packet.result.filingReady,false);
});
