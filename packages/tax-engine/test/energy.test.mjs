import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {energyCredits,newEnergyCredits} from '../energy-credits.mjs';
import {calculateReturn} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {reviewed,wage,business} from './fixtures.mjs';
const examples=JSON.parse(await readFile(new URL('./irs-energy-examples.json',import.meta.url),'utf8'));
export function energyFixture(costs){const value=newEnergyCredits();Object.assign(value.home,{street:'1 Example Street',city:'Hartford',state:'CT',zip:'06103'});for(const key of Object.keys(value.review))value.review[key]=true;value.panelEnabledTypes=['E'];value.items=costs.map(([category,dollars],index)=>({id:'synthetic-'+index,category,costCents:dollars*100,qmid:'A1B2',source:'Synthetic eligibility record'}));return value;}
for(const year of [2023,2024,2025])for(const example of examples.examples)test(`${year} IRS energy FAQ example ${example.id}`,()=>{
 const result=energyCredits(energyFixture(example.costs),{year,taxBeforeCreditsCents:1000000});assert.deepEqual(result.diagnostics,[]);assert.equal(result.creditCents,example.expectedCreditDollars*100);assert.equal(result.carryforwardCents,0);
});
test('home improvement has priority, is nonrefundable and never carries; clean energy carries even with zero liability',()=>{
 const value=energyFixture([['solar',10000],['heatPump',8000],['insulation',5000]]);value.carryforwardCents=50000;
 for(const [liability,improvements,clean,carry]of [[0,0,0,3500],[2000,2000,0,3500],[4000,3200,800,2700],[10000,3200,3500,0]]){
  const result=energyCredits(value,{year:2025,taxBeforeCreditsCents:liability*100});assert.equal(result.improvementCreditCents,improvements*100);assert.equal(result.cleanCreditCents,clean*100);assert.equal(result.carryforwardCents,carry*100);
 }
 const only=newEnergyCredits();only.carryforwardCents=42000;only.review.scope=true;only.review.carryforward=true;const result=energyCredits(only,{year:2025,taxBeforeCreditsCents:10000});assert.equal(result.cleanCreditCents,10000);assert.equal(result.carryforwardCents,32000);
});
test('unknown eligibility, address, QMID and other credit worksheets cannot produce a complete balance',()=>{
 const input=reviewed();input.individual.w2s=[wage('taxpayer',50000)];const value=energyFixture([['heatPump',8000]]);input.individual.energyCredits=value;
 value.items[0].qmid='';let result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,null);assert.equal(result.summary.refundCents,null);assert(result.diagnostics.some(item=>item.code==='ENERGY_QMID_REQUIRED'));
 input.year=2024;assert.equal(calculateReturn(input).summary.energyImprovementCreditCents,200000);input.year=2025;value.items[0].qmid='A1B2';
 value.review.property=false;assert.equal(calculateReturn(input).summary.totalTaxCents,null);value.review.property=true;
 value.home.street='';assert.equal(calculateReturn(input).summary.totalTaxCents,null);value.home.street='1 Example Street';
 input.features=['dependents-credits'];assert.equal(calculateReturn(input).summary.energyImprovementCreditCents,null);input.features=[];
 value.review.scope=false;assert.equal(calculateReturn(input).summary.totalTaxCents,null);value.review.scope=true;
 value.items.push({...value.items[0]});assert.equal(calculateReturn(input).calculationAvailable,false);
});
test('annual source validation, battery and panel requirements preserve records without assuming eligibility',()=>{
 const value=energyFixture([['battery',5000],['panel',3000]]);value.review.battery=false;value.panelEnabledTypes=[];
 let result=energyCredits(value,{year:2025,taxBeforeCreditsCents:1000000});assert.equal(result.creditCents,null);assert(result.diagnostics.some(item=>item.code==='ENERGY_BATTERY_REVIEW'));assert(result.diagnostics.some(item=>item.code==='ENERGY_ENABLED_PROPERTY_REQUIRED'));
 value.items[0].costCents=-1;assert.throws(()=>energyCredits(value,{year:2025,taxBeforeCreditsCents:0}),/nonnegative/);
});
for(const year of [2023,2024,2025])test(`${year} energy credits flow through original Form 5695, Schedule 3 and Form 1040 PDF rows`,async()=>{
 const input=reviewed();input.year=year;input.individual.w2s=[wage('taxpayer',50000,5000)];input.individual.energyCredits=energyFixture([['solar',10000],['door',1020],['door',920],['door',800],['window',600],['waterHeater',2100],['waterHeater',400],['panel',400],['heatPump',8000]]);
 input.individual.energyCredits.items.find(item=>item.category==='waterHeater'&&item.costCents===40000).qmid='C3D4';
 const result=calculateReturn(input),main=result.forms.find(form=>form.form==='f1040'),energy=result.forms.find(form=>form.form==='f5695'),schedule=result.forms.find(form=>form.form==='f1040s3');
 assert.equal(result.summary.energyImprovementCreditCents,320000);assert.equal(main.lines['20'],main.lines['16']);assert.equal(main.lines['22'],0);assert.equal(main.lines['24'],0);assert.equal(main.lines['34'],500000);assert.equal(schedule.lines['8'],main.lines['20']);assert.equal(energy.lines['16'],300000-result.summary.residentialCleanEnergyCreditCents);
 const {bytes,audit}=await generateDraftPdf(input,{loadTemplate:(id,y)=>readFile(new URL(`../forms/${y}/${id}.pdf`,import.meta.url))});
 const xml=execFileSync('pdftotext',['-bbox-layout','-','-'],{input:bytes,maxBuffer:4*1024*1024}).toString(),pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
 const amount=(form,offset,value,top)=>{const page=pages[audit.find(item=>item.form===form).firstPage-1+offset][1];assert([...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].some(([,attrs,text])=>text===String(value)&&Number(attrs.match(/xMin="([^"]+)"/)[1])>=500&&Math.abs((Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2-top)<8),`${form}: printed ${value} on the source row at ${top}`);};
 amount('f5695',year===2025?3:2,3200,year===2025?444:330);amount('f5695',0,result.summary.residentialCleanEnergyCreditCents/100,year===2023?714:year===2024?726:702);amount('f1040s3',0,3200,year===2023?240:186);amount('f1040s3',0,main.lines['20']/100,year===2023?576:year===2024?402:414);
 if(year===2025){assert(audit.find(item=>item.form==='f5695').filled.some(field=>field.reference==='name:topmostSubform[0].Page3[0].f3_30[0]'));assert(audit.find(item=>item.form==='f5695').filled.some(field=>field.reference?.includes('Ln23aii')));}
 if(year===2025){const page=pages[audit.find(item=>item.form==='f5695').firstPage+1][1],words=[...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)];const at=(left,right,top)=>words.filter(([,attrs])=>{const x=Number(attrs.match(/xMin="([^"]+)"/)[1]),y=(Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2;return x>=left&&x<right&&Math.abs(y-top)<8;}).map(([,attrs,text])=>text).join('');assert.equal(at(345,383,346),'2100');assert.equal(at(64,130,370),'C3D4');}
 assert.equal(result.filingReady,false);
});
test('nonrefundable energy credits do not offset self-employment or additional Medicare tax',()=>{
 const input=reviewed();input.individual.businesses=[business()];input.individual.energyCredits=energyFixture([['solar',100000]]);const result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,result.summary.selfEmploymentTaxCents);assert(result.summary.cleanEnergyCarryforwardCents>0);
 input.individual.businesses=[];input.individual.w2s=[{...wage('taxpayer',220000),medicareTaxWithheldCents:337000}];input.individual.energyCredits.items[0].costCents=100000000;assert.equal(calculateReturn(input).summary.totalTaxCents,18000);
});
test('2025 displayed item rows sum to their category totals after whole-dollar rounding; extra QMID items remain in the statement',async()=>{
 const value=energyFixture([['waterHeater',100.50],['waterHeater',100.50],['window',100.50],['window',100.50],['window',100.50],['window',100.50],['window',300.99]]);value.items[5].qmid='Z9Z9';
 const result=energyCredits(value,{year:2025,taxBeforeCreditsCents:1000000});assert.equal(result.form.lines['23a'],20200);assert.equal(result.form.lines['20a'],60400);assert.equal(result.form.lines['20b'],10100);assert.equal(result.form.lines['20c'],70500);assert.equal(result.form.energy.groups.window[0].costCents,30099);
 const input=reviewed();input.individual.energyCredits=value;const {bytes}=await generateDraftPdf(input,{loadTemplate:(id,y)=>readFile(new URL(`../forms/${y}/${id}.pdf`,import.meta.url))});const text=execFileSync('pdftotext',['-raw','-','-'],{input:bytes,maxBuffer:4*1024*1024}).toString();assert.match(text,/Z9Z9/);assert.match(text,/300\.99 USD/);
});
