import {sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {diagnostic,amountFields} from './model.mjs';

// Form 8959, ordinary W-2 Medicare wages and Schedule SE income only.
// RRTA, Forms 4137/8919 and uncollected box-12 taxes remain separate treatments.
export function additionalMedicare({filingStatus,w2s,selfEmploymentEarnings}){
 const threshold=filingStatus==='marriedJoint'?25000000:filingStatus==='marriedSeparate'?12500000:20000000;
 const wages=R(sumMoney(w2s.map(wage=>wage.medicareWagesCents))),earnings=sumMoney(selfEmploymentEarnings.filter(value=>value>=40000));
 for(const wage of w2s)if(wage.medicareTaxWithheldCents!==undefined)amountFields(wage,['medicareTaxWithheldCents'],'W-2 Medicare withholding');
 const missing=w2s.some(wage=>wage.medicareTaxWithheldCents===undefined),reported=R(sumMoney(w2s.map(wage=>wage.medicareTaxWithheldCents??0))),regular=P(wages,145),excess=Math.max(0,reported-regular);
 const required=wages+earnings>threshold||w2s.some(wage=>wage.medicareWagesCents>20000000)||excess>0;
 if(!required)return {taxCents:0,withholdingCents:0,required:false,diagnostics:[],form:null};
 const diagnostics=missing?[diagnostic('MEDICARE_WITHHOLDING_REQUIRED','Enter Form W-2 box 6 Medicare tax withheld for every W-2 to reconcile Form 8959. A blank is unknown; enter 0 only when the source says zero. Payment/refund/balance totals remain unavailable.',{field:'individual.w2s.medicareTaxWithheldCents'})]:[];
 const lines={};
 if(wages){Object.assign(lines,{'1':wages,'4':wages,'5':threshold,'6':Math.max(0,wages-threshold)});lines['7']=P(lines['6'],90);}
 if(earnings){Object.assign(lines,{'8':earnings,'9':threshold,'10':wages,'11':Math.max(0,threshold-wages)});lines['12']=Math.max(0,earnings-lines['11']);lines['13']=P(lines['12'],90);}
 lines['18']=sumMoney([lines['7']??0,lines['13']??0]);
 if(w2s.length){Object.assign(lines,{'19':missing?null:reported,'20':wages,'21':regular,'22':missing?null:excess,'24':missing?null:excess});}
 return {taxCents:lines['18'],withholdingCents:missing?null:excess,required:true,diagnostics,form:{form:'f8959',copyId:'additional-medicare',lines}};
}
