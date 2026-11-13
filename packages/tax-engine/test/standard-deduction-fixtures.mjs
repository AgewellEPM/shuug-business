import {newIndividualEligibility} from '../standard-deduction.mjs';
// Synthetic test facts only. Production factories retain unknown decisions.
export function eligibilityFixture(){
 const value=newIndividualEligibility();Object.assign(value,{residency:'fullYearCitizenOrResident',returnPeriod:'fullYear',deductionChoice:'standard',spouseItemizes:'no',source:'Synthetic calendar-year status and deduction review'});value.review={status:true,earnedIncome:true};
 for(const owner of ['taxpayer','spouse'])Object.assign(value[owner],{dateOfBirth:'1990-06-15',blind:'no',canBeClaimed:'no',deceased:'no',source:'Synthetic eligibility source for '+owner,reviewed:true});value.spouse.noGrossIncome='no';value.spouse.filingReturn='yes';return value;
}
