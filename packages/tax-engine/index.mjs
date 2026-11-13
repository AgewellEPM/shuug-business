import { commonInput,inputDiagnostics,diagnostic } from './model.mjs';
import { calculateIndividual } from './individual.mjs';
import { calculateBusiness } from './business.mjs';
import {calculationYears} from './federal-years.mjs';
import {calculateStateReturns} from './state-returns.mjs';
export {calculationYears,requestedTaxYears,federalSourcesFor} from './federal-years.mjs';
export { newReturn,expenseCategories } from './model.mjs';
export {newInventory,newInventoryCost,inventoryMethods,inventoryReviews} from './inventory.mjs';
export {newRetirementIncome,newRetirementDistribution,newSocialSecurityBenefit,newTaxExemptPayer,retirementPlans,retirementTreatments,retirementDistributionReviews,retirementReviews} from './retirement-income.mjs';
export {newNYStateReturn,newNYWageRecord,newNYModification,newNYDependent,nyReviews,nyModifications,nyUnsupportedTreatments} from './state-ny-model.mjs';
export { returnTypes,filingStatuses,scopeNotice,federalSources } from './catalog.mjs';
export { parseMoney,displayMoney,sumMoney } from './money.mjs';
export {newHouseholdEmployer,newHouseholdEmployee,householdReviews} from './household-employment.mjs';
export {newEnergyCredits,energyCategories,energyReviews,panelEnabledTypes} from './energy-credits.mjs';

export function calculateReturn(raw){
  let input;
  try{input=commonInput(structuredClone(raw));if(!calculationYears.includes(input.year))return {version:1,year:input.year,kind:input.kind,status:'unsupported',calculationAvailable:false,filingReady:false,forms:[],summary:{},diagnostics:[diagnostic('TAX_YEAR_NOT_SUPPORTED','No reviewed calculation/form pack is installed for this tax year. Another year’s rates were not substituted.')]};
    if(input.year===2026&&input.kind!=='1040')return {version:1,year:input.year,kind:input.kind,status:'unsupported',calculationAvailable:false,filingReady:false,forms:[],summary:{},diagnostics:[diagnostic('BUSINESS_ANNUAL_PACK_REQUIRED','The 2026 entity return pack has not been reviewed. The original input is retained; 2025 entity forms were not reused.')]};
    const result=input.kind==='1040'?calculateIndividual(input):calculateBusiness(input),diagnostics=[...inputDiagnostics(input),...result.diagnostics];
    const stateResult=calculateStateReturns(input,result);result.states=stateResult.states;result.forms.push(...stateResult.forms);diagnostics.push(...stateResult.diagnostics);
    if(input.year===2026){result.pdfUnavailableForms=[...new Set(result.forms.filter(item=>!['f1040sc','f1040sse'].includes(item.form)).map(item=>item.form))];diagnostics.push(diagnostic('ANNUAL_FORMS_INCOMPLETE','2026 calculations are provisional. Only the final Schedule C and Schedule SE templates are installed; missing main forms and schedules are listed in the workpaper and omitted from the PDF. No prior-year form is substituted.'));}
    return {...result,version:1,year:input.year,kind:input.kind,status:diagnostics.some(item=>item.severity==='blocking')?'needs-attention':'draft',calculationAvailable:true,filingReady:false,diagnostics};
  }catch(error){return {version:1,year:input?.year??null,kind:input?.kind??null,status:'invalid-input',calculationAvailable:false,filingReady:false,forms:[],summary:{},diagnostics:[diagnostic('INPUT_INVALID',error instanceof Error?error.message:'The original return input needs review.')]};}
}

export {newHouseholdFuta,newHouseholdFutaRow} from './household-futa.mjs';
export {newInvestmentIncome,newInvestmentPayer,investmentReviews} from './investment-income.mjs';

export {newCapitalIncome,newCapitalTrade,newCapitalDistribution,capitalCategories,capitalAdjustmentCodes,capitalReviews} from './capital-income.mjs';
export {newCTStateReturn,newCTAdjustment,newCTWithholding,newCTPropertyTax,ctReviews,ctAdjustmentLines,ctUnsupportedTreatments,stateJurisdictions,stateCoverage} from './state-returns.mjs';
