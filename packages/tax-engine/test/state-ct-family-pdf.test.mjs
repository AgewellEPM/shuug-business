import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {generateDraftPdf} from '../pdf.mjs';
import {calculateIndividual} from '../individual.mjs';
import {calculateCTEitc} from '../state-ct-eitc.mjs';
import {ctDependentDisclosure} from '../state-ct-dependent.mjs';
import {ctEitcPdfYearPack,renderCTEitcForm} from '../state-ct-eitc-pdf.mjs';
import {ctDependentPdfYearPack,renderCTDependentForm} from '../state-ct-dependent-pdf.mjs';
import {ctPdfYearPack} from '../state-ct-pdf.mjs';
import {ctEitcFixture,ctEitcSourceFixture} from './state-ct-eitc-fixtures.mjs';
import {business} from './fixtures.mjs';
import {pdfText} from './pdf-text.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
const pages=bytes=>[...pdfText(bytes).matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(match=>[...match[1].matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].map(([,attributes,text])=>({text,...Object.fromEntries([...attributes.matchAll(/(xMin|yMin|xMax|yMax)="([^"]+)"/g)].map(([,key,value])=>[key,Number(value)]))})));
const at=(words,text,x,top,width=130,height=18)=>words.some(word=>word.text===String(text)&&word.xMin>=x&&word.xMax<=x+width&&(word.yMin+word.yMax)/2>=top&&(word.yMin+word.yMax)/2<=top+height);
async function save(name,bytes){if(process.env.SHUUG_CT_FAMILY_PDF_EVIDENCE)await writeFile(`${process.env.SHUUG_CT_FAMILY_PDF_EVIDENCE}/${name}.pdf`,bytes);}

for(const year of [2023,2024,2025])test(`${year} original EITC prints annual amounts, reviewed children and exact source identifiers`,async()=>{
 const f=ctEitcFixture({year,children:4});f.input.individual.taxableInterestCents=52500;
 const child=f.input.individual.dependents[0];child.firstName='FirstMapped';child.middleInitial='Q';child.lastName='MappedFamily';
 f.input.individual.earnedIncomeCredit.award.children[0].usHomeMonths=7;child.usResidencyDays=200;child.residencyDays=200;
 const second=f.input.individual.dependents[1];second.dateOfBirth=`${year-22}-06-15`;second.studentMonths=5;
 const third=f.input.individual.dependents[2];third.dateOfBirth='1990-06-15';third.permanentlyDisabled='yes';
 f.ct.earnedIncomeCredit.wageSources[0].stateIdStatus='provided';f.ct.earnedIncomeCredit.wageSources[0].employerStateId='CT1234567';
 const result=calculateCTEitc(f.input,f.ct,calculateIndividual(f.input));assert(result.known,JSON.stringify(result.diagnostics));
 const rendered=await renderCTEitcForm(f.input,result.forms[0],{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes),words=pages(rendered.bytes);
 assert.equal(pdf.getPageCount(),3);assert.equal(pdf.getForm().getFields().length,0);assert.equal(rendered.audit.continuationPages,1);
 assert(at(words[0],'FirstMapped',107,299,150,16));assert(at(words[0],'MappedFamily',329,299,222,16));assert(at(words[0],'Q',286,299,18,16));assert(at(words[0],'7',464,327,28,17));
 assert(at(words[0],'X',435,476,19,17));assert(at(words[0],'X',438,624,19,17));
 assert(at(words[1],'CT1234567',234,170,180,14));assert(at(words[1],'33030',428,170,139,14));
 for(const [line,top]of [['8',year===2025?386:397],['10',year===2025?437:448],['16',year===2025?703:682]])assert(at(words[1],result.lines[line]/100,435,top,119,17),`${year} line${line}`);
 if(year===2025)assert(at(words[1],'250',435,647,119,17));else assert(!rendered.audit.fields.some(row=>row.line==='15a'));
 assert.equal(rendered.audit.fields.filter(row=>row.line.startsWith('6a:federalId:')).length,9);
 const text=pdfText(rendered.bytes,'-layout');assert.match(text,/Child 4:/);assert.match(text,/Taxpayer SSN:/);assert.match(text,new RegExp(String(year)));assert(!JSON.stringify(rendered.audit).includes('FirstMapped'));
 assert.equal(ctEitcPdfYearPack(year).templates[0].pages,2);assert.equal(ctPdfYearPack(year).templates[0].sourceDraft,year===2023);
 await save(`${year}-eitc`,rendered.bytes);
});

for(const year of [2023,2024,2025])test(`${year} dependent original derives claimed identities and prints four rows plus complete continuation`,async()=>{
 const f=ctEitcFixture({year,children:5});f.ct.dependentDisclosure={source:'Synthetic reconciled dependent sources',reviewed:true};
 const result=ctDependentDisclosure(f.input,f.ct,calculateIndividual(f.input));assert(result.known,JSON.stringify(result.diagnostics));assert.equal(result.dependents.length,5);
 const rendered=await renderCTDependentForm(f.input,result.forms[0],{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes),words=pages(rendered.bytes);
 assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getPage(0).getWidth(),792);assert.equal(pdf.getPage(1).getWidth(),612);
 for(let i=0;i<4;i++){assert(at(words[0],result.dependents[i].firstName,54,314+i*36,143,23));assert(at(words[0],result.dependents[i].lastName,211,314+i*36,143,23));assert(at(words[0],'1',681,316+i*36,19,17));}
 assert(at(words[0],'5',198,492,27,19));assert(at(words[0],'X',391,170,14,19));
 const text=pdfText(rendered.bytes,'-layout');assert.match(text,/Dependent 5:/);assert.match(text,/Date of birth:/);assert.match(text,/Relationship code: 1/);
 assert.equal(rendered.audit.fields.filter(row=>row.line.startsWith('2:1:dateOfBirth:')).length,8);assert.equal(rendered.audit.fields.filter(row=>row.line.startsWith('2:4:taxId:')).length,9);assert.equal(rendered.audit.continuationPages,1);assert.equal(ctDependentPdfYearPack(year).templates[0].pages,1);
 await save(`${year}-dependent`,rendered.bytes);
});

test('EITC business source amounts and all allocation rows occupy original annual boxes without deriving a ratio',async()=>{
 for(const year of [2023,2024,2025]){
  const f=ctEitcFixture({year,children:0,wages:0,joint:false});f.input.individual.businesses=[business('taxpayer',10000)];f.ct.earnedIncomeCredit=ctEitcSourceFixture(f.input);Object.assign(f.ct.earnedIncomeCredit.businessSources[0],{stateIdStatus:'provided',ctTaxRegistrationNumber:'CT7654321'});
  const result=calculateCTEitc(f.input,f.ct,calculateIndividual(f.input));assert(result.known,JSON.stringify(result.diagnostics));const item=result.forms[0];
  // Geometry-only values exercise otherwise unsupported separate-AGI rows.
  Object.assign(item.lines,{'12':1234500,'13':2469000,'15':12300});item.ratioBps=5000;
  const rendered=await renderCTEitcForm(f.input,item,{loadTemplate}),words=pages(rendered.bytes),offset=year===2025?0:11;
  assert(at(words[1],'CT7654321',213,311,185,14));assert(at(words[1],'10000',421,311,139,14));
  for(const [value,top]of [[12345,516.62],[24690,566.07],[123,622.04]])assert(at(words[1],value,435,top+offset,119,17));
  assert.equal(rendered.audit.fields.filter(row=>row.line.startsWith('14:ratio:')).length,5);assert.equal(rendered.audit.fields.filter(row=>row.line.startsWith('7a:federalId:')).length,9);
 }
});

test('annual pins, unsupported years, missing amounts and source overflow fail closed',async()=>{
 const f=ctEitcFixture(),result=calculateCTEitc(f.input,f.ct,calculateIndividual(f.input)),item=result.forms[0];
 await assert.rejects(()=>renderCTEitcForm(f.input,item,{loadTemplate:()=>new Uint8Array([1,2,3])}),/integrity/);
 await assert.rejects(()=>renderCTEitcForm(f.input,item,{loadTemplate:(id)=>loadTemplate(id,2024)}),/integrity/);
 await assert.rejects(()=>renderCTEitcForm({...f.input,year:2026},item,{loadTemplate}),/annual/);
 const overflow=structuredClone(item);overflow.printedWageSources=Array.from({length:4},()=>item.printedWageSources[0]);await assert.rejects(()=>renderCTEitcForm(f.input,overflow,{loadTemplate}),/overflow/);
 const unknown=structuredClone(item);unknown.lines['10']=null;unknown.lines['16']=null;const rendered=await renderCTEitcForm(f.input,unknown,{loadTemplate});assert(!rendered.audit.fields.some(row=>['10','16'].includes(row.line)));
 const long=structuredClone(item);long.children[0].firstName='Unprintable'.repeat(100);await assert.rejects(()=>renderCTEitcForm(f.input,long,{loadTemplate}),/cannot fit/);
 for(const year of [2026,2027]){assert.deepEqual(ctEitcPdfYearPack(year).templates,[]);assert.deepEqual(ctDependentPdfYearPack(year).templates,[]);}
});

test('dependent continuation supports all100 retained federal records; no truncation or mismatched count',async()=>{
 const f=ctEitcFixture({children:1});f.ct.dependentDisclosure={source:'Synthetic source',reviewed:true};const first=ctDependentDisclosure(f.input,f.ct,calculateIndividual(f.input)).forms[0];const item={...first,totalDependents:100,dependents:Array.from({length:100},(_,i)=>({...first.dependents[0],id:`source-${i}`,firstName:`Synthetic${i+1}`}))};
 const rendered=await renderCTDependentForm(f.input,item,{loadTemplate});assert.equal(rendered.audit.dependentCount,100);assert.equal(rendered.audit.continuationPages,10);assert.match(pdfText(rendered.bytes,'-layout'),/Dependent 100: Synthetic100/);
 await assert.rejects(()=>renderCTDependentForm(f.input,{...item,totalDependents:99},{loadTemplate}),/matching total/);
 await assert.rejects(()=>renderCTDependentForm(f.input,item,{loadTemplate:()=>new Uint8Array([1,2,3])}),/integrity/);
});

test('actual annual draft packets route CT schedules and preserve their state payment transfer',async()=>{
 for(const [year,credit]of [[2023,218200],[2024,245200],[2025,284900]]){
  const f=ctEitcFixture({year});f.input.individual.taxableInterestCents=52500;f.ct.dependentDisclosure={source:'Synthetic reconciled federal dependent list',reviewed:true};
  const packet=await generateDraftPdf(f.input,{loadTemplate}),state=packet.result.states.find(row=>row.state==='CT');
  assert.equal(state.lines['20a'],credit);assert.equal(state.lines['21'],credit);assert(Number.isSafeInteger(state.summary.totalTaxCents));assert.equal(state.summary.refundCents,credit-state.summary.totalTaxCents);assert.equal(packet.result.filingReady,false);
  for(const form of ['ct1040','ct1040eitc','ctdependent'])assert(packet.audit.some(row=>row.form===form),`${year}/${form}`);
  assert.equal(packet.audit.find(row=>row.form==='ct1040').sourceDraft,year===2023);
  const text=pdfText(packet.bytes,'-layout');assert.match(text,/Connecticut Earned Income Tax Credit/);assert.match(text,/Schedule CT-Dependent/);
 }
});
