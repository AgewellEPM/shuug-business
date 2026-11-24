import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleFacilityResearch } from './coach-facility-research.mjs';

const user = { role: 'agent', id: 'synthetic', states: ['AL'] };
const facility = { name: 'Example Nursing', city: 'Athens', state: 'AL', certifiedBeds: 170, cmsRating: 3,
  cms: { processingDate: '2026-10-01' }, sourceURL: 'https://example.invalid/cms' };
const screen = { view: 'prospects', facilityResearch: { state: 'AL',
  selected: { state: 'AL', category: 'nursing-home', sourceURL: facility.sourceURL } } };
const report = { total: 1, results: [facility] };

test('spoken research scopes the existing directory lookup and links the exact range to Prospects', async () => {
  const question = 'Find nursing homes named Example Nursing in Alabama with at least one hundred beds and CMS overall 3 stars';
  const result = await handleFacilityResearch(user, (rep, action, input) => {
    assert.equal(rep, user);
    assert.equal(action, 'territory-facilities');
    assert.deepEqual(input, { state: 'AL', category: 'nursing-home', query: 'Example Nursing', minBeds: 100, maxBeds: undefined, maxCmsRating: 3 });
    return report;
  }, question, screen);
  assert.match(result.answer, /170 CMS-certified beds.*CMS overall 3 out of 5/);
  assert.equal(result.navigation.href, '#view=prospects&facility=nursing-home&state=al&query=Example+Nursing&minbeds=100&maxcms=3');
});

test('the opened profile supplies the official bed count and Google review navigation consumes no Google content', async () => {
  const result = await handleFacilityResearch(user, (_rep, action, input) => {
    assert.equal(action, 'territory-facilities');
    assert.deepEqual(input, screen.facilityResearch.selected);
    return report;
  }, 'How many beds does this facility currently have?', screen);
  assert.match(result.answer, /170 CMS-certified beds.*2026-10-01/);
  const reviews = await handleFacilityResearch(user, () => assert.fail('Google data belongs to the facility panel'), 'Open Google reviews', screen);
  assert.equal(reviews.navigation.href, '#view=prospects&review=google');
});
