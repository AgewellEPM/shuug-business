// Reproducible local evidence and explicit gaps. Never issues an approval,
// changes filingReady, contacts an agency or includes customer information.
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {additionalMedicare} from '../../packages/tax-engine/additional-medicare.mjs';
import {energyCredits,newEnergyCredits} from '../../packages/tax-engine/energy-credits.mjs';
import {householdEmployment,newHouseholdEmployer,newHouseholdEmployee} from '../../packages/tax-engine/household-employment.mjs';
import {newHouseholdFuta,newHouseholdFutaRow} from '../../packages/tax-engine/household-futa.mjs';
import {newInvestmentIncome,investmentIncome,netInvestmentTax} from '../../packages/tax-engine/investment-income.mjs';
import {calculateReturn,calculationYears,requestedTaxYears} from '../../packages/tax-engine/index.mjs';
import {pdfYearPack} from '../../packages/tax-engine/form-years.mjs';
import {federal2026Availability} from '../../packages/tax-engine/annual-2026.mjs';
import {federal2027Availability} from '../../packages/tax-engine/annual-2027.mjs';
import {capitalIncome,capitalLossCarryforward,newCapitalIncome} from '../../packages/tax-engine/capital-income.mjs';
import {qualifiedCapitalTax} from '../../packages/tax-engine/capital-tax.mjs';
import {retirementIncome,socialSecurityBenefits,newRetirementIncome,newRetirementDistribution,newSocialSecurityBenefit} from '../../packages/tax-engine/retirement-income.mjs';
import {standardDeduction,newIndividualEligibility} from '../../packages/tax-engine/standard-deduction.mjs';
import {ctRetirementAdjustments,ctPensionFactor,ctSocialSecurityAdjustment,newCTRetirement,newCTRetirementDistribution} from '../../packages/tax-engine/state-ct-retirement.mjs';
import {schedule1A} from '../../packages/tax-engine/schedule-1a.mjs';
import {eicAward} from '../../packages/tax-engine/eic-award.mjs';
import {ctEitcFixture} from '../../packages/tax-engine/test/state-ct-eitc-fixtures.mjs';
import {nyEicFixture,nyNoncustodialFixture} from '../../packages/tax-engine/test/state-ny-eic-fixtures.mjs';
import {nyEmpireChildFixture} from '../../packages/tax-engine/test/state-ny-child-fixtures.mjs';
import {schedule1AFixture,schedule1AContext,overtime,tip,vehicle,senior} from '../../packages/tax-engine/test/schedule-1a-fixtures.mjs';

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
  const retirementExamples=JSON.parse(await readFile(path.join(engine,'test/retirement-reference.json'),'utf8'));
  const standardExamples=JSON.parse(await readFile(path.join(engine,'test/standard-deduction-reference.json'),'utf8'));
  const nyFamilySources=JSON.parse(await readFile(path.join(engine,'data/ny-family-boundary-sources.json'),'utf8'));
  const nyChildFormSources=JSON.parse(await readFile(path.join(engine,'data/ny-child-form-sources.json'),'utf8'));
  const nyChildSources=JSON.parse(await readFile(path.join(engine,'data/state-ny-child-sources.json'),'utf8'));
  const nyEicSources=JSON.parse(await readFile(path.join(engine,'data/state-ny-eic-sources.json'),'utf8'));
  const ctEicSources=JSON.parse(await readFile(path.join(engine,'data/ct-eitc-sources.json'),'utf8'));
  const ctEicExamples=JSON.parse(await readFile(path.join(engine,'test/state-ct-eitc-reference.json'),'utf8'));
  const ctSources=JSON.parse(await readFile(path.join(engine,'data/ct-sources.json'),'utf8'));
  const schedule1AExamples=JSON.parse(await readFile(path.join(engine,'test/schedule-1a-reference.json'),'utf8'));
  const childSources=JSON.parse(await readFile(path.join(engine,'data/child-credits-sources.json'),'utf8'));
  const eicSources=JSON.parse(await readFile(path.join(engine,'data/earned-income-credit-sources.json'),'utf8'));
  const eicExamples=JSON.parse(await readFile(path.join(engine,'test/eic-award-reference.json'),'utf8'));
  const annual2027=JSON.parse(await readFile(path.join(engine,'data/2027-sources.json'),'utf8'));
  const sourceEvidence=[];
  if(sourcesDirectory){
    for(const scenario of catalog.selectedScenarios)sourceEvidence.push({id:scenario.id,...await checkedSource(path.join(sourcesDirectory,scenario.sourceFile),scenario)});
    sourceEvidence.push({id:'8959-instructions',...await checkedSource(path.join(sourcesDirectory,'i8959--2025.pdf'),examples.source)});
    sourceEvidence.push({id:'energy-faq-examples',...await checkedSource(path.join(sourcesDirectory,'irs-energy-examples.html'),energyExamples.source)});
    const checked=new Map();
    const ctInstructions=Object.entries(ctSources.sources).map(([year,source])=>({year:Number(year),url:source.instructions,sha256:source.instructionSha256,bytes:source.instructionBytes}));
    for(const source of [...householdExamples.sources,...householdExamples.annualInstructions,...householdFutaExamples.annualInstructions,...investmentExamples.annualInstructions,...capitalExamples.annualInstructions,...retirementExamples.annualInstructions,...standardExamples.annualInstructions,...ctInstructions,...schedule1AExamples.annualInstructions,...childSources.instructions,...eicSources.annualInstructions,...eicExamples.annualInstructions,...annual2027.sources,...ctEicSources.sources,...nyEicSources.instructions,...nyEicSources.formsSources,...nyFamilySources.sources,...nyChildFormSources.instructions,...nyChildFormSources.forms,...nyChildSources.instructions]){
      if(checked.has(source.url)){const previous=checked.get(source.url);if(previous.bytes!==source.bytes||previous.sha256!==source.sha256)throw new Error('Instruction fixtures disagree about a reviewed source pin.');continue;}
      const filename=source.file??new URL(source.url).pathname.split('/').pop();sourceEvidence.push({id:filename,...await checkedSource(path.join(sourcesDirectory,filename),source)});checked.set(source.url,source);
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
  const retirementPublishedChecks=[2023,2024,2025].map(year=>{
    const row=retirementExamples.publishedSupportedExample,value=newRetirementIncome(),pension=newRetirementDistribution(),benefit=newSocialSecurityBenefit();for(const key of Object.keys(value.review))value.review[key]=true;for(const key of Object.keys(pension.review))pension.review[key]=true;
    Object.assign(pension,{id:'synthetic-published-pension',payer:'Synthetic pension payer for published example',plan:'qualifiedPlan',grossCents:row.pension*100,reportedTaxableCents:row.pension*100,distributionCodes:'7',treatment:'fullyTaxable',source:'Annual Publication915 Example1, fully taxable pension'});Object.assign(benefit,{id:'synthetic-published-benefit',benefitsPaidCents:row.benefits*100,source:'Annual Publication915 Example1, SSA1099 net benefits'});value.distributions=[pension];value.benefits=[benefit];
    const result=retirementIncome(value,{year,filingStatus:row.status,otherIncomeCents:(row.wages+row.interest)*100,adjustmentsCents:0}),actual={pensionCents:result.lines['5b'],grossBenefitsCents:result.lines['6a'],taxableBenefitsCents:result.lines['6b']},expected={pensionCents:row.pension*100,grossBenefitsCents:row.benefits*100,taxableBenefitsCents:row.taxableBenefits*100};return {year,id:'pub915-example1',kind:'published-instruction-example',pass:JSON.stringify(actual)===JSON.stringify(expected)&&!result.diagnostics.length,actual,expected};
  });
  const retirementDerivedChecks=[2023,2024,2025].flatMap(year=>retirementExamples.syntheticBenefits.map((row,index)=>{
    const actual=socialSecurityBenefits({year,filingStatus:row.status,netBenefitsCents:row.benefits*100,otherIncomeCents:row.otherIncome*100,taxExemptInterestCents:row.exempt*100,adjustmentsCents:row.adjustments*100,livedApartAllYear:row.apart??'unknown'}).taxableCents,expected=row.taxable*100;
    return {year,id:'social-security-boundary-'+index,kind:'derived-synthetic-instruction-vector',pass:actual===expected,actualTaxableBenefitsCents:actual,expectedTaxableBenefitsCents:expected};
  }));
  const eligibility=()=>{const value=newIndividualEligibility();Object.assign(value,{residency:'fullYearCitizenOrResident',returnPeriod:'fullYear',deductionChoice:'standard',spouseItemizes:'no',source:'Synthetic status review for published arithmetic'});value.review={status:true,earnedIncome:true};for(const owner of ['taxpayer','spouse'])Object.assign(value[owner],{dateOfBirth:'1990-01-01',blind:'no',canBeClaimed:'no',deceased:'no',source:'Synthetic source for published eligibility facts',reviewed:true});value.spouse.noGrossIncome='no';value.spouse.filingReturn='yes';return value;};
  const standardPublishedChecks=[];
  for(const year of [2023,2024,2025]){
    const examples=standardExamples.publishedExamples[year];
    for(const [kind,expectedDollars]of Object.entries(examples.married)){const value=eligibility();if(kind==='oneBlind')value.taxpayer.blind='yes';if(kind==='bothAge65')for(const owner of ['taxpayer','spouse'])value[owner].dateOfBirth=`${year-70}-01-01`;const actual=standardDeduction(value,{year,filingStatus:'marriedJoint'});standardPublishedChecks.push({year,id:'pub501-married-'+kind,kind:'published-instruction-example',pass:actual.deductionCents===expectedDollars*100&&!actual.diagnostics.length,actualDeductionCents:actual.deductionCents,expectedDeductionCents:expectedDollars*100});}
    for(const [index,row]of examples.dependent.entries()){const value=eligibility();value.taxpayer.dateOfBirth=`${year-18}-01-15`;value.taxpayer.canBeClaimed='yes';value.taxpayer.blind=row.blind?'yes':'no';const actual=standardDeduction(value,{year,filingStatus:row.filingStatus,wagesCents:row.wagesDollars*100,businessProfitCents:(row.businessDollars??0)*100,incomeKnown:true});standardPublishedChecks.push({year,id:'pub501-dependent-'+(index+1),kind:'published-instruction-example',pass:actual.deductionCents===row.deductionDollars*100&&!actual.diagnostics.length,actualDeductionCents:actual.deductionCents,expectedDeductionCents:row.deductionDollars*100});}
  }
  const standardDerivedChecks=[2023,2024,2025,2026].flatMap(year=>[['01',true],['02',false]].map(([day,expectedAge65])=>{
    const value=eligibility();value.taxpayer.dateOfBirth=`${year-64}-01-${day}`;const actual=standardDeduction(value,{year,filingStatus:'single'}),base={2023:1385000,2024:1460000,2025:1575000,2026:1610000}[year],addition={2023:185000,2024:195000,2025:200000,2026:205000}[year],expected=base+(expectedAge65?addition:0);
    return {year,id:'age65-january-'+day,kind:'derived-synthetic-instruction-vector',pass:actual.deductionCents===expected&&!actual.diagnostics.length,actualDeductionCents:actual.deductionCents,expectedDeductionCents:expected};
  }));
  const ctRetirementInput=(year,distributionSpecs)=>{
    const value=newRetirementIncome();for(const key of Object.keys(value.review))value.review[key]=true;const state={retirement:{...newCTRetirement(),source:'Synthetic CT classification for source example',reviewed:true},adjustments:[]};
    for(const [index,[dollars,plan,kind,election='unknown']]of distributionSpecs.entries()){const row={...newRetirementDistribution(),id:'synthetic-ct-'+index,payer:'Synthetic retirement source',grossCents:dollars*100,plan,distributionCodes:'7',treatment:'fullyTaxable',source:'Synthetic source matching instruction vector'};for(const key of Object.keys(row.review))row.review[key]=true;value.distributions.push(row);if(kind)state.retirement.distributions.push({...newCTRetirementDistribution(row.id),kind,teacherElection:election,source:'Synthetic eligibility classification',reviewed:true});}
    const retirement=retirementIncome(value,{year,filingStatus:'single',otherIncomeCents:0,adjustmentsCents:0}),input={year,individual:{filingStatus:'single',retirementIncome:value}},federal={retirement,forms:[{form:'f1040',lines:retirement.lines}],adjustedGrossIncomeKnown:!retirement.incomeUnknown,summary:{adjustedGrossIncomeCents:retirement.taxableIncomeCents}};return ctRetirementAdjustments(input,state,federal);
  };
  const ctPublishedChecks=[2023,2024,2025].map(year=>{const result=ctRetirementInput(year,[[30000,'qualifiedPlan','teachers','pension'],[38000,'qualifiedPlan','ordinary']]),actual={teachersCents:result.lines['45'],pensionCents:result.lines['48b']},expected={teachersCents:0,pensionCents:6800000};return {year,id:'ct-anna-teacher-pension-election',kind:'published-instruction-example',pass:JSON.stringify(actual)===JSON.stringify(expected)&&result.known,actual,expected};});
  const ctDerivedChecks=[2023,2024,2025].flatMap(year=>{
    const ira=ctRetirementInput(year,[[20000,'traditionalIRA']]),expectedIRA={2023:500000,2024:1000000,2025:1500000}[year];
    const federal=socialSecurityBenefits({year,filingStatus:'single',netBenefitsCents:10000000,otherIncomeCents:4200000,taxExemptInterestCents:0,adjustmentsCents:0,livedApartAllYear:'unknown'}),social=ctSocialSecurityAdjustment({year,filingStatus:'single',agiCents:9580000,taxableCents:federal.taxableCents,worksheet:federal.worksheet,livedApartAllYear:'unknown'});
    const checks=[{year,id:'ct-ira-annual-share',kind:'derived-synthetic-instruction-vector',pass:ira.known&&ira.lines['48b']===expectedIRA,actualCents:ira.lines['48b'],expectedCents:expectedIRA},{year,id:'ct-social-security-high-agi-lesser-line-b',kind:'derived-synthetic-instruction-vector',pass:social?.F===3705000,actualCents:social?.F??null,expectedCents:3705000}];
    for(const status of ['single','marriedJoint']){const threshold=status==='single'?75000:100000,end=status==='single'?100000:150000;for(const [agi,expected]of [[threshold-1,10000],[threshold,year===2023?0:8500],[end,0]]){const actual=ctPensionFactor(year,status,agi*100);checks.push({year,id:`ct-pension-${status}-${agi}`,kind:'derived-synthetic-instruction-vector',pass:actual===expected,actualFactorBps:actual,expectedFactorBps:expected});}}
    return checks;
  });
  const schedule1APublishedChecks=schedule1AExamples.publishedOvertimeExamples.map((row,index)=>{
    const value=schedule1AFixture();value.overtime=[overtime(row.amountDollars,row.method)];const result=schedule1A(value,schedule1AContext()),actual=result.overtimeDeductionCents,expected=row.qualifiedDollars*100;
    return {year:row.year,id:'schedule1a-overtime-premium-example-'+(index+1),kind:'published-arithmetic-synthetic-eligibility',scope:'Published premium arithmetic only; wage-source links and eligibility review are synthetic, not a published whole return.',pass:actual===expected&&!result.diagnostics.length,actualDeductionCents:actual,expectedDeductionCents:expected};
  });
  const schedule1ADerivedChecks=schedule1AExamples.syntheticPhaseoutVectors.map((row,index)=>{
    const value=schedule1AFixture(),context=schedule1AContext();context.adjustedGrossIncomeCents=row.agiDollars*100;
    if(row.part==='tips')value.tips=[tip(row.amountDollars)];else if(row.part==='overtime')value.overtime=[overtime(row.amountDollars,'premiumStatement')];else if(row.part==='vehicle')value.vehicles=[vehicle(row.amountDollars)];else{value.seniors=[senior()];context.eligibility.taxpayer.dateOfBirth='1950-01-01';}
    const result=schedule1A(value,context),actual=result[{tips:'tipsDeductionCents',overtime:'overtimeDeductionCents',vehicle:'vehicleInterestDeductionCents',senior:'seniorDeductionCents'}[row.part]],expected=row.deductionDollars*100;
    return {year:2025,id:'schedule1a-phaseout-'+index,kind:'derived-synthetic-instruction-vector',pass:actual===expected&&!result.diagnostics.length,actualDeductionCents:actual,expectedDeductionCents:expected};
  });
  const eicPublishedChecks=eicExamples.publishedGreyExamples.map(example=>{
    // Published worksheet arithmetic; eligibility below is synthetic scaffolding,
    // not an IRS certification of this application's source-decision model.
    const input={year:example.year,individual:{filingStatus:example.filingStatus,w2s:[{owner:'taxpayer',wagesCents:example.taxpayerWagesDollars*100},{owner:'spouse',wagesCents:example.spouseWagesDollars*100}],businesses:[],earnedIncomeCredit:{award:{combatElections:{taxpayer:'exclude',spouse:'exclude'}}}}};
    const children=Array.from({length:example.validSsnChildren},(_,index)=>({id:`published-child-${index}`})),eligibility={known:true,eligible:true,allQualifyingChildren:children,creditChildren:children,diagnostics:[],filerFacts:{earnedSourcesKnown:true,investmentSourcesKnown:true,combatKnown:true,combatByOwner:{taxpayer:0,spouse:0}}};
    const result=eicAward(input,{eligibility,adjustedGrossIncomeCents:example.agiDollars*100,wageIncomeCents:example.earnedIncomeDollars*100,scheduleCProfitCents:0,halfSeTaxCents:0,investmentIncomeCents:example.taxableInterestDollars*100,investmentKnown:true,otherTreatments:false,businesses:[],seByOwner:[]});
    const actual=result.amountCents,expected=example.eicDollars*100;
    return {year:example.year,id:example.id,kind:'published-IRS-worksheet-arithmetic-with-synthetic-eligibility-scaffolding',pass:actual===expected&&result.diagnostics.length===0,actualCreditCents:actual,expectedCreditCents:expected};
  });
  const ctEicDerivedChecks=ctEicExamples.derivedAnnual.map(example=>{
    const {input,ct}=ctEitcFixture({year:example.year});input.individual.taxableInterestCents=52500;ct.dependentDisclosure={source:'Synthetic Connecticut dependent disclosure for arithmetic verification',reviewed:true};
    const result=calculateReturn(input),state=result.states[0],actual={creditCents:state.lines['20a'],baseCents:state.earnedIncomeCredit.lines['10'],supplementCents:state.earnedIncomeCredit.lines['15a']??0},expected={creditCents:example.creditDollars*100,baseCents:example.baseDollars*100,supplementCents:example.supplementDollars*100};
    return {year:example.year,id:'ct-eitc-derived-'+example.year,kind:'derived-Connecticut-arithmetic-with-synthetic-residency-and-source-facts',pass:JSON.stringify(actual)===JSON.stringify(expected)&&state.dependentDisclosure.known&&state.summary.refundCents!==null,actual,expected};
  });
  const nyEicDerivedChecks=[2023,2024,2025].flatMap(year=>['ordinary','noncustodial','noncustodial-federal-zero'].map(scenario=>{
    const {input}=scenario==='ordinary'?nyEicFixture({year}):nyNoncustodialFixture({year,wages:scenario==='noncustodial'?10000:30000}),state=calculateReturn(input).states[0],actual=Object.fromEntries(['65','66','70'].map(line=>[line,state.lines[line]]));
    const expected=scenario==='ordinary'?{'65':({2023:13000,2024:14500,2025:15000})[year],'66':0,'70':({2023:14600,2024:15800,2025:16200})[year]}:{'65':0,'66':(scenario==='noncustodial'?{2023:145800,2024:158000,2025:162300}:{2023:52800,2024:60900,2025:65200})[year],'70':0};
    return {year,id:'ny-eic-derived-'+scenario+'-'+year,kind:'derived-New-York-arithmetic-with-synthetic-source-and-eligibility-facts',pass:JSON.stringify(actual)===JSON.stringify(expected)&&state.earnedIncomeCredit.known&&state.summary.refundCents!==null,actual,expected};
  }));
  const nyChildDerivedChecks=[2023,2024,2025].flatMap(year=>[30000,80000].map(wages=>{
    const {input}=nyEmpireChildFixture({year,children:1,wages,joint:false,locality:'none'}),ny=calculateReturn(input).states[0],actual={creditCents:ny.lines['63'],known:ny.empireChildCredit.known},expected={creditCents:wages===30000?33000:year===2025?24700:24800,known:true};
    return {year,id:`ny-child-derived-${year}-${wages}`,kind:'derived-New-York-child-credit-arithmetic-with-synthetic-source-and-eligibility-facts',pass:JSON.stringify(actual)===JSON.stringify(expected),actual,expected};
  }));
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
    internalChecksPassed:[...instructionChecks,...energyInstructionChecks,...householdInstructionChecks,...householdFutaDerivedChecks,...investmentDerivedChecks,...capitalPublishedChecks,...capitalDerivedChecks,...retirementPublishedChecks,...retirementDerivedChecks,...standardPublishedChecks,...standardDerivedChecks,...ctPublishedChecks,...ctDerivedChecks,...schedule1APublishedChecks,...schedule1ADerivedChecks,...eicPublishedChecks,...ctEicDerivedChecks,...nyEicDerivedChecks,...nyChildDerivedChecks].every(item=>item.pass),instructionChecks,energyInstructionChecks,householdInstructionChecks,householdFutaDerivedChecks,investmentDerivedChecks,capitalPublishedChecks,capitalDerivedChecks,retirementPublishedChecks,retirementDerivedChecks,standardPublishedChecks,standardDerivedChecks,ctPublishedChecks,ctDerivedChecks,schedule1APublishedChecks,schedule1ADerivedChecks,eicPublishedChecks,ctEicDerivedChecks,nyEicDerivedChecks,nyChildDerivedChecks,sourceEvidence,installedPacks,scenarios,
    requestedYears:requestedTaxYears,unimplementedCalculationYears:requestedTaxYears.filter(year=>!calculationYears.includes(year)),partialCalculationYears:[2026,2027],federal2026Availability,federal2027Availability,stateCalculationPacks:[{state:'NY',years:[2023,2024,2025],residency:'resident',coverage:'partial',sourceDraftYears:[],filingApproved:false},{state:'CT',years:[2023,2024,2025],residency:'resident',coverage:'partial',sourceDraftYears:[2023],filingApproved:false}],
    agencySubmissionAttempted:false,agencyApproval:false,releaseReady:false,externalSteps:catalog.requiredExternalSteps,references:catalog.references,
    limits:['Instruction examples are not ATS scenario execution.','FUTA, NIIT, capital, retirement, standard-deduction and Connecticut derived vectors are synthetic cases. Published capital/benefit/standard-deduction and CT Anna examples are labeled separately, including the generic capital arithmetic example with a synthetic adjustment interpretation.','2026–2027 calculations use published annual/statutory guidance, not final annual Forms 1040 or Tax Tables.','Pinned blank forms and mapped rows do not establish complete form coverage.','Selected scenarios do not determine the full required IRS test plan.','No real customer, physical custody, installed service or independent review is exercised.']};
}
const isMain=Boolean(process.argv[1])&&await realpath(path.resolve(process.argv[1])).then(file=>import.meta.url===pathToFileURL(file).href,()=>false);
if(isMain){
  try{
    const options={},args=process.argv.slice(2);
    for(let i=0;i<args.length;i+=2){if(!['--sources','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(options,args[i]))throw new Error('Usage: node scripts/tax/qualification-report.mjs [--sources REVIEWED_PDFS_DIRECTORY] [--out NEW_REPORT_JSON]');options[args[i]]=path.resolve(args[i+1]);}
    const report=await qualificationReport({sourcesDirectory:options['--sources']}),text=JSON.stringify(report,null,2)+'\n';
    if(options['--out'])await writeFile(options['--out'],text,{flag:'wx',mode:0o600});else process.stdout.write(text);
    // Successful local execution is deliberately distinct from release readiness.
    if(!report.internalChecksPassed)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
