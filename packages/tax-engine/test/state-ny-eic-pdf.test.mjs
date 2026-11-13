import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {renderNYEicForm,nyEicPdfYearPack} from '../state-ny-eic-pdf.mjs';
import {calculateIndividual} from '../individual.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {eicFixture} from './eic-fixtures.mjs';
import {nyEicFixture,nyNoncustodialFixture,computeNYEicFixture} from './state-ny-eic-fixtures.mjs';
import {pdfText} from './pdf-text.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
const pages=bytes=>[...pdfText(bytes).matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(match=>[...match[1].matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].map(([,attributes,text])=>({text,...Object.fromEntries([...attributes.matchAll(/(xMin|yMin|xMax|yMax)="([^"]+)"/g)].map(([,key,value])=>[key,Number(value)]))})));
const at=(words,text,x,top,width=92,height=13)=>words.some(word=>word.text===String(text)&&word.xMin>=x&&word.xMax<=x+width&&(word.yMin+word.yMax)/2>=top&&(word.yMin+word.yMax)/2<=top+height);
const monetary=rows=>Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,value*100]));
async function save(name,bytes){if(process.env.SHUUG_NY_EIC_PDF_EVIDENCE)await writeFile(`${process.env.SHUUG_NY_EIC_PDF_EVIDENCE}/${name}.pdf`,bytes);}
function geometryFixture(year,form){
 const input=eicFixture({year,children:3});const federal=calculateIndividual(input),children=structuredClone(federal.earnedIncomeCredit.eligibility.attachmentChildren);
 children[0].firstName='MappedChild';children[0].middleInitial='Q';children[0].lastName='MappedFamily';children[0].usHomeMonths=7;
 children[1].age=22;children[1].dateOfBirth=`${year-22}-06-15`;children[1].studentYounger=true;children[1].younger=true;
 children[2].age=35;children[2].dateOfBirth='1990-06-15';children[2].studentYounger=false;children[2].disabled=true;children[2].younger=true;
 const flags=form==='nyit215'?{'1':true,'2':false,'3':false,'4':true,'5':false}:Object.fromEntries([1,2,3,4,5,6,7,8,9,10,11,12,19,20,26,27,33,34,44].map(n=>[n,[1,2,3,4,5,6,7,19,26,33,34,44].includes(n)]));
 const lines=form==='nyit215'?monetary({'6':33030,'7':50,'8':-500,'9':33555,'10':6498,'12':1949,'13':100,'14':20,'15':20,'16':1929,'27':1290}):monetary({'13':17000,'14':500,'15':1000,'16':15500,'17':18000,'18':3000,'21':2800,'22':2800,'24':560,'25':400,'28':300,'29':300,'31':750,'32':750,'35':2000,'37':600,'38a':100,'38b':20,'38c':10,'38d':30,'38e':70,'38':70,'39':70,'40':50,'41':50,'42':550,'43':750,'45':500});
 const eic={flags:{...flags,profit:false,loss:true},children,businessIdentifier:'001234567',worksheetB:{lines:monetary({'1':130,'2':20,'3':10,'4':30,'5':100})},noncustodial:{children:[{id:'nc-child',firstName:'OutsideHome',middleInitial:'R',lastName:'OtherFamily',taxId:'009876543',dateOfBirth:`${year-10}-04-12`,relationship:'child'}],businessIncomeCents:-100000}};
 return {input,item:{form,state:'NY',copyId:form==='nyit215'?'NY-EIC':'NY-noncustodial-EIC',lines,eic}};
}

for(const year of [2023,2024,2025])test(`${year} IT215 original prints money, WorksheetB, source children and actual numeric-question mappings`,async()=>{
 const {input,item}=geometryFixture(year,'nyit215'),rendered=await renderNYEicForm(input,item,{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes),words=pages(rendered.bytes);
 assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getForm().getFields().length,0);
 for(const [value,top]of [[33030,476],[50,488],[-500,500],[33555,524],[6498,536],[1949,560],[20,608],[1929,620]])assert(at(words[0],value,486,top,79,12),`${year}/${value}/${top}`);
 assert(at(words[1],1290,486,374,79,12));assert(at(words[1],130,486,458,79,12));assert(at(words[1],100,486,506,79,12));
 assert(at(words[0],'MappedChild',72,247,121,13));assert(at(words[0],'MappedFamily',210,247,205,13));assert(at(words[0],7,123,271,22,13));assert(at(words[0],item.eic.children[0].taxId.replaceAll('-',''),270,271,97,13));
 const flags=rendered.audit.fields.filter(row=>row.checkbox);for(const [name,choice]of [['Line 1','Yes'],['Line 1a','No'],['Line 2','No'],['Line 3','Yes'],['Line 5','No']])assert(flags.some(row=>row.checkbox===name&&row.choice===choice));
 assert(flags.some(row=>row.checkbox==='ln34student2'));assert(flags.some(row=>row.checkbox==='ln34disability3'));assert(!flags.some(row=>row.checkbox==='ln34student1'));
 assert.equal(nyEicPdfYearPack(year).templates.find(row=>row.id==='nyit215').fieldCount,67);assert(!JSON.stringify(rendered.audit).includes('MappedChild'));
 await save(`${year}-it215-filled`,rendered.bytes);
});

for(const year of [2023,2024,2025])test(`${year} IT209 original separates noncustodial and federal children; native reverse-order boxes and profit-loss choice`,async()=>{
 const {input,item}=geometryFixture(year,'nyit209'),rendered=await renderNYEicForm(input,item,{loadTemplate}),pdf=await PDFDocument.load(rendered.bytes),words=pages(rendered.bytes);
 assert.equal(pdf.getPageCount(),4);assert.equal(pdf.getForm().getFields().length,0);
 assert(at(words[0],'OutsideHome',36,384,97,13));assert(at(words[0],'OtherFamily',144,384,205,13));assert(at(words[0],'009876543',444,384,73,13));
 assert(at(words[1],17000,474,194,90,12));assert(at(words[1],1000,474,218,90,12));assert(at(words[1],560,474,530,90,12));assert(at(words[2],750,474,230,90,12));
 assert(at(words[2],'MappedChild',72,384,122,13));assert(at(words[2],2000,474,542,90,12));assert(at(words[2],600,474,590,90,12));
 for(const [value,top]of [[70,86],[70,194],[50,218],[50,242],[550,266],[750,290],[500,518]])assert(at(words[3],value,474,top,90,12),`${year}/${value}/${top}`);
 const flags=rendered.audit.fields.filter(row=>row.checkbox);assert(flags.some(row=>row.checkbox==='ln7'&&row.choice==='Yes'));assert(flags.some(row=>row.checkbox==='ln9'&&row.choice==='No'));assert(flags.some(row=>row.checkbox==='15'&&row.choice==='Loss'));
 assert.equal(rendered.audit.noncustodialPrintedCount,1);assert.equal(nyEicPdfYearPack(year).templates.find(row=>row.id==='nyit209').fieldCount,year===2023?105:104);
 assert(!pdfText(rendered.bytes,'-layout').includes('.30.30'));assert(!rendered.audit.fields.some(row=>row.reference==='ln36_dollars'));
 await save(`${year}-it209-filled`,rendered.bytes);
});

test('NY original pins, unsupported annual forms and unknown amount blanks are enforced',async()=>{
 const {input,item}=geometryFixture(2025,'nyit215');await assert.rejects(()=>renderNYEicForm(input,item,{loadTemplate:()=>new Uint8Array([1,2,3])}),/integrity/);await assert.rejects(()=>renderNYEicForm(input,item,{loadTemplate:id=>loadTemplate(id,2024)}),/integrity/);
 for(const year of [2026,2027]){assert.deepEqual(nyEicPdfYearPack(year).templates,[]);await assert.rejects(()=>renderNYEicForm({...input,year},item,{loadTemplate}),/annual/);}
 item.lines['16']=null;const rendered=await renderNYEicForm(input,item,{loadTemplate});assert(!rendered.audit.fields.some(row=>row.line==='16'));
 item.eic.children[0].usHomeMonths=undefined;await assert.rejects(()=>renderNYEicForm(input,item,{loadTemplate}),/months/);
});

test('NY federal child continuation preserves all100 records while original noncustodial line3 keeps up to3',async()=>{
 const {input,item}=geometryFixture(2025,'nyit209');item.eic.children=Array.from({length:100},(_,i)=>({...item.eic.children[0],id:`federal-${i}`,firstName:`Child${i+1}`}));item.eic.noncustodial.children=Array.from({length:4},(_,i)=>({...item.eic.noncustodial.children[0],id:`nc-${i}`,firstName:`Outside${i+1}`}));
 const rendered=await renderNYEicForm(input,item,{loadTemplate});assert.equal(rendered.audit.childCount,100);assert.equal(rendered.audit.noncustodialChildCount,4);assert.equal(rendered.audit.noncustodialPrintedCount,3);const text=pdfText(rendered.bytes,'-layout');assert.match(text,/Child 100: Child100/);assert.match(text,/Taxpayer SSN:/);assert.match(text,/Outside3/);assert(!text.includes('Outside4'));
});

test('actual annual ordinary and noncustodial source calculations reach central draft packets and correct IT201 payment lines',async()=>{
 for(const [year,ordinary,city,nc]of [[2023,13000,14600,71400],[2024,14500,15800,79500],[2025,15000,16200,83800]]){
  for(const [kind,fixture,expectedForm]of [['ordinary',nyEicFixture({year}),'nyit215'],['noncustodial',nyNoncustodialFixture({year,wages:24210}),'nyit209']]){
   const packet=await generateDraftPdf(fixture.input,{loadTemplate}),state=packet.result.states.find(row=>row.state==='NY');
   assert.equal(state.lines['65'],kind==='ordinary'?ordinary:0);assert.equal(state.lines['66'],kind==='noncustodial'?nc:0);assert.equal(state.lines['70'],kind==='ordinary'?city:0);
   assert(packet.audit.some(row=>row.form===expectedForm));assert(!packet.audit.some(row=>row.form===(expectedForm==='nyit215'?'nyit209':'nyit215')));assert.equal(packet.result.filingReady,false);
   assert(Number.isSafeInteger(state.summary.paymentsCents));assert(Number.isSafeInteger(state.summary.refundCents));assert(Number.isSafeInteger(state.summary.amountOwedCents));
   const text=pdfText(packet.bytes,'-layout');assert.match(text,/New York earned income credit calculations/);
   if(kind==='noncustodial'){assert.match(text,/synthetic-support-order/);assert.match(text,/current due 1200.00 USD/);assert.match(text,/IT209 income Worksheet A line 5: 24210.00 USD/);assert.match(text,/IT209 income Worksheet B line 4: 0.00 USD/);assert.equal(packet.result.summary.earnedIncomeCreditCents,0);}
   await save(`${year}-${kind}-actual-packet`,packet.bytes);
  }
 }
});

test('actual valid child group beyond3 becomes original NY continuation, while unsafe identity remains source-only',async()=>{
 const fixture=nyEicFixture({children:4,wages:33030,joint:true}),{result}=computeNYEicFixture(fixture);assert.equal(result.children.length,4);assert(result.forms.length,JSON.stringify(result.diagnostics));
 const rendered=await renderNYEicForm(fixture.input,result.forms[0],{loadTemplate});assert.equal(rendered.audit.childCount,4);assert.equal(rendered.audit.continuationPages,1);assert.match(pdfText(rendered.bytes,'-layout'),/Child 4:/);
 fixture.input.individual.dependents[0].dateOfBirth='';const unsafe=computeNYEicFixture(fixture).result;assert.equal(unsafe.stateCreditCents,null);assert.equal(unsafe.forms.length,0);
});
