import {lineMaps,scheduleMaps} from './form-maps.mjs';
import {lineMaps2023,scheduleMaps2023,lineMaps2024,scheduleMaps2024} from './form-maps-prior.mjs';
import {officialForms2023} from './forms/2023/templates.mjs';
import {officialForms2024} from './forms/2024/templates.mjs';
import {officialForms2025} from './forms/2025/templates.mjs';
const packs=Object.freeze({
  2023:Object.freeze({templates:officialForms2023,lineMaps:lineMaps2023,scheduleMaps:scheduleMaps2023}),
  2024:Object.freeze({templates:officialForms2024,lineMaps:lineMaps2024,scheduleMaps:scheduleMaps2024}),
  2025:Object.freeze({templates:officialForms2025,lineMaps,scheduleMaps}),
});
export function pdfYearPack(year){if(!Number.isInteger(year)||!Object.hasOwn(packs,year))throw new Error('No reviewed PDF pack is installed for this tax year.');return packs[year];}
