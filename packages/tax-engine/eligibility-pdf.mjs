import {displayMoney} from './money.mjs';
// Exact checkbox names from the pinned annual IRS Form 1040 blanks.
export const eligibilityCheckboxes=Object.freeze({
 2023:{page:1,taxpayerClaimable:'c1_5[0]',spouseClaimable:'c1_6[0]',ineligible:'c1_7[0]',taxpayerAge65:'c1_8[0]',taxpayerBlind:'c1_9[0]',spouseAge65:'c1_10[0]',spouseBlind:'c1_11[0]'},
 2024:{page:1,taxpayerClaimable:'c1_6[0]',spouseClaimable:'c1_7[0]',ineligible:'c1_8[0]',taxpayerAge65:'c1_9[0]',taxpayerBlind:'c1_10[0]',spouseAge65:'c1_11[0]',spouseBlind:'c1_12[0]'},
 2025:{page:2,taxpayerClaimable:'c2_1[0]',spouseClaimable:'c2_2[0]',spouseItemizes:'c2_3[0]',dualStatus:'c2_4[0]',taxpayerAge65:'c2_5[0]',taxpayerBlind:'c2_6[0]',spouseAge65:'c2_7[0]',spouseBlind:'c2_8[0]'},
});
export function eligibilityIdentity(input,item,set){
 if(item.form!=='f1040'||!item.standardDeduction)return;const map=eligibilityCheckboxes[input.year];if(!map)return;
 const flags=item.standardDeduction.flags;
 for(const [key,name]of Object.entries(map))if(key!=='page'&&(key==='ineligible'?flags.spouseItemizes||flags.dualStatus:flags[key]))set.checkbox(`topmostSubform[0].Page${map.page}[0].${name}`);
 if(input.year!==2025)return;
 const value=input.individual.eligibility;let any=false;
 for(const [owner,fields]of [['taxpayer',['f1_05[0]','f1_06[0]','f1_07[0]']],['spouse',['f1_08[0]','f1_09[0]','f1_10[0]']]]){
  if(owner==='spouse'&&input.individual.filingStatus!=='marriedJoint')continue;const person=value?.[owner],age=item.standardDeduction.persons?.[owner];
  if(person?.deceased==='yes'&&age?.known){any=true;const [year,month,day]=person.dateOfDeath.split('-');for(const [index,text]of [month,day,year].entries())set(`name:topmostSubform[0].Page1[0].${fields[index]}`,text,'date-of-death');}
 }
 if(any)set.checkbox('topmostSubform[0].Page1[0].c1_3[0]');
}
export function eligibilityAnnotations(input,item,{pdf,font,audit}){
 if(item.form!=='f1040'||![2023,2024].includes(input.year)||!item.standardDeduction)return;
 const names=[];for(const owner of ['taxpayer',...(input.individual.filingStatus==='marriedJoint'?['spouse']:[])]){const person=input.individual.eligibility?.[owner];if(person?.deceased==='yes'&&item.standardDeduction.persons?.[owner]?.known)names.push(`${owner==='taxpayer'?input.party.name:input.individual.spouseName}, ${person.dateOfDeath}`);}
 if(!names.length)return;const text='DECEASED: '+names.join('; '),x=36,y=777;let size=9;while(size>6&&font.widthOfTextAtSize(text,size)>540)size-=.25;if(font.widthOfTextAtSize(text,size)>540)throw new Error('The deceased-taxpayer annotation cannot fit without losing the original name or date.');pdf.getPage(0).drawText(text,{x,y,size,font});audit.push({annotation:'deceased',text,page:1,x,y});
}
export function eligibilityWorkpaper(input,line,result){
 const value=input.individual?.eligibility;if(!value)return;line('Federal standard-deduction eligibility and worksheet',12);
 for(const owner of ['taxpayer',...(['marriedJoint','marriedSeparate'].includes(input.individual.filingStatus)?['spouse']:[])]){const person=value[owner];line(`${owner}: birth ${person.dateOfBirth||'unentered'}; blind ${person.blind}; can be claimed ${person.canBeClaimed}; deceased ${person.deceased}; death date ${person.dateOfDeath||'none entered'}; source ${person.source}; reviewed ${person.reviewed}.`);if(owner==='spouse')line(`Spouse no gross income: ${person.noGrossIncome}; separate return: ${person.filingReturn}.`);}
 line(`Residency ${value.residency}; period ${value.returnPeriod}; choice ${value.deductionChoice}; spouse itemizes ${value.spouseItemizes}; status review ${value.review.status}; earned-income completeness ${value.review.earnedIncome}. Source: ${value.source}`);
 const deduction=result.standardDeduction;if(!deduction?.known)line('Standard deduction unresolved; original source facts are retained.');
 if(deduction?.worksheet)for(const [key,value]of Object.entries(deduction.worksheet))line(`${key}: ${key.endsWith('Cents')?displayMoney(value)+' USD':String(value)}`);line(`Calculated standard deduction: ${displayMoney(deduction?.deductionCents)} USD.`);
 if(input.year===2026)line('2026 statutory deduction worksheet uses final Publication 505. Final Form 1040 and the annual Tax Table remain separately unavailable.');
}
