// Annual constants for the explicitly limited ordinary-income draft model.
// These do not establish complete return coverage, final forms or filing approval.
import {federal2026Rules} from './annual-2026.mjs';
import {federal2027Rules} from './annual-2027.mjs';
export const calculationYears=Object.freeze([2023,2024,2025,2026,2027]);
export const requestedTaxYears=Object.freeze([2023,2024,2025,2026,2027]);
const deductions=(single,joint,head)=>Object.freeze({single,marriedJoint:joint,marriedSeparate:single,headOfHousehold:head,survivingSpouse:joint});
const rules=Object.freeze({
  2027:federal2027Rules,
  2026:federal2026Rules,
  2023:Object.freeze({standardDeductions:deductions(1385000,2770000,2080000),socialSecurityBaseCents:16020000,qbiSingleThresholdCents:18210000,qbiJointThresholdCents:36420000}),
  2024:Object.freeze({standardDeductions:deductions(1460000,2920000,2190000),socialSecurityBaseCents:16860000,qbiSingleThresholdCents:19195000,qbiJointThresholdCents:38390000}),
  2025:Object.freeze({standardDeductions:deductions(1575000,3150000,2362500),socialSecurityBaseCents:17610000,qbiSingleThresholdCents:19730000,qbiJointThresholdCents:39460000}),
});
export function federalYearRules(year){if(!Number.isInteger(year)||!Object.hasOwn(rules,year))throw new Error('No reviewed ordinary-income rules are installed for this tax year.');return rules[year];}
export function federalSourcesFor(year){
  federalYearRules(year);const prior=id=>`https://www.irs.gov/pub/irs-prior/${id}--${year}.pdf`;
  if(year===2027)return Object.freeze({annualRules:'https://www.irs.gov/pub/irs-drop/rp-26-35.pdf',socialSecurity:'https://www.govinfo.gov/content/pkg/FR-2026-10-26/pdf/2026-21796.pdf',qbi:'https://uscode.house.gov/us/usc/119-134/t26/s199A/'});
  if(year===2026)return Object.freeze({annualRules:'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',socialSecurity:'https://www.govinfo.gov/content/pkg/FR-2025-11-03/pdf/2025-19763.pdf',scheduleC:'https://www.irs.gov/pub/irs-pdf/f1040sc.pdf',scheduleSE:'https://www.irs.gov/pub/irs-pdf/f1040sse.pdf',scheduleSEInstructions:'https://www.irs.gov/pub/irs-pdf/i1040sse.pdf',qbi:'https://uscode.house.gov/us/usc/119-118/t26/s199A/'});
  return Object.freeze({individual:prior('i1040gi'),taxTable:prior('i1040tt'),scheduleC:prior('f1040sc'),scheduleSE:prior('f1040sse'),qbi:prior('i8995'),partnership:prior('f1065'),sCorporation:prior('f1120s'),corporation:prior('i1120')});
}
