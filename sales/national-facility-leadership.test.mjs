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
});
