import { commonInput,inputDiagnostics,diagnostic } from './model.mjs';
import { calculateIndividual } from './individual.mjs';
import { calculateBusiness } from './business.mjs';
export { newReturn,expenseCategories } from './model.mjs';
export { returnTypes,filingStatuses,scopeNotice,federalSources } from './catalog.mjs';
export { parseMoney,displayMoney } from './money.mjs';

export function calculateReturn(raw){
  let input;
  try{input=commonInput(structuredClone(raw));if(input.year!==2025)return {version:1,year:input.year,kind:input.kind,status:'unsupported',calculationAvailable:false,filingReady:false,forms:[],summary:{},diagnostics:[diagnostic('TAX_YEAR_NOT_SUPPORTED','No reviewed calculation/form pack is installed for this tax year. Another year’s rates were not substituted.')]};
    const result=input.kind==='1040'?calculateIndividual(input):calculateBusiness(input),diagnostics=[...inputDiagnostics(input),...result.diagnostics];
    return {...result,version:1,year:2025,kind:input.kind,status:diagnostics.some(item=>item.severity==='blocking')?'needs-attention':'draft',calculationAvailable:true,filingReady:false,diagnostics};
  }catch(error){return {version:1,year:input?.year??null,kind:input?.kind??null,status:'invalid-input',calculationAvailable:false,filingReady:false,forms:[],summary:{},diagnostics:[diagnostic('INPUT_INVALID',error instanceof Error?error.message:'The original return input needs review.')]};}
}
