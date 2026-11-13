// Reproducible local evidence and explicit gaps. Never issues an approval,
// changes filingReady, contacts an agency or includes customer information.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {additionalMedicare} from '../../packages/tax-engine/additional-medicare.mjs';
import {energyCredits,newEnergyCredits} from '../../packages/tax-engine/energy-credits.mjs';
import {householdEmployment,newHouseholdEmployer,newHouseholdEmployee} from '../../packages/tax-engine/household-employment.mjs';
import {newHouseholdFuta,newHouseholdFutaRow} from '../../packages/tax-engine/household-futa.mjs';
import {newInvestmentIncome,investmentIncome,netInvestmentTax} from '../../packages/tax-engine/investment-income.mjs';
import {calculationYears,requestedTaxYears} from '../../packages/tax-engine/index.mjs';
import {pdfYearPack} from '../../packages/tax-engine/form-years.mjs';
import {federal2026Availability} from '../../packages/tax-engine/annual-2026.mjs';
import {capitalIncome,capitalLossCarryforward,newCapitalIncome} from '../../packages/tax-engine/capital-income.mjs';
import {qualifiedCapitalTax} from '../../packages/tax-engine/capital-tax.mjs';

const engine=fileURLToPath(new URL('../../packages/tax-engine/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function checkedSource(file,expected){
  const bytes=await readFile(file);
  if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw new Error(`Source bytes differ from the reviewed pin: ${path.basename(file)}`);
  return {sha256:expected.sha256,bytes:bytes.length};
}
export async function qualificationReport({sourcesDirectory=null}={}){
  const catalog=JSON.parse(await readFile(path.join(engine,'qualification/ats-scenarios.json'),'utf8'));
  const examples=JSON.parse(await readFile(path.join(engine,'test/irs-8959-examples.json'),'utf8'));
  const energyExamples=JSON.parse(await readFile(path.join(engine,'test/irs-energy-examples.json'),'utf8'));
  const householdExamples=JSON.parse(await readFile(path.join(engine,'test/irs-household-examples.json'),'utf8'));
  const householdFutaExamples=JSON.parse(await readFile(path.join(engine,'test/irs-household-futa-examples.json'),'utf8'));
  const investmentExamples=JSON.parse(await readFile(path.join(engine,'test/investment-reference.json'),'utf8'));
  const capitalExamples=JSON.parse(await readFile(path.join(engine,'test/capital-reference.json'),'utf8'));
  const sourceEvidence=[];
  if(sourcesDirectory){
    for(const scenario of catalog.selectedScenarios)sourceEvidence.push({id:scenario.id,...await checkedSource(path.join(sourcesDirectory,scenario.sourceFile),scenario)});
    sourceEvidence.push({id:'8959-instructions',...await checkedSource(path.join(sourcesDirectory,'i8959--2025.pdf'),examples.source)});
    sourceEvidence.push({id:'energy-faq-examples',...await checkedSource(path.join(sourcesDirectory,'irs-energy-examples.html'),energyExamples.source)});
    const checked=new Map();
    for(const source of [...householdExamples.sources,...householdExamples.annualInstructions,...householdFutaExamples.annualInstructions,...investmentExamples.annualInstructions,...capitalExamples.annualInstructions]){
      if(checked.has(source.url)){const previous=checked.get(source.url);if(previous.bytes!==source.bytes||previous.sha256!==source.sha256)throw new Error('Instruction fixtures disagree about a reviewed source pin.');continue;}
      const filename=new URL(source.url).pathname.split('/').pop();sourceEvidence.push({id:filename,...await checkedSource(path.join(sourcesDirectory,filename),source)});checked.set(source.url,source);
    }
  }
  const instructionChecks=examples.examples.map(example=>{
    const result=additionalMedicare({filingStatus:example.filingStatus,w2s:example.medicareWagesDollars.map(wages=>({medicareWagesCents:wages*100,medicareTaxWithheldCents:wages*1.45})),selfEmploymentEarnings:example.selfEmploymentIncomeDollars.map(value=>value*100)});
    const actual={required:result.required,taxCents:result.taxCents,wageSubjectCents:result.form?.lines['6']??0,selfEmploymentSubjectCents:result.form?.lines['12']??0};
    const expected={required:example.required,taxCents:example.expectedAdditionalTaxDollars*100,wageSubjectCents:example.expectedWageSubjectDollars*100,selfEmploymentSubjectCents:example.expectedSelfEmploymentSubjectDollars*100};
    return {id:example.id,pass:JSON.stringify(actual)===JSON.stringify(expected),actual,expected};
  });
  const energyInstructionChecks=[2023,2024,2025].flatMap(year=>energyExamples.examples.map(example=>{
    const value=newEnergyCredits();Object.assign(value.home,{street:'1 Example Street',city:'Hartford',state:'CT',zip:'06103'});for(const key of Object.keys(value.review))value.review[key]=true;
    value.items=example.costs.map(([category,dollars],index)=>({id:'synthetic-'+index,category,costCents:dollars*100,qmid:'A1B2',source:'Synthetic eligibility record for arithmetic verification'}));
    const result=energyCredits(value,{year,taxBeforeCreditsCents:1000000});return {year,id:example.id,pass:result.creditCents===example.expectedCreditDollars*100&&result.diagnostics.length===0,actualCreditCents:result.creditCents,expectedCreditCents:example.expectedCreditDollars*100};
  }));
  const householdInstructionChecks=householdExamples.examples.map(example=>{
    const value=newHouseholdEmployer();value.ein='00-0123456';value.priorYearFutaQuartersCents=[0,0,0,0];for(const key of Object.keys(value.review))value.review[key]=true;
    const worker=newHouseholdEmployee('synthetic-published-example');Object.assign(worker,{name:'Synthetic Worker',quartersCents:[63000,91000,91000,91000],ficaTreatment:'ordinary',futaTreatment:'ordinary'});value.employees=[worker];
    const result=householdEmployment([value],{year:example.year,filingStatus:'single'}),lines=result.forms[0].lines;
    const actual={socialSecurityTaxCents:lines[example.year===2023?'2c':'2'],medicareTaxCents:lines['4'],partITaxCents:result.taxCents},expected={socialSecurityTaxCents:example.expectedSocialSecurityTaxCents,medicareTaxCents:example.expectedMedicareTaxCents,partITaxCents:example.expectedPartITaxCents};
    return {year:example.year,pass:JSON.stringify(actual)===JSON.stringify(expected)&&result.diagnostics.length===0,actual,expected};
  });
  const householdFutaInput=(year,state)=>{
    const value=newHouseholdEmployer();value.ein='00-0123456';value.priorYearFutaQuartersCents=[0,0,0,0];for(const key of Object.keys(value.review))value.review[key]=true;
    value.employees=[{...newHouseholdEmployee('synthetic-worker'),name:'Synthetic Worker',quartersCents:[1000000,0,0,0],ficaTreatment:'ordinary',futaTreatment:'ordinary'}];
    Object.assign(value.unemployment,{state,onlyOneState:true,paidOnTime:true,allFutaWagesStateTaxable:true,sectionB:{...newHouseholdFuta(),reviewed:true,allocationReviewed:true,rows:[{...newHouseholdFutaRow(),state,taxableWagesCents:1000000,rateStatus:'assigned',experienceRate:'2.7',periodStart:`${year}-01-01`,periodEnd:`${year}-12-31`,paidOnTimeCents:27000,paidLateCents:0}],allocations:[{employeeId:'synthetic-worker',state,wagesCents:700000}]}});
    return value;
  };
  const householdFutaDerivedChecks=householdFutaExamples.rates.flatMap(rates=>['CA','NY','VI','CT'].map(state=>{
    const result=householdEmployment([householdFutaInput(rates.year,state)],{year:rates.year,filingStatus:'single'}),form=result.forms[0];
    const actual={taxCents:result.taxCents,reductionCents:form.household.futaDetails.worksheet2?.['4']??0},expected={taxCents:157200+70*rates[state],reductionCents:70*rates[state]};
    return {year:rates.year,id:'futa-credit-reduction-'+state,kind:'derived-synthetic-instruction-vector',pass:JSON.stringify(actual)===JSON.stringify(expected)&&!result.diagnostics.length,actual,expected};
  }));
  const late=householdFutaExamples.lateExample,lateInput=householdFutaInput(late.year,late.state);lateInput.unemployment.paidOnTime=false;
  Object.assign(lateInput.unemployment.sectionB.rows[0],{taxableWagesCents:late.stateWagesCents,experienceRate:late.experienceRate,paidOnTimeCents:late.paidOnTimeCents,paidLateCents:late.paidLateCents});
  const lateResult=householdEmployment([lateInput],{year:late.year,filingStatus:'single'}),lateDetails=lateResult.forms[0].household.futaDetails;
  const lateActual={taxCents:lateResult.taxCents,worksheet1:lateDetails.worksheet1,worksheet2:Object.fromEntries(Object.keys(late.worksheet2).map(key=>[key,lateDetails.worksheet2?.[key]??null]))},lateExpected={taxCents:late.householdTaxCents,worksheet1:late.worksheet1,worksheet2:late.worksheet2};
  householdFutaDerivedChecks.push({year:late.year,id:'futa-late-contributions-then-reduction',kind:'derived-synthetic-instruction-vector',pass:JSON.stringify(lateActual)===JSON.stringify(lateExpected)&&!lateResult.diagnostics.length,actual:lateActual,expected:lateExpected});
  const investmentDerivedChecks=[2023,2024,2025].flatMap(year=>investmentExamples.cases.map((example,index)=>{
    const value=newInvestmentIncome();value.foreignAccount='no';value.foreignTrust='no';for(const key of Object.keys(value.review))value.review[key]=true;
    if(example.interestDollars)value.interestPayers=[{id:'synthetic-interest',payer:'Synthetic Bank',amountCents:example.interestDollars*100,source:'Synthetic ordinary-income vector'}];
    if(example.dividendsDollars)value.dividendPayers=[{id:'synthetic-dividends',payer:'Synthetic Fund',amountCents:example.dividendsDollars*100,source:'Synthetic nonqualified-income vector'}];
    const income=investmentIncome(value,{year,filingStatus:example.status,taxableInterestCents:0,ordinaryDividendsCents:0});
    const niit=netInvestmentTax(value,{year,filingStatus:example.status,adjustedGrossIncomeCents:example.agiDollars*100,taxableInterestCents:income.taxableInterestCents,ordinaryDividendsCents:income.ordinaryDividendsCents});
    const actual={scheduleB:income.forms[0].lines,niitCents:niit.taxCents,thresholdCents:niit.form?.lines['14']??null};
    const expected={scheduleB:{'2':example.interestDollars*100,'3':0,'4':example.interestDollars*100,'6':example.dividendsDollars*100},niitCents:example.taxDollars*100,thresholdCents:example.agiDollars>example.thresholdDollars?example.thresholdDollars*100:null};
    return {year,id:'ordinary-investment-'+index,kind:'derived-synthetic-instruction-vector',pass:JSON.stringify(actual)===JSON.stringify(expected)&&!income.diagnostics.length&&!niit.diagnostics.length,actual,expected};
  }));
  const capitalValue=()=>{const value=newCapitalIncome();for(const key of Object.keys(value.review))value.review[key]=true;return value;};
  const capitalTrade=(year,category,proceeds,basis,adjustments=[])=>({id:'synthetic-'+category,description:'Synthetic example security',category,dateAcquired:`${category<'D'?year:year-2}-01-01`,dateSold:`${year}-06-01`,proceedsCents:proceeds*100,basisCents:basis*100,adjustments,source:'Published arithmetic or labeled synthetic vector'});
  const capitalPublishedChecks=[2023,2024,2025].flatMap(year=>capitalExamples.published8949.map((row,index)=>{
    const value=capitalValue();value.trades=[capitalTrade(year,'A',row.proceeds,row.basis,row.code?[{code:row.code,amountCents:row.adjustment*100,explanation:row.example}]:[])];const result=capitalIncome(value,{year,filingStatus:'single'}),actual=result.shortTermCents,expected=row.gain*100;
    return {year,id:'8949-column-h-example-'+(index+1),kind:index===2?'published-arithmetic-synthetic-adjustment':'published-instruction-example',pass:actual===expected&&!result.diagnostics.length,actualGainCents:actual,expectedGainCents:expected};
  }));
  for(const year of [2023,2024,2025]){
    const row=capitalExamples.publishedCarryover,value=capitalValue();value.trades=[capitalTrade(year,'D',0,row.netLoss)];const result=capitalIncome(value,{year,filingStatus:row.status}),carry=capitalLossCarryforward(result,{taxableIncomeBeforeFloorCents:row.taxable*100}),actual={deductionCents:result.lossDeductionCents,carryforwardCents:carry.shortTermLossCents+carry.longTermLossCents},expected={deductionCents:row.deduction*100,carryforwardCents:row.nextTotal*100};
    capitalPublishedChecks.push({year,id:'pub550-bob-shelly-carryover',kind:'published-instruction-example',pass:JSON.stringify(actual)===JSON.stringify(expected)&&!result.diagnostics.length,actual,expected});
  }
  const capitalDerivedChecks=capitalExamples.syntheticPreferential.map(row=>{
    const actual=qualifiedCapitalTax({year:row.year,filingStatus:'single',taxableIncomeCents:row.taxable*100,qualifiedDividendsCents:row.preferential*100}).taxCents,expected=row.tax*100;
    return {year:row.year,id:`qualified-tax-${row.taxable}-${row.preferential}`,kind:'derived-synthetic-instruction-vector',pass:actual===expected,actualTaxCents:actual,expectedTaxCents:expected};
  });
  for(const year of [2023,2024,2025])for(const [index,row]of capitalExamples.syntheticLosses.entries()){
    const value=capitalValue();value.trades=[capitalTrade(year,'A',Math.max(0,row.short),Math.max(0,-row.short)),capitalTrade(year,'D',Math.max(0,row.long),Math.max(0,-row.long))];const result=capitalIncome(value,{year,filingStatus:row.status??'single'}),carry=capitalLossCarryforward(result,{taxableIncomeBeforeFloorCents:row.taxable*100}),actual={shortCents:carry.shortTermLossCents,longCents:carry.longTermLossCents},expected={shortCents:row.nextShort*100,longCents:row.nextLong*100};
    capitalDerivedChecks.push({year,id:'capital-loss-character-'+index,kind:'derived-synthetic-instruction-vector',pass:JSON.stringify(actual)===JSON.stringify(expected)&&!result.diagnostics.length,actual,expected});
  }
  const installedPacks=[];
  for(const year of calculationYears){
    const pack=pdfYearPack(year),forms=[];
    for(const form of pack.templates){
      const bytes=await checkedSource(path.join(engine,`forms/${year}/${form.id}.pdf`),form);
      forms.push({id:form.id,...bytes,mappedLines:Object.keys(pack.lineMaps[form.id]??{}).length,coverage:'partial',filingApproved:false});
    }
    installedPacks.push({year,forms});
  }
  const scenarios=catalog.selectedScenarios.map(scenario=>{
    const installed=installedPacks.find(pack=>pack.year===scenario.taxYear)?.forms??[];
    return {id:scenario.id,source:scenario.url,sourceSha256:scenario.sha256,sourceBytesVerified:sourceEvidence.some(item=>item.id===scenario.id),status:'blocked',fullScenarioExecuted:false,
      requirements:scenario.requiredForms.map(id=>({id,status:installed.some(form=>form.id===id)?'partial-calculation-and-draft-pdf':id==='w2'?'partial-source-input-no-mef-xml':'not-implemented'})),
      missingBoundary:'Complete required forms/disclosures/attachments, scenario import and expected-output checks, official XML validation, transport and agency acceptance.'};
  });
  const sourceFiles=[];
  async function inventory(relative=''){
    for(const entry of await readdir(path.join(engine,relative),{withFileTypes:true})){
      if(['node_modules','dist'].includes(entry.name))continue;
      const name=path.posix.join(relative,entry.name);
      if(entry.isDirectory())await inventory(name);
      else if(entry.isFile())sourceFiles.push({path:name,sha256:hash(await readFile(path.join(engine,name)))});
      else throw new Error('Unexpected non-file in the tax-engine source inventory.');
    }
  }
  await inventory();sourceFiles.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  return {version:1,type:'shuug-local-qualification-evidence',createdAt:new Date().toISOString(),readiness:'prototype',sourceInventorySha256:hash(JSON.stringify(sourceFiles)),sourceFiles,
    internalChecksPassed:[...instructionChecks,...energyInstructionChecks,...householdInstructionChecks,...householdFutaDerivedChecks,...investmentDerivedChecks,...capitalPublishedChecks,...capitalDerivedChecks].every(item=>item.pass),instructionChecks,energyInstructionChecks,householdInstructionChecks,householdFutaDerivedChecks,investmentDerivedChecks,capitalPublishedChecks,capitalDerivedChecks,sourceEvidence,installedPacks,scenarios,
    requestedYears:requestedTaxYears,unimplementedCalculationYears:requestedTaxYears.filter(year=>!calculationYears.includes(year)),partialCalculationYears:[2026],federal2026Availability,stateCalculationPacks:[{state:'CT',years:[2023,2024,2025],residency:'resident',coverage:'partial',sourceDraftYears:[2023],filingApproved:false}],
    agencySubmissionAttempted:false,agencyApproval:false,releaseReady:false,externalSteps:catalog.requiredExternalSteps,references:catalog.references,
    limits:['Instruction examples are not ATS scenario execution.','FUTA, NIIT and capital derived vectors are synthetic cases; published capital examples are labeled separately, including the generic arithmetic example with a synthetic adjustment interpretation.','Pinned blank forms and mapped rows do not establish complete form coverage.','Selected scenarios do not determine the full required IRS test plan.','No real customer, physical custody, installed service or independent review is exercised.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const options={},args=process.argv.slice(2);
    for(let i=0;i<args.length;i+=2){if(!['--sources','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(options,args[i]))throw new Error('Usage: node scripts/tax/qualification-report.mjs [--sources REVIEWED_PDFS_DIRECTORY] [--out NEW_REPORT_JSON]');options[args[i]]=path.resolve(args[i+1]);}
    const report=await qualificationReport({sourcesDirectory:options['--sources']}),text=JSON.stringify(report,null,2)+'\n';
    if(options['--out'])await writeFile(options['--out'],text,{flag:'wx',mode:0o600});else process.stdout.write(text);
    // Successful local execution is deliberately distinct from release readiness.
    if(!report.internalChecksPassed)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
