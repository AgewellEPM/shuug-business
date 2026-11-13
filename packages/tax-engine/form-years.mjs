import {childCreditMaps} from './child-credits-pdf.mjs';
import {eicMaps} from './eic-pdf.mjs';
import {schedule1AMap} from './schedule-1a-pdf.mjs';
import {lineMaps,scheduleMaps} from './form-maps.mjs';
import {lineMaps2023,scheduleMaps2023,lineMaps2024,scheduleMaps2024} from './form-maps-prior.mjs';
import {officialForms2023} from './forms/2023/templates.mjs';
import {officialForms2024} from './forms/2024/templates.mjs';
import {officialForms2025} from './forms/2025/templates.mjs';
import {officialForms2026} from './forms/2026/templates.mjs';
import {lineMaps2026,scheduleMaps2026} from './form-maps-2026.mjs';
import {ctPdfYearPack} from './state-ct-pdf.mjs';
import {ctEitcPdfYearPack} from './state-ct-eitc-pdf.mjs';
import {ctDependentPdfYearPack} from './state-ct-dependent-pdf.mjs';
import {nyPdfYearPack} from './state-ny-pdf.mjs';
import {nyEicPdfYearPack} from './state-ny-eic-pdf.mjs';
import {nyChildPdfYearPack} from './state-ny-child-pdf.mjs';
import {inventoryScheduleCMap,inventory1125AMap} from './inventory-pdf.mjs';
const retirementMaps={2023:{'2a':'1/41','4a':'1/45','4b':'1/46','5a':'1/47','5b':'1/48','6a':'1/49','6b':'1/50','25b':'2/12','28':'2/17','32':'2/21'},2024:{'2a':'1/42','4a':'1/46','4b':'1/47','5a':'1/48','5b':'1/49','6a':'1/50','6b':'1/51','25b':'2/12','28':'2/17','32':'2/21'},2025:{'2a':'1/58','4a':'1/62','4b':'1/63','5a':'1/65','5b':'1/66','6a':'1/68','6b':'1/69','25b':'2/18','28':'2/24','32':'2/28'}};
const packs=Object.freeze({
  2023:Object.freeze({templates:officialForms2023,lineMaps:lineMaps2023,scheduleMaps:scheduleMaps2023}),
  2024:Object.freeze({templates:officialForms2024,lineMaps:lineMaps2024,scheduleMaps:scheduleMaps2024}),
  2025:Object.freeze({templates:officialForms2025,lineMaps,scheduleMaps}),
  2026:Object.freeze({templates:officialForms2026,lineMaps:lineMaps2026,scheduleMaps:scheduleMaps2026}),
  2027:Object.freeze({templates:[],lineMaps:{},scheduleMaps:{}}),
});
export function pdfYearPack(year){if(!Number.isInteger(year)||!Object.hasOwn(packs,year))throw new Error('No reviewed PDF pack is installed for this tax year.');const federal=packs[year],state=ctPdfYearPack(year),ctEic=ctEitcPdfYearPack(year),ctDependent=ctDependentPdfYearPack(year),ny=nyPdfYearPack(year),nyEic=nyEicPdfYearPack(year),nyChild=nyChildPdfYearPack(year);return {templates:[...federal.templates,...state.templates,...ctEic.templates,...ctDependent.templates,...ny.templates,...nyEic.templates,...nyChild.templates],lineMaps:{...federal.lineMaps,...childCreditMaps[year],...eicMaps[year],...state.lineMaps,...ctEic.lineMaps,...ctDependent.lineMaps,...ny.lineMaps,...nyEic.lineMaps,...nyChild.lineMaps,...(year===2025?{f1040s1a:schedule1AMap}:{}),f1040:{...federal.lineMaps.f1040,...retirementMaps[year],...childCreditMaps[year]?.f1040,...eicMaps[year]?.f1040},f1040sc:{...federal.lineMaps.f1040sc,...inventoryScheduleCMap},...(year<2026?{f1125a:inventory1125AMap}:{})},scheduleMaps:federal.scheduleMaps};}
