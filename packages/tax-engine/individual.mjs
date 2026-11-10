import { strictObject, list, text, amountFields, diagnostic } from './model.mjs';
import { sumMoney, wholeDollars as R, wholeRatio as P } from './money.mjs';
import { standardDeductions2025 } from './catalog.mjs';
import { scheduleC } from './schedule-c.mjs';
import { ordinaryTax2025 } from './ordinary-tax.mjs';

export function calculateIndividual(input){
  const individual=strictObject(input.individual,['filingStatus','spouseName','spouseFirstName','spouseLastName','spouseTaxId','w2s','taxableInterestCents','ordinaryDividendsCents','priorQbiLossCents','estimatedPaymentsCents','priorYearAppliedCents','businesses'],'Individual return');
  if(!Object.hasOwn(standardDeductions2025,individual.filingStatus))throw new Error('Choose a supported individual filing status.');
  for(const field of ['spouseName','spouseTaxId'])text(individual[field],field);
  for(const field of ['spouseFirstName','spouseLastName'])if(individual[field]!==undefined)text(individual[field],field);
  amountFields(individual,['taxableInterestCents','ordinaryDividendsCents','priorQbiLossCents','estimatedPaymentsCents','priorYearAppliedCents'],'Individual return');
  const joint=individual.filingStatus==='marriedJoint',diagnostics=[],w2s=list(individual.w2s,'W-2 records',100);
  const ids=new Set();
  for(const wage of w2s){
    strictObject(wage,['id','owner','employer','wagesCents','socialSecurityWagesCents','medicareWagesCents','federalWithholdingCents'],'W-2');
    text(wage.id,'W-2 identifier',100);text(wage.employer,'Employer');if(!wage.id||ids.has(wage.id))throw new Error('Each W-2 needs its own stable identifier.');ids.add(wage.id);
    if(!['taxpayer','spouse'].includes(wage.owner)||wage.owner==='spouse'&&!joint)throw new Error('Spouse wages require a joint individual return.');
    amountFields(wage,['wagesCents','socialSecurityWagesCents','medicareWagesCents','federalWithholdingCents'],'W-2');
  }
  const businesses=list(individual.businesses,'Schedule C businesses',5).map(scheduleC);ids.clear();
  for(const business of businesses){if(!business.copyId||ids.has(business.copyId))throw new Error('Each business needs its own stable identifier.');ids.add(business.copyId);if(business.owner==='spouse'&&!joint)throw new Error('Spouse business income requires a joint return.');diagnostics.push(...business.diagnostics);}
  const forms=[...businesses],seByOwner=[];
  for(const owner of joint?['taxpayer','spouse']:['taxpayer']){
    const profits=businesses.filter(business=>business.owner===owner),net=sumMoney(profits.map(business=>business.profitCents));
    if(!profits.length||net<=0)continue;
    const earnings=net>0?P(net,9235):0,ssWages=R(sumMoney(w2s.filter(wage=>wage.owner===owner).map(wage=>wage.socialSecurityWagesCents)));
    const lines={'2':net,'3':net,'4a':earnings,'4b':0,'4c':earnings,'5a':0,'5b':0,'6':earnings,'7':17610000,'8a':ssWages,'8b':0,'8c':0,'8d':ssWages,'9':Math.max(0,17610000-ssWages)};
    lines['10']=earnings<40000?0:P(Math.min(earnings,lines['9']),1240);lines['11']=earnings<40000?0:P(earnings,290);lines['12']=sumMoney([lines['10'],lines['11']]);lines['13']=P(lines['12'],5000);
    const result={form:'f1040sse',copyId:owner,owner,lines,profitCents:net,halfTaxCents:lines['13'],taxCents:lines['12'],netEarningsCents:earnings};seByOwner.push(result);if(earnings>=40000)forms.push(result);
  }
  const profit=sumMoney(businesses.map(business=>business.profitCents)),seTax=sumMoney(seByOwner.map(owner=>owner.taxCents)),halfTax=sumMoney(seByOwner.map(owner=>owner.halfTaxCents));
  const lines={'1a':R(sumMoney(w2s.map(wage=>wage.wagesCents))),'2b':R(individual.taxableInterestCents),'3b':R(individual.ordinaryDividendsCents),'8':profit};lines['1z']=lines['1a'];
  lines['9']=sumMoney([lines['1z'],lines['2b'],lines['3b'],lines['8']]);lines['10']=halfTax;lines['11a']=sumMoney([lines['9'],-lines['10']]);lines['11b']=lines['11a'];lines['12e']=standardDeductions2025[individual.filingStatus];
  const beforeQbi=Math.max(0,lines['11b']-lines['12e']),qbiThreshold=joint?39460000:19730000;
  let qbi=0,qbiUnknown=false;
  if(businesses.length||individual.priorQbiLossCents){
    const qualified=sumMoney([profit,-halfTax]),netQualified=sumMoney([qualified,-R(individual.priorQbiLossCents)]);
    const qbiLines={'2':qualified,'3':R(individual.priorQbiLossCents),'4':Math.max(0,netQualified),'6':0,'7':0,'8':0,'9':0,'11':beforeQbi,'12':0,'13':beforeQbi};qbiLines['5']=P(qbiLines['4'],2000);qbiLines['10']=qbiLines['5'];qbiLines['14']=P(beforeQbi,2000);qbiLines['15']=Math.min(qbiLines['10'],qbiLines['14']);qbiLines['16']=Math.max(0,-netQualified);qbiLines['17']=0;
    if(beforeQbi>qbiThreshold){qbiUnknown=true;diagnostics.push(diagnostic('QBI_COMPLEX_LIMITS','Taxable income exceeds the simplified Form 8995 threshold. Form 8995-A wage/property and trade limitations must be completed; no zero deduction was substituted.'));}
    else if(['taxpayer','spouse'].some(owner=>businesses.filter(business=>business.owner===owner).length>1)){
      qbiUnknown=true;diagnostics.push(diagnostic('QBI_MULTIPLE_BUSINESS_ALLOCATION','Multiple businesses for one taxpayer require reviewed allocation of self-employment adjustments and QBI losses. No unreviewed business-row allocation was substituted.'));
    }else{qbi=qbiLines['15'];forms.push({form:'f8995',copyId:'qbi',lines:qbiLines,businesses:businesses.map(business=>({copyId:business.copyId,name:business.businessName,taxId:business.owner==='spouse'?individual.spouseTaxId:input.party.taxId,qbiCents:sumMoney([business.profitCents,-(seByOwner.find(owner=>owner.owner===business.owner)?.halfTaxCents??0)])})),qualifiedBusinessIncomeCents:qualified});}
  }
  const medicareWages=R(sumMoney(w2s.map(wage=>wage.medicareWagesCents))),netEarnings=sumMoney(seByOwner.filter(owner=>owner.netEarningsCents>=40000).map(owner=>owner.netEarningsCents)),medicareThreshold=joint?25000000:individual.filingStatus==='marriedSeparate'?12500000:20000000;
  const additionalMedicare=medicareWages+netEarnings>medicareThreshold;
  if(additionalMedicare)diagnostics.push(diagnostic('ADDITIONAL_MEDICARE_REQUIRED','Combined Medicare wages and self-employment earnings require Form 8959. Complete that calculation before a total-tax or balance figure is used.'));
  if(lines['2b']>150000||lines['3b']>150000)diagnostics.push(diagnostic('SCHEDULE_B_REQUIRED','Interest/dividends require Schedule B and its account/foreign reporting questions.'));
  if(joint&&(!individual.spouseName.trim()||!/^\d{9}$/.test(individual.spouseTaxId.replaceAll('-',''))))diagnostics.push(diagnostic('SPOUSE_IDENTITY_REQUIRED','Complete the spouse name and taxpayer ID for a joint return.'));
  if(joint&&(!individual.spouseFirstName?.trim()||!individual.spouseLastName?.trim()))diagnostics.push(diagnostic('SPOUSE_NAME_PARTS_REQUIRED','Confirm the spouse first/middle and last-name fields before completing Form 1040.'));
  if(individual.filingStatus==='headOfHousehold'||individual.filingStatus==='survivingSpouse')diagnostics.push(diagnostic('QUALIFYING_PERSON_REVIEW','Confirm the qualifying-person/dependent information and household/surviving-spouse conditions. Their schedules are not inferred from filing status.'));
  lines['13a']=qbiUnknown?null:qbi;lines['13b']=0;lines['14']=qbiUnknown?null:sumMoney([lines['12e'],qbi]);lines['15']=qbiUnknown?null:Math.max(0,lines['11b']-lines['14']);
  const tax=lines['15']===null?null:ordinaryTax2025(lines['15'],individual.filingStatus);lines['16']=tax?.taxCents??null;lines['17']=0;lines['18']=lines['16'];lines['19']=0;lines['20']=0;lines['21']=0;lines['22']=lines['16'];lines['23']=seTax;
  const limited=qbiUnknown||additionalMedicare||input.features.length>0||diagnostics.some(item=>item.code==='LOSS_LIMITATION_REVIEW');lines['24']=limited?null:sumMoney([lines['22'],lines['23']]);lines['25a']=R(sumMoney(w2s.map(wage=>wage.federalWithholdingCents)));lines['25d']=lines['25a'];lines['26']=R(sumMoney([individual.estimatedPaymentsCents,individual.priorYearAppliedCents]));lines['33']=sumMoney([lines['25d'],lines['26']]);lines['34']=lines['24']===null?null:Math.max(0,lines['33']-lines['24']);lines['35a']=lines['34'];lines['37']=lines['24']===null?null:Math.max(0,lines['24']-lines['33']);
  if(businesses.length)forms.push({form:'f1040s1',copyId:'adjustments',lines:{'3':profit,'10':profit,'15':halfTax,'26':halfTax}});
  if(seTax)forms.push({form:'f1040s2',copyId:'other-taxes',lines:{'4':seTax,'21':seTax}});
  forms.unshift({form:'f1040',copyId:'main',lines});
  return {forms,diagnostics,summary:{adjustedGrossIncomeCents:lines['11b'],taxableIncomeCents:lines['15'],ordinaryTaxCents:lines['16'],selfEmploymentTaxCents:seTax,totalTaxCents:lines['24'],paymentsCents:lines['33'],refundCents:lines['34'],amountOwedCents:lines['37']},taxMethod:tax};
}
