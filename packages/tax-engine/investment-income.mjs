import {strictObject,list,text,amountFields,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';

export const investmentReviews=Object.freeze([
  ['ordinaryIncome','All payer amounts are taxable interest or ordinary dividends, including their separately entered qualified subset; exempt interest, capital distributions and withholding are not included or omitted'],
  ['noAdjustments','No nominee amounts, seller-financed home mortgages, accrued-interest adjustments, OID adjustments, bond-premium adjustments or savings-bond exclusions'],
  ['usTaxpayer','Full-year US citizen/resident treatment applies to each filer; no nonresident-spouse election or dual-status treatment'],
  ['noOtherInvestmentIncome','No NIIT income or adjustments outside entered interest, dividends and supported Schedule D securities: annuities, rental/royalty/pass-through income, trusts, passive businesses or financial trading businesses'],
  ['noMagiAdjustments','NIIT modified AGI equals AGI: no section 911 exclusion, CFC/PFIC ownership, foreign-trust adjustment or other MAGI modification'],
  ['noInvestmentDeductions','No deductible investment interest, allocable income taxes, investment expenses, additional losses or other Form 8960 Part II deductions/modifications'],
  ['qualifiedDividends','Qualified dividends are an eligible subset of ordinary dividends; holding periods, issuer eligibility, hedges/short-sale restrictions and Form 4952 elections reviewed'],
].map(Object.freeze));
export const newInvestmentPayer=()=>({id:globalThis.crypto.randomUUID(),payer:'',amountCents:0,source:''});
export const newInvestmentIncome=()=>({interestPayers:[],dividendPayers:[],foreignAccount:'unknown',fbarRequired:'unknown',foreignTrust:'unknown',foreignCountries:'',review:Object.fromEntries(investmentReviews.map(([key])=>[key,false]))});
const decisions=['unknown','yes','no'];
const threshold=status=>({single:20000000,headOfHousehold:20000000,marriedJoint:25000000,survivingSpouse:25000000,marriedSeparate:12500000})[status];

function validate(value,year,filingStatus){
  if(![2023,2024,2025,2026].includes(year)||threshold(filingStatus)===undefined)throw new Error('Investment income requires an installed individual tax year and filing status.');
  strictObject(value,['interestPayers','dividendPayers','foreignAccount','fbarRequired','foreignTrust','foreignCountries','review'],'Investment income');
  const ids=new Set();
  for(const key of ['interestPayers','dividendPayers'])for(const payer of list(value[key],key,100)){
    strictObject(payer,['id','payer','amountCents','source',...(key==='dividendPayers'?['qualifiedDividendsCents']:[])],'Investment payer');text(payer.id,'Investment payer identifier',100);text(payer.payer,'Investment payer name',200);text(payer.source,'Investment source reference',500);amountFields(payer,['amountCents'],'Investment payer');
    if(key==='dividendPayers'){checkedMoney(payer.qualifiedDividendsCents??0,'Qualified dividend subset');if((payer.qualifiedDividendsCents??0)>payer.amountCents)throw new Error('Qualified dividends cannot exceed the same payer’s ordinary dividends.');}
    if(!payer.id||ids.has(payer.id))throw new Error('Each investment payer needs a unique stable identifier.');ids.add(payer.id);
  }
  for(const key of ['foreignAccount','fbarRequired','foreignTrust'])if(!decisions.includes(value[key]))throw new Error('Foreign reporting questions require an explicit yes, no or unknown answer.');
  text(value.foreignCountries,'Foreign account countries',180);
  if(value.foreignAccount==='no'&&value.fbarRequired==='yes')throw new Error('FBAR required conflicts with no foreign account; review both answers.');
  strictObject(value.review,investmentReviews.map(([key])=>key),'Investment scope review');
  for(const [key]of investmentReviews)if(!(key==='qualifiedDividends'&&value.review[key]===undefined)&&typeof value.review[key]!=='boolean')throw new Error('Investment scope reviews must be explicit yes/no decisions.');
}

// Optional payer records are authoritative. Returns made before their addition
// retain their original aggregate inputs and original missing-schedule gate.
export function investmentIncome(value,{year,filingStatus,taxableInterestCents,ordinaryDividendsCents}){
  checkedMoney(taxableInterestCents,'Taxable interest');checkedMoney(ordinaryDividendsCents,'Ordinary dividends');
  if(value===undefined){
    const interest=R(taxableInterestCents),dividends=R(ordinaryDividendsCents),required=taxableInterestCents>150000||ordinaryDividendsCents>150000;
    return {required,taxableInterestCents:interest,ordinaryDividendsCents:dividends,qualifiedDividendsCents:0,incomeUnknown:false,forms:[],diagnostics:required?[diagnostic('SCHEDULE_B_REQUIRED','Add interest/dividend payer records and review Schedule B foreign-account/trust questions.')]:[]};
  }
  validate(value,year,filingStatus);
  const rawInterest=sumMoney(value.interestPayers.map(item=>item.amountCents)),rawDividends=sumMoney(value.dividendPayers.map(item=>item.amountCents)),interest=R(rawInterest),dividends=R(rawDividends);
  const qualifiedDividendsCents=R(sumMoney(value.dividendPayers.map(item=>item.qualifiedDividendsCents??0))),diagnostics=[],need=(ok,code,message)=>{if(!ok)diagnostics.push(diagnostic(code,message));};
  if(year===2026)return {required:true,taxableInterestCents:interest,ordinaryDividendsCents:dividends,qualifiedDividendsCents,incomeUnknown:true,forms:[],diagnostics:[diagnostic('INVESTMENT_YEAR_UNSUPPORTED','No reviewed Schedule B / qualified-dividend form pack is installed for 2026. Source amounts are preserved and final tax totals remain unavailable.')]};
  if(qualifiedDividendsCents)need(value.review.qualifiedDividends===true,'QUALIFIED_DIVIDENDS_REVIEW',investmentReviews.at(-1)[1]+'.');
  const hasIncome=interest>0||dividends>0;
  const unnamed=[...value.interestPayers,...value.dividendPayers].some(item=>item.amountCents>0&&!item.payer.trim());
  need(!unnamed,'INVESTMENT_PAYER_REQUIRED','Name every interest/dividend payer with an entered amount; retain the source statement.');
  // Nonzero legacy values must agree with the detailed records. Never silently
  // discard stale aggregate money when an imported return adds payer records.
  const mismatch=(taxableInterestCents!==0&&taxableInterestCents!==rawInterest)||(ordinaryDividendsCents!==0&&ordinaryDividendsCents!==rawDividends);
  need(!mismatch,'INVESTMENT_AGGREGATE_MISMATCH','Payer totals conflict with saved aggregate interest/dividends. Reconcile the preserved amounts before relying on totals.');
  if(hasIncome){
    need(value.review.ordinaryIncome,'INVESTMENT_INCOME_REVIEW',investmentReviews[0][1]+'.');
    need(value.review.noAdjustments,'INVESTMENT_ADJUSTMENT_REVIEW',investmentReviews[1][1]+'.');
  }
  need(value.foreignAccount!=='unknown','SCHEDULE_B_ACCOUNT_REVIEW','Answer whether any filer had a financial interest in or signature authority over a foreign financial account.');
  need(value.foreignTrust!=='unknown','SCHEDULE_B_TRUST_REVIEW','Answer whether any filer received a foreign-trust distribution or was a foreign-trust grantor/transferor.');
  if(value.foreignAccount==='yes'){
    need(value.fbarRequired!=='unknown','SCHEDULE_B_FBAR_REVIEW','Review the FBAR filing requirement and exceptions; account location alone does not determine it.');
    if(value.fbarRequired==='yes'){
      need(Boolean(value.foreignCountries.trim()),'SCHEDULE_B_COUNTRIES_REQUIRED','List the countries of foreign financial accounts for Schedule B line 7b.');
      diagnostics.push(diagnostic('FBAR_SEPARATE_FILING_REQUIRED','Schedule B records the FBAR disclosure only. FinCEN Form 114 must be completed and filed separately; no FBAR has been transmitted.'));
    }
    diagnostics.push(diagnostic('FOREIGN_ASSET_REPORTING_REVIEW','Review Form 8938 and any other foreign-asset reporting requirements separately; this Schedule B does not prepare those forms.'));
  }
  if(value.foreignTrust==='yes')diagnostics.push(diagnostic('FOREIGN_TRUST_TREATMENT_REQUIRED','Foreign-trust distributions, grantor/transferor treatment and Form 3520/3520-A require additional work. Ordinary tax and NIIT totals remain unavailable.'));
  const incomeUnknown=mismatch||hasIncome&&(!value.review.ordinaryIncome||!value.review.noAdjustments)||qualifiedDividendsCents>0&&value.review.qualifiedDividends!==true||value.foreignTrust==='yes';
  const partIII=rawInterest>150000||rawDividends>150000||value.foreignAccount==='yes'||value.foreignTrust==='yes';
  return {required:true,taxableInterestCents:interest,ordinaryDividendsCents:dividends,qualifiedDividendsCents,incomeUnknown,diagnostics,
    forms:[{form:'f1040sb',copyId:'investment-payers',lines:{'2':interest,'3':value.review.noAdjustments?0:null,'4':incomeUnknown?null:interest,'6':incomeUnknown?null:dividends},investment:{...value,partIII}}]};
}

// Limited Form 8960: all ordinary payer income is included, MAGI equals AGI,
// and reviewed deductions/modifications are zero. No arbitrary override inputs.
export function netInvestmentTax(value,{year,filingStatus,adjustedGrossIncomeCents,taxableInterestCents,ordinaryDividendsCents,capitalIncomeCents=0,capitalUnknown=false,incomeUnknown=false,otherTreatments=false}){
  if(![2023,2024,2025].includes(year)){const possible=capitalUnknown||incomeUnknown||taxableInterestCents>0||ordinaryDividendsCents>0||capitalIncomeCents!==0;return {required:possible,taxCents:possible?null:0,form:null,diagnostics:possible?[diagnostic('NIIT_YEAR_UNSUPPORTED','No reviewed Form 8960 pack is installed for this tax year. Investment-tax totals remain unavailable.')]:[]};}
  if(threshold(filingStatus)===undefined)throw new Error('NIIT requires a supported individual filing status.');
  checkedMoney(adjustedGrossIncomeCents,'Adjusted gross income',{negative:true});checkedMoney(taxableInterestCents,'Taxable interest');checkedMoney(ordinaryDividendsCents,'Ordinary dividends');
  checkedMoney(capitalIncomeCents,'Capital gain/loss for NIIT',{negative:true});
  const limit=threshold(filingStatus),agi=R(adjustedGrossIncomeCents),interest=R(taxableInterestCents),dividends=R(ordinaryDividendsCents),capital=R(capitalIncomeCents),income=sumMoney([interest,dividends,capital]),netIncome=Math.max(0,income);
  const empty={required:false,taxCents:0,form:null,diagnostics:[]};
  if(value===undefined)return (income>0||capitalUnknown)&&agi>limit?{...empty,required:true,taxCents:null,diagnostics:[diagnostic('NET_INVESTMENT_TAX_REQUIRED','Add investment-income records and complete the Form 8960 income, MAGI and expense review before using total tax or balance figures.')]}:empty;
  validate(value,year,filingStatus);
  if(!income&&!incomeUnknown&&!capitalUnknown&&agi<=limit)return empty;
  const diagnostics=[];
  for(const [key,label]of investmentReviews.slice(2).filter(([key])=>key!=='qualifiedDividends'))if(!value.review[key])diagnostics.push(diagnostic('NIIT_'+key.replace(/[A-Z]/g,letter=>'_'+letter).toUpperCase()+'_REVIEW',label+'.'));
  if(incomeUnknown||capitalUnknown||otherTreatments||(interest>0||dividends>0)&&(!value.review.ordinaryIncome||!value.review.noAdjustments)||value.foreignTrust==='yes')diagnostics.push(diagnostic('NIIT_INCOME_UNRESOLVED','Complete the investment-income review, capital-income NIIT treatment and other tax treatments before calculating NIIT.'));
  const unknown=diagnostics.length>0;
  if(!unknown&&agi<=limit)return empty;
  const allowed=number=>unknown?null:number;
  const magiKnown=value.review.noMagiAdjustments&&!incomeUnknown&&!otherTreatments&&value.foreignTrust!=='yes'&&(!(interest>0||dividends>0)||value.review.ordinaryIncome&&value.review.noAdjustments);
  const lines={'1':interest,'2':dividends,'3':allowed(0),'4a':allowed(0),'4b':allowed(0),'4c':allowed(0),'5a':allowed(capital),'5b':allowed(0),'5c':allowed(0),'5d':allowed(capital),'6':allowed(0),'7':allowed(0),'8':allowed(income),'9a':allowed(0),'9b':allowed(0),'9c':allowed(0),'9d':allowed(0),'10':allowed(0),'11':allowed(0),'12':allowed(netIncome),'13':magiKnown?agi:null,'14':limit,'15':magiKnown?Math.max(0,agi-limit):null,'16':allowed(Math.min(netIncome,Math.max(0,agi-limit)))};
  lines['17']=unknown?null:P(lines['16'],380);
  return {required:true,taxCents:lines['17'],diagnostics,form:{form:'f8960',copyId:'net-investment-income',lines}};
}
