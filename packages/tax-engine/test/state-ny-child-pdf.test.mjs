import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {nyChildPdfYearPack,renderNYChildForm,nyChildWorkpaper} from '../state-ny-child-pdf.mjs';
import {eicFixture} from './eic-fixtures.mjs';
import {nyEmpireChildFixture} from './state-ny-child-fixtures.mjs';
import {calculateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {newEnergyCredits} from '../energy-credits.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
import {pdfText} from './pdf-text.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
const pages=bytes=>[...pdfText(bytes).matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(match=>[...match[1].matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].map(([,attributes,text])=>({text,...Object.fromEntries([...attributes.matchAll(/(xMin|yMin|xMax|yMax)="([^"]+)"/g)].map(([,key,value])=>[key,Number(value)]))})));
const at=(words,text,x,top,width=92,height=13)=>words.some(word=>word.text===String(text)&&word.xMin>=x&&word.xMax<=x+width&&(word.yMin+word.yMax)/2>=top&&(word.yMin+word.yMax)/2<=top+height);
async function save(name,bytes){if(process.env.SHUUG_NY_CHILD_PDF_EVIDENCE)await writeFile(`${process.env.SHUUG_NY_CHILD_PDF_EVIDENCE}/${name}.pdf`,bytes);}
function fixture(year,childCount=6){
 const input=eicFixture({year,children:1,joint:true});input.party.name='Mapped Taxpayer';input.individual.spouseName='Mapped Spouse';
 const children=Array.from({length:childCount},(_,i)=>({id:`child-${i+1}`,firstName:`Child${i+1}`,middleInitial:'Q',lastName:'MappedFamily',suffix:i===0?'Jr':'',taxId:String(123456789+i),dateOfBirth:`${year-8}-04-12`,age:8,timelyForFederal:true,lateIdentifier:false}));
 const amounts=year===2023?{'6':3201,'7':4502,'8':7703,'9':2542,'13':600,'14':2542,'15':1201,'16':1341}:year===2024?{'5':3201,'6':4502,'7':7703,'8':2542,'9':600,'10':2542,'11':1201,'12':1341}:{'2':2000,'4':1320,'5':3320,'6':78000,'7':3000,'8':50,'9':3270};
 const counts=year===2023?{'4':5,'5':1,'10':5,'11':1,'12':6}:year===2024?{'4':6}:{'1':2,'3':4};
 const lines=Object.fromEntries(Object.entries(amounts).map(([line,value])=>[line,value*100]));
 return {input,item:{form:'nyit213',copyId:'NY-Empire-child-credit',state:'NY',lines,empireChildCredit:{known:true,amountCents:254200,children,counts,flags:year===2025?{}:{'1':true,'2':false,'3':true},lines,worksheets:{}}}};
}

for(const year of [2023,2024,2025])test(`${year} IT213 original fills printed annual money/count rows, names and full child birth dates`,async()=>{
 const {input,item}=fixture(year),rendered=await renderNYChildForm(input,item,{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes),words=pages(rendered.bytes);
 assert.equal(pdf.getPageCount(),year===2025?1:2);assert.equal(pdf.getForm().getFields().length,0);assert.equal(rendered.audit.childCount,6);assert.equal(rendered.audit.continuationPages,0);
 if(year===2023){for(const [value,top]of [[3201,120],[4502,144],[7703,168],[2542,192],[600,324],[2542,348],[1201,432],[1341,480]])assert(at(words[1],value,472,top,94),`${year}/${value}/${top}`);for(const [value,top]of [[5,252],[1,276],[6,300]])assert(at(words[1],value,486,top,31),`${year}/count/${value}`);assert(at(words[0],5,498,360,31));assert(at(words[0],1,498,396,31));}
 if(year===2024){for(const [value,top]of [[3201,144],[4502,168],[7703,192],[2542,216],[600,288],[2542,312],[1201,408],[1341,456]])assert(at(words[1],value,474,top),`${year}/${value}/${top}`);assert(at(words[0],6,498,360,31));assert(rendered.audit.fields.some(row=>row.line==='5'&&row.reference==='Line 6 Dollars'));assert(rendered.audit.fields.some(row=>row.line==='10'&&row.reference==='Line 14 Dollars'));}
 if(year===2025){for(const [value,top]of [[2000,185],[1320,234],[3320,258],[78000,282],[3000,366],[50,390],[3270,414]])assert(at(words[0],value,474,top,91,15),`${year}/${value}/${top}`);assert(at(words[0],2,487,158,29,17));assert(at(words[0],4,486,206,31,18));assert(!rendered.audit.fields.some(row=>row.checkbox));}
 const childTop=year===2025?508:517;assert(at(words[0],'Child1',36,childTop,138,24));assert(at(words[0],'MappedFamily',192,childTop,216,24));assert(at(words[0],'123456789',432,childTop,84,24));assert(at(words[0],`0412${year-8}`,515,childTop,61,24));assert(at(words[0],'Child6',36,childTop+120,138,24));
 const text=pdfText(rendered.bytes,'-layout');assert.match(text,/Mapped Taxpayer/);assert.match(text,/Mapped Spouse/);if(year<2025){for(const [name,choice]of [['Line 1','Yes'],['Line 2','No'],['Line 3','Yes']])assert(rendered.audit.fields.some(row=>row.checkbox===name&&row.choice===choice));}
 assert(!JSON.stringify(rendered.audit).includes('MappedFamily'));assert.equal(nyChildPdfYearPack(year).templates.find(row=>row.id==='nyit213').fieldCount,year===2023?56:year===2024?52:47);
 await save(`${year}-it213-filled`,rendered.bytes);
});

for(const year of [2023,2024,2025])test(`${year} seventh child and later children use prescribed original IT213ATT at exact seventeen-row boundary`,async()=>{
 const {input,item}=fixture(year,24),rendered=await renderNYChildForm(input,item,{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes),words=pages(rendered.bytes),mainPages=year===2025?1:2;
 assert.equal(pdf.getPageCount(),mainPages+2);assert.equal(rendered.audit.continuationPages,2);assert.deepEqual(rendered.audit.continuations.map(row=>[row.firstChild,row.childCount]),[[7,17],[24,1]]);
 assert(at(words[mainPages],'Child7',36,216,139));assert(at(words[mainPages],'Child23',36,600,139));assert(at(words[mainPages],`0412${year-8}`,515,600,61));assert(at(words[mainPages+1],'Child24',36,216,139));
 for(const index of [mainPages,mainPages+1]){const text=words[index].map(row=>row.text).join(' ');assert.match(text,/IT-213-ATT/);assert.match(text,/Mapped Taxpayer/);assert.match(text,/Mapped Spouse/);assert(!text.includes('Child6'));}
 assert.equal(nyChildPdfYearPack(year).templates.find(row=>row.id==='nyit213att').fieldCount,104);assert.equal(pdf.getForm().getFields().length,0);
 await save(`${year}-it213-original-continuations`,rendered.bytes);
});

test('NY child originals reject wrong annual bytes, unsupported years, unsafe source identity and truncation',async()=>{
 const {input,item}=fixture(2025);await assert.rejects(()=>renderNYChildForm(input,item,{loadTemplate:id=>loadTemplate(id,2024)}),/integrity/);await assert.rejects(()=>renderNYChildForm(input,item,{loadTemplate:()=>new Uint8Array([1,2,3])}),/integrity/);
 for(const year of [2026,2027]){assert.deepEqual(nyChildPdfYearPack(year).templates,[]);await assert.rejects(()=>renderNYChildForm({...input,year},item,{loadTemplate}),/annual/);}
 item.empireChildCredit.children[0].dateOfBirth='2020-02-30';await assert.rejects(()=>renderNYChildForm(input,item,{loadTemplate}),/birth date/);item.empireChildCredit.children[0].dateOfBirth='2017-04-12';item.empireChildCredit.children[0].firstName='LongUntruncated'.repeat(30);await assert.rejects(()=>renderNYChildForm(input,item,{loadTemplate}),/no truncation/);
});

test('all100 retained children fit original attachments; unknown amounts stay blank and workpaper keeps worksheet cents separate from counts',async()=>{
 const {input,item}=fixture(2025,100);item.lines['9']=null;const rendered=await renderNYChildForm(input,item,{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes);
 assert.equal(pdf.getPageCount(),7);assert.equal(rendered.audit.continuationPages,6);assert.equal(rendered.audit.continuations.at(-1).childCount,9);assert(!rendered.audit.fields.some(row=>row.line==='9'));assert.match(pdfText(rendered.bytes,'-layout'),/Child100/);
 item.empireChildCredit.worksheets={a:{lines:{'1':300000},counts:{children:3},flags:{eligible:true}}};const text=[];nyChildWorkpaper(input,{states:[{state:'NY',empireChildCredit:item.empireChildCredit}]},value=>text.push(value));assert(text.includes('IT213 worksheet a line 1: 3000.00 USD.'));assert(text.includes('IT213 worksheet a line children count: 3.'));
});

test('actual annual Empire calculations transfer to IT201 line63 and original packet with annual worksheet amounts',async()=>{
 for(const year of [2023,2024,2025])for(const [wages,amount]of [[30000,33000],[80000,year===2025?24700:24800]]){
  const {input}=nyEmpireChildFixture({year,wages}),calculated=calculateReturn(input),state=calculated.states.find(row=>row.state==='NY');
  assert.equal(calculated.calculationAvailable,true);assert.equal(state.empireChildCredit.known,true,JSON.stringify(state.empireChildCredit.diagnostics));assert.equal(state.lines['63'],amount);assert.equal(state.empireChildCredit.amountCents,amount);
  const packet=await generateDraftPdf(input,{loadTemplate}),audit=packet.audit.find(row=>row.form==='nyit213');assert(audit);assert.equal(audit.childCount,1);assert.equal(packet.result.states.find(row=>row.state==='NY').lines['63'],amount);assert.equal(packet.result.filingReady,false);
  const text=pdfText(packet.bytes,'-layout');assert.match(text,/New York Empire State child credit calculation/);assert(text.includes(`IT213 line ${year===2023?'14':year===2024?'10':'9'}: ${(amount/100).toFixed(2)} USD.`));
  if(year<2025)assert.match(text,/IT213 worksheet a line 1: 1000.00 USD/);else assert.match(text,/IT213 line 4: 330.00 USD/);
  await save(`${year}-wages${wages}-actual-packet`,packet.bytes);
 }
});

test('actual2025 independent unclaimed child prints while unreviewed identity and retained birth conflicts suppress the original',async()=>{
 const {input,state}=nyEmpireChildFixture({year:2025,wages:30000});input.individual.dependents[0].claim='no';state.dependents=[];
 const packet=await generateDraftPdf(input,{loadTemplate});assert.equal(packet.result.states.find(row=>row.state==='NY').lines['63'],33000);assert(packet.audit.some(row=>row.form==='nyit213'));assert.equal(input.individual.dependents[0].claim,'no');
 input.individual.dependents[0].review.identity=false;const unresolved=await generateDraftPdf(input,{loadTemplate}),ny=unresolved.result.states.find(row=>row.state==='NY');assert.equal(ny.lines['63'],null);assert.equal(ny.summary.paymentsCents,null);assert(!unresolved.audit.some(row=>row.form==='nyit213'));assert.equal(ny.lines['19'],3000000);
 const conflicted=nyEmpireChildFixture({year:2025,wages:30000});conflicted.state.dependents[0].dateOfBirth='2000-01-01';const conflict=await generateDraftPdf(conflicted.input,{loadTemplate});assert.equal(conflict.result.states.find(row=>row.state==='NY').lines['63'],null);assert(!conflict.audit.some(row=>row.form==='nyit213'));
});

test('actual seven-child result uses original continuation and2025 age bands; no zero-credit original is submitted',async()=>{
 const {input,state}=nyEmpireChildFixture({year:2025,children:7,wages:30000,joint:true});
 input.individual.dependents[0].dateOfBirth='2023-04-12';state.dependents[0].dateOfBirth='2023-04-12';
 const packet=await generateDraftPdf(input,{loadTemplate}),credit=packet.result.states.find(row=>row.state==='NY').empireChildCredit,audit=packet.audit.find(row=>row.form==='nyit213');assert.equal(credit.known,true,JSON.stringify(credit.diagnostics));assert.deepEqual(credit.counts,{'1':1,'3':6});assert.equal(credit.amountCents,298000);assert.equal(audit.childCount,7);assert.equal(audit.continuationPages,1);assert.equal(audit.continuations[0].childCount,1);assert.match(pdfText(packet.bytes,'-layout'),/IT-213-ATT/);await save('2025-seven-child-actual-packet',packet.bytes);
 const zero=nyEmpireChildFixture({year:2025,children:1,wages:200000});const stopped=await generateDraftPdf(zero.input,{loadTemplate});assert.equal(stopped.result.states.find(row=>row.state==='NY').lines['63'],0);assert(!stopped.audit.some(row=>row.form==='nyit213'));
});

for(const childIdType of ['ssn','itin'])test(`actual2024 ${childIdType} children packet reconstructs the New York old-law payroll alternative`,async()=>{
 const {input}=nyEmpireChildFixture({year:2024,children:3,wages:6000});input.individual.taxableInterestCents=2400000;input.individual.investmentIncome=investmentFixture(24000,0);
 if(childIdType==='itin')for(const child of input.individual.dependents){child.citizenship='usResident';Object.assign(child.identifier,{type:'itin',validForEmployment:'no'});}
 const packet=await generateDraftPdf(input,{loadTemplate}),federal=packet.result,ny=federal.states.find(row=>row.state==='NY'),credit=ny.empireChildCredit;
 assert.equal(federal.forms.find(row=>row.form==='f1040').lines['18'],161900);assert.equal(federal.earnedIncomeCredit.amountCents,0);assert.equal(federal.childCredits.refundableCents,childIdType==='ssn'?52500:0);assert.equal(federal.dependents.ctcCount,childIdType==='ssn'?3:0);assert.equal(federal.dependents.odcCount,childIdType==='itin'?3:0);assert.equal(federal.childCredits.form.lines['25'],undefined);
 assert.equal(credit.worksheets.b.lines['6'],45000);assert.equal(credit.worksheets.b.lines['7'],45900);assert.equal(credit.lines['6'],45900);assert.equal(credit.amountCents,68600);assert.equal(ny.lines['63'],68600);assert.equal(ny.summary.paymentsCents,null,'separate dependent-care review remains unresolved');
 const original=pages(packet.bytes).find(page=>page.some(word=>word.text==='IT-213')&&page.some(word=>word.text==='(back)'));assert(original,'actual2024 IT213 back page');assert(at(original,459,474,168));assert(at(original,686,474,312));
 const text=pdfText(packet.bytes,'-layout');assert.match(text,/IT213 worksheet b line 7: 459.00 USD/);assert.match(text,/New York old-law payroll alternative from current original sources/);assert.match(text,/New York old-law payroll alternative line 25: 459.00 USD/);assert.match(text,/IT213 line 10: 686.00 USD/);await save(`2024-${childIdType}-reconstructed-payroll-actual-packet`,packet.bytes);
});

test('actual2024 ITIN-only ODC and solar packet honors federal Credit Limit B inapplicability',async()=>{
 const {input}=nyEmpireChildFixture({year:2024,children:1,wages:6000});input.individual.taxableInterestCents=2400000;input.individual.investmentIncome=investmentFixture(24000,0);
 Object.assign(input.individual.dependents[0],{citizenship:'usResident'});Object.assign(input.individual.dependents[0].identifier,{type:'itin',validForEmployment:'no'});
 const energy=newEnergyCredits();Object.assign(energy.home,{street:'1 Synthetic Road',city:'Albany',state:'NY',zip:'12207'});for(const key of Object.keys(energy.review))energy.review[key]=true;energy.items=[{id:'solar-source',category:'solar',costCents:1000000,qmid:'',source:'Synthetic reviewed solar installation'}];input.individual.energyCredits=energy;
 const packet=await generateDraftPdf(input,{loadTemplate}),federal=packet.result,ny=federal.states.find(row=>row.state==='NY'),credit=ny.empireChildCredit;
 assert.equal(federal.dependents.ctcCount,0);assert.equal(federal.dependents.odcCount,1);assert.equal(federal.childCredits.nonrefundableCents,50000);assert.equal(federal.childCredits.creditLimitWorksheetA['4'],0);assert.equal(federal.summary.residentialCleanEnergyCreditCents,111900);
 assert.equal(credit.worksheets.aLine11.lines['9'],0);assert.equal(credit.lines['5'],100000);assert.equal(credit.amountCents,33000);assert.equal(ny.lines['63'],33000);assert.equal(ny.summary.paymentsCents,null,'separate dependent-care review remains unresolved');
 const original=pages(packet.bytes).find(page=>page.some(word=>word.text==='IT-213')&&page.some(word=>word.text==='(back)'));assert(original,'actual2024 IT213 back page');assert(at(original,1000,474,144));assert(at(original,330,474,312));
 const text=pdfText(packet.bytes,'-layout');assert.match(text,/IT213 worksheet aLine11 line 9: 0.00 USD/);assert.match(text,/IT213 line 10: 330.00 USD/);assert(packet.audit.some(row=>row.form==='f5695'));assert(packet.audit.some(row=>row.form==='nyit213'));await save('2024-itin-odc-solar-actual-packet',packet.bytes);
});
