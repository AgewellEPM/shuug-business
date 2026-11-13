import assert from 'node:assert/strict';
import {eligibilityFixture} from '../../tax-engine/test/standard-deduction-fixtures.mjs';
export {eligibilityFixture};
// Deliberate synthetic source answers entered through the actual editor fields.
export function fillEligibility(document){
 const value=eligibilityFixture(),section=document.querySelector('#federal-eligibility-editor');assert(section);
 for(const [key,answer]of Object.entries({...value,...value.taxpayer,...value.review})){
  if(typeof answer==='object')continue;
  for(const input of section.querySelectorAll(`[data-return-field="${key}"]`)){if(input.type==='checkbox')input.checked=answer;else input.value=answer;input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));}
 }
}
