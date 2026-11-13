import { checkedMoney } from './money.mjs';
import {calculationYears} from './federal-years.mjs';

export const kinds=Object.freeze(['1040','1065','1120S','1120']);
export const expenseCategories=Object.freeze([
  ['advertising','Advertising'],['vehicle','Eligible vehicle expenses'],['commissions','Commissions and fees'],['contractLabor','Contract labor'],
  ['employeeBenefits','Employee benefits'],['insurance','Insurance'],['mortgageInterest','Business mortgage interest'],['otherInterest','Other business interest'],
  ['professional','Legal and professional'],['office','Office expense'],['retirement','Employee retirement plans'],['equipmentRent','Vehicle/equipment rent'],
  ['propertyRent','Other business rent'],['repairs','Repairs and maintenance'],['supplies','Supplies'],['taxes','Business taxes and licenses'],
  ['travel','Business travel'],['meals','Eligible deductible meal amount'],['utilities','Utilities'],['wages','Salaries and wages'],['other','Other eligible deductions'],
].map(Object.freeze));
export function newReturn(kind='1040',year=2025){
  if(!kinds.includes(kind))throw new Error('Choose an installed return type.');
  if(!calculationYears.includes(year))throw new Error('Choose an installed tax-year draft pack.');
  return {version:1,type:'tax-return',year,kind,party:{name:'',firstName:'',lastName:'',taxId:'',street:'',city:'',state:'',zip:''},
    review:{identity:false,income:false,deductions:false,credits:false,ownership:false,coverage:false},features:[],notes:'',
    ...(kind==='1040'?{individual:{filingStatus:'single',spouseName:'',spouseFirstName:'',spouseLastName:'',spouseTaxId:'',w2s:[],taxableInterestCents:0,ordinaryDividendsCents:0,priorQbiLossCents:0,estimatedPaymentsCents:0,priorYearAppliedCents:0,businesses:[]}}:
      {entity:{businessName:'',businessCode:'',accountingMethod:'cash',receiptsCents:0,returnsCents:0,costOfGoodsCents:0,otherIncomeCents:0,officerCompensationCents:0,guaranteedPaymentsCents:0,estimatedPaymentsCents:0,expenses:[],owners:[]}})};
}
export function strictObject(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be a structured record.`);
  const extra=Object.keys(value).filter(key=>!keys.includes(key));if(extra.length)throw new Error(`${label} contains an unsupported field; its original input must be preserved and reviewed.`);return value;
}
export function text(value,label,maximum=200){if(typeof value!=='string'||value.length>maximum||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error(`${label} must be supported text within its length limit.`);return value;}
export function list(value,label,max=100){if(!Array.isArray(value)||value.length>max)throw new Error(`${label} exceeds the supported list bounds.`);return value;}
export function amountFields(value,names,label){for(const name of names)checkedMoney(value[name],`${label}: ${name}`);}
export function expenses(value){
  const result={},allowed=new Set(expenseCategories.map(([id])=>id));
  for(const item of list(value,'Expense lines')){strictObject(item,['category','amountCents','description'],'Expense line');if(!allowed.has(item.category)||Object.hasOwn(result,item.category))throw new Error('Choose each supported deduction category at most once.');checkedMoney(item.amountCents,'Deductible expense');text(item.description,'Deduction description',500);result[item.category]=item.amountCents;}
  return result;
}
export function commonInput(input){
  strictObject(input,['version','type','year','kind','party','review','features','notes','individual','entity'],'Tax return');
  if(input.version!==1||input.type!=='tax-return'||!kinds.includes(input.kind))throw new Error('This saved return format or return type is not supported.');
  if(!Number.isInteger(input.year))throw new Error('Choose an exact tax year.');
  strictObject(input.party,['name','firstName','lastName','taxId','street','city','state','zip'],'Return identity');for(const key of ['name','taxId','street','city','state','zip'])text(input.party[key],`Identity ${key}`,key==='street'?300:200);for(const key of ['firstName','lastName'])if(input.party[key]!==undefined)text(input.party[key],`Identity ${key}`);
  strictObject(input.review,['identity','income','deductions','credits','ownership','coverage'],'Preparation review');for(const value of Object.values(input.review))if(typeof value!=='boolean')throw new Error('Preparation reviews must be explicit yes/no decisions.');
  for(const feature of list(input.features,'Additional tax treatments',50))text(feature,'Additional tax treatment',100);
  if(new Set(input.features).size!==input.features.length)throw new Error('A tax treatment was selected more than once.');text(input.notes,'Preparation notes',10000);
  if(input.kind==='1040'&&input.entity!==undefined||input.kind!=='1040'&&input.individual!==undefined)throw new Error('The saved input belongs to another return family.');
  return input;
}
export const diagnostic=(code,message,{blocking=true,field=null}={})=>({code,message,severity:blocking?'blocking':'information',field});
export function inputDiagnostics(input){
  const result=[];
  if(!input.party.name.trim()||!/^\d{9}$/.test(input.party.taxId.replaceAll('-','')))result.push(diagnostic('IDENTITY_INCOMPLETE','Complete and review the return name and nine-digit taxpayer/entity ID. This check validates format, not government identity.',{field:'party'}));
  if(input.kind==='1040'&&(!input.party.firstName?.trim()||!input.party.lastName?.trim()))result.push(diagnostic('NAME_PARTS_REQUIRED','Confirm the first/middle and last-name fields explicitly. A full legal name is preserved in the workpaper but is never split by guesswork onto Form 1040.',{field:'party'}));
  for(const [key,label] of [['identity','Identity and filing details'],['income','All income sources'],['deductions','Deduction eligibility and limits'],['credits','Credit eligibility'],...(input.kind==='1040'?[]:[['ownership','Entity ownership and allocations']])])if(input.review[key]!==true)result.push(diagnostic('REVIEW_'+key.toUpperCase(),`${label} still require an explicit preparation review.`,{field:'review.'+key}));
  for(const feature of input.features)result.push(diagnostic('ADDITIONAL_TREATMENT','This return includes a treatment outside the current calculation/form coverage: '+feature+'. Preserve its sources and complete the required work before filing.',{field:'features'}));
  if(input.review.coverage!==true)result.push(diagnostic('COVERAGE_REVIEW_REQUIRED','Review the installed coverage and confirm whether any additional income, credit, deduction, limitation or disclosure applies.',{field:'review.coverage'}));
  result.push(diagnostic('FILING_NOT_PERFORMED','Calculation and draft PDF generation do not transmit a return or establish an IRS/state acknowledgment.',{blocking:false}));
  return result;
}
