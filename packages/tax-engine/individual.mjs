import {earnedIncomeCredit} from './earned-income-credit.mjs';
import {calculateDependents} from './dependents.mjs';
import {childCreditReserve,calculateChildCredits} from './child-credits.mjs';
import {schedule1A} from './schedule-1a.mjs';
import {standardDeduction} from './standard-deduction.mjs';
import {investmentIncome,netInvestmentTax} from './investment-income.mjs';
import {capitalIncome,capitalLossCarryforward} from './capital-income.mjs';
import {qualifiedCapitalTax} from './capital-tax.mjs';
import {retirementIncome} from './retirement-income.mjs';
import {qualifiedBusinessDeduction2026} from './annual-2026.mjs';
import {qualifiedBusinessDeduction2027} from './annual-2027.mjs';
import {additionalMedicare} from './additional-medicare.mjs';
import {householdEmployment} from './household-employment.mjs';
import {energyCredits} from './energy-credits.mjs';
import { strictObject, list, text, amountFields, diagnostic } from './model.mjs';
import { sumMoney, wholeDollars as R, wholeRatio as P } from './money.mjs';
import {federalYearRules} from './federal-years.mjs';
import { scheduleC } from './schedule-c.mjs';

// State wage supplements can reveal missing federal income or additional-tax
// treatments. Dependency and age conflicts are reconciled by their own modules.
function stateFederalCoverage(input,diagnostics){
  let creditsUnknown=false,incomeUnknown=false,additionalTaxUnknown=false,wageRoutingUnknown=false;
  for(const [index,state]of (Array.isArray(input.individual.stateReturns)?input.individual.stateReturns:[]).entries()){
    if(state?.state!=='NY')continue;const path=`individual.stateReturns.${index}`;
    for(const [position,wage]of (Array.isArray(state.wageRecords)?state.wageRecords:[]).entries()){
      const codes=(Array.isArray(wage.box12)?wage.box12:[]).filter(row=>row.amountCents>0).map(row=>String(row.code).toUpperCase());
      if(wage.allocatedTipsCents>0||wage.statutoryEmployee===true||wage.dependentCareCents>0||codes.some(code=>['W','T'].includes(code))){
        incomeUnknown=true;additionalTaxUnknown=true;wageRoutingUnknown||=wage.statutoryEmployee===true;
        creditsUnknown||=wage.dependentCareCents>0||codes.includes('T');
        diagnostics.push(diagnostic('FEDERAL_W2_TREATMENT_UNRESOLVED','The New York W-2 supplement records allocated tips, statutory-employee income, dependent-care benefits, HSA contributions or adoption benefits. Complete the applicable federal income routing and Forms 4137, 2441, 8889 or 8839 before using federal AGI and tax totals.',{field:path+`.wageRecords.${position}`}));
      }
      if(codes.some(code=>['A','B','M','N','Z'].includes(code))){additionalTaxUnknown=true;diagnostics.push(diagnostic('FEDERAL_W2_ADDITIONAL_TAX_UNRESOLVED','The W-2 supplement reports uncollected Social Security/Medicare tax or section 409A income. Complete the required additional-tax treatment before using federal tax or settlement totals.',{field:path+`.wageRecords.${position}.box12`}));}
    }
  }
  return {creditsUnknown,incomeUnknown,additionalTaxUnknown,wageRoutingUnknown};
}

