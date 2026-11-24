import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedFacilityAdministrator } from './facility-administrators.mjs';

test('national administrator names match CMS facility identity and retain their publisher', () => {
  const shelby = { cms: { id: '015411' }, city: 'ALABASTER', state: 'AL', phone: '2056208500' };
  const administrator = publishedFacilityAdministrator(shelby);
  assert.equal(administrator.name, 'Khaley Davis');
  assert.equal(administrator.sourceName, 'Alabama public health');
  assert.equal(administrator.phone, shelby.phone);
  assert.equal(publishedFacilityAdministrator({ ...shelby, city: 'Shelby' }), null);
  assert.equal(publishedFacilityAdministrator({ ...shelby, state: 'AK' }), null);
  assert.equal(publishedFacilityAdministrator({ ...shelby, cms: { id: 'INVALID' } }), null);
  const buckCreek = publishedFacilityAdministrator({ ...shelby, cms: { id: '015144' }, phone: '2056633859',
    sourceURL: 'https://data.cms.gov/provider-data/dataset/4pq5-n9py?conditions[0][property]=cms_certification_number_ccn&conditions[0][value]=015144' });
  assert.equal(buckCreek.name, 'Antonio Alonso');
  assert.equal(buckCreek.photoFrame, 'buck-creek');
  assert.match(buckCreek.photoURL, /^https:\/\/www\.alabasterconnection\.net\//);
});
