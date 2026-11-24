import test from 'node:test';
import assert from 'node:assert/strict';
import { administratorPhotoOrigins, publishedFacilityAdministrator, publishedFacilityProfile } from './facility-administrators.mjs';

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

test('reviewed portraits stay attached to the named person and the matched CMS facility', () => {
  const facility = (id, city, phone) => ({ state: 'CT', city, phone, sourceURL:
    'https://data.cms.gov/provider-data/dataset/4pq5-n9py?conditions[0][property]=cms_certification_number_ccn&conditions[0][value]=' + id });
  const ark = facility('075320', 'Stamford', '2033250200');
  const staff = publishedFacilityProfile(ark).people;
  const minette = staff.find(person => person.name === 'Minette Zambo');
  assert.equal(new URL(minette.photoURL).hostname, 'media.licdn.com');
  assert.match(minette.photoSourceURL, /posts\/minette-zambo-b71286106_/);
  assert.match(minette.fallbackPhotoURL, /minette-zambo-sq\.png$/);
  for (const name of ['Farah Pasard', 'Erica Hagenow', 'Jean Ormond']) {
    const person = staff.find(row => row.name === name);
    assert.equal(new URL(person.photoURL).origin, new URL(person.photoSourceURL).origin);
  }
  assert.equal(publishedFacilityProfile({ ...ark, phone: '2035550102' }), null);
  const george = publishedFacilityAdministrator(facility('075268', 'Hartford', '8609511060'));
  assert.equal(george.name, 'George Kingston');
  assert.match(george.photoSourceURL, /george-kingston-trinity-hill/);
  assert.match(george.photoURL, /george_kingston/);
  for (const url of [minette.photoURL, minette.fallbackPhotoURL, george.photoURL]) assert.ok(administratorPhotoOrigins.includes(new URL(url).origin));
});

test('directory photos supplement only the sourced facility and keep the published role attribution', () => {
  for (const [id, city, state, name, publisher] of [
    ['155761', 'Brownsburg', 'IN', 'Paige Metzler', 'media.licdn.com'],
    ['055268', 'Sonoma', 'CA', 'JON D OLSON', 'media.licdn.com'],
    ['075117', 'Greenwich', 'CT', 'JOHN MASTRONARDI', 'www.thenathanielwitherell.org'],
    ['075314', 'Manchester', 'CT', 'PATRICK J NEAGLE', 'www.icarehn.com'],
  ]) {
    const row = { cms: { id }, state, city };
    const person = publishedFacilityAdministrator(row);
    assert.equal(person.name, name);
    assert.equal(new URL(person.photoURL).hostname, publisher);
    assert.notEqual(person.sourceURL, person.photoSourceURL);
    assert.ok(administratorPhotoOrigins.includes(new URL(person.photoURL).origin));
    assert.equal(publishedFacilityAdministrator({ ...row, city: 'Wrong city' }), null);
  }
  // The employer article only identifies Touchpoints at Manchester.
  const other = publishedFacilityAdministrator({ cms: { id: '075252' }, state: 'CT', city: 'Manchester' });
  assert.equal(other.name, 'PATRICK J NEAGLE');
  assert.equal(other.photoURL, undefined);
});
