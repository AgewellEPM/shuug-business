import {investmentIncome,netInvestmentTax} from './investment-income.mjs';
import {additionalMedicare} from './additional-medicare.mjs';
import {householdEmployment} from './household-employment.mjs';
import {energyCredits} from './energy-credits.mjs';
import { strictObject, list, text, amountFields, diagnostic } from './model.mjs';
import { sumMoney, wholeDollars as R, wholeRatio as P } from './money.mjs';
import {federalYearRules} from './federal-years.mjs';
import { scheduleC } from './schedule-c.mjs';
import {ordinaryTax} from './ordinary-tax.mjs';

export function calculateIndividual(input){
  const rules=federalYearRules(input.year),standardDeductions=rules.standardDeductions;
  const individual=strictObject(input.individual,['filingStatus','spouseName','spouseFirstName','spouseLastName','spouseTaxId','w2s','taxableInterestCents','ordinaryDividendsCents','priorQbiLossCents','estimatedPaymentsCents','priorYearAppliedCents','businesses','energyCredits','householdEmployers','investmentIncome'],'Individual return');
  if(!Object.hasOwn(standardDeductions,individual.filingStatus))throw new Error('Choose a supported individual filing status.');
  for(const field of ['spouseName','spouseTaxId'])text(individual[field],field);
  for(const field of ['spouseFirstName','spouseLastName'])if(individual[field]!==undefined)text(individual[field],field);
  amountFields(individual,['taxableInterestCents','ordinaryDividendsCents','priorQbiLossCents','estimatedPaymentsCents','priorYearAppliedCents'],'Individual return');
  const joint=individual.filingStatus==='marriedJoint',diagnostics=[],w2s=list(individual.w2s,'W-2 records',100);
  const ids=new Set();
  for(const wage of w2s){
    strictObject(wage,['id','owner','employer','wagesCents','socialSecurityWagesCents','medicareWagesCents','federalWithholdingCents','medicareTaxWithheldCents'],'W-2');
    text(wage.id,'W-2 identifier',100);text(wage.employer,'Employer');if(!wage.id||ids.has(wage.id))throw new Error('Each W-2 needs its own stable identifier.');ids.add(wage.id);
    if(!['taxpayer','spouse'].includes(wage.owner)||wage.owner==='spouse'&&!joint)throw new Error('Spouse wages require a joint individual return.');
    amountFields(wage,['wagesCents','socialSecurityWagesCents','medicareWagesCents','federalWithholdingCents'],'W-2');
  }
  const businesses=list(individual.businesses,'Schedule C businesses',5).map((business,index)=>scheduleC(business,index,input.year));ids.clear();
  for(const business of businesses){if(!business.copyId||ids.has(business.copyId))throw new Error('Each business needs its own stable identifier.');ids.add(business.copyId);if(business.owner==='spouse'&&!joint)throw new Error('Spouse business income requires a joint return.');diagnostics.push(...business.diagnostics);}
  const investment=investmentIncome(individual.investmentIncome,{year:input.year,filingStatus:individual.filingStatus,taxableInterestCents:individual.taxableInterestCents,ordinaryDividendsCents:individual.ordinaryDividendsCents});diagnostics.push(...investment.diagnostics);
  const forms=[...businesses,...investment.forms],seByOwner=[];
  for(const owner of joint?['taxpayer','spouse']:['taxpayer']){
    const profits=businesses.filter(business=>business.owner===owner),net=sumMoney(profits.map(business=>business.profitCents));
    if(!profits.length||net<=0)continue;
    const earnings=net>0?P(net,9235):0,ssWages=R(sumMoney(w2s.filter(wage=>wage.owner===owner).map(wage=>wage.socialSecurityWagesCents)));
    const lines={'2':net,'3':net,'4a':earnings,'4b':0,'4c':earnings,'5a':0,'5b':0,'6':earnings,'7':rules.socialSecurityBaseCents,'8a':ssWages,'8b':0,'8c':0,'8d':ssWages,'9':Math.max(0,rules.socialSecurityBaseCents-ssWages)};
    lines['10']=earnings<40000?0:P(Math.min(earnings,lines['9']),1240);lines['11']=earnings<40000?0:P(earnings,290);lines['12']=sumMoney([lines['10'],lines['11']]);lines['13']=P(lines['12'],5000);
    const result={form:'f1040sse',copyId:owner,owner,lines,profitCents:net,halfTaxCents:lines['13'],taxCents:lines['12'],netEarningsCents:earnings};seByOwner.push(result);if(earnings>=40000)forms.push(result);
  }
  const profit=sumMoney(businesses.map(business=>business.profitCents)),seTax=sumMoney(seByOwner.map(owner=>owner.taxCents)),halfTax=sumMoney(seByOwner.map(owner=>owner.halfTaxCents));
  const lines={'1a':R(sumMoney(w2s.map(wage=>wage.wagesCents))),'2b':R(investment.taxableInterestCents),'3b':R(investment.ordinaryDividendsCents),'8':profit};lines['1z']=lines['1a'];
  lines['9']=sumMoney([lines['1z'],lines['2b'],lines['3b'],lines['8']]);lines['10']=halfTax;lines['11a']=sumMoney([lines['9'],-lines['10']]);lines['11b']=lines['11a'];lines['12e']=standardDeductions[individual.filingStatus];
  const beforeQbi=Math.max(0,lines['11b']-lines['12e']),qbiThreshold=joint?rules.qbiJointThresholdCents:rules.qbiSingleThresholdCents;
  let qbi=0,qbiUnknown=false;
  if(businesses.length||individual.priorQbiLossCents){
    const qualified=sumMoney([profit,-halfTax]),netQualified=sumMoney([qualified,-R(individual.priorQbiLossCents)]);
    const qbiLines={'2':qualified,'3':R(individual.priorQbiLossCents),'4':Math.max(0,netQualified),'6':0,'7':0,'8':0,'9':0,'11':beforeQbi,'12':0,'13':beforeQbi};qbiLines['5']=P(qbiLines['4'],2000);qbiLines['10']=qbiLines['5'];qbiLines['14']=P(beforeQbi,2000);qbiLines['15']=Math.min(qbiLines['10'],qbiLines['14']);qbiLines['16']=Math.max(0,-netQualified);qbiLines['17']=0;
    if(beforeQbi>qbiThreshold){qbiUnknown=true;diagnostics.push(diagnostic('QBI_COMPLEX_LIMITS','Taxable income exceeds the simplified Form 8995 threshold. Form 8995-A wage/property and trade limitations must be completed; no zero deduction was substituted.'));}
    else if(['taxpayer','spouse'].some(owner=>businesses.filter(business=>business.owner===owner).length>1)){
      qbiUnknown=true;diagnostics.push(diagnostic('QBI_MULTIPLE_BUSINESS_ALLOCATION','Multiple businesses for one taxpayer require reviewed allocation of self-employment adjustments and QBI losses. No unreviewed business-row allocation was substituted.'));
    }else{qbi=qbiLines['15'];forms.push({form:'f8995',copyId:'qbi',lines:qbiLines,businesses:businesses.map(business=>({copyId:business.copyId,name:business.businessName,taxId:business.owner==='spouse'?individual.spouseTaxId:input.party.taxId,qbiCents:sumMoney([business.profitCents,-(seByOwner.find(owner=>owner.owner===business.owner)?.halfTaxCents??0)])})),qualifiedBusinessIncomeCents:qualified});}
  }
  const medicare=additionalMedicare({filingStatus:individual.filingStatus,w2s,selfEmploymentEarnings:seByOwner.map(owner=>owner.netEarningsCents)});diagnostics.push(...medicare.diagnostics);if(medicare.form)forms.push(medicare.form);
  const household=householdEmployment(individual.householdEmployers,{year:input.year,filingStatus:individual.filingStatus});diagnostics.push(...household.diagnostics);forms.push(...household.forms);
  const niit=netInvestmentTax(individual.investmentIncome,{year:input.year,filingStatus:individual.filingStatus,adjustedGrossIncomeCents:lines['11b'],taxableInterestCents:lines['2b'],ordinaryDividendsCents:lines['3b'],incomeUnknown:investment.incomeUnknown,otherTreatments:investment.incomeUnknown||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')});diagnostics.push(...niit.diagnostics);if(niit.form)forms.push(niit.form);
  if(joint&&(!individual.spouseName.trim()||!/^\d{9}$/.test(individual.spouseTaxId.replaceAll('-',''))))diagnostics.push(diagnostic('SPOUSE_IDENTITY_REQUIRED','Complete the spouse name and taxpayer ID for a joint return.'));
  if(joint&&(!individual.spouseFirstName?.trim()||!individual.spouseLastName?.trim()))diagnostics.push(diagnostic('SPOUSE_NAME_PARTS_REQUIRED','Confirm the spouse first/middle and last-name fields before completing Form 1040.'));
  if(individual.filingStatus==='headOfHousehold'||individual.filingStatus==='survivingSpouse')diagnostics.push(diagnostic('QUALIFYING_PERSON_REVIEW','Confirm the qualifying-person/dependent information and household/surviving-spouse conditions. Their schedules are not inferred from filing status.'));
  lines['13a']=qbiUnknown?null:qbi;lines['13b']=0;lines['14']=qbiUnknown?null:sumMoney([lines['12e'],qbi]);lines['15']=qbiUnknown?null:Math.max(0,lines['11b']-lines['14']);
  const tax=lines['15']===null?null:ordinaryTax(lines['15'],individual.filingStatus,input.year);lines['16']=tax?.taxCents??null;lines['17']=0;lines['18']=lines['16'];lines['19']=0;lines['20']=0;lines['21']=0;lines['22']=lines['16'];lines['23']=household.taxCents===null||niit.taxCents===null?null:sumMoney([seTax,medicare.taxCents,household.taxCents,niit.taxCents]);
  const energy=energyCredits(individual.energyCredits,{year:input.year,taxBeforeCreditsCents:lines['18'],otherTreatments:investment.incomeUnknown||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW')});diagnostics.push(...energy.diagnostics);
  if(energy.required){forms.push(energy.form,{form:'f1040s3',copyId:'nonrefundable-credits',lines:{'5a':energy.cleanCreditCents,'5b':energy.improvementCreditCents,'8':energy.creditCents}});lines['20']=energy.creditCents;lines['21']=energy.creditCents;lines['22']=lines['18']===null||energy.creditCents===null?null:Math.max(0,lines['18']-energy.creditCents);}
  const limited=qbiUnknown||investment.incomeUnknown||niit.taxCents===null||household.taxCents===null||energy.creditCents===null||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW');lines['24']=limited?null:sumMoney([lines['22'],lines['23']]);lines['25a']=R(sumMoney(w2s.map(wage=>wage.federalWithholdingCents)));if(medicare.required)lines['25c']=medicare.withholdingCents;lines['25d']=medicare.withholdingCents===null?null:sumMoney([lines['25a'],medicare.withholdingCents]);lines['26']=R(sumMoney([individual.estimatedPaymentsCents,individual.priorYearAppliedCents]));lines['33']=lines['25d']===null?null:sumMoney([lines['25d'],lines['26']]);lines['34']=lines['24']===null||lines['33']===null?null:Math.max(0,lines['33']-lines['24']);lines['35a']=lines['34'];lines['37']=lines['24']===null||lines['33']===null?null:Math.max(0,lines['24']-lines['33']);
  if(businesses.length)forms.push({form:'f1040s1',copyId:'adjustments',lines:{'3':profit,'10':profit,'15':halfTax,'26':halfTax}});
  if(seTax||medicare.taxCents||household.required||niit.required)forms.push({form:'f1040s2',copyId:'other-taxes',lines:{...(seTax?{'4':seTax}:{}),...(household.required?{'9':household.taxCents}:{}),...(medicare.taxCents?{'11':medicare.taxCents}:{}),...(niit.required?{'12':niit.taxCents}:{}),'21':lines['23']}});
  forms.unshift({form:'f1040',copyId:'main',lines});
  const summary={adjustedGrossIncomeCents:lines['11b'],taxableIncomeCents:lines['15'],ordinaryTaxCents:lines['16'],selfEmploymentTaxCents:seTax,additionalMedicareTaxCents:medicare.taxCents,additionalMedicareWithholdingCents:medicare.withholdingCents,totalTaxCents:lines['24'],paymentsCents:lines['33'],refundCents:lines['34'],amountOwedCents:lines['37']};
  if(niit.required)summary.netInvestmentIncomeTaxCents=niit.taxCents;
  if(household.required)summary.householdEmploymentTaxCents=household.taxCents;
  if(energy.required)Object.assign(summary,{residentialCleanEnergyCreditCents:energy.cleanCreditCents,energyImprovementCreditCents:energy.improvementCreditCents,cleanEnergyCarryforwardCents:energy.carryforwardCents});
  if(input.year<2025){lines['11']=lines['11a'];lines['12']=lines['12e'];lines['13']=lines['13a'];for(const key of ['11a','11b','12e','13a','13b'])delete lines[key];}
  return {forms,diagnostics,summary,taxMethod:tax};
}
