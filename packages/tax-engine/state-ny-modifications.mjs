import {strictObject,list,text,diagnostic} from './model.mjs';
import {checkedMoney,sumMoney,wholeDollars as R} from './money.mjs';
import {newNYModification,nyModifications} from './state-ny-model.mjs';

export function validateNYModifications(input,value,diagnostics,reviewedSource){
 const lines={},ids=new Set(),joint=input.individual.filingStatus==='marriedJoint';let known=value.review.modifications;
 for(const row of list(value.modifications,'New York modifications',16)){
  strictObject(row,Object.keys(newNYModification()),'New York modification');if(!nyModifications.some(([line])=>line===row.line))throw new Error('Choose a supported New York modification.');
  const pension=['26','29'].includes(row.line),bond=row.line==='28',key=row.line+(pension?':'+row.owner:bond?':'+row.incomeLine:'');
  if(ids.has(key))throw new Error('Choose each New York modification once per applicable recipient or source income line.');ids.add(key);
  if(pension&&(!['taxpayer','spouse'].includes(row.owner)||row.owner==='spouse'&&!joint))throw new Error('A pension subtraction needs its recipient; spouse income requires a joint return.');
  if(bond&&!['2','3','6','11'].includes(row.incomeLine))throw new Error('Choose the federal-income line containing the government bond income.');
  checkedMoney(row.amountCents,'New York eligible modification');text(row.description,'New York modification explanation',500);known=reviewedSource(row,`New York line ${row.line}`,diagnostics)&&known;
  lines[row.line]=sumMoney([lines[row.line]??0,R(row.amountCents)]);
  if(['23','31'].includes(row.line)&&row.amountCents){known=false;diagnostics.push(diagnostic('NY_MODIFICATION_SUPPLEMENT','Other additions/subtractions require IT-225 and underlying modification codes. Its amounts are preserved, but state AGI remains unresolved.'));}
  if(row.line==='30'&&row.amountCents>(joint?1000000:500000)){known=false;diagnostics.push(diagnostic('NY_529_SUBTRACTION_LIMIT','NY 529 contributions are limited to $5,000 ($10,000 jointly). Any additional taxable QTP-distribution subtraction requires a represented federal distribution source, outside this pack.'));}
 }
 return {lines,modificationsKnown:known};
}

export function reconcileNYModifications(input,value,federalResult,lines,diagnostics){
 let known=true,pensionKnown=true;const details=[],distributions=input.individual.retirementIncome?.distributions??[],federalDetails=federalResult.retirement?.details??[],joint=input.individual.filingStatus==='marriedJoint';
 const need=(condition,code,message)=>{if(!condition){known=false;diagnostics.push(diagnostic(code,message));}return condition;};
 for(const owner of joint?['taxpayer','spouse']:['taxpayer']){
  const rows=value.modifications.filter(row=>row.owner===owner&&['26','29'].includes(row.line));if(!rows.length)continue;
  const source=distributions.filter(row=>row.owner===owner).map(row=>({row,taxable:federalDetails.find(detail=>detail.id===row.id)?.taxableCents}));
  const valid=source.every(item=>Number.isSafeInteger(item.taxable));if(!need(valid,'NY_PENSION_SOURCE_UNRESOLVED','Resolve the recipient’s federal taxable retirement sources before a New York pension subtraction.')){pensionKnown=false;continue;}
  const government=R(rows.find(row=>row.line==='26')?.amountCents??0),requested=R(rows.find(row=>row.line==='29')?.amountCents??0),governmentIncome=R(sumMoney(source.filter(item=>item.row.plan==='qualifiedPlan').map(item=>item.taxable))),ownIncome=R(sumMoney(source.filter(item=>item.row.distributionCodes.toUpperCase()!=='4').map(item=>item.taxable)));
  let recipientKnown=government<=governmentIncome;need(recipientKnown,'NY_GOVERNMENT_PENSION_SOURCE','The government pension subtraction exceeds this recipient’s taxable employer-plan pension income. IRA distributions cannot be relabeled as direct government pension payments.');
  let exclusion=0;
  if(requested){
   const dob=value[owner==='taxpayer'?'taxpayerDob':'spouseDob'],sharedDob=input.individual.eligibility?.[owner]?.dateOfBirth,identityConsistent=!sharedDob||sharedDob===dob,eligibleAtStart=/^\d{4}-\d{2}-\d{2}$/.test(dob)&&Number.isFinite(Date.parse(dob+'T00:00:00Z'))&&new Date(dob+'T00:00:00Z').toISOString().slice(0,10)===dob&&dob<=`${input.year-60}-07-01`;
   recipientKnown&&=identityConsistent;need(identityConsistent,'NY_PENSION_BIRTH_CONFLICT','The recipient’s shared federal birth date differs from the New York source birth date. Reconcile the identity records before the age-based pension exclusion; government-pension and Social Security subtractions retain their separate source rules.');
   recipientKnown&&=eligibleAtStart;need(eligibleAtStart,'NY_PENSION_AGE_SOURCE','The ordinary pension exclusion requires age 59½ by the start of the year. Birthday-year receipt allocations or inherited/decedent exclusions need additional source worksheets, not a shared spouse allowance.');
   recipientKnown&&=requested<=Math.max(0,ownIncome-government);need(requested<=Math.max(0,ownIncome-government),'NY_PENSION_RECIPIENT_LIMIT','Qualifying pension income exceeds this recipient’s included non-inherited retirement income after the government pension subtraction. Each spouse uses only their own income and $20,000 allowance; inherited exclusions require separate allocation.');
   exclusion=Math.min(2000000,requested);
  }
  pensionKnown&&=recipientKnown;details.push({owner,known:recipientKnown,governmentCents:government,qualifyingIncomeCents:requested,exclusionCents:exclusion});
 }
 if(value.modifications.some(row=>row.line==='29'))lines['29']=pensionKnown?sumMoney(details.map(row=>row.exclusionCents)):null;
 if(Number.isSafeInteger(lines['9'])&&Number.isSafeInteger(lines['10'])&&lines['29']!==null)need(sumMoney([lines['26']??0,lines['29']??0])<=sumMoney([lines['9'],lines['10']]),'NY_RETIREMENT_AGGREGATE_LIMIT','Combined retirement subtractions exceed the retirement income included on the return. Reconcile recipient allocation and whole-dollar rounding before state AGI is known.');
 for(const row of value.modifications.filter(row=>row.line==='28')){
  if(!['2','3'].includes(row.incomeLine)){need(false,'NY_BOND_BUSINESS_SOURCE','Government-bond income on business or pass-through lines requires its gross-income allocation and source schedule; net business profit is not an eligibility cap.');continue;}
  need(Number.isSafeInteger(lines[row.incomeLine])&&R(row.amountCents)<=lines[row.incomeLine],'NY_BOND_INCOME_LIMIT','The government-bond subtraction exceeds the included interest or dividend income on its selected source line. Verify qualifying obligations and the mutual-fund asset/percentage worksheet.');
 }
 return {known,details};
}