export function calculateIndividual(input){
  const rules=federalYearRules(input.year),standardDeductions=rules.standardDeductions;
  const individual=strictObject(input.individual,['filingStatus','spouseName','spouseFirstName','spouseLastName','spouseTaxId','w2s','taxableInterestCents','ordinaryDividendsCents','priorQbiLossCents','estimatedPaymentsCents','priorYearAppliedCents','businesses','energyCredits','householdEmployers','investmentIncome','capitalIncome','retirementIncome','stateReturns','eligibility','schedule1A','taxpayerIdentifiers','dependents','childCredits','earnedIncomeCredit'],'Individual return');
  if(!Object.hasOwn(standardDeductions,individual.filingStatus))throw new Error('Choose a supported individual filing status.');
  for(const field of ['spouseName','spouseTaxId'])text(individual[field],field);
  if(['marriedJoint','marriedSeparate'].includes(individual.filingStatus)&&/^\d{9}$/.test(input.party.taxId.replaceAll('-',''))&&input.party.taxId.replaceAll('-','')===individual.spouseTaxId.replaceAll('-',''))throw new Error('The taxpayer and spouse must have distinct taxpayer identifiers. Reconcile the original identity sources.');
  for(const field of ['spouseFirstName','spouseLastName'])if(individual[field]!==undefined)text(individual[field],field);
  amountFields(individual,['taxableInterestCents','ordinaryDividendsCents','priorQbiLossCents','estimatedPaymentsCents','priorYearAppliedCents'],'Individual return');
  const joint=individual.filingStatus==='marriedJoint',diagnostics=[],w2s=list(individual.w2s,'W-2 records',100);
  const federalCoverage=stateFederalCoverage(input,diagnostics),dependents=calculateDependents(input),creditsUnknown=federalCoverage.creditsUnknown||!dependents.known;diagnostics.push(...dependents.diagnostics);
  const ids=new Set();
  for(const wage of w2s){
    strictObject(wage,['id','owner','employer','wagesCents','socialSecurityWagesCents','medicareWagesCents','federalWithholdingCents','medicareTaxWithheldCents'],'W-2');
    text(wage.id,'W-2 identifier',100);text(wage.employer,'Employer');if(!wage.id||ids.has(wage.id))throw new Error('Each W-2 needs its own stable identifier.');ids.add(wage.id);
    if(!['taxpayer','spouse'].includes(wage.owner)||wage.owner==='spouse'&&!joint)throw new Error('Spouse wages require a joint individual return.');
    amountFields(wage,['wagesCents','socialSecurityWagesCents','medicareWagesCents','federalWithholdingCents'],'W-2');
  }
  const businesses=list(individual.businesses,'Schedule C businesses',5).map((business,index)=>scheduleC(business,index,input.year));ids.clear();
  for(const business of businesses){if(!business.copyId||ids.has(business.copyId))throw new Error('Each business needs its own stable identifier.');ids.add(business.copyId);if(business.owner==='spouse'&&!joint)throw new Error('Spouse business income requires a joint return.');diagnostics.push(...business.diagnostics);}
  const businessUnknown=businesses.some(business=>business.incomeUnknown);
  const investment=investmentIncome(individual.investmentIncome,{year:input.year,filingStatus:individual.filingStatus,taxableInterestCents:individual.taxableInterestCents,ordinaryDividendsCents:individual.ordinaryDividendsCents});diagnostics.push(...investment.diagnostics);
  const capital=capitalIncome(individual.capitalIncome,{year:input.year,filingStatus:individual.filingStatus,qualifiedDividendsCents:investment.qualifiedDividendsCents??0});diagnostics.push(...capital.diagnostics);
  const forms=[...businesses,...investment.forms,...capital.forms],seByOwner=[];
  for(const owner of joint?['taxpayer','spouse']:['taxpayer']){
    const profits=businesses.filter(business=>business.owner===owner),net=sumMoney(profits.map(business=>business.profitCents));
    if(!profits.length||net<=0)continue;
    const earnings=net>0?P(net,9235):0,ssWages=R(sumMoney(w2s.filter(wage=>wage.owner===owner).map(wage=>wage.socialSecurityWagesCents)));
    const lines={'2':net,'3':net,'4a':earnings,'4b':0,'4c':earnings,'5a':0,'5b':0,'6':earnings,'7':rules.socialSecurityBaseCents,'8a':ssWages,'8b':0,'8c':0,'8d':ssWages,'9':Math.max(0,rules.socialSecurityBaseCents-ssWages)};
    lines['10']=earnings<40000?0:P(Math.min(earnings,lines['9']),1240);lines['11']=earnings<40000?0:P(earnings,290);lines['12']=sumMoney([lines['10'],lines['11']]);lines['13']=P(lines['12'],5000);
    const ownerUnknown=profits.some(business=>business.incomeUnknown),result={form:'f1040sse',copyId:owner,owner,lines,profitCents:net,halfTaxCents:lines['13'],taxCents:lines['12'],netEarningsCents:earnings,incomeUnknown:ownerUnknown};seByOwner.push({...result});if(ownerUnknown){for(const key of ['2','3','4a','4c','6','10','11','12','13'])lines[key]=null;for(const key of ['profitCents','halfTaxCents','taxCents','netEarningsCents'])result[key]=null;}if(earnings>=40000||ownerUnknown)forms.push(result);
  }
  const profit=sumMoney(businesses.map(business=>business.profitCents)),seTax=sumMoney(seByOwner.map(owner=>owner.taxCents)),halfTax=sumMoney(seByOwner.map(owner=>owner.halfTaxCents));
  const lines={'1a':R(sumMoney(w2s.map(wage=>wage.wagesCents))),'2b':R(investment.taxableInterestCents),'3b':R(investment.ordinaryDividendsCents),'8':profit};lines['1z']=lines['1a'];
  const retirement=retirementIncome(individual.retirementIncome,{year:input.year,filingStatus:individual.filingStatus,otherIncomeCents:sumMoney([lines['1z'],lines['2b'],lines['3b'],capital.incomeCents,profit]),adjustmentsCents:halfTax,incomeUnknown:federalCoverage.incomeUnknown||businessUnknown||investment.incomeUnknown||capital.incomeUnknown,otherTreatments:input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')});diagnostics.push(...retirement.diagnostics);Object.assign(lines,retirement.lines);
  const sourceIncomeUnknown=federalCoverage.incomeUnknown||businessUnknown||investment.incomeUnknown||capital.incomeUnknown||retirement.incomeUnknown;
  if(investment.qualifiedDividendsCents)lines['3a']=R(investment.qualifiedDividendsCents);
  if(capital.required)lines[input.year>=2025?'7a':'7']=capital.incomeUnknown?null:capital.incomeCents;
  lines['9']=sumMoney([lines['1z'],lines['2b'],lines['3b'],capital.incomeCents,lines['8'],retirement.taxableIncomeCents]);lines['10']=halfTax;lines['11a']=sumMoney([lines['9'],-lines['10']]);lines['11b']=lines['11a'];lines['12e']=standardDeductions[individual.filingStatus];
  const standard=standardDeduction(individual.eligibility,{year:input.year,filingStatus:individual.filingStatus,wagesCents:lines['1z'],businessProfitCents:profit,seAdjustmentCents:halfTax,incomeKnown:!sourceIncomeUnknown&&!input.features.length,stateReturns:individual.stateReturns??[]});diagnostics.push(...standard.diagnostics);const deductionUnknown=!standard.known;lines['12e']=standard.deductionCents;
  const additionalDeductions=schedule1A(individual.schedule1A,{year:input.year,filingStatus:individual.filingStatus,adjustedGrossIncomeCents:lines['11b'],incomeUnknown:sourceIncomeUnknown,otherTreatments:input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW'),w2s,businesses,selfEmploymentAdjustments:seByOwner,eligibility:individual.eligibility,eligibilityConflict:standard.diagnostics.some(row=>row.code==='STANDARD_STATE_BIRTH_CONFLICT'),identifiers:individual.taxpayerIdentifiers,taxIds:{taxpayer:input.party.taxId,spouse:individual.spouseTaxId}});diagnostics.push(...additionalDeductions.diagnostics);forms.push(...additionalDeductions.forms);
  const tipReduction=business=>additionalDeductions.qbiReductionByBusiness.find(row=>row.businessId===business.copyId)?.amountCents??0,allTipReductions=sumMoney(businesses.map(tipReduction));
  const beforeQbi=Math.max(0,lines['11b']-(lines['12e']??0)-(additionalDeductions.deductionCents??0)),qbiThreshold=rules.qbiThresholds?.[individual.filingStatus]??(joint?rules.qbiJointThresholdCents:rules.qbiSingleThresholdCents);
  let qbi=0,qbiUnknown=deductionUnknown||additionalDeductions.deductionCents===null||additionalDeductions.qbiUnknown;
  if(businesses.length||individual.priorQbiLossCents){
    const qualified=sumMoney([profit,-halfTax,-allTipReductions]),netQualified=sumMoney([qualified,-R(individual.priorQbiLossCents)]);
    const capitalPreference=sumMoney([R(investment.qualifiedDividendsCents??0),capital.preferentialGainCents]);
    const qbiLines={'2':qualified,'3':R(individual.priorQbiLossCents),'4':Math.max(0,netQualified),'6':0,'7':0,'8':0,'9':0,'11':beforeQbi,'12':capitalPreference,'13':Math.max(0,beforeQbi-capitalPreference)};qbiLines['5']=P(qbiLines['4'],2000);qbiLines['10']=qbiLines['5'];qbiLines['14']=P(qbiLines['13'],2000);qbiLines['15']=Math.min(qbiLines['10'],qbiLines['14']);qbiLines['16']=Math.max(0,-netQualified);qbiLines['17']=0;
    if(additionalDeductions.deductionCents===null||additionalDeductions.qbiUnknown){qbiUnknown=true;diagnostics.push(diagnostic('QBI_SCHEDULE1A_UNRESOLVED','Resolve Schedule 1-A deductions and business-tip allocation before the QBI deduction.'));}
    else if(deductionUnknown){qbiUnknown=true;diagnostics.push(diagnostic('QBI_STANDARD_DEDUCTION_UNRESOLVED','Resolve federal dependent/aged standard-deduction eligibility before the QBI taxable-income limitation.'));}
    else if(sourceIncomeUnknown){qbiUnknown=true;diagnostics.push(diagnostic('QBI_SOURCE_INCOME_UNRESOLVED','Resolve business, investment and retirement income before applying the QBI deduction and taxable-income limitation.'));}
    else if(input.year<2026&&beforeQbi>qbiThreshold){qbiUnknown=true;diagnostics.push(diagnostic('QBI_COMPLEX_LIMITS','Taxable income exceeds the simplified Form 8995 threshold. Form 8995-A wage/property and trade limitations must be completed; no zero deduction was substituted.'));}
    else if(['taxpayer','spouse'].some(owner=>businesses.filter(business=>business.owner===owner).length>1)){
      qbiUnknown=true;diagnostics.push(diagnostic('QBI_MULTIPLE_BUSINESS_ALLOCATION','Multiple businesses for one taxpayer require reviewed allocation of self-employment adjustments and QBI losses. No unreviewed business-row allocation was substituted.'));
    }else if(input.year>=2026){
      const active=sumMoney(businesses.filter(business=>individual.businesses.find(value=>value.id===business.copyId).materialParticipation).map(business=>sumMoney([business.profitCents,-(seByOwner.find(owner=>owner.owner===business.owner)?.halfTaxCents??0),-tipReduction(business)])));
      const annual=(input.year===2027?qualifiedBusinessDeduction2027:qualifiedBusinessDeduction2026)({filingStatus:individual.filingStatus,taxableIncomeBeforeDeductionCents:beforeQbi,qualifiedIncomeCents:qualified,activeQualifiedIncomeCents:active,priorLossCents:individual.priorQbiLossCents,netCapitalGainCents:capitalPreference});diagnostics.push(...annual.diagnostics);qbiUnknown=annual.deductionCents===null;qbi=annual.deductionCents??0;
      forms.push({form:'f8995',copyId:'qbi',lines:{...qbiLines,'15':annual.deductionCents},annual,qualifiedBusinessIncomeCents:qualified});
    }else{qbi=qbiLines['15'];forms.push({form:'f8995',copyId:'qbi',lines:qbiLines,businesses:businesses.map(business=>({copyId:business.copyId,name:business.businessName,taxId:business.owner==='spouse'?individual.spouseTaxId:input.party.taxId,qbiCents:sumMoney([business.profitCents,-(seByOwner.find(owner=>owner.owner===business.owner)?.halfTaxCents??0),-tipReduction(business)])})),qualifiedBusinessIncomeCents:qualified});}
  }
  const medicare=additionalMedicare({filingStatus:individual.filingStatus,w2s,selfEmploymentEarnings:seByOwner.map(owner=>owner.netEarningsCents),selfEmploymentUnknown:businessUnknown});diagnostics.push(...medicare.diagnostics);if(medicare.form)forms.push(medicare.form);
  const household=householdEmployment(individual.householdEmployers,{year:input.year,filingStatus:individual.filingStatus});diagnostics.push(...household.diagnostics);forms.push(...household.forms);
  const niit=netInvestmentTax(individual.investmentIncome,{year:input.year,filingStatus:individual.filingStatus,adjustedGrossIncomeCents:lines['11b'],taxableInterestCents:lines['2b'],ordinaryDividendsCents:lines['3b'],capitalIncomeCents:capital.incomeCents,capitalUnknown:capital.niitUnknown,incomeUnknown:sourceIncomeUnknown,otherTreatments:sourceIncomeUnknown||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')});diagnostics.push(...niit.diagnostics);if(niit.form)forms.push(niit.form);
  if(joint&&(!individual.spouseName.trim()||!/^\d{9}$/.test(individual.spouseTaxId.replaceAll('-',''))))diagnostics.push(diagnostic('SPOUSE_IDENTITY_REQUIRED','Complete the spouse name and taxpayer ID for a joint return.'));
  if(joint&&(!individual.spouseFirstName?.trim()||!individual.spouseLastName?.trim()))diagnostics.push(diagnostic('SPOUSE_NAME_PARTS_REQUIRED','Confirm the spouse first/middle and last-name fields before completing Form 1040.'));
  if(individual.filingStatus==='headOfHousehold'||individual.filingStatus==='survivingSpouse')diagnostics.push(diagnostic('QUALIFYING_PERSON_REVIEW','Confirm the qualifying-person/dependent information and household/surviving-spouse conditions. Their schedules are not inferred from filing status.'));
  if(deductionUnknown)lines['12e']=null;
  lines['13a']=qbiUnknown?null:qbi;lines['13b']=additionalDeductions.deductionCents;lines['14']=qbiUnknown||lines['13b']===null?null:sumMoney([lines['12e'],qbi,lines['13b']]);lines['15']=qbiUnknown||lines['14']===null?null:Math.max(0,lines['11b']-lines['14']);
  const tax=qualifiedCapitalTax({year:input.year,filingStatus:individual.filingStatus,taxableIncomeCents:lines['15'],qualifiedDividendsCents:investment.qualifiedDividendsCents??0,preferentialGainCents:capital.preferentialGainCents,unknown:sourceIncomeUnknown});diagnostics.push(...(tax.diagnostics??[]));lines['16']=tax.taxCents;lines['17']=0;lines['18']=lines['16'];lines['19']=0;lines['20']=0;lines['21']=0;lines['22']=lines['16'];lines['23']=federalCoverage.additionalTaxUnknown||retirement.incomeUnknown||businessUnknown||medicare.taxCents===null||household.taxCents===null||niit.taxCents===null?null:sumMoney([seTax,medicare.taxCents,household.taxCents,niit.taxCents]);
  const eic=earnedIncomeCredit(input,{dependents,adjustedGrossIncomeCents:sourceIncomeUnknown?null:lines['11b'],wageIncomeCents:federalCoverage.wageRoutingUnknown?null:lines['1z'],scheduleCProfitCents:businessUnknown?null:profit,halfSeTaxCents:businessUnknown?null:halfTax,otherTreatments:sourceIncomeUnknown||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')});diagnostics.push(...eic.diagnostics);
  const childContext={dependents,eicCents:eic.amountCents,adjustedGrossIncomeCents:sourceIncomeUnknown?null:lines['11b'],wageIncomeCents:federalCoverage.wageRoutingUnknown?null:lines['1z'],scheduleCProfitCents:businessUnknown?null:profit,halfSeTaxCents:businessUnknown?null:halfTax,medicare,otherTreatments:creditsUnknown||sourceIncomeUnknown||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')};
  const childReserve=dependents.required||individual.childCredits!==undefined?childCreditReserve(input,childContext):{reserveCents:0};
  const energy=energyCredits(individual.energyCredits,{year:input.year,taxBeforeCreditsCents:lines['18'],cleanCreditReserveCents:childReserve.reserveCents,otherTreatments:federalCoverage.creditsUnknown||deductionUnknown||sourceIncomeUnknown||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')});diagnostics.push(...energy.diagnostics);
  if(energy.required){if(energy.form)forms.push(energy.form);forms.push({form:'f1040s3',copyId:'nonrefundable-credits',lines:{'5a':energy.cleanCreditCents,'5b':energy.improvementCreditCents,'8':energy.creditCents}});lines['20']=energy.creditCents;lines['21']=energy.creditCents;lines['22']=lines['18']===null||energy.creditCents===null?null:Math.max(0,lines['18']-energy.creditCents);}
  const children=calculateChildCredits(input,{...childContext,taxBeforeCreditsCents:lines['18'],priorityCreditsCents:energy.improvementCreditCents,cleanEnergyCreditCents:energy.cleanCreditCents,cleanEnergyRequired:energy.form?.energy.clean===true});diagnostics.push(...children.diagnostics,...children.eic.diagnostics);if(children.form)forms.push(children.form);
  if(children.required){lines['19']=children.nonrefundableCents;lines['28']=children.refundableCents;lines[input.year>=2025?'27a':'27']=children.eic.amountCents;lines['32']=children.refundableCents===null||children.eic.amountCents===null?null:sumMoney([children.refundableCents,children.eic.amountCents]);lines['21']=children.nonrefundableCents===null||energy.creditCents===null?null:sumMoney([children.nonrefundableCents,energy.creditCents]);lines['22']=lines['18']===null||lines['21']===null?null:Math.max(0,lines['18']-lines['21']);}
  lines[input.year>=2025?'27a':'27']=eic.amountCents;lines['32']=children.refundableCents===null||eic.amountCents===null?null:sumMoney([children.refundableCents,eic.amountCents]);
  if(creditsUnknown)for(const key of ['19','21','22','28','32'])lines[key]=null;
  const limited=federalCoverage.additionalTaxUnknown||lines['22']===null||qbiUnknown||sourceIncomeUnknown||medicare.taxCents===null||niit.taxCents===null||household.taxCents===null||energy.creditCents===null||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW');lines['24']=limited?null:sumMoney([lines['22'],lines['23']]);lines['25a']=R(sumMoney(w2s.map(wage=>wage.federalWithholdingCents)));if(medicare.required)lines['25c']=medicare.withholdingCents;lines['25d']=medicare.withholdingCents===null||retirement.paymentUnknown?null:sumMoney([lines['25a'],retirement.federalWithholdingCents,medicare.withholdingCents]);lines['26']=R(sumMoney([individual.estimatedPaymentsCents,individual.priorYearAppliedCents]));lines['33']=creditsUnknown||lines['25d']===null||lines['32']===null?null:sumMoney([lines['25d'],lines['26'],lines['32']??0]);lines['34']=lines['24']===null||lines['33']===null?null:Math.max(0,lines['33']-lines['24']);lines['35a']=lines['34'];lines['37']=lines['24']===null||lines['33']===null?null:Math.max(0,lines['24']-lines['33']);
  if(creditsUnknown)lines['33']=null;
  if(businesses.length)forms.push({form:'f1040s1',copyId:'adjustments',lines:{'3':businessUnknown?null:profit,'10':businessUnknown?null:profit,'15':businessUnknown?null:halfTax,'26':businessUnknown?null:halfTax}});
  if(businessUnknown||seTax||medicare.required||household.required||niit.required)forms.push({form:'f1040s2',copyId:'other-taxes',lines:{...(businessUnknown||seTax?{'4':businessUnknown?null:seTax}:{}),...(household.required?{'9':household.taxCents}:{}),...(medicare.required?{'11':medicare.taxCents}:{}),...(niit.required?{'12':niit.taxCents}:{}),'21':lines['23']}});
  forms.unshift({form:'f1040',copyId:'main',lines,retirement:retirement.annotations,standardDeduction:standard,dependents});
  const summary={adjustedGrossIncomeCents:lines['11b'],taxableIncomeCents:lines['15'],ordinaryTaxCents:lines['16'],earnedIncomeCreditCents:eic.amountCents,selfEmploymentTaxCents:businessUnknown?null:seTax,additionalMedicareTaxCents:medicare.taxCents,additionalMedicareWithholdingCents:medicare.withholdingCents,totalTaxCents:lines['24'],paymentsCents:lines['33'],refundCents:lines['34'],amountOwedCents:lines['37']};
  const carryforward=capitalLossCarryforward(capital,{taxableIncomeBeforeFloorCents:qbiUnknown||sourceIncomeUnknown||input.features.length||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')?null:lines['11b']-lines['14']});
  if(capital.required)Object.assign(summary,{capitalGainOrLossCents:capital.incomeUnknown?null:capital.incomeCents,shortTermCapitalLossCarryforwardCents:carryforward.shortTermLossCents,longTermCapitalLossCarryforwardCents:carryforward.longTermLossCents});
  if(niit.required)summary.netInvestmentIncomeTaxCents=niit.taxCents;
  if(household.required)summary.householdEmploymentTaxCents=household.taxCents;
  if(energy.required)Object.assign(summary,{residentialCleanEnergyCreditCents:energy.cleanCreditCents,energyImprovementCreditCents:energy.improvementCreditCents,cleanEnergyCarryforwardCents:energy.carryforwardCents});
  if(children.required)Object.assign(summary,{childAndOtherDependentCreditCents:children.nonrefundableCents,additionalChildTaxCreditCents:children.refundableCents,earnedIncomeCreditCents:children.eic.amountCents});
  if(additionalDeductions.required)Object.assign(summary,{additionalDeductionsCents:additionalDeductions.deductionCents});
  if(retirement.required)Object.assign(summary,{taxableRetirementIncomeCents:retirement.incomeUnknown?null:retirement.taxableIncomeCents,retirementWithholdingCents:retirement.federalWithholdingCents});
  if(federalCoverage.wageRoutingUnknown){lines['1a']=null;lines['1z']=null;}
  if(businessUnknown){lines['8']=null;lines['10']=null;}
  const adjustedGrossIncomeKnown=!sourceIncomeUnknown&&!input.features.length&&!diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW');
  if(!adjustedGrossIncomeKnown){for(const key of ['9','11a','11b','15'])lines[key]=null;summary.adjustedGrossIncomeCents=null;summary.taxableIncomeCents=null;}
  if(input.year<2025){lines['11']=lines['11a'];lines['12']=lines['12e'];lines['13']=lines['13a'];for(const key of ['11a','11b','12e','13a','13b'])delete lines[key];}
  return {forms,diagnostics,summary,taxMethod:tax,capitalLossCarryforward:carryforward,retirement,standardDeduction:standard,schedule1A:additionalDeductions,dependents,childCredits:children,childCreditReserve:childReserve,earnedIncomeCredit:eic,adjustedGrossIncomeKnown};
}
