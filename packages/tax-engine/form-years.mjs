import {lineMaps,scheduleMaps} from './form-maps.mjs';
import {lineMaps2023,scheduleMaps2023,lineMaps2024,scheduleMaps2024} from './form-maps-prior.mjs';
import {officialForms2023} from './forms/2023/templates.mjs';
import {officialForms2024} from './forms/2024/templates.mjs';
import {officialForms2025} from './forms/2025/templates.mjs';
import {officialForms2026} from './forms/2026/templates.mjs';
import {lineMaps2026,scheduleMaps2026} from './form-maps-2026.mjs';
import {ctPdfYearPack} from './state-ct-pdf.mjs';
const packs=Object.freeze({
  2023:Object.freeze({templates:officialForms2023,lineMaps:lineMaps2023,scheduleMaps:scheduleMaps2023}),
  2024:Object.freeze({templates:officialForms2024,lineMaps:lineMaps2024,scheduleMaps:scheduleMaps2024}),
  2025:Object.freeze({templates:officialForms2025,lineMaps,scheduleMaps}),
  2026:Object.freeze({templates:officialForms2026,lineMaps:lineMaps2026,scheduleMaps:scheduleMaps2026}),
});
export function pdfYearPack(year){if(!Number.isInteger(year)||!Object.hasOwn(packs,year))throw new Error('No reviewed PDF pack is installed for this tax year.');const federal=packs[year],state=ctPdfYearPack(year);return {templates:[...federal.templates,...state.templates],lineMaps:{...federal.lineMaps,...state.lineMaps},scheduleMaps:federal.scheduleMaps};}
