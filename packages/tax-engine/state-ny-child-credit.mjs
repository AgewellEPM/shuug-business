import {diagnostic} from './model.mjs';
import {wholeDollars as R,wholeRatio as P} from './money.mjs';
import {validateNYEmpireChildCredit} from './state-ny-child-model.mjs';
import {nyEmpireEligibility} from './state-ny-child-eligibility.mjs';
import {nyLegacyChildCredit} from './state-ny-child-legacy.mjs';
export * from './state-ny-child-model.mjs';
export const nyEmpireYears=Object.freeze([2023,2024,2025]);
export const nyEmpireThreshold=status=>({marriedJoint:11000000,marriedSeparate:5500000,single:7500000,headOfHousehold:7500000,survivingSpouse:7500000})[status];
export function calculateNYEmpireChildCredit(input,state,federal,context={}){
 const source=state.empireChildCredit===undefined?null:validateNYEmpireChildCredit(state.empireChildCredit),diagnostics=[],need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));return Boolean(condition);},result={required:false,known:false,amountCents:null,children:[],records:[],worksheets:{},lines:{},counts:{},flags:{},forms:[],diagnostics};
 if(!nyEmpireYears.includes(input.year)){need(false,'NY_EMPIRE_YEAR','No annual Empire State child-credit calculation/original is installed for this year. Older-year rules are not substituted.');return result;}
 const eligibility=nyEmpireEligibility(input,state,source);Object.assign(result,{required:eligibility.required,children:eligibility.children,records:eligibility.records});diagnostics.push(...eligibility.diagnostics);
 if(!eligibility.known)return result;if(!result.children.length)return {...result,known:true,amountCents:0};
 const main=federal.forms?.find(row=>row.form==='f1040')?.lines??{},agi=Object.hasOwn(context,'federalAgiCents')?context.federalAgiCents:federal.summary?.adjustedGrossIncomeCents,threshold=nyEmpireThreshold(input.individual.filingStatus);
 need(federal.adjustedGrossIncomeKnown===true&&Number.isSafeInteger(agi)&&agi===federal.summary?.adjustedGrossIncomeCents&&agi===main[input.year>=2025?'11b':'11'],'NY_EMPIRE_FEDERAL_AGI','Reconcile actual IT-201 line19 to the current known annual federal AGI.');need(Number.isSafeInteger(threshold),'NY_EMPIRE_FILING_STATUS','Choose a supported annual filing status.');if(diagnostics.length)return result;
 if(input.year===2025){result.counts={'1':result.children.filter(row=>row.age<4).length,'3':result.children.filter(row=>row.age>=4).length};const lines=result.lines;lines['2']=result.counts['1']*100000;lines['4']=result.counts['3']*33000;lines['5']=lines['2']+lines['4'];lines['6']=Math.floor(Math.max(0,R(agi))/100000)*100000;lines['7']=Math.max(0,lines['6']-threshold);lines['8']=P(lines['7'],165);lines['9']=Math.max(0,lines['5']-lines['8']);result.amountCents=lines['9'];result.known=true;}
 else{const legacy=nyLegacyChildCredit(input,state,federal,source,{...eligibility,agi,threshold});Object.assign(result,{known:legacy.known,amountCents:legacy.amountCents,lines:legacy.lines,counts:legacy.counts,flags:legacy.flags,worksheets:legacy.worksheets});diagnostics.push(...legacy.diagnostics);}
 if(result.known&&result.amountCents>0)result.forms.push({form:'nyit213',copyId:'NY-Empire-child-credit',state:'NY',lines:result.lines,empireChildCredit:{...result,forms:[]}});return result;
}
