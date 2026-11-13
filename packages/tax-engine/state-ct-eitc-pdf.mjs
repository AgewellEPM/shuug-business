import {ctEitcTemplates,ctEitcLineMaps,ctEitcQuestions,ctEitcChildren} from './state-ct-family-maps.mjs';
import {ctOverlay,ctBox,ctDigits,ctDollars} from './state-ct-overlay.mjs';
import {displayMoney} from './money.mjs';

export function ctEitcPdfYearPack(year){const template=ctEitcTemplates[year];return {templates:template?[template]:[],lineMaps:template?{ct1040eitc:ctEitcLineMaps[year]}:{},scheduleMaps:{}};}

export async function renderCTEitcForm(input,item,options={}){
 const {draw,digits,check,continuation,finish}=await ctOverlay(input,item,ctEitcTemplates[input.year],{...options,width:612,height:792});
 if(item.rateBps!==4000)throw new Error('The Connecticut annual EITC original is preprinted at 40%.');
 const mainIdPositions=[388.44,403.11,417.77,442.16,456.82,481.21,495.87,510.54,525.21];
 for(const page of [0,1])digits(page,mainIdPositions,page===0?65.88:37.88,input.party.taxId,'taxpayerId',{width:10.76,height:16.34});
 const questions={...ctEitcQuestions,jointFederalSeparateState:[ctBox(1,57.06,input.year===2025?492.80:503.64,10.8,14.4),ctBox(1,233.52,input.year===2025?492.80:503.80,10.8,14.4)]};
 if(input.year===2025)questions.supplementChild=[ctBox(1,57.06,665.37,10.8,14.4),ctBox(1,233.52,665.37,10.8,14.4)];
 for(const [key,pair]of Object.entries(questions)){const value=item.questions?.[key];if(value===true||value===false)check(pair[value?0:1],true,`question:${key}:${value?'yes':'no'}`);else if(value!==null&&value!==undefined)throw new Error('Connecticut EITC questions require reviewed boolean evidence.');}
 const rows=item.children??[];
 if(!Array.isArray(rows)||rows.length>100)throw new Error('Connecticut EITC child disclosure is invalid.');
 for(const [index,row]of rows.entries()){
  if(!row.firstName?.trim()||!row.lastName?.trim()||!/^\d{9}$/.test(ctDigits(row.taxId))||!/^\d{4}$/.test(String(row.birthYear))||Number(row.birthYear)>input.year||![1,2,3,4,5].includes(row.relationshipCode)||!Number.isInteger(row.months)||row.months<1||row.months>12)throw new Error('Connecticut EITC child identity, relationship and reviewed residence months must be complete.');
  if(index>=3)continue;const map=ctEitcChildren[index],label=`5:${index+1}`;
  draw(ctBox(0,map.firstX+2,map.nameTop,144,16),row.firstName,`${label}:firstName`);
  draw(ctBox(0,map.middleX,map.nameTop,18,16),row.middleInitial,`${label}:middleInitial`,{center:true});
  draw(ctBox(0,map.lastX+2,map.nameTop,216,16),row.lastName,`${label}:lastName`);
  digits(0,[0,13.45,26.90,49.25,62.70,85.06,98.50,111.95,125.40].map(n=>map.ssnX+n),map.detailTop,row.taxId,`${label}:taxId`,{width:9.87,height:16});
  draw(ctBox(0,map.birthX,map.detailTop,40.32,16),row.birthYear,`${label}:birthYear`,{center:true});
  draw(ctBox(0,map.relationX,map.detailTop,18,16),row.relationshipCode,`${label}:relationship`,{center:true});
  draw(ctBox(0,map.monthsX,map.detailTop,26.64,16),row.months,`${label}:months`,{center:true});
  check(ctBox(0,map.studentX,map.studentTop,18,16),row.student,`${label}:student`);
  check(ctBox(0,map.disabledX,map.disabledTop,18,16),row.disabled,`${label}:disabled`);
 }
 const wages=item.printedWageSources??[],businesses=item.businessSources??[];
 if(!Array.isArray(wages)||!Array.isArray(businesses)||wages.length>3||businesses.length>3)throw new Error('Connecticut EITC wage or business source overflow needs a reviewed primary-source selection; no rows were silently dropped.');
 for(const [index,row]of wages.entries()){
  const top=[170.24,191.48,212.36][index],label=`6${'abc'[index]}`;
  if(!/^\d{9}$/.test(ctDigits(row.employerFederalId)))throw new Error('Connecticut EITC employer federal ID must have nine digits.');
  digits(1,[70.56,87.78,105,122.22,139.44,156.66,173.88,191.10,208.32],top,row.employerFederalId,`${label}:federalId`,{width:12.64});
  draw(ctBox(1,237,top,174,14),row.employerStateId,`${label}:stateId`,{center:true});
  draw(ctBox(1,430,top,134,14),ctDollars(row.wagesCents),`${label}:wages`,{right:true});
 }
 for(const [index,row]of businesses.entries()){
  const top=[311.36,332.60,353.48][index],label=`7${'abc'[index]}`;
  if(!/^\d{9}$/.test(ctDigits(row.federalId)))throw new Error('Connecticut EITC business federal ID must have nine digits.');
  digits(1,[70.11,85.02,99.93,114.84,129.74,144.65,159.56,174.46,189.37],top,row.federalId,`${label}:federalId`,{width:10.94});
  draw(ctBox(1,215,top,180,14),row.ctTaxRegistrationNumber,`${label}:stateId`,{center:true});
  draw(ctBox(1,423,top,134,14),ctDollars(row.incomeCents),`${label}:income`,{right:true});
 }
 for(const [line,value]of Object.entries(item.lines??{})){
  if(value===null||value===undefined)continue;
  const box=ctEitcLineMaps[input.year][line];if(!box)throw new Error(`Connecticut EITC line ${line} has no reviewed annual overlay.`);
  draw(box,ctDollars(value),line,{right:true});
 }
 if(item.ratioBps!==null&&item.ratioBps!==undefined){if(!Number.isInteger(item.ratioBps)||item.ratioBps<0||item.ratioBps>10000)throw new Error('Connecticut EITC allocation ratio must be reviewed to four places.');const text=(item.ratioBps/10000).toFixed(4);digits(1,[435,458,474,490,506],input.year===2025?591.54:602.54,text.replace('.',''),'14:ratio',{height:16});}
 continuation('Schedule CT-EITC qualifying children',rows.slice(3),(row,index,{page,top,draw})=>{
  const n=index+4;draw(ctBox(page,36,top,540,18),`Child ${n}: ${[row.firstName,row.middleInitial,row.lastName].filter(Boolean).join(' ')}`,`continuation:${n}:name`);
  draw(ctBox(page,36,top+20,540,18),`SSN: ${ctDigits(row.taxId)}    Birth year: ${row.birthYear}    Relationship code: ${row.relationshipCode}`,`continuation:${n}:identity`);
  draw(ctBox(page,36,top+40,540,18),`Months living with you: ${row.months}; federal Schedule EIC student: ${row.student===true?'Yes':row.student===false?'No':'Unresolved'}; disability: ${row.disabled===true?'Yes':row.disabled===false?'No':'Unresolved'}`,`continuation:${n}:eligibility`);
 });
 return finish({childCount:rows.length,wageSourceCount:wages.length,businessSourceCount:businesses.length,preprintedLines:['9']});
}

export function ctEitcWorkpaper(input,result,line){
 const state=result.states?.find(row=>row.state==='CT'),credit=state?.earnedIncomeCredit;if(!credit?.required&&!credit?.forms?.length)return;
 line('Connecticut earned income tax credit',11);line(`Complete: ${credit.known}; amount: ${credit.amountCents===null?'UNRESOLVED':displayMoney(credit.amountCents)+' USD'}.`);
 for(const [key,value]of Object.entries(credit.lines??{}))line(`Schedule CT-EITC line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
 for(const row of credit.wageSources??[])line(`Linked W-2 ${row.w2Id}: ${row.owner}; source ${row.source}; reviewed ${row.reviewed}.`);
 for(const row of credit.businessSources??[])line(`Linked business ${row.businessId}: ${row.owner}; source ${row.source}; reviewed ${row.reviewed}.`);
 for(const row of credit.children??[])line(`Federal EIC child ${row.id}: reviewed months ${row.months}; CT relationship code ${row.relationshipCode}.`);
}
